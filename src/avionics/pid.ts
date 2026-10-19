/**
 * Military-Grade Cascade PID Controller with Anti-Windup & Derivative Filter
 * STANAG 4586 compliant flight stabilization architecture.
 */

export interface PIDGains {
  kp: number;
  ki: number;
  kd: number;
  kff?: number; // Feed-forward gain
  integralMax: number;
  outputMin: number;
  outputMax: number;
  derivativeFilterHz: number;
}

export class PIDController {
  private gains: PIDGains;
  private integral: number = 0;
  private previousError: number = 0;
  private derivativeFiltered: number = 0;

  constructor(gains: PIDGains) {
    this.gains = gains;
  }

  public update(setpoint: number, measurement: number, dt: number): number {
    if (dt <= 0) return 0;

    const error = setpoint - measurement;

    // Proportional term
    const pTerm = this.gains.kp * error;

    // Integral term with trapezoidal integration & clamping anti-windup
    this.integral += 0.5 * (error + this.previousError) * dt;
    this.integral = Math.max(-this.gains.integralMax, Math.min(this.gains.integralMax, this.integral));
    const iTerm = this.gains.ki * this.integral;

    // Derivative term on error with first-order low-pass filter
    const rawDerivative = (error - this.previousError) / dt;
    const alpha = (2 * Math.PI * dt * this.gains.derivativeFilterHz) /
                  (2 * Math.PI * dt * this.gains.derivativeFilterHz + 1);
    this.derivativeFiltered += alpha * (rawDerivative - this.derivativeFiltered);
    const dTerm = this.gains.kd * this.derivativeFiltered;

    // Feed-forward term
    const ffTerm = (this.gains.kff ?? 0) * setpoint;

    this.previousError = error;

    // Total output clamped
    const rawOutput = pTerm + iTerm + dTerm + ffTerm;
    return Math.max(this.gains.outputMin, Math.min(this.gains.outputMax, rawOutput));
  }

  public reset(): void {
    this.integral = 0;
    this.previousError = 0;
    this.derivativeFiltered = 0;
  }

  public setGains(newGains: Partial<PIDGains>): void {
    this.gains = { ...this.gains, ...newGains };
  }
}

/**
 * Cascade Attitude & Rate Controller for Roll, Pitch, and Yaw
 */
export class CascadeAttitudeController {
  // Outer Attitude Loops (Target Angle -> Desired Angular Rate)
  public rollAnglePID: PIDController;
  public pitchAnglePID: PIDController;
  public yawAnglePID: PIDController;

  // Inner Rate Loops (Target Angular Rate -> Control Surface Deflection / Motor Command)
  public rollRatePID: PIDController;
  public pitchRatePID: PIDController;
  public yawRatePID: PIDController;

  constructor() {
    this.rollAnglePID = new PIDController({
      kp: 4.5,
      ki: 0.0,
      kd: 0.05,
      integralMax: 1.0,
      outputMin: -3.0, // max 3.0 rad/s
      outputMax: 3.0,
      derivativeFilterHz: 20.0
    });

    this.pitchAnglePID = new PIDController({
      kp: 4.0,
      ki: 0.0,
      kd: 0.06,
      integralMax: 1.0,
      outputMin: -2.5,
      outputMax: 2.5,
      derivativeFilterHz: 20.0
    });

    this.yawAnglePID = new PIDController({
      kp: 2.5,
      ki: 0.0,
      kd: 0.02,
      integralMax: 0.8,
      outputMin: -1.8,
      outputMax: 1.8,
      derivativeFilterHz: 15.0
    });

    this.rollRatePID = new PIDController({
      kp: 0.18,
      ki: 0.04,
      kd: 0.008,
      integralMax: 0.3,
      outputMin: -1.0,
      outputMax: 1.0,
      derivativeFilterHz: 40.0
    });

    this.pitchRatePID = new PIDController({
      kp: 0.22,
      ki: 0.05,
      kd: 0.012,
      integralMax: 0.35,
      outputMin: -1.0,
      outputMax: 1.0,
      derivativeFilterHz: 40.0
    });

    this.yawRatePID = new PIDController({
      kp: 0.28,
      ki: 0.02,
      kd: 0.005,
      integralMax: 0.25,
      outputMin: -1.0,
      outputMax: 1.0,
      derivativeFilterHz: 30.0
    });
  }

  public update(
    targetAngles: { roll: number; pitch: number; yaw: number },
    currentAngles: { roll: number; pitch: number; yaw: number },
    currentRates: { p: number; q: number; r: number },
    dt: number
  ): { aileron: number; elevator: number; rudder: number } {
    // 1. Outer Loop: Calculate desired angular rates
    const desiredP = this.rollAnglePID.update(targetAngles.roll, currentAngles.roll, dt);
    const desiredQ = this.pitchAnglePID.update(targetAngles.pitch, currentAngles.pitch, dt);

    // Normalize yaw error across [-PI, PI]
    let yawDiff = targetAngles.yaw - currentAngles.yaw;
    while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
    while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;
    const desiredR = this.yawAnglePID.update(yawDiff, 0, dt);

    // 2. Inner Loop: Calculate control surface deflections (-1.0 to 1.0)
    const aileron = this.rollRatePID.update(desiredP, currentRates.p, dt);
    const elevator = this.pitchRatePID.update(desiredQ, currentRates.q, dt);
    const rudder = this.yawRatePID.update(desiredR, currentRates.r, dt);

    return { aileron, elevator, rudder };
  }

  public reset(): void {
    this.rollAnglePID.reset();
    this.pitchAnglePID.reset();
    this.yawAnglePID.reset();
    this.rollRatePID.reset();
    this.pitchRatePID.reset();
    this.yawRatePID.reset();
  }
}
