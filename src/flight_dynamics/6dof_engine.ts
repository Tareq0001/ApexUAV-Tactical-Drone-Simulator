/**
 * 6-Degree-of-Freedom (6-DoF) Non-Linear Rigid-Body Flight Dynamics Engine
 * Implements Newton-Euler equations of motion, aerodynamic forces & moments.
 */

import { Vector3D, Quaternion4D, Vec3, Quat } from '../core/math.ts';

export interface AircraftParameters {
  massKg: number;
  wingAreaM2: number;
  wingspanM: number;
  meanChordM: number;
  inertiaTensor: { Ixx: number; Iyy: number; Izz: number };
  maxThrustN: number;
  dragCoeffBase: number;
  liftCoeffSlope: number;
}

export interface AircraftState {
  positionNED: Vector3D;      // North, East, Down (meters)
  velocityBody: Vector3D;     // U, V, W in body frame (m/s)
  angularVelocity: Vector3D;  // P, Q, R (rad/s)
  attitude: Quaternion4D;     // Orientation quaternion
  throttle: number;           // 0.0 to 1.0
  controlSurfaces: {
    aileron: number;   // -1.0 to 1.0
    elevator: number;  // -1.0 to 1.0
    rudder: number;    // -1.0 to 1.0
  };
}

export class FlightDynamicsEngine {
  private params: AircraftParameters;
  private state: AircraftState;
  private airDensity: number = 1.225; // Sea-level standard atmosphere (kg/m3)
  private gravity: number = 9.80665;  // m/s2

  constructor(params?: Partial<AircraftParameters>) {
    this.params = {
      massKg: params?.massKg ?? 12.5,
      wingAreaM2: params?.wingAreaM2 ?? 0.85,
      wingspanM: params?.wingspanM ?? 2.4,
      meanChordM: params?.meanChordM ?? 0.35,
      inertiaTensor: params?.inertiaTensor ?? { Ixx: 0.82, Iyy: 1.15, Izz: 1.75 },
      maxThrustN: params?.maxThrustN ?? 95.0,
      dragCoeffBase: params?.dragCoeffBase ?? 0.028,
      liftCoeffSlope: params?.liftCoeffSlope ?? 5.2
    };

    this.state = {
      positionNED: Vec3.create(0, 0, -25.0), // 25 meters altitude (Down is negative in NED)
      velocityBody: Vec3.create(18.0, 0, 0),  // 18 m/s forward trim speed
      angularVelocity: Vec3.create(0, 0, 0),
      attitude: Quat.identity(),
      throttle: 0.55,
      controlSurfaces: { aileron: 0, elevator: 0, rudder: 0 }
    };
  }

  public step(dt: number): AircraftState {
    const subSteps = Math.max(1, Math.ceil(dt / 0.005));
    const dtSub = dt / subSteps;
    for (let s = 0; s < subSteps; s++) {
      this.integrateStep(dtSub);
    }
    return this.getState();
  }

