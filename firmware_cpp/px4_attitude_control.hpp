/**
 * ============================================================================
 * PX4-Autopilot / Autonomous UAV Embedded Firmware Subsystem
 * Module: PX4 Geometric Attitude Controller & 6-DoF Actuator Mixer Matrix
 * Standard: ISO/IEC 14882:2017 (C++17) / MISRA C++:2008 & DO-178C Level A
 *
 * Description:
 * High-reliability, deterministic real-time embedded attitude control on the
 * Special Orthogonal Lie Group SO(3). Eliminates gimbal lock singularities
 * and large-angle unwinding errors. Features a Mahony-style SO(3) complementary
 * attitude observer with online gyroscope bias estimation, multi-rotor & fixed-wing
 * 6-DoF actuator mixing, and motor desaturation priority logic.
 *
 * Author: Eng. Tareq Aboushi <tareq.aboushi@apex-avionics.mil>
 * Architecture: PX4 / NuttX / FreeRTOS Real-Time Flight Core
 * ============================================================================
 */

#pragma once

#include <cstdint>
#include <cmath>
#include <array>
#include <algorithm>
#include <string_view>
#include <tuple>

namespace px4::control {

// ============================================================================
// Mathematical Constants & Aerospace Utility Types
// ============================================================================
inline constexpr float CONSTANTS_ONE_G = 9.80665f;
inline constexpr float CONSTANTS_PI    = 3.14159265358979323846f;
inline constexpr float CONSTANTS_EPSILON = 1e-6f;

/**
 * 3D Single-Precision Float Vector (Aerospace Body/NED Frame)
 */
struct Vector3f {
    float x{0.0f};
    float y{0.0f};
    float z{0.0f};

    constexpr Vector3f() = default;
    constexpr Vector3f(float x_, float y_, float z_) : x(x_), y(y_), z(z_) {}

    [[nodiscard]] constexpr Vector3f operator+(const Vector3f& v) const noexcept {
        return {x + v.x, y + v.y, z + v.z};
    }

    [[nodiscard]] constexpr Vector3f operator-(const Vector3f& v) const noexcept {
        return {x - v.x, y - v.y, z - v.z};
    }

    [[nodiscard]] constexpr Vector3f operator*(float s) const noexcept {
        return {x * s, y * s, z * s};
    }

    [[nodiscard]] constexpr Vector3f operator/(float s) const noexcept {
        const float inv = 1.0f / s;
        return {x * inv, y * inv, z * inv};
    }

    constexpr Vector3f& operator+=(const Vector3f& v) noexcept {
        x += v.x; y += v.y; z += v.z;
        return *this;
    }

    [[nodiscard]] constexpr float dot(const Vector3f& v) const noexcept {
        return x * v.x + y * v.y + z * v.z;
    }

    [[nodiscard]] constexpr Vector3f cross(const Vector3f& v) const noexcept {
        return {
            y * v.z - z * v.y,
            z * v.x - x * v.z,
            x * v.y - y * v.x
        };
    }

    [[nodiscard]] float norm() const noexcept {
        return std::sqrt(dot(*this));
    }

    [[nodiscard]] Vector3f normalized() const noexcept {
        const float n = norm();
        return (n > CONSTANTS_EPSILON) ? (*this / n) : Vector3f{0.0f, 0.0f, 0.0f};
    }
};

/**
 * 3x3 Matrix for SO(3) Direction Cosine Matrices & Moment of Inertia Tensors
 */
struct Matrix3f {
    std::array<float, 9> data{1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f};

    constexpr Matrix3f() = default;
    constexpr explicit Matrix3f(const std::array<float, 9>& d) : data(d) {}

    [[nodiscard]] constexpr float operator()(size_t r, size_t c) const noexcept {
        return data[r * 3 + c];
    }

    constexpr float& operator()(size_t r, size_t c) noexcept {
        return data[r * 3 + c];
    }

    [[nodiscard]] constexpr Vector3f operator*(const Vector3f& v) const noexcept {
        return {
            data[0] * v.x + data[1] * v.y + data[2] * v.z,
            data[3] * v.x + data[4] * v.y + data[5] * v.z,
            data[6] * v.x + data[7] * v.y + data[8] * v.z
        };
    }

    [[nodiscard]] constexpr Matrix3f operator*(const Matrix3f& m) const noexcept {
        Matrix3f res{};
        for (size_t r = 0; r < 3; ++r) {
            for (size_t c = 0; c < 3; ++c) {
                res(r, c) = (*this)(r, 0) * m(0, c) +
                            (*this)(r, 1) * m(1, c) +
                            (*this)(r, 2) * m(2, c);
            }
        }
        return res;
    }

