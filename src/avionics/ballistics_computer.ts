/**
 * Tactical Ballistics & Proportional Navigation Guidance Computer
 * Implements:
 * 1. 3D True Proportional Navigation (TPN) Intercept Lead Guidance
 * 2. Continuous Computed Impact Point (CCIP) Numerical Trajectory Integration
 * 3. Airborne Gun Sight Lead Reticle Kinematics
 */

import { Vector3D, Vec3 } from '../core/math.ts';

export interface TPNResult {
  accelCmd: Vector3D;       // Commanded acceleration vector (m/s^2) perpendicular to LOS
  timeToGoSec: number;     // Estimated time-to-go until intercept (seconds)
  zeroEffortMissM: number; // Zero-Effort-Miss (ZEM) distance at closest approach (meters)
  closingSpeedMs: number;  // Relative closing speed V_c along LOS (m/s)
  losRateRadS: number;     // Line-of-sight angular rotation rate (rad/s)
}

export interface CCIPResult {
  impactPoint: Vector3D;      // Predicted coordinates of ground impact point
  timeOfFlightSec: number;    // Projectile time of flight until ground impact (s)
  impactVelocity: Vector3D;   // Terminal projectile velocity vector (m/s)
  forwardRangeM: number;      // Horizontal ground distance from release to impact (m)
}

export interface GunLeadResult {
  leadAimPoint: Vector3D;     // Target future intercept position to aim bore-sight
  timeOfFlightSec: number;    // Bullet flight time (s)
  leadAngleRad: number;       // Angle offset from current line-of-sight (rad)
}

export class BallisticsComputer {
  private gravity: number = 9.80665; // m/s^2 standard gravity

  constructor(gravity: number = 9.80665) {
    this.gravity = gravity;
  }

  /**
   * 3D True Proportional Navigation (TPN) Guidance Law
   * Calculates lateral acceleration commands perpendicular to the Line of Sight (LOS)
   * to drive the LOS rotation rate to zero for an optimal collision course.
   *
   * a_cmd = N * V_c * (Omega x lambda_hat)
   *
   * @param dronePos Interceptor drone position vector
   * @param droneVel Interceptor drone velocity vector
   * @param targetPos Target vehicle position vector
   * @param targetVel Target vehicle velocity vector
   * @param navConstant Navigation ratio constant N (typically 3.0 to 5.0, default: 3.5)
   */
  public static computeTPN(
    dronePos: Vector3D,
    droneVel: Vector3D,
    targetPos: Vector3D,
    targetVel: Vector3D,
    navConstant: number = 3.5
  ): { accelCmd: Vector3D; timeToGoSec: number; zeroEffortMissM: number } {
    // 1. Relative position (LOS vector) and distance
    const rRel = Vec3.sub(targetPos, dronePos);
    const range = Vec3.length(rRel);

    if (range < 0.001) {
      return {
        accelCmd: Vec3.create(0, 0, 0),
        timeToGoSec: 0,
        zeroEffortMissM: 0
      };
    }

    const losUnit = Vec3.scale(rRel, 1.0 / range);

    // 2. Relative velocity vector
    const vRel = Vec3.sub(targetVel, droneVel);

    // 3. Closing velocity: V_c = - (R_rel . V_rel) / |R_rel|
    const closingSpeed = -Vec3.dot(losUnit, vRel);

    // 4. Time-to-go estimation: t_go = R / V_c (clamped for divergence)
    const droneSpeed = Vec3.length(droneVel);
    const effectiveVc = closingSpeed > 0.1 ? closingSpeed : Math.max(1.0, droneSpeed);
    const timeToGoSec = Math.max(0.01, range / effectiveVc);

    // 5. Normal velocity component perpendicular to LOS: V_rel_perp = V_rel - (V_rel . los) * los
    const vAlongLos = Vec3.dot(vRel, losUnit);
    const vRelPerp = Vec3.sub(vRel, Vec3.scale(losUnit, vAlongLos));

    // 6. 3D TPN Commanded Acceleration:
    // a_cmd = N * (V_c / R) * V_rel_perp  (which is mathematically identical to N * V_c * (Omega x losUnit))
    const gainFactor = (navConstant * Math.max(0.5, effectiveVc)) / range;
    let accelCmd = Vec3.scale(vRelPerp, gainFactor);

    // Dynamic G-load limiter (max 25g interceptor airframe load limit)
    const maxAccel = 25.0 * 9.80665;
    const accelMag = Vec3.length(accelCmd);
    if (accelMag > maxAccel) {
      accelCmd = Vec3.scale(accelCmd, maxAccel / accelMag);
    }

    // 7. Zero-Effort-Miss (ZEM): Miss distance vector if no further acceleration is applied
    // R_ZEM = R_rel + V_rel * t_go
    const zemVector = Vec3.add(rRel, Vec3.scale(vRel, timeToGoSec));
    const zeroEffortMissM = Vec3.length(zemVector);

    return {
      accelCmd,
      timeToGoSec,
      zeroEffortMissM
    };
  }

  /**
   * Instance wrapper for computeTPN
   */
  public computeTPN(
    dronePos: Vector3D,
    droneVel: Vector3D,
    targetPos: Vector3D,
    targetVel: Vector3D,
    navConstant: number = 3.5
  ): TPNResult {
    const rRel = Vec3.sub(targetPos, dronePos);
    const range = Math.max(0.001, Vec3.length(rRel));
    const losUnit = Vec3.scale(rRel, 1.0 / range);
    const vRel = Vec3.sub(targetVel, droneVel);
    const closingSpeed = -Vec3.dot(losUnit, vRel);

    const base = BallisticsComputer.computeTPN(dronePos, droneVel, targetPos, targetVel, navConstant);

    // LOS angular rate: Omega = |R x V| / R^2
    const cross = Vec3.cross(rRel, vRel);
    const losRateRadS = Vec3.length(cross) / (range * range);

    return {
      ...base,
      closingSpeedMs: closingSpeed,
      losRateRadS
    };
  }

