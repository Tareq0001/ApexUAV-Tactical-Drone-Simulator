/**
 * Tactical 2D Airspace & MGRS Canvas Radar Renderer
 * STANAG 4586 compliant tactical situational awareness display.
 */

import { Vector3D } from '../core/math.ts';
import { GroundTarget } from '../vision/target_tracker.ts';

export class TacticalMapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private breadcrumbs: { x: number; z: number }[] = [];
  private maxBreadcrumbs: number = 60;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get 2D context from tactical map canvas');
    this.ctx = context;
  }

  public render(
    dronePos: Vector3D,
    droneYawRad: number,
    targets: GroundTarget[],
    waypoints: { x: number; z: number }[],
    activeWaypointIdx: number
  ): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    // Track breadcrumb trail
    if (this.breadcrumbs.length === 0 ||
        Math.hypot(dronePos.x - this.breadcrumbs[this.breadcrumbs.length - 1].x,
                   dronePos.z - this.breadcrumbs[this.breadcrumbs.length - 1].z) > 4.0) {
      this.breadcrumbs.push({ x: dronePos.x, z: dronePos.z });
      if (this.breadcrumbs.length > this.maxBreadcrumbs) {
        this.breadcrumbs.shift();
      }
    }

    // 1. Tactical Black Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    // 2. Military Grid Lines
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.45;

    // 3. Draw Flight Breadcrumbs
    if (this.breadcrumbs.length > 1) {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      this.breadcrumbs.forEach((pt, i) => {
        const bx = cx + pt.x * scale;
        const by = cy - pt.z * scale;
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Draw Waypoint Route
    if (waypoints.length > 0) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      waypoints.forEach((wp, i) => {
        const wx = cx + wp.x * scale;
        const wy = cy - wp.z * scale;
        if (i === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      });
      ctx.stroke();

      // Waypoint Markers
      waypoints.forEach((wp, i) => {
        const wx = cx + wp.x * scale;
        const wy = cy - wp.z * scale;
        ctx.fillStyle = i === activeWaypointIdx ? '#38bdf8' : '#10b981';
        ctx.beginPath();
        ctx.arc(wx, wy, i === activeWaypointIdx ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 5. Draw Ground Targets
    targets.forEach(tgt => {
      const tx = cx + tgt.posWorld.x * scale;
      const ty = cy - tgt.posWorld.z * scale;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Target Label
      ctx.fillStyle = '#f87171';
      ctx.font = '8px monospace';
      ctx.fillText(tgt.id, tx + 6, ty + 3);
    });

    // 6. Draw Drone Sensor FOV (Field Of View Cone)
    const dx = cx + dronePos.x * scale;
    const dy = cy - dronePos.z * scale;
    const fovAngle = Math.PI / 4; // 45 deg FOV
    const fovRange = 45;

    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(-droneYawRad);

    ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, fovRange, -Math.PI / 2 - fovAngle / 2, -Math.PI / 2 + fovAngle / 2);
    ctx.closePath();
    ctx.fill();

    // Drone Directional Chevron
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}
