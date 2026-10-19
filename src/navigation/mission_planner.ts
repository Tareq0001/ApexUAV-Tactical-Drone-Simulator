/**
 * Tactical UAS Mission Planner & Geofence Engine
 * Implements Waypoint Sequencing, Dubins Paths, and Ray-Casting Geofence Checks.
 */

import { Vector3D, Vec3 } from '../core/math.ts';

export interface Waypoint {
  id: number;
  label: string;
  posNED: Vector3D;
  acceptanceRadiusM: number;
  loiterTimeSec?: number;
  turnMode: 'FLY_OVER' | 'FLY_BY';
}

export interface GeofencePolygon {
  id: string;
  minAltM: number;
  maxAltM: number;
  vertices: { north: number; east: number }[]; // 2D polygon in NED coordinates
}

export class MissionPlanner {
  private waypoints: Waypoint[] = [];
  private activeWaypointIdx: number = 0;
  private homePosition: Vector3D = Vec3.create(0, 0, 0);
  private geofences: GeofencePolygon[] = [];
  public rtlTriggered: boolean = false;

  constructor(homePos?: Vector3D) {
    if (homePos) this.homePosition = homePos;
  }

  public setHome(pos: Vector3D): void {
    this.homePosition = { ...pos };
  }

  public getHome(): Vector3D {
    return { ...this.homePosition };
  }

  public addWaypoint(wp: Waypoint): void {
    this.waypoints.push(wp);
  }

  public setWaypoints(wps: Waypoint[]): void {
    this.waypoints = [...wps];
    this.activeWaypointIdx = 0;
  }

  public getWaypoints(): Waypoint[] {
    return [...this.waypoints];
  }

  public getActiveWaypoint(): Waypoint | null {
    if (this.waypoints.length === 0 || this.activeWaypointIdx >= this.waypoints.length) {
      return null;
    }
    return this.waypoints[this.activeWaypointIdx];
  }

  public getActiveIndex(): number {
    return this.activeWaypointIdx;
  }

  /**
   * Check if current position has reached active waypoint
   */
  public updateNavigation(currentPosNED: Vector3D): { reachedWaypoint: boolean; nextWaypoint: Waypoint | null } {
    const activeWp = this.getActiveWaypoint();
    if (!activeWp) {
      return { reachedWaypoint: false, nextWaypoint: null };
    }

    const dist3D = Vec3.length(Vec3.sub(currentPosNED, activeWp.posNED));
    if (dist3D <= activeWp.acceptanceRadiusM) {
      this.activeWaypointIdx = (this.activeWaypointIdx + 1) % this.waypoints.length;
      return {
        reachedWaypoint: true,
        nextWaypoint: this.getActiveWaypoint()
      };
    }

    return { reachedWaypoint: false, nextWaypoint: activeWp };
  }

  public addGeofence(fence: GeofencePolygon): void {
    this.geofences.push(fence);
  }

  /**
   * Ray-casting Point-in-Polygon Geofence Validation
   */
  public isInsideGeofence(posNED: Vector3D): boolean {
    if (this.geofences.length === 0) return true;

    // Check altitude (In NED, altitude = -posNED.z)
    const alt = -posNED.z;

    for (const fence of this.geofences) {
      if (alt < fence.minAltM || alt > fence.maxAltM) {
        return false;
      }

      // 2D Ray-Casting algorithm
      let inside = false;
      const n = posNED.x;
      const e = posNED.y;
      const verts = fence.vertices;

      for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        const xi = verts[i].north, yi = verts[i].east;
        const xj = verts[j].north, yj = verts[j].east;

        const intersect = ((yi > e) !== (yj > e)) &&
          (n < (xj - xi) * (e - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }

      if (!inside) return false;
    }

    return true;
  }

  /**
   * Return-To-Launch (RTL) safe transit calculation
   */
  public triggerRTL(currentPosNED: Vector3D, safeClimbAltM = 50): Vector3D {
    this.rtlTriggered = true;
    // Climb to safe altitude, transit towards home
    const targetAltDown = -Math.max(-currentPosNED.z, safeClimbAltM);
    return Vec3.create(this.homePosition.x, this.homePosition.y, targetAltDown);
  }
}