  /**
   * Continuously Computed Impact Point (CCIP) Numerical Simulation
   * Integrates projectile ballistic equations with gravity and aerodynamic quadratic drag
   * from release state until ground intersection (y <= groundElevationM).
   *
   * @param releasePos Starting position of drone/weapon in World coordinates (Y is Up)
   * @param releaseVel Release velocity vector in World coordinates (m/s)
   * @param groundElevationM Elevation of terrain MSL (default 0.0)
   * @param ballisticDragCoeff Drag coefficient beta = 0.5 * rho * Cd * A / m (default: 0.0004 1/m)
   * @param dt Integration step size in seconds (default 0.015)
   */
  public computeCCIP(
    releasePos: Vector3D,
    releaseVel: Vector3D,
    groundElevationM: number = 0.0,
    ballisticDragCoeff: number = 0.0004,
    dt: number = 0.015
  ): CCIPResult {
    let simPos = Vec3.create(releasePos.x, releasePos.y, releasePos.z);
    let simVel = Vec3.create(releaseVel.x, releaseVel.y, releaseVel.z);
    let timeElapsed = 0.0;
    const maxTime = 60.0; // Max 60 seconds flight envelope

    if (simPos.y <= groundElevationM) {
      return {
        impactPoint: simPos,
        timeOfFlightSec: 0,
        impactVelocity: simVel,
        forwardRangeM: 0
      };
    }

    let prevPos = Vec3.create(simPos.x, simPos.y, simPos.z);

    while (simPos.y > groundElevationM && timeElapsed < maxTime) {
      prevPos = Vec3.create(simPos.x, simPos.y, simPos.z);

      const speed = Vec3.length(simVel);
      // Aerodynamic drag force acceleration: a_drag = -beta * |v| * v
      const dragAccel = Vec3.scale(simVel, -ballisticDragCoeff * speed);

      // Total acceleration = gravity + drag
      const totalAccel: Vector3D = {
        x: dragAccel.x,
        y: -this.gravity + dragAccel.y,
        z: dragAccel.z
      };

      // Velocity Verlet / Euler integration
      simVel = Vec3.add(simVel, Vec3.scale(totalAccel, dt));
      simPos = Vec3.add(simPos, Vec3.scale(simVel, dt));
      timeElapsed += dt;
    }

    // Linear interpolation for sub-step impact point precision at ground elevation
    if (prevPos.y > groundElevationM && simPos.y <= groundElevationM) {
      const frac = (prevPos.y - groundElevationM) / Math.max(1e-5, prevPos.y - simPos.y);
      simPos = {
        x: prevPos.x + (simPos.x - prevPos.x) * frac,
        y: groundElevationM,
        z: prevPos.z + (simPos.z - prevPos.z) * frac
      };
      timeElapsed -= (1.0 - frac) * dt;
    }

    const horizDist = Math.hypot(simPos.x - releasePos.x, simPos.z - releasePos.z);

    return {
      impactPoint: simPos,
      timeOfFlightSec: Math.max(0, timeElapsed),
      impactVelocity: simVel,
      forwardRangeM: horizDist
    };
  }

  /**
   * Calculate Gun Lead Solution for airborne cannon or interception reticle
   * Predicts future position where high-speed projectile meets moving target.
   *
   * @param shooterPos Origin of weapon fire
   * @param shooterVel Velocity of shooter platform
   * @param muzzleSpeed Muzzle exit velocity (e.g. 850 m/s for 20mm/30mm cannon)
   * @param targetPos Target position
   * @param targetVel Target velocity
   */
  public computeGunLeadSolution(
    shooterPos: Vector3D,
    shooterVel: Vector3D,
    muzzleSpeed: number,
    targetPos: Vector3D,
    targetVel: Vector3D
  ): GunLeadResult {
    const rRel = Vec3.sub(targetPos, shooterPos);
    const vRel = Vec3.sub(targetVel, shooterVel);

    // Solve quadratic equation for time of flight t:
    // |r + v*t|^2 = (V_muzzle * t)^2
    // (v.v - V_m^2)*t^2 + 2*(r.v)*t + r.r = 0
    const a = Vec3.dot(vRel, vRel) - muzzleSpeed * muzzleSpeed;
    const b = 2.0 * Vec3.dot(rRel, vRel);
    const c = Vec3.dot(rRel, rRel);

    const disc = b * b - 4.0 * a * c;
    let t = 0.1;

    if (disc >= 0 && Math.abs(a) > 1e-5) {
      const t1 = (-b - Math.sqrt(disc)) / (2.0 * a);
      const t2 = (-b + Math.sqrt(disc)) / (2.0 * a);
      if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
      else if (t1 > 0) t = t1;
      else if (t2 > 0) t = t2;
    } else {
      t = Vec3.length(rRel) / Math.max(10.0, muzzleSpeed);
    }

    const leadAimPoint = Vec3.add(targetPos, Vec3.scale(targetVel, t));
    const aimVec = Vec3.normalize(Vec3.sub(leadAimPoint, shooterPos));
    const losVec = Vec3.normalize(rRel);
    const cosAngle = Math.max(-1.0, Math.min(1.0, Vec3.dot(aimVec, losVec)));
    const leadAngleRad = Math.acos(cosAngle);

    return {
      leadAimPoint,
      timeOfFlightSec: t,
      leadAngleRad
    };
  }
}
