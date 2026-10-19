/**
 * MIL-STD-1787 Aircraft HUD (Heads-Up Display) Renderer
 * Implements pitch ladder, roll indicator, flight path marker, and airspeed/alt tapes.
 */

import { Vector3D } from '../core/math.ts';

export interface HUDTelemetry {
  altitudeM: number;
  airspeedMs: number;
  rollRad: number;
  pitchRad: number;
  yawRad: number;
  dronePos: Vector3D;
}

export class HUDRenderer {
  private telAltElem: HTMLElement | null;
  private telSpdElem: HTMLElement | null;
  private hudAltText: SVGTextElement | null;
  private hudAirspeedText: SVGTextElement | null;
  private compassText: SVGTextElement | null;
  private horizonLine: SVGLineElement | null;
  private mgrsCoordElem: HTMLElement | null;

  constructor() {
    this.telAltElem = document.getElementById('telAlt');
    this.telSpdElem = document.getElementById('telSpd');
    this.hudAltText = document.getElementById('hudAltText') as unknown as SVGTextElement;
    this.hudAirspeedText = document.getElementById('hudAirspeedText') as unknown as SVGTextElement;
    this.compassText = document.getElementById('compassText') as unknown as SVGTextElement;
    this.horizonLine = document.getElementById('horizonLine') as unknown as SVGLineElement;
    this.mgrsCoordElem = document.getElementById('mgrsCoord');
  }

  public update(telemetry: HUDTelemetry): void {
    const altClamped = Math.max(0, telemetry.altitudeM);
    const speed = telemetry.airspeedMs;
    const hdgDeg = Math.round(((-telemetry.yawRad * 180 / Math.PI) + 360) % 360);

    // GCS Telemetry Badges
    if (this.telAltElem) this.telAltElem.innerText = `${altClamped.toFixed(1)} m`;
    if (this.telSpdElem) this.telSpdElem.innerText = `${speed.toFixed(1)} m/s`;

    // HUD Tape Values
    if (this.hudAltText) this.hudAltText.textContent = `${Math.round(altClamped)}`;
    if (this.hudAirspeedText) this.hudAirspeedText.textContent = `${Math.round(speed)}`;

    // Compass Tape
    if (this.compassText) {
      const hdgStr = hdgDeg.toString().padStart(3, '0');
      this.compassText.textContent = `HDG: ${hdgStr}° [${this.getCardinal(hdgDeg)}]`;
    }

    // Artificial Horizon & Pitch Ladder
    if (this.horizonLine) {
      const pitchOffset = telemetry.pitchRad * 65;
      const rollDeg = -telemetry.rollRad * 180 / Math.PI;
      this.horizonLine.setAttribute('transform', `translate(0, ${pitchOffset}) rotate(${rollDeg})`);
    }

    // MGRS Coordinates
    if (this.mgrsCoordElem) {
      const easting = 1450 + Math.round(telemetry.dronePos.x / 10);
      const northing = 8930 + Math.round(telemetry.dronePos.z / 10);
      this.mgrsCoordElem.innerText = `38Q KM ${easting} ${northing}`;
    }
  }

  private getCardinal(deg: number): string {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }
}
