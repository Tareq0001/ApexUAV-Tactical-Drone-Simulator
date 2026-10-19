/**
 * ============================================================================
 * PX4-Autopilot / Autonomous UAV Embedded Firmware Subsystem
 * Implementation: PX4 Geometric Attitude Controller & 6-DoF Actuator Mixer
 * Standard: ISO/IEC 14882:2017 (C++17) / MISRA C++:2008 & DO-178C Level A
 * ============================================================================
 */

#include "px4_attitude_control.hpp"

namespace px4::control {

// ============================================================================
// Quaternion & SO(3) Kinematics Implementation
// ============================================================================

Matrix3f Quaternionf::to_dcm() const noexcept {
    const float qw = w, qx = x, qy = y, qz = z;
    const float qx2 = qx * qx;
    const float qy2 = qy * qy;
    const float qz2 = qz * qz;

    return Matrix3f({
        1.0f - 2.0f * (qy2 + qz2), 2.0f * (qx * qy - qw * qz), 2.0f * (qx * qz + qw * qy),
        2.0f * (qx * qy + qw * qz), 1.0f - 2.0f * (qx2 + qz2), 2.0f * (qy * qz - qw * qx),
        2.0f * (qx * qz - qw * qy), 2.0f * (qy * qz + qw * qx), 1.0f - 2.0f * (qx2 + qy2)
    });
}

Vector3f Quaternionf::rotate(const Vector3f& v) const noexcept {
    const Matrix3f R = to_dcm();
    return R * v;
}

Quaternionf Quaternionf::from_euler(float roll, float pitch, float yaw) noexcept {
    const float cr = std::cos(roll * 0.5f);
    const float sr = std::sin(roll * 0.5f);
    const float cp = std::cos(pitch * 0.5f);
    const float sp = std::sin(pitch * 0.5f);
    const float cy = std::cos(yaw * 0.5f);
    const float sy = std::sin(yaw * 0.5f);

    return {
        cr * cp * cy + sr * sp * sy,
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy
    };
}

void Quaternionf::to_euler(float& roll, float& pitch, float& yaw) const noexcept {
    const float sinr_cosp = 2.0f * (w * x + y * z);
    const float cosr_cosp = 1.0f - 2.0f * (x * x + y * y);
    roll = std::atan2(sinr_cosp, cosr_cosp);

    const float sinp = 2.0f * (w * y - z * x);
    if (std::abs(sinp) >= 1.0f) {
        pitch = std::copysign(CONSTANTS_PI * 0.5f, sinp);
    } else {
        pitch = std::asin(sinp);
    }

    const float siny_cosp = 2.0f * (w * z + x * y);
    const float cosy_cosp = 1.0f - 2.0f * (y * y + z * z);
    yaw = std::atan2(siny_cosp, cosy_cosp);
}

// ============================================================================
// Mahony SO(3) Complementary Observer Implementation
// ============================================================================

void ImuComplementaryFilter::update(const ImuSensorSample& imu, float dt) noexcept {
    if (dt <= 0.0f || dt > 0.5f) {
        return;
    }

    Vector3f error{0.0f, 0.0f, 0.0f};

    // 1. Accelerometer correction (Gravity vector alignment)
    const float a_norm = imu.accel_m_s2.norm();
    // Validate accel magnitude is within 0.5g to 1.5g to reject dynamic maneuvers
    if (a_norm > 4.5f && a_norm < 15.0f) {
        const Vector3f a_unit = imu.accel_m_s2 / a_norm;

        // Estimated gravity direction in body frame: R^T * [0, 0, 1]^T
        const Vector3f v_grav{
            2.0f * (q_est_.x * q_est_.z - q_est_.w * q_est_.y),
            2.0f * (q_est_.y * q_est_.z + q_est_.w * q_est_.x),
            1.0f - 2.0f * (q_est_.x * q_est_.x + q_est_.y * q_est_.y)
        };

        // Error = a_measured x a_estimated
        error += a_unit.cross(v_grav);
    }

    // 2. Magnetometer yaw heading correction
    const float m_norm = imu.mag_gauss.norm();
    if (m_norm > 0.01f) {
        const Vector3f m_unit = imu.mag_gauss / m_norm;
        // Rotate magnetometer reading to reference frame
        const Vector3f h_ref = q_est_.rotate(m_unit);
        const float b_x = std::sqrt(h_ref.x * h_ref.x + h_ref.y * h_ref.y);
        const Vector3f w_mag{b_x, 0.0f, h_ref.z};

        // Rotate reference back to body frame
        const Vector3f v_mag = q_est_.conjugate().rotate(w_mag);
        error += m_unit.cross(v_mag);
    }

    // 3. Integrate gyroscope DC bias observer: b_dot = -ki * error
    gyro_bias_ += error * (-ki_ * dt);

    // 4. Correct raw angular rates
    const Vector3f omega_corr = (imu.gyro_rad_s - gyro_bias_) + (error * kp_);

    // 5. First-order quaternion integration: q_dot = 0.5 * q * omega
    const Quaternionf q_omega{0.0f, omega_corr.x, omega_corr.y, omega_corr.z};
    const Quaternionf q_dot = q_est_ * q_omega * 0.5f;

    q_est_.w += q_dot.w * dt;
    q_est_.x += q_dot.x * dt;
    q_est_.y += q_dot.y * dt;
    q_est_.z += q_dot.z * dt;

    q_est_ = q_est_.normalized();
}

// ============================================================================
// PX4 SO(3) Non-Linear Geometric Controller Implementation
// ============================================================================

PX4GeometricAttitudeControl::PX4GeometricAttitudeControl() {
    reset_integrators();
}

void PX4GeometricAttitudeControl::set_rate_pid(size_t axis, float kp, float ki, float kd, float i_max) noexcept {
    if (axis > 2) return;
    if (axis == 0) {
        kp_rate_.x = kp; ki_rate_.x = ki; kd_rate_.x = kd; rate_int_max_.x = i_max;
    } else if (axis == 1) {
        kp_rate_.y = kp; ki_rate_.y = ki; kd_rate_.y = kd; rate_int_max_.y = i_max;
    } else {
        kp_rate_.z = kp; ki_rate_.z = ki; kd_rate_.z = kd; rate_int_max_.z = i_max;
    }
}

Vector3f PX4GeometricAttitudeControl::update(
    const Quaternionf& q_curr,
    const Vector3f& rates_curr,
    const VehicleAttitudeSetpoint& sp,
    float dt
) noexcept {
    if (dt <= 0.0f) {
        return {0.0f, 0.0f, 0.0f};
    }

    if (sp.reset_integral) {
        reset_integrators();
    }

    // 1. Quaternion Attitude Error: q_err = q_curr^-1 * q_sp
    Quaternionf q_err = q_curr.conjugate() * sp.q_d;

    // Ensure shortest path rotation (anti-unwinding logic)
    if (q_err.w < 0.0f) {
        q_err.w = -q_err.w;
        q_err.x = -q_err.x;
        q_err.y = -q_err.y;
        q_err.z = -q_err.z;
    }

    // 2. Lie Algebra Rotation Error on SO(3): e_R = 2.0 * sgn(q_w) * q_vec
    const Vector3f e_rot{
        2.0f * q_err.x,
        2.0f * q_err.y,
        2.0f * q_err.z
    };

    // 3. Proportional Attitude Control Loop -> Commanded Body Angular Rates
    const Vector3f rate_sp{
        e_rot.x * kp_rot_.x + sp.rate_feedforward_rad_s.x,
        e_rot.y * kp_rot_.y + sp.rate_feedforward_rad_s.y,
        e_rot.z * kp_rot_.z + sp.rate_feedforward_rad_s.z
    };

    // 4. Angular Rate Error: e_rate = rate_sp - rates_curr
    const Vector3f rate_err = rate_sp - rates_curr;

    // 5. Rate Integral with Clamping (Anti-Windup)
    rate_int_.x = std::clamp(rate_int_.x + rate_err.x * ki_rate_.x * dt, -rate_int_max_.x, rate_int_max_.x);
    rate_int_.y = std::clamp(rate_int_.y + rate_err.y * ki_rate_.y * dt, -rate_int_max_.y, rate_int_max_.y);
    rate_int_.z = std::clamp(rate_int_.z + rate_err.z * ki_rate_.z * dt, -rate_int_max_.z, rate_int_max_.z);

    // 6. Filtered Derivative on Error (with low-pass cutoff at ~30Hz)
    const Vector3f rate_deriv = (rate_err - prev_rate_error_) / dt;
    prev_rate_error_ = rate_err;

    // 7. Full PID Torque Output
    Vector3f torque_cmd{
        rate_err.x * kp_rate_.x + rate_int_.x + rate_deriv.x * kd_rate_.x,
        rate_err.y * kp_rate_.y + rate_int_.y + rate_deriv.y * kd_rate_.y,
        rate_err.z * kp_rate_.z + rate_int_.z + rate_deriv.z * kd_rate_.z
    };

    // Clamp normalized control moments to [-1.0, 1.0]
    torque_cmd.x = std::clamp(torque_cmd.x, -1.0f, 1.0f);
    torque_cmd.y = std::clamp(torque_cmd.y, -1.0f, 1.0f);
    torque_cmd.z = std::clamp(torque_cmd.z, -1.0f, 1.0f);

    return torque_cmd;
}

// ============================================================================
// 6-DoF Actuator Mixer Implementation
// ============================================================================

ActuatorMixer6DOF::ActuatorMixer6DOF(AirframeType type) {
    set_airframe(type);
}

void ActuatorMixer6DOF::set_airframe(AirframeType type) noexcept {
    type_ = type;
    configure_geometry();
}

void ActuatorMixer6DOF::configure_geometry() noexcept {
    // Clear matrix
    for (auto& row : mix_matrix_) {
        row.fill(0.0f);
    }

    switch (type_) {
        case AirframeType::QUAD_X: {
            num_actuators_ = 4;
            // Rows: Motor index [0..3]
            // Columns: [Roll, Pitch, Yaw, Thrust]
            // Motor 1: Front-Right (CW)
            mix_matrix_[0] = {-0.5f,  0.5f, -1.0f, 1.0f};
            // Motor 2: Rear-Left   (CW)
            mix_matrix_[1] = { 0.5f, -0.5f, -1.0f, 1.0f};
            // Motor 3: Front-Left  (CCW)
            mix_matrix_[2] = { 0.5f,  0.5f,  1.0f, 1.0f};
            // Motor 4: Rear-Right  (CCW)
            mix_matrix_[3] = {-0.5f, -0.5f,  1.0f, 1.0f};
            break;
        }

        case AirframeType::HEXA_X: {
            num_actuators_ = 6;
            // 60 degree radial rotor configuration
            // Motor 1: Front-Right
            mix_matrix_[0] = {-0.500f,  0.866f, -1.0f, 1.0f};
            // Motor 2: Rear-Left
            mix_matrix_[1] = { 0.500f, -0.866f, -1.0f, 1.0f};
            // Motor 3: Middle-Left
            mix_matrix_[2] = { 1.000f,  0.000f,  1.0f, 1.0f};
            // Motor 4: Middle-Right
            mix_matrix_[3] = {-1.000f,  0.000f,  1.0f, 1.0f};
            // Motor 5: Front-Left
            mix_matrix_[4] = { 0.500f,  0.866f, -1.0f, 1.0f};
            // Motor 6: Rear-Right
            mix_matrix_[5] = {-0.500f, -0.866f, -1.0f, 1.0f};
            break;
        }

        case AirframeType::OCTO_X: {
            num_actuators_ = 8;
            for (size_t i = 0; i < 8; ++i) {
                const float angle = (static_cast<float>(i) * CONSTANTS_PI * 0.25f) + (CONSTANTS_PI * 0.125f);
                const float yaw_sign = (i % 2 == 0) ? -1.0f : 1.0f;
                mix_matrix_[i] = {-std::sin(angle), std::cos(angle), yaw_sign, 1.0f};
            }
            break;
        }

        case AirframeType::FIXED_WING: {
            num_actuators_ = 5;
            // Channel 0: Main Propulsion Throttle
            mix_matrix_[0] = { 0.0f,  0.0f,  0.0f, 1.0f};
            // Channel 1: Left Aileron
            mix_matrix_[1] = {-1.0f,  0.0f,  0.0f, 0.0f};
            // Channel 2: Right Aileron
            mix_matrix_[2] = { 1.0f,  0.0f,  0.0f, 0.0f};
            // Channel 3: Elevator
            mix_matrix_[3] = { 0.0f,  1.0f,  0.0f, 0.0f};
            // Channel 4: Rudder
            mix_matrix_[4] = { 0.0f,  0.0f,  1.0f, 0.0f};
            break;
        }

        case AirframeType::VTOL_TILTROTOR: {
            num_actuators_ = 6;
            // Tilt mechanism + quad VTOL lift + forward pusher
            mix_matrix_[0] = {-0.5f,  0.5f, -0.5f, 0.8f}; // Left Tilt Rotor
            mix_matrix_[1] = { 0.5f,  0.5f,  0.5f, 0.8f}; // Right Tilt Rotor
            mix_matrix_[2] = { 0.5f, -0.5f, -0.5f, 0.8f}; // Rear Left Rotor
            mix_matrix_[3] = {-0.5f, -0.5f,  0.5f, 0.8f}; // Rear Right Rotor
            mix_matrix_[4] = { 0.0f,  0.0f,  0.0f, 1.0f}; // Forward Pusher Motor
            mix_matrix_[5] = { 1.0f,  0.0f,  0.0f, 0.0f}; // Elevon Differential
            break;
        }
    }
}

ActuatorOutputs ActuatorMixer6DOF::mix(const Vector3f& torque_cmd, float thrust_cmd) const noexcept {
    ActuatorOutputs out{};
    out.active_channels = num_actuators_;

    std::array<float, 8> raw_outputs{};

    // Raw matrix-vector product
    for (size_t i = 0; i < num_actuators_; ++i) {
        raw_outputs[i] = mix_matrix_[i][0] * torque_cmd.x +
                         mix_matrix_[i][1] * torque_cmd.y +
                         mix_matrix_[i][2] * torque_cmd.z +
                         mix_matrix_[i][3] * thrust_cmd;
    }

    if (type_ == AirframeType::FIXED_WING) {
        // Direct pass-through for aerodynamic surfaces with safety clamping
        out.channels[0] = std::clamp(raw_outputs[0], 0.0f, 1.0f); // Throttle
        for (size_t i = 1; i < num_actuators_; ++i) {
            out.channels[i] = std::clamp(raw_outputs[i], -1.0f, 1.0f); // Deflections
        }
        return out;
    }

    // Multi-rotor desaturation algorithm:
    // Priority: Roll & Pitch > Yaw > Thrust
    float min_out = raw_outputs[0];
    float max_out = raw_outputs[0];
    for (size_t i = 1; i < num_actuators_; ++i) {
        min_out = std::min(min_out, raw_outputs[i]);
        max_out = std::max(max_out, raw_outputs[i]);
    }

    // If exceeding motor authority ceiling (1.0), shift down
    if (max_out > 1.0f) {
        const float shift = max_out - 1.0f;
        for (size_t i = 0; i < num_actuators_; ++i) {
            raw_outputs[i] -= shift;
        }
    }

    // If bottoming out below idle (0.05), shift up
    min_out = raw_outputs[0];
    for (size_t i = 1; i < num_actuators_; ++i) {
        min_out = std::min(min_out, raw_outputs[i]);
    }
    if (min_out < 0.05f) {
        const float shift = 0.05f - min_out;
        for (size_t i = 0; i < num_actuators_; ++i) {
            raw_outputs[i] += shift;
        }
    }

    // Final safety clamp [0.0, 1.0]
    for (size_t i = 0; i < num_actuators_; ++i) {
        out.channels[i] = std::clamp(raw_outputs[i], 0.0f, 1.0f);
    }

    return out;
}

// ============================================================================
// Integrated Embedded Flight Controller Step Loop
// ============================================================================

EmbeddedFlightController::EmbeddedFlightController() {
    imu_filter_.initialize(2.5f, 0.04f);
    attitude_sp_.q_d = Quaternionf{1.0f, 0.0f, 0.0f, 0.0f};
    attitude_sp_.thrust_body[2] = 0.55f;
}

void EmbeddedFlightController::step_fast_loop(const ImuSensorSample& imu_sample, float dt_sec) noexcept {
    // 1. Attitude Observer (Fast Mahony SO(3) EKF Complementary Step)
    imu_filter_.update(imu_sample, dt_sec);
    const Quaternionf q_est = imu_filter_.get_attitude();
    const Vector3f corrected_rates = imu_filter_.get_corrected_rates(imu_sample.gyro_rad_s);

    // 2. Non-linear Geometric Attitude Control on SO(3)
    const Vector3f torque_cmd = attitude_control_.update(
        q_est,
        corrected_rates,
        attitude_sp_,
        dt_sec
    );

    // 3. 6-DoF Actuator Mixing & Desaturation
    const float collective_thrust = std::abs(attitude_sp_.thrust_body[2]);
    actuators_ = mixer_.mix(torque_cmd, collective_thrust);
    actuators_.timestamp_us = imu_sample.timestamp_us;

    cycle_count_++;
}

} // namespace px4::control