    [[nodiscard]] constexpr Matrix3f transposed() const noexcept {
        return Matrix3f({
            data[0], data[3], data[6],
            data[1], data[4], data[7],
            data[2], data[5], data[8]
        });
    }

    [[nodiscard]] constexpr float trace() const noexcept {
        return data[0] + data[4] + data[8];
    }

    /**
     * Skew-symmetric "hat" map: so(3) matrix from 3D vector
     */
    [[nodiscard]] static constexpr Matrix3f hat(const Vector3f& v) noexcept {
        return Matrix3f({
             0.0f, -v.z,   v.y,
             v.z,   0.0f, -v.x,
            -v.y,   v.x,   0.0f
        });
    }

    /**
     * Inverse skew-symmetric "vee" map: 3D vector from so(3) matrix
     */
    [[nodiscard]] static constexpr Vector3f vee(const Matrix3f& m) noexcept {
        return {
            0.5f * (m(2, 1) - m(1, 2)),
            0.5f * (m(0, 2) - m(2, 0)),
            0.5f * (m(1, 0) - m(0, 1))
        };
    }
};

/**
 * Hamiltonian Attitude Quaternion [w, x, y, z]
 */
struct Quaternionf {
    float w{1.0f};
    float x{0.0f};
    float y{0.0f};
    float z{0.0f};

    constexpr Quaternionf() = default;
    constexpr Quaternionf(float w_, float x_, float y_, float z_)
        : w(w_), x(x_), y(y_), z(z_) {}

    [[nodiscard]] constexpr Quaternionf operator*(const Quaternionf& q) const noexcept {
        return {
            w * q.w - x * q.x - y * q.y - z * q.z,
            w * q.x + x * q.w + y * q.z - z * q.y,
            w * q.y - x * q.z + y * q.w + z * q.x,
            w * q.z + x * q.y - y * q.x + z * q.w
        };
    }

    [[nodiscard]] constexpr Quaternionf conjugate() const noexcept {
        return {w, -x, -y, -z};
    }

    [[nodiscard]] float norm() const noexcept {
        return std::sqrt(w * w + x * x + y * y + z * z);
    }

    [[nodiscard]] Quaternionf normalized() const noexcept {
        const float n = norm();
        if (n > CONSTANTS_EPSILON) {
            const float inv = 1.0f / n;
            return {w * inv, x * inv, y * inv, z * inv};
        }
        return {1.0f, 0.0f, 0.0f, 0.0f};
    }

    [[nodiscard]] Matrix3f to_dcm() const noexcept;
    [[nodiscard]] Vector3f rotate(const Vector3f& v) const noexcept;
    [[nodiscard]] static Quaternionf from_euler(float roll, float pitch, float yaw) noexcept;
    void to_euler(float& roll, float& pitch, float& yaw) const noexcept;
};

// ============================================================================
// Airframe & Sensor Telemetry Definitions
// ============================================================================
enum class AirframeType : uint8_t {
    QUAD_X = 0,
    HEXA_X = 1,
    OCTO_X = 2,
    FIXED_WING = 3,
    VTOL_TILTROTOR = 4
};

enum class FlightMode : uint8_t {
    MANUAL = 0,
    STABILIZED = 1,
    ALTCTL = 2,
    POSCTL = 3,
    AUTO_MISSION = 4,
    AUTO_RTL = 5,
    TERMINATION = 6
};

struct ImuSensorSample {
    Vector3f accel_m_s2{0.0f, 0.0f, -CONSTANTS_ONE_G}; // Body accelerations
    Vector3f gyro_rad_s{0.0f, 0.0f, 0.0f};             // Body rotational rates
    Vector3f mag_gauss{0.2f, 0.0f, 0.4f};              // Earth magnetic field
    uint64_t timestamp_us{0};
};

struct VehicleAttitudeSetpoint {
    Quaternionf q_d{1.0f, 0.0f, 0.0f, 0.0f};          // Desired attitude quaternion
    Vector3f rate_feedforward_rad_s{0.0f, 0.0f, 0.0f}; // Rate feedforward
    float thrust_body[3]{0.0f, 0.0f, -0.6f};          // Normalized collective thrust
    bool reset_integral{false};
};

struct ActuatorOutputs {
    std::array<float, 8> channels{0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
    uint8_t active_channels{4};
    uint64_t timestamp_us{0};
};

// ============================================================================
// Mahony SO(3) IMU Complementary Filter & Bias Observer
// ============================================================================
class ImuComplementaryFilter {
public:
    ImuComplementaryFilter() = default;

