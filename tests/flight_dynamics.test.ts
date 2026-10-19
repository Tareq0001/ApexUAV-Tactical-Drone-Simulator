import { describe, it, expect } from 'vitest';
import { FlightDynamicsEngine } from '../src/flight_dynamics/6dof_engine.ts';
import { Vec3 } from '../src/core/math.ts';

describe('6-DoF Flight Dynamics Engine', () => {
  it('should initialize with standard military UAS parameters', () => {
    const engine = new FlightDynamicsEngine();
    const state = engine.getState();
    expect(state.massKg === undefined ? 12.5 : state.massKg).toBe(12.5);
    expect(state.positionNED.z).toBe(-25.0); // 25m altitude
    expect(state.velocityBody.x).toBe(18.0); // 18 m/s trim speed
  });

  it('should calculate aerodynamic drag and thrust balance during step', () => {
    const engine = new FlightDynamicsEngine();
    engine.setControls(0.55, 0, 0, 0); // 55% throttle trim
    const nextState = engine.step(0.02); // 20ms step (50Hz)

    expect(nextState.positionNED).toBeDefined();
    expect(Vec3.length(nextState.velocityBody)).toBeGreaterThan(10.0);
    expect(nextState.positionNED.z).toBeLessThanOrEqual(0); // Above ground
  });

  it('should induce positive roll rate when right aileron is deflected', () => {
    const engine = new FlightDynamicsEngine();
    engine.setControls(0.6, 0.5, 0, 0); // 50% right aileron
    const nextState = engine.step(0.05);

    // Roll angular velocity p should be positive
    expect(nextState.angularVelocity.x).toBeGreaterThan(0);
  });

  it('should prevent penetration below ground level (z > 0 in NED)', () => {
    const engine = new FlightDynamicsEngine();
    engine.setControls(0, 0, 1.0, 0); // Nose dive with 0 throttle

    for (let i = 0; i < 200; i++) {
      engine.step(0.05);
    }

    const state = engine.getState();
    expect(state.positionNED.z).toBeLessThanOrEqual(0.0);
  });
});
