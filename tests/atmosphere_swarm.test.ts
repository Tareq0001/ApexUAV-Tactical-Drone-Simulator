import { describe, it, expect } from 'vitest';
import { DrydenAtmosphereEngine } from '../src/flight_dynamics/atmosphere_dryden.ts';
import { TacticalSwarmController } from '../src/autonomy/swarm_controller.ts';
import { BallisticsComputer } from '../src/avionics/ballistics_computer.ts';
import { Vec3 } from '../src/core/math.ts';

describe('MIL-F-8785C Dryden Atmosphere & ISA Engine', () => {
  it('should compute International Standard Atmosphere (ISA) properties accurately at sea level', () => {
    const seaLevel = DrydenAtmosphereEngine.computeISA(0);
    expect(seaLevel.temperatureK).toBeCloseTo(288.15, 1);
    expect(seaLevel.pressurePa).toBeCloseTo(101325, 0);
    expect(seaLevel.densityKgM3).toBeCloseTo(1.225, 2);
    expect(seaLevel.speedOfSoundMs).toBeCloseTo(340.3, 0);
  });

  it('should compute ISA lapse rate in Troposphere and isothermal Stratosphere', () => {
    const midAlt = DrydenAtmosphereEngine.computeISA(5000);
    expect(midAlt.temperatureK).toBeLessThan(288.15);
    expect(midAlt.densityKgM3).toBeLessThan(1.225);
    expect(midAlt.pressurePa).toBeLessThan(101325);

    // Tropopause boundary at 11,000m
    const tropopause = DrydenAtmosphereEngine.computeISA(11000);
    expect(tropopause.temperatureK).toBeCloseTo(216.65, 1);

    // Lower Stratosphere (isothermal layer)
    const stratosphere = DrydenAtmosphereEngine.computeISA(14000);
    expect(stratosphere.temperatureK).toBeCloseTo(216.65, 1);
    expect(stratosphere.densityKgM3).toBeLessThan(tropopause.densityKgM3);
  });

  it('should generate zero turbulence when severity is NONE', () => {
    const atmo = new DrydenAtmosphereEngine('NONE');
    const state = atmo.step(100, 25.0, 0.02);

    expect(state.windNED.x).toBe(0);
    expect(state.windNED.y).toBe(0);
    expect(state.windNED.z).toBe(0);
    expect(state.turbulenceBody.x).toBe(0);
    expect(state.turbulenceBody.y).toBe(0);
    expect(state.turbulenceBody.z).toBe(0);
  });

  it('should generate continuous Dryden turbulence stochastic gusts in LIGHT and SEVERE modes', () => {
    const atmo = new DrydenAtmosphereEngine('LIGHT');
    expect(atmo.getSeverity()).toBe('LIGHT');

    const state1 = atmo.step(50, 22.0, 0.02);
    expect(state1.windNED).toBeDefined();
    expect(Vec3.length(state1.windNED)).toBeGreaterThan(0);

    atmo.setSeverity('SEVERE');
    expect(atmo.getSeverity()).toBe('SEVERE');
    const stateSevere = atmo.step(50, 22.0, 0.02);
    expect(Vec3.length(stateSevere.windNED)).toBeGreaterThan(Vec3.length(state1.windNED));
  });
});

describe('Autonomous Multi-UAV Tactical Swarm Controller', () => {
  it('should initialize 3 wingmen in V-Wedge formation', () => {
    const leaderPos = Vec3.create(0, 30, 0);
    const swarm = new TacticalSwarmController(leaderPos);
    const wingmen = swarm.getWingmen();

    expect(wingmen.length).toBe(3);
    expect(wingmen[0].callsign).toBe('ALPHA-2');
    expect(wingmen[1].callsign).toBe('ALPHA-3');
    expect(wingmen[2].callsign).toBe('ALPHA-4');
    expect(swarm.getFormation()).toBe('V_WEDGE');
  });

  it('should update formation offsets when switching formations', () => {
    const swarm = new TacticalSwarmController();
    swarm.setFormation('COMBAT_DIAMOND');
    expect(swarm.getFormation()).toBe('COMBAT_DIAMOND');

    const wingmen = swarm.getWingmen();
    const diamondOffsets = TacticalSwarmController.getFormationOffsets('COMBAT_DIAMOND');
    expect(wingmen[0].formationOffsetBody.x).toBe(diamondOffsets[0].x);
    expect(wingmen[1].formationOffsetBody.x).toBe(diamondOffsets[1].x);
    expect(wingmen[2].formationOffsetBody.z).toBe(diamondOffsets[2].z);
  });

  it('should converge wingmen towards desired formation slots over simulation time', () => {
    const leaderPos = Vec3.create(100, 40, 100);
    const leaderVel = Vec3.create(0, 0, 18);
    const swarm = new TacticalSwarmController(leaderPos);

    // Initial displacement
    swarm.getWingmen()[0].positionWorld = Vec3.create(20, 40, 20);
    swarm.step(leaderPos, leaderVel, 0, 0.02);
    const initialError = swarm.getWingmen()[0].trackingErrorM;

    for (let step = 0; step < 150; step++) {
      swarm.step(leaderPos, leaderVel, 0, 0.02);
    }

    const finalError = swarm.getWingmen()[0].trackingErrorM;
    expect(finalError).toBeLessThan(initialError);
    expect(swarm.getFormationCoherenceErrorM()).toBeGreaterThanOrEqual(0);
  });

  it('should activate APF (Artificial Potential Field) repulsive forces to prevent collisions', () => {
    const leaderPos = Vec3.create(0, 30, 0);
    const swarm = new TacticalSwarmController(leaderPos);

    // Place wingman 0 and wingman 1 in immediate collision proximity (1.0m apart)
    swarm.getWingmen()[0].positionWorld = Vec3.create(10.0, 30.0, 0.0);
    swarm.getWingmen()[0].velocityWorld = Vec3.create(0, 0, 0);
    swarm.getWingmen()[1].positionWorld = Vec3.create(11.0, 30.0, 0.0);
    swarm.getWingmen()[1].velocityWorld = Vec3.create(0, 0, 0);

    const initialDistance = Vec3.length(
      Vec3.sub(swarm.getWingmen()[0].positionWorld, swarm.getWingmen()[1].positionWorld)
    );

    // Step simulation
    swarm.step(leaderPos, Vec3.create(0, 0, 0), 0, 0.05);

    const postDistance = Vec3.length(
      Vec3.sub(swarm.getWingmen()[0].positionWorld, swarm.getWingmen()[1].positionWorld)
    );

    // APF repulsion must push them apart, increasing separation distance
    expect(postDistance).toBeGreaterThan(initialDistance);
  });
});