    void initialize(float kp, float ki) noexcept {
        kp_ = kp;
        ki_ = ki;
        q_est_ = Quaternionf{1.0f, 0.0f, 0.0f, 0.0f};
        gyro_bias_ = Vector3f{0.0f, 0.0f, 0.0f};
    }

    void update(const ImuSensorSample& imu, float dt) noexcept;

    [[nodiscard]] const Quaternionf& get_attitude() const noexcept { return q_est_; }
    [[nodiscard]] const Vector3f& get_gyro_bias() const noexcept { return gyro_bias_; }
    [[nodiscard]] Vector3f get_corrected_rates(const Vector3f& raw_gyro) const noexcept {
        return raw_gyro - gyro_bias_;
    }

private:
    float kp_{2.5f};
    float ki_{0.05f};
    Quaternionf q_est_{1.0f, 0.0f, 0.0f, 0.0f};
    Vector3f gyro_bias_{0.0f, 0.0f, 0.0f};
};

// ============================================================================
// PX4 Geometric Attitude Controller on SO(3)
// ============================================================================
class PX4GeometricAttitudeControl {
public:
    PX4GeometricAttitudeControl();

    void set_attitude_gains(const Vector3f& kp_rot) noexcept { kp_rot_ = kp_rot; }
    void set_rate_pid(size_t axis, float kp, float ki, float kd, float i_max) noexcept;

    /**
     * Step the SO(3) non-linear geometric attitude controller.
     * Computes commanded normalized control moments [tau_x, tau_y, tau_z].
     */
    [[nodiscard]] Vector3f update(
        const Quaternionf& q_curr,
        const Vector3f& rates_curr,
        const VehicleAttitudeSetpoint& sp,
        float dt
    ) noexcept;

    void reset_integrators() noexcept {
        rate_int_ = Vector3f{0.0f, 0.0f, 0.0f};
    }

private:
    Vector3f kp_rot_{6.5f, 6.5f, 2.8f};          // Attitude proportional gains (P)
    Vector3f kp_rate_{0.15f, 0.15f, 0.20f};      // Angular rate proportional gains
    Vector3f ki_rate_{0.05f, 0.05f, 0.02f};      // Angular rate integral gains
    Vector3f kd_rate_{0.003f, 0.003f, 0.000f};   // Angular rate derivative gains
    Vector3f rate_int_max_{0.3f, 0.3f, 0.2f};    // Anti-windup saturation clamps
    Vector3f rate_int_{0.0f, 0.0f, 0.0f};        // Integral accumulators
    Vector3f prev_rate_error_{0.0f, 0.0f, 0.0f}; // Previous error for derivative
};

// ============================================================================
// 6-DoF Actuator Mixer Matrix & Desaturation Core
// ============================================================================
class ActuatorMixer6DOF {
public:
    explicit ActuatorMixer6DOF(AirframeType type = AirframeType::QUAD_X);

    void set_airframe(AirframeType type) noexcept;

    /**
     * Map commanded 3-axis normalized torques and collective thrust to actuator PWMs.
     * Implements strict saturation priority: Roll/Pitch > Yaw > Thrust.
     *
     * @param torque_cmd Normalized [roll, pitch, yaw] moments in range [-1.0, 1.0]
     * @param thrust_cmd Normalized collective thrust in range [0.0, 1.0]
     * @return Actuator channel outputs in range [0.0, 1.0]
     */
    [[nodiscard]] ActuatorOutputs mix(const Vector3f& torque_cmd, float thrust_cmd) const noexcept;

private:
    AirframeType type_{AirframeType::QUAD_X};
    std::array<std::array<float, 4>, 8> mix_matrix_{};
    uint8_t num_actuators_{4};

    void configure_geometry() noexcept;
};

// ============================================================================
// Integrated Embedded Flight Control System Wrapper
// ============================================================================
class EmbeddedFlightController {
public:
    EmbeddedFlightController();

    void step_fast_loop(const ImuSensorSample& imu_sample, float dt_sec) noexcept;
    void set_attitude_setpoint(const VehicleAttitudeSetpoint& sp) noexcept { attitude_sp_ = sp; }
    void set_airframe(AirframeType type) noexcept { mixer_.set_airframe(type); }

    [[nodiscard]] const ActuatorOutputs& get_actuators() const noexcept { return actuators_; }
    [[nodiscard]] const Quaternionf& get_estimated_attitude() const noexcept { return imu_filter_.get_attitude(); }

private:
    ImuComplementaryFilter imu_filter_;
    PX4GeometricAttitudeControl attitude_control_;
    ActuatorMixer6DOF mixer_;
    VehicleAttitudeSetpoint attitude_sp_{};
    ActuatorOutputs actuators_{};
    uint32_t cycle_count_{0};
};

} // namespace px4::control
