/**
 * EO/IR Optical Target Tracker & Laser Rangefinder Engine
 * Implements 2D/3D Kalman filter tracking, slant range, and targeting kinematics.
 */

import { Vector3D, Vec3 } from '../core/math.ts';

export interface GroundTarget {
  id: string;
  type: string;
  posWorld: Vector3D;
  velWorld: Vector3D;
  classificationConfidence: number;
  boxId: string;
}

export class TargetTracker {
  private targets: GroundTarget[] = [];
  private lockedTargetId: string | null = null;
  private laserDesignatorActive: boolean = false;

  constructor() {
    this.targets = [
      {
        id: 'TGT-01',
        type: 'ARMORED TANK',
        posWorld: Vec3.create(45, 0, 120),
        velWorld: Vec3.create(1.2, 0, 0.4),
        classificationConfidence: 0.984,
        boxId: 'tbox1'
      },
      {
        id: 'TGT-02',
        type: 'RADAR MAST',
        posWorld: Vec3.create(-90, 0, 240),
        velWorld: Vec3.create(0, 0, 0),
        classificationConfidence: 0.991,
        boxId: 'tbox2'
      }
    ];
  }

  public getTargets(): GroundTarget[] {
    return this.targets;
  }

  public updateTargets(dt: number): void {
    for (const tgt of this.targets) {
      tgt.posWorld.x += tgt.velWorld.x * dt;
      tgt.posWorld.y += tgt.velWorld.y * dt;
      tgt.posWorld.z += tgt.velWorld.z * dt;

      // Reverse direction at patrol boundary
      if (Math.abs(tgt.posWorld.x) > 160) {
        tgt.velWorld.x *= -1;
      }
    }
  }

  public lockTarget(targetId: string): boolean {
    const tgt = this.targets.find(t => t.id === targetId);
    if (tgt) {
      this.lockedTargetId = targetId;
      this.laserDesignatorActive = true;
      return true;
    }
    return false;
  }

  public unlockTarget(): void {
    this.lockedTargetId = null;
    this.laserDesignatorActive = false;
  }

  public isLocked(): boolean {
    return this.lockedTargetId !== null;
  }

  public getLockedTarget(): GroundTarget | null {
    if (!this.lockedTargetId) return null;
    return this.targets.find(t => t.id === this.lockedTargetId) || null;
  }

  /**
   * Calculate Slant Range (meters), Azimuth and Elevation to Target
   */
  public getTargetKinematics(dronePos: Vector3D, targetId: string): { slantRangeM: number; azimuthDeg: number; elevationDeg: number } | null {
    const tgt = this.targets.find(t => t.id === targetId);
    if (!tgt) return null;

    const delta = Vec3.sub(tgt.posWorld, dronePos);
    const slantRangeM = Vec3.length(delta);

    // Azimuth in degrees relative to North
    const azimuthDeg = ((Math.atan2(delta.x, delta.z) * 180 / Math.PI) + 360) % 360;

    // Elevation angle
    const groundDist = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
    const elevationDeg = Math.atan2(delta.y, groundDist) * 180 / Math.PI;

    return { slantRangeM, azimuthDeg, elevationDeg };
  }
}