  private integrateStep(dt: number): void {
    // 1. Aerodynamic Airspeed & Dynamic Pressure
    const airspeed = Vec3.length(this.state.velocityBody);
    const qBar = 0.5 * this.airDensity * Math.pow(Math.max(airspeed, 0.1), 2);

    // 2. Angle of Attack (Alpha) & Sideslip (Beta)
    const alpha = Math.atan2(this.state.velocityBody.z, Math.max(Math.abs(this.state.velocityBody.x), 0.5));
    const beta = Math.asin(Math.max(-1, Math.min(1, this.state.velocityBody.y / Math.max(airspeed, 0.5))));

    // 3. Aerodynamic Coefficients
    const cL = this.params.liftCoeffSlope * alpha + this.state.controlSurfaces.elevator * -0.4;
    const cD = this.params.dragCoeffBase + (Math.pow(cL, 2) / (Math.PI * 0.8 * (Math.pow(this.params.wingspanM, 2) / this.params.wingAreaM2)));
    const cY = -0.3 * beta + this.state.controlSurfaces.rudder * 0.2;

    // 4. Aerodynamic Forces in Body Frame
    const liftN = cL * qBar * this.params.wingAreaM2;
    const dragN = cD * qBar * this.params.wingAreaM2;
    const sideN = cY * qBar * this.params.wingAreaM2;

    const thrustN = this.state.throttle * this.params.maxThrustN;

    // F_body = Thrust - Drag + Gravity projected into body frame
    const gravNED = Vec3.create(0, 0, this.params.massKg * this.gravity);
    const qConj: Quaternion4D = {
      w: this.state.attitude.w,
      x: -this.state.attitude.x,
      y: -this.state.attitude.y,
      z: -this.state.attitude.z
    };
    const gravBody = Quat.rotateVector(qConj, gravNED);

    const fBody: Vector3D = {
      x: thrustN - dragN + gravBody.x,
      y: sideN + gravBody.y,
      z: -liftN + gravBody.z
    };

    // 5. Translational Acceleration (Newton's 2nd Law in rotating frame: a = F/m - w x v)
    const omegaCrossV = Vec3.cross(this.state.angularVelocity, this.state.velocityBody);
    const accelBody: Vector3D = {
      x: (fBody.x / this.params.massKg) - omegaCrossV.x,
      y: (fBody.y / this.params.massKg) - omegaCrossV.y,
      z: (fBody.z / this.params.massKg) - omegaCrossV.z
    };

    // Integrate body velocity
    this.state.velocityBody = Vec3.add(this.state.velocityBody, Vec3.scale(accelBody, dt));

    // 6. Rotational Moments & Angular Acceleration
    const lMoment = qBar * this.params.wingAreaM2 * this.params.wingspanM * (this.state.controlSurfaces.aileron * 0.15 - this.state.angularVelocity.x * 0.25);
    const mMoment = qBar * this.params.wingAreaM2 * this.params.meanChordM * (this.state.controlSurfaces.elevator * 0.25 - this.state.angularVelocity.y * 0.35);
    const nMoment = qBar * this.params.wingAreaM2 * this.params.wingspanM * (this.state.controlSurfaces.rudder * 0.08 - this.state.angularVelocity.z * 0.20);

    // Euler Rotational Dynamics (I * w_dot + w x (I * w) = M)
    const p = this.state.angularVelocity.x;
    const q = this.state.angularVelocity.y;
    const r = this.state.angularVelocity.z;

    const pDot = (lMoment - (this.params.inertiaTensor.Izz - this.params.inertiaTensor.Iyy) * q * r) / this.params.inertiaTensor.Ixx;
    const qDot = (mMoment - (this.params.inertiaTensor.Ixx - this.params.inertiaTensor.Izz) * p * r) / this.params.inertiaTensor.Iyy;
    const rDot = (nMoment - (this.params.inertiaTensor.Iyy - this.params.inertiaTensor.Ixx) * p * q) / this.params.inertiaTensor.Izz;

    const maxRate = 5.0; // max 5 rad/s
    this.state.angularVelocity.x = Math.max(-maxRate, Math.min(maxRate, this.state.angularVelocity.x + pDot * dt));
    this.state.angularVelocity.y = Math.max(-maxRate, Math.min(maxRate, this.state.angularVelocity.y + qDot * dt));
    this.state.angularVelocity.z = Math.max(-maxRate, Math.min(maxRate, this.state.angularVelocity.z + rDot * dt));

    // 7. Quaternion Kinematics Update
    const qDeriv = {
      w: 0.5 * (-this.state.attitude.x * p - this.state.attitude.y * q - this.state.attitude.z * r),
      x: 0.5 * (this.state.attitude.w * p + this.state.attitude.y * r - this.state.attitude.z * q),
      y: 0.5 * (this.state.attitude.w * q - this.state.attitude.x * r + this.state.attitude.z * p),
      z: 0.5 * (this.state.attitude.w * r + this.state.attitude.x * q - this.state.attitude.y * p)
    };

    this.state.attitude.w += qDeriv.w * dt;
    this.state.attitude.x += qDeriv.x * dt;
    this.state.attitude.y += qDeriv.y * dt;
    this.state.attitude.z += qDeriv.z * dt;

    // Normalize quaternion
    const qLen = Math.sqrt(
      Math.pow(this.state.attitude.w, 2) + Math.pow(this.state.attitude.x, 2) +
      Math.pow(this.state.attitude.y, 2) + Math.pow(this.state.attitude.z, 2)
    );
    if (qLen > 0) {
      this.state.attitude.w /= qLen;
      this.state.attitude.x /= qLen;
      this.state.attitude.y /= qLen;
      this.state.attitude.z /= qLen;
    }

    // 8. Transform Body Velocity to NED Position
    const velocityNED = Quat.rotateVector(this.state.attitude, this.state.velocityBody);
    this.state.positionNED = Vec3.add(this.state.positionNED, Vec3.scale(velocityNED, dt));

    // Ground clamp (Altitude above ground >= 0)
    if (this.state.positionNED.z > 0) {
      this.state.positionNED.z = 0;
      this.state.velocityBody = Vec3.create(0, 0, 0);
      this.state.angularVelocity = Vec3.create(0, 0, 0);
    }
  }

  public setControls(throttle: number, aileron: number, elevator: number, rudder: number): void {
    this.state.throttle = Math.max(0, Math.min(1, throttle));
    this.state.controlSurfaces.aileron = Math.max(-1, Math.min(1, aileron));
    this.state.controlSurfaces.elevator = Math.max(-1, Math.min(1, elevator));
    this.state.controlSurfaces.rudder = Math.max(-1, Math.min(1, rudder));
  }

  public getState(): AircraftState {
    return JSON.parse(JSON.stringify(this.state));
  }
}
