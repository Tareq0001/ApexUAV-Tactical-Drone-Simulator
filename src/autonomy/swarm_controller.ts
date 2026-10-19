/**
 * Autonomous Multi-UAV Tactical Swarm & Consensus Formation Controller
 * Implements Leader-Follower Graph Consensus + Artificial Potential Field (APF)
 * Collision Avoidance for Coordinated Defense UAV Swarms.
 */

import { Vector3D, Vec3 } from '../core/math.ts';

export type SwarmFormationType = 'V_WEDGE' | 'COMBAT_DIAMOND' | 'ORBIT_RING';

export interface WingmanAgent {
  id: string;
  callsign: string;
  positionWorld: Vector3D; // Three.js World frame (X: East, Y: Up, Z: North)
  velocityWorld: Vector3D;
  yawRad: number;
  rollRad: number;
  pitchRad: number;
  formationOffsetBody: Vector3D; // Desired offset relative to Leader body frame
  trackingErrorM: number;
  datalinkRssiDbm: number;
}

export class TacticalSwarmController {
  private wingmen: WingmanAgent[] = [];
  private formation: SwarmFormationType = 'V_WEDGE';
  private orbitPhaseRad: number = 0;

  // Control & Potential Field gains
  private readonly kpPos: number = 2.8;
  private readonly kdVel: number = 1.9;
  private readonly repulsionGain: number = 45.0;
  private readonly safeSeparationM: number = 6.5;
  private readonly maxWingmanSpeedMs: number = 45.0;

  constructor(initialLeaderPos: Vector3D = Vec3.create(0, 35, 0)) {
    const offsets = TacticalSwarmController.getFormationOffsets('V_WEDGE');
    this.wingmen = [
      {
        id: 'UAV-02',
        callsign: 'ALPHA-2',
        positionWorld: Vec3.add(initialLeaderPos, offsets[0]),
        velocityWorld: Vec3.create(0, 0, 0),
        yawRad: 0,
        rollRad: 0,
        pitchRad: 0,
        formationOffsetBody: offsets[0],
        trackingErrorM: 0,
        datalinkRssiDbm: -48
      },
      {
        id: 'UAV-03',
        callsign: 'ALPHA-3',
        positionWorld: Vec3.add(initialLeaderPos, offsets[1]),
        velocityWorld: Vec3.create(0, 0, 0),
        yawRad: 0,
        rollRad: 0,
        pitchRad: 0,
        formationOffsetBody: offsets[1],
        trackingErrorM: 0,
        datalinkRssiDbm: -51
      },
      {
        id: 'UAV-04',
        callsign: 'ALPHA-4',
        positionWorld: Vec3.add(initialLeaderPos, offsets[2]),
        velocityWorld: Vec3.create(0, 0, 0),
        yawRad: 0,
        rollRad: 0,
        pitchRad: 0,
        formationOffsetBody: offsets[2],
        trackingErrorM: 0,
        datalinkRssiDbm: -53
      }
    ];
  }

  public static getFormationOffsets(formation: SwarmFormationType): Vector3D[] {
    switch (formation) {
      case 'V_WEDGE':
        return [
          Vec3.create(-12, 0.5, -10), // Left wingman echelon
          Vec3.create(12, 0.5, -10),  // Right wingman echelon
          Vec3.create(24, 1.5, -20)   // Outer right trail
        ];
      case 'COMBAT_DIAMOND':
        return [
          Vec3.create(-15, 0, -8),    // Left flank
          Vec3.create(15, 0, -8),     // Right flank
          Vec3.create(0, 2.0, -22)    // Rear guard high
        ];
      case 'ORBIT_RING':
        return [
          Vec3.create(-18, 1.0, 0),
          Vec3.create(9, 1.0, 15.58),
          Vec3.create(9, 1.0, -15.58)
        ];
    }
  }

  public setFormation(formation: SwarmFormationType): void {
    this.formation = formation;
    const offsets = TacticalSwarmController.getFormationOffsets(formation);
    this.wingmen.forEach((w, idx) => {
      w.formationOffsetBody = offsets[idx];
    });
  }

  public getFormation(): SwarmFormationType {
    return this.formation;
  }

  public getWingmen(): WingmanAgent[] {
    return this.wingmen;
  }

