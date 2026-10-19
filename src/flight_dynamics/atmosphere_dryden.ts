/**
 * MIL-F-8785C / MIL-HDBK-1797 Dryden Wind Turbulence & ISA Atmosphere Model
 * Implements International Standard Atmosphere (ISA) properties and continuous
 * stochastic Dryden spectral forming filters for 3-axis aerodynamic gusts.
 */

import { Vector3D, Vec3 } from '../core/math.ts';

export type TurbulenceSeverity = 'NONE' | 'LIGHT' | 'MODERATE' | 'SEVERE';

export interface AtmosphereState {
  altitudeM: number;
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
  speedOfSoundMs: number;
  windNED: Vector3D;          // Total wind vector in NED frame (steady + gust)
  turbulenceBody: Vector3D;   // Filtered Dryden turbulence in body frame (u_g, v_g, w_g)
}

export class DrydenAtmosphereEngine {
  private severity: TurbulenceSeverity = 'LIGHT';
  private steadyWindNED: Vector3D = Vec3.create(3.5, -2.0, 0.0); // Default desert crosswind (m/s)
  private filterStateU: number = 0;
  private filterStateV: number = 0;
  private filterStateW: number = 0;
  private prngSeed: number = 133742;

  constructor(severity: TurbulenceSeverity = 'LIGHT') {
    this.severity = severity;
  }

  public setSeverity(severity: TurbulenceSeverity): void {
    this.severity = severity;
    if (severity === 'NONE') {
      this.steadyWindNED = Vec3.create(0, 0, 0);
      this.filterStateU = 0;
      this.filterStateV = 0;
      this.filterStateW = 0;
    } else if (severity === 'LIGHT') {
      this.steadyWindNED = Vec3.create(3.5, -2.0, 0.0);
    } else if (severity === 'MODERATE') {
      this.steadyWindNED = Vec3.create(8.5, -5.5, 0.4);
    } else if (severity === 'SEVERE') {
      this.steadyWindNED = Vec3.create(15.0, -11.0, 1.2);
    }
  }

  public getSeverity(): TurbulenceSeverity {
    return this.severity;
  }

  /**
   * Deterministic Box-Muller Gaussian White Noise Generator N(0, 1)
   */
  private nextGaussian(): number {
    this.prngSeed = (this.prngSeed * 1664525 + 1013904223) >>> 0;
    const u1 = Math.max(1e-7, (this.prngSeed & 0x0fffffff) / 0x10000000);
    this.prngSeed = (this.prngSeed * 1664525 + 1013904223) >>> 0;
    const u2 = (this.prngSeed & 0x0fffffff) / 0x10000000;
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /**
   * Compute International Standard Atmosphere (ISA) properties at given altitude MSL (meters)
   */
  public static computeISA(altitudeM: number): {
    temperatureK: number;
    pressurePa: number;
    densityKgM3: number;
    speedOfSoundMs: number;
  } {
    const h = Math.max(0, Math.min(20000, altitudeM));
    const T0 = 288.15;     // Sea level standard temperature (K)
    const P0 = 101325.0;   // Sea level standard pressure (Pa)
    const L = 0.0065;      // Troposphere temperature lapse rate (K/m)
    const R = 287.05287;   // Specific gas constant for dry air (J/(kg·K))
    const g0 = 9.80665;    // Standard gravity (m/s^2)
    const gamma = 1.4;     // Adiabatic index

    let temperatureK: number;
    let pressurePa: number;

    if (h <= 11000) {
      temperatureK = T0 - L * h;
      pressurePa = P0 * Math.pow(temperatureK / T0, g0 / (R * L));
    } else {
      // Lower Stratosphere isothermal layer
      temperatureK = 216.65;
      const P11 = P0 * Math.pow(216.65 / T0, g0 / (R * L));
      pressurePa = P11 * Math.exp((-g0 * (h - 11000)) / (R * temperatureK));
    }

    const densityKgM3 = pressurePa / (R * temperatureK);
    const speedOfSoundMs = Math.sqrt(gamma * R * temperatureK);

    return { temperatureK, pressurePa, densityKgM3, speedOfSoundMs };
  }

  /**
   * Step the MIL-F-8785C Low-Altitude Dryden Turbulence Filter
   * @param altitudeM Current altitude AGL (meters)
   * @param airspeedMs True airspeed V (m/s)
   * @param dt Integration timestep (seconds)
   */
  public step(altitudeM: number, airspeedMs: number, dt: number): AtmosphereState {
    const isa = DrydenAtmosphereEngine.computeISA(altitudeM);

    if (this.severity === 'NONE' || dt <= 0) {
      return {
        altitudeM,
        ...isa,
        windNED: Vec3.create(0, 0, 0),
        turbulenceBody: Vec3.create(0, 0, 0)
      };
    }

    // Wind speed at 20 feet (6m) reference height based on MIL-F-8785C
    const W20 = this.severity === 'LIGHT' ? 7.7 : this.severity === 'MODERATE' ? 15.4 : 23.1;

    // Clamp altitude for low-altitude boundary layer model (3m to 300m)
    const h = Math.max(3.0, Math.min(300.0, altitudeM));
    const V = Math.max(5.0, airspeedMs);

    // Turbulence scale lengths (meters) per MIL-F-8785C
    const Lw = h;
    const Lu = h / Math.pow(0.177 + 0.0027 * h, 1.2);
    const Lv = Lu;

    // Turbulence intensities (RMS m/s)
    const sigmaW = 0.1 * W20;
    const sigmaU = sigmaW / Math.pow(0.177 + 0.0027 * h, 0.4);
    const sigmaV = sigmaU;

    // First-order discrete Euler-Maruyama realization of Dryden transfer functions
    const tauU = Lu / V;
    const tauV = Lv / V;
    const tauW = Lw / V;

    const etaU = this.nextGaussian();
    const etaV = this.nextGaussian();
    const etaW = this.nextGaussian();

    this.filterStateU += (-this.filterStateU / tauU) * dt + sigmaU * Math.sqrt((2.0 * dt) / tauU) * etaU;
    this.filterStateV += (-this.filterStateV / tauV) * dt + sigmaV * Math.sqrt((2.0 * dt) / tauV) * etaV;
    this.filterStateW += (-this.filterStateW / tauW) * dt + sigmaW * Math.sqrt((2.0 * dt) / tauW) * etaW;

    const turbulenceBody = Vec3.create(this.filterStateU, this.filterStateV, this.filterStateW);

    // Wind shear profile (logarithmic boundary layer)
    const shearFactor = Math.log(Math.max(h, 1.0) / 0.05) / Math.log(20.0 / 0.05);
    const windNED: Vector3D = {
      x: this.steadyWindNED.x * shearFactor + this.filterStateU,
      y: this.steadyWindNED.y * shearFactor + this.filterStateV,
      z: this.steadyWindNED.z + this.filterStateW
    };

    return {
      altitudeM,
      ...isa,
      windNED,
      turbulenceBody
    };
  }
}
