import { describe, it, expect } from 'vitest';
import { PIDController, CascadeAttitudeController } from '../src/avionics/pid.ts';
import { EKF3Estimator } from '../src/avionics/ekf3.ts';
import { Vec3 } from '../src/core/math.ts';

describe('Avionics: Cascade PID & EKF3 Sensor Fusion', () => {
  it('should drive error to zero with PID controller', () => {
    const pid = new PIDController({
      kp: 2.0,
      ki: 0.5,
      kd: 0.1,
      integralMax: 5.0,
      outputMin: -10.0,
      outputMax: 10.0,
      derivativeFilterHz: 20.0
    });

    let measurement = 0.0;
    const setpoint = 10.0;
    const dt = 0.02;

    for (let i = 0; i < 200; i++) {
      const output = pid.update(setpoint, measurement, dt);
      measurement += output * dt * 2.0; // Simulated plant
    }

    expect(measurement).toBeCloseTo(setpoint, 0);
  });

  it('should calculate cascade attitude control surface commands', () => {
    const cascade = new CascadeAttitudeController();
    const target = { roll: 0.2, pitch: 0.1, yaw: 0.0 };
    const current = { roll: 0.0, pitch: 0.0, yaw: 0.0 };
    const rates = { p: 0.0, q: 0.0, r: 0.0 };

    const command = cascade.update(target, current, rates, 0.02);
    expect(command.aileron).toBeGreaterThan(0);
    expect(command.elevator).toBeGreaterThan(0);
    expect(command.rudder).toBeCloseTo(0, 1);
  });

  it('should fuse IMU and Baro altitude in EKF3', () => {
    const ekf = new EKF3Estimator();
    ekf.predict({
      accel: Vec3.create(0, 0, -9.8),
      gyro: Vec3.create(0, 0, 0),
      timestampSec: 0.02
    }, 0.02);

    ekf.updateBaro({
      altitudeM: 50.0,
      pressurePa: 95460,
      timestampSec: 0.02
    });

    // In NED frame, Down is negative altitude
    expect(ekf.positionNED.z).toBeLessThan(0);
  });

  it('should detect EW Jamming and switch to dead-reckoning', () => {
    const ekf = new EKF3Estimator();
    const updated = ekf.updateGPS({
      latDeg: 24.7,
      lonDeg: 46.6,
      altM: 40.0,
      velNED: Vec3.create(15, 0, 0),
      fixType: 0,
      jammed: true, // EW Jammer active!
      timestampSec: 1.0
    });

    expect(updated).toBe(false);
    expect(ekf.deadReckoningActive).toBe(true);
    expect(ekf.isGPSDegraded).toBe(true);
  });
});