  /**
   * Step the distributed consensus & Artificial Potential Field (APF) swarm dynamics
   */
  public step(
    leaderPosWorld: Vector3D,
    leaderVelWorld: Vector3D,
    leaderYawRad: number,
    dt: number
  ): WingmanAgent[] {
    if (dt <= 0) return this.wingmen;

    this.orbitPhaseRad = (this.orbitPhaseRad + 0.85 * dt) % (2 * Math.PI);

    const cosY = Math.cos(leaderYawRad);
    const sinY = Math.sin(leaderYawRad);

    for (let i = 0; i < this.wingmen.length; i++) {
      const agent = this.wingmen[i];

      // 1. Compute desired slot in World coordinates by rotating formation offset by leader heading
      let localOffset = agent.formationOffsetBody;
      if (this.formation === 'ORBIT_RING') {
        const angle = this.orbitPhaseRad + (i * 2 * Math.PI) / 3;
        const radius = 18.0;
        localOffset = Vec3.create(Math.cos(angle) * radius, 1.5, Math.sin(angle) * radius);
      }

      const rotatedOffset: Vector3D = {
        x: localOffset.x * cosY + localOffset.z * sinY,
        y: localOffset.y,
        z: -localOffset.x * sinY + localOffset.z * cosY
      };

      const targetPos = Vec3.add(leaderPosWorld, rotatedOffset);
      const posError = Vec3.sub(targetPos, agent.positionWorld);
      agent.trackingErrorM = Vec3.length(posError);

      // 2. Consensus PD Attraction Force toward formation slot
      const velError = Vec3.sub(leaderVelWorld, agent.velocityWorld);
      let accelCmd = Vec3.add(
        Vec3.scale(posError, this.kpPos),
        Vec3.scale(velError, this.kdVel)
      );

      // 3. Artificial Potential Field (APF) Repulsion from Leader and peer Wingmen
      const obstacles: Vector3D[] = [leaderPosWorld];
      for (let j = 0; j < this.wingmen.length; j++) {
        if (i !== j) obstacles.push(this.wingmen[j].positionWorld);
      }

      for (const obs of obstacles) {
        const diff = Vec3.sub(agent.positionWorld, obs);
        const dist = Math.max(0.5, Vec3.length(diff));
        if (dist < this.safeSeparationM) {
          // Repulsive potential gradient: F_rep = k_rep * (1/d - 1/d0) * (1/d^2) * u_hat
          const repMag = this.repulsionGain * (1.0 / dist - 1.0 / this.safeSeparationM) / (dist * dist);
          const repVec = Vec3.scale(Vec3.normalize(diff), repMag);
          accelCmd = Vec3.add(accelCmd, repVec);
        }
      }

      // 4. Integrate velocity & clamp to airframe envelope
      agent.velocityWorld = Vec3.add(agent.velocityWorld, Vec3.scale(accelCmd, dt));
      const speed = Vec3.length(agent.velocityWorld);
      if (speed > this.maxWingmanSpeedMs) {
        agent.velocityWorld = Vec3.scale(agent.velocityWorld, this.maxWingmanSpeedMs / speed);
      }

      // 5. Integrate position & enforce minimum altitude floor
      agent.positionWorld = Vec3.add(agent.positionWorld, Vec3.scale(agent.velocityWorld, dt));
      if (agent.positionWorld.y < 2.0) {
        agent.positionWorld.y = 2.0;
        agent.velocityWorld.y = Math.max(0, agent.velocityWorld.y);
      }

      // 6. Attitude banking & pitch coordination
      agent.yawRad = leaderYawRad;
      agent.rollRad = Math.max(-0.6, Math.min(0.6, -accelCmd.x * 0.04));
      agent.pitchRad = Math.max(-0.4, Math.min(0.4, accelCmd.z * 0.03));
    }

    return this.wingmen;
  }

  /**
   * Compute mean formation coherence error (RMSE in meters) across all wingmen
   */
  public getFormationCoherenceErrorM(): number {
    if (this.wingmen.length === 0) return 0;
    const sumSq = this.wingmen.reduce((acc, w) => acc + w.trackingErrorM * w.trackingErrorM, 0);
    return Math.sqrt(sumSq / this.wingmen.length);
  }
}
