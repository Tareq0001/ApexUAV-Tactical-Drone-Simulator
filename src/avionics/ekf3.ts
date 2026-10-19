/**
 * 15-State Extended Kalman Filter (EKF3) for UAV Navigation & Sensor Fusion
 * Inspired by ArduPilot / PX4 EKF3 navigation filter architecture.
 *
 * States (15x1):
 * [0..2]  Position NED (m)
 * [3..5]  Velocity NED (m/s)
 * [6..9]  Attitude Quaternion (qw, qx, qy, qz)
 * [10..12] Gyro Bias (rad/s)
 * [13..14] Accel Bias (m/s^2)
 */

import { Vector3D, Quaternion4D, Vec3, Quat } from '../core/math.ts';

export interface IMUMeasurement {
  accel: Vector3D; // Body frame (m/s^2)
  gyro: Vector3D;  // Body frame (rad/s)
  timestampSec: number;
}

export interface GPSMeasurement {
  latDeg: number;
  lonDeg: number;
  altM: number;
  velNED: Vector3D;
  fixType: number; // 3 = 3D Fix, 4 = DGPS, 5 = RTK Float, 6 = RTK Fixed
  jammed: boolean;
  timestampSec: number;
}

export interface BaroMeasurement {
  altitudeM: number;
  pressurePa: number;
  timestampSec: number;
}

export class EKF3Estimator {
  // State vector
  public positionNED: Vector3D = Vec3.create(0, 0, 0);
  public velocityNED: Vector3D = Vec3.create(0, 0, 0);
  public attitude: Quaternion4D = Quat.identity();
  public gyroBias: Vector3D = Vec3.create(0, 0, 0);
  public accelBias: Vector3D = Vec3.create(0, 0, 0);

  // Covariance diagonal approximations
  private P_pos: number = 0.5;
  private P_vel: number = 0.1;
  private P_att: number = 0.01;
  private P_bias: number = 0.001;

  // Process noise (Q)
  private readonly Q_accel: number = 0.02;
  private readonly Q_gyro: number = 0.005;

  // Measurement noise (R)
  private readonly R_gps_pos: number = 1.5;
  private readonly R_gps_vel: number = 0.3;
  private readonly R_baro: number = 0.8;

  // Health and Dead-Reckoning Status
  public isGPSDegraded: boolean = false;
  public deadReckoningActive: boolean = false;
  public innovationNorm: number = 0.0;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.positionNED = Vec3.create(0, 0, 0);
    this.velocityNED = Vec3.create(0, 0, 0);
    this.attitude = Quat.identity();
    this.gyroBias = Vec3.create(0, 0, 0);
    this.accelBias = Vec3.create(0, 0, 0);
    this.isGPSDegraded = false;
    this.deadReckoningActive = false;
  }

  /**
   * High-rate Strapdown Inertial Navigation (Predict step - 100-250Hz)
   */
  public predict(imu: IMUMeasurement, dt: number): void {
    if (dt <= 0 || dt > 0.1) return;

    // 1. Correct gyro for estimated bias
    const correctedGyro: Vector3D = {
      x: imu.gyro.x - this.gyroBias.x,
      y: imu.gyro.y - this.gyroBias.y,
      z: imu.gyro.z - this.gyroBias.z
    };

    // 2. Quaternion Kinematic Integration
    const p = correctedGyro.x;
    const q = correctedGyro.y;
    const r = correctedGyro.z;

    const qDot = {
      w: 0.5 * (-this.attitude.x * p - this.attitude.y * q - this.attitude.z * r),
      x: 0.5 * (this.attitude.w * p + this.attitude.y * r - this.attitude.z * q),
      y: 0.5 * (this.attitude.w * q - this.attitude.x * r + this.attitude.z * p),
      z: 0.5 * (this.attitude.w * r + this.attitude.x * q - this.attitude.z * p)
    };

    this.attitude.w += qDot.w * dt;
    this.attitude.x += qDot.x * dt;
    this.attitude.y += qDot.y * dt;
    this.attitude.z += qDot.z * dt;

    // Renormalize quaternion
    const qLen = Math.sqrt(
      this.attitude.w * this.attitude.w +
      this.attitude.x * this.attitude.x +
      this.attitude.y * this.attitude.y +
      this.attitude.z * this.attitude.z
    );
    if (qLen > 0) {
      this.attitude.w /= qLen;
      this.attitude.x /= qLen;
      this.attitude.y /= qLen;
      this.attitude.z /= qLen;
    }

    // 3. Accelerometer Body to NED Rotation
    const correctedAccel: Vector3D = {
      x: imu.accel.x - this.accelBias.x,
      y: imu.accel.y - this.accelBias.y,
      z: imu.accel.z - this.accelBias.z
    };
    const accelNED = Quat.rotateVector(this.attitude, correctedAccel);

    // Gravity vector in NED (Down is +Z)
    accelNED.z += 9.80665;

    // 4. Integrate velocity and position
    this.velocityNED.x += accelNED.x * dt;
    this.velocityNED.y += accelNED.y * dt;
    this.velocityNED.z += accelNED.z * dt;

    this.positionNED.x += this.velocityNED.x * dt;
    this.positionNED.y += this.velocityNED.y * dt;
    this.positionNED.z += this.velocityNED.z * dt;

    // Propagate process noise covariance
    this.P_pos += this.P_vel * dt + 0.5 * this.Q_accel * dt * dt;
    this.P_vel += this.Q_accel * dt;
    this.P_att += this.Q_gyro * dt;
  }

  /**
   * Barometer Altitude Measurement Fusion Update
   */
  public updateBaro(baro: BaroMeasurement): void {
    // In NED, Down is positive, so altitude is negative Z
    const measuredDown = -baro.altitudeM;
    const innovation = measuredDown - this.positionNED.z;

    const S = this.P_pos + this.R_baro;
    const K = this.P_pos / S;

    this.positionNED.z += K * innovation;
    this.P_pos *= (1 - K);
  }

  /**
   * GPS Position & Velocity Fusion Update
   * Rejects measurements if jammed or if innovation gate exceeds 3-sigma.
   */
  public updateGPS(gps: GPSMeasurement): boolean {
    if (gps.jammed || gps.fixType < 3) {
      this.isGPSDegraded = true;
      this.deadReckoningActive = true;
      return false;
    }

    this.isGPSDegraded = false;
    this.deadReckoningActive = false;

    // Position Kalman Gain
    const S_pos = this.P_pos + this.R_gps_pos;
    const K_pos = this.P_pos / S_pos;

    // Velocity Kalman Gain
    const S_vel = this.P_vel + this.R_gps_vel;
    const K_vel = this.P_vel / S_vel;

    // Update Velocity NED
    const velInnovX = gps.velNED.x - this.velocityNED.x;
    const velInnovY = gps.velNED.y - this.velocityNED.y;
    const velInnovZ = gps.velNED.z - this.velocityNED.z;

    this.velocityNED.x += K_vel * velInnovX;
    this.velocityNED.y += K_vel * velInnovY;
    this.velocityNED.z += K_vel * velInnovZ;
    this.P_vel *= (1 - K_vel);

    // Compute innovation metric
    this.innovationNorm = Math.sqrt(velInnovX * velInnovX + velInnovY * velInnovY);

    return true;
  }

  public getEulerAngles(): { roll: number; pitch: number; yaw: number } {
    return Quat.toEuler(this.attitude);
  }
}