describe('Tactical Ballistics & Proportional Navigation Computer', () => {
  it('should compute True Proportional Navigation (TPN) collision course against stationary target', () => {
    const dronePos = Vec3.create(0, 50, 0);
    const droneVel = Vec3.create(0, 0, 40);
    const targetPos = Vec3.create(0, 50, 400); // 400m directly ahead
    const targetVel = Vec3.create(0, 0, 0);

    const tpn = BallisticsComputer.computeTPN(dronePos, droneVel, targetPos, targetVel, 3.5);

    // On pure collision course, lateral acceleration command is zero
    expect(Vec3.length(tpn.accelCmd)).toBeCloseTo(0, 1);
    // Time to go = 400m / 40 m/s = 10s
    expect(tpn.timeToGoSec).toBeCloseTo(10.0, 0);
    // Zero-Effort-Miss distance is approximately 0
    expect(tpn.zeroEffortMissM).toBeCloseTo(0, 0);
  });

  it('should compute lateral acceleration command to intercept cross-velocity target', () => {
    const dronePos = Vec3.create(0, 50, 0);
    const droneVel = Vec3.create(0, 0, 50);
    const targetPos = Vec3.create(0, 50, 300);
    const targetVel = Vec3.create(15, 0, 0); // Target maneuvering laterally right

    const tpn3 = BallisticsComputer.computeTPN(dronePos, droneVel, targetPos, targetVel, 3.0);
    const tpn5 = BallisticsComputer.computeTPN(dronePos, droneVel, targetPos, targetVel, 5.0);

    // Commanded acceleration should steer toward the positive X direction (lead angle)
    expect(tpn3.accelCmd.x).toBeGreaterThan(0);
    // Higher navigation constant N generates higher corrective lateral acceleration
    expect(tpn5.accelCmd.x).toBeGreaterThan(tpn3.accelCmd.x);
    expect(tpn3.timeToGoSec).toBeGreaterThan(0);
  });

  it('should compute Continuous Computed Impact Point (CCIP) ballistic trajectory', () => {
    const computer = new BallisticsComputer();
    const releasePos = Vec3.create(0, 150, 0); // 150m altitude
    const releaseVel = Vec3.create(0, 0, 25);  // 25 m/s forward velocity

    const ccip = computer.computeCCIP(releasePos, releaseVel, 0.0);

    // Projectile impacts at ground level (y = 0)
    expect(ccip.impactPoint.y).toBeCloseTo(0.0, 1);
    // Time of flight should be approximately sqrt(2*h/g) = sqrt(300/9.8) ~ 5.5s
    expect(ccip.timeOfFlightSec).toBeGreaterThan(4.5);
    expect(ccip.timeOfFlightSec).toBeLessThan(7.0);
    // Forward travel range must be positive and close to V * t
    expect(ccip.forwardRangeM).toBeGreaterThan(80.0);
  });

  it('should solve airborne gun lead intercept reticle kinematics', () => {
    const computer = new BallisticsComputer();
    const shooterPos = Vec3.create(0, 100, 0);
    const shooterVel = Vec3.create(0, 0, 30);
    const muzzleSpeed = 850; // m/s
    const targetPos = Vec3.create(200, 100, 400);
    const targetVel = Vec3.create(10, 0, 0);

    const solution = computer.computeGunLeadSolution(
      shooterPos,
      shooterVel,
      muzzleSpeed,
      targetPos,
      targetVel
    );

    expect(solution.timeOfFlightSec).toBeGreaterThan(0);
    expect(solution.leadAimPoint.x).toBeGreaterThan(targetPos.x); // Leads moving target
    expect(solution.leadAngleRad).toBeGreaterThanOrEqual(0);
  });
});
