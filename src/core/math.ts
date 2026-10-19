/**
 * Aerospace & Avionics Core Mathematical Utilities
 * Implements Vector3, Quaternion, and Frame Transformations (NED to Body).
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion4D {
  w: number;
  x: number;
  y: number;
  z: number;
}

export class Vec3 {
  static create(x = 0, y = 0, z = 0): Vector3D {
    return { x, y, z };
  }

  static add(a: Vector3D, b: Vector3D): Vector3D {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  static sub(a: Vector3D, b: Vector3D): Vector3D {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  static scale(v: Vector3D, s: number): Vector3D {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  }

  static dot(a: Vector3D, b: Vector3D): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  static cross(a: Vector3D, b: Vector3D): Vector3D {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  static length(v: Vector3D): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  static normalize(v: Vector3D): Vector3D {
    const len = Vec3.length(v);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return Vec3.scale(v, 1 / len);
  }
}

export class Quat {
  static identity(): Quaternion4D {
    return { w: 1, x: 0, y: 0, z: 0 };
  }

  static fromEuler(roll: number, pitch: number, yaw: number): Quaternion4D {
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);

    return {
      w: cr * cp * cy + sr * sp * sy,
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy
    };
  }

  static toEuler(q: Quaternion4D): { roll: number; pitch: number; yaw: number } {
    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
    const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp);

    // Pitch (y-axis rotation)
    const sinp = 2 * (q.w * q.y - q.z * q.x);
    const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);

    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
    const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
    const yaw = Math.atan2(siny_cosp, cosy_cosp);

    return { roll, pitch, yaw };
  }

  static multiply(a: Quaternion4D, b: Quaternion4D): Quaternion4D {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
    };
  }

  static rotateVector(q: Quaternion4D, v: Vector3D): Vector3D {
    const qv = { w: 0, x: v.x, y: v.y, z: v.z };
    const qConj = { w: q.w, x: -q.x, y: -q.y, z: -q.z };
    const res = Quat.multiply(Quat.multiply(q, qv), qConj);
    return { x: res.x, y: res.y, z: res.z };
  }
}
