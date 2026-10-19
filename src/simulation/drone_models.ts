/**
 * Procedural Military Drone 3D Airframes
 * Generates Three.js meshes for:
 * 1. Saqr-1 MALE Long-Endurance Reconnaissance UAV
 * 2. Tactical VTOL Hexacopter
 * 3. FPV Kamikaze Interceptor
 */

import * as THREE from 'three';

export type DroneCategory = 'fixed' | 'quad' | 'fpv';

export interface DroneAirframeResult {
  root: THREE.Group;
  rotors: THREE.Mesh[];
}

export class DroneModelFactory {
  public static createAirframe(category: DroneCategory): DroneAirframeResult {
    const root = new THREE.Group();
    const rotors: THREE.Mesh[] = [];

    if (category === 'fixed') {
      // Saqr-1 MALE Long-Endurance Reconnaissance UAV
      const fuselageMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.7 });
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });

      // Fuselage
      const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 6.5, 16), fuselageMat);
      fuselage.rotation.x = Math.PI / 2;
      root.add(fuselage);

      // SATCOM Nose Fairing
      const satcomNose = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), fuselageMat);
      satcomNose.position.set(0, 0.25, 2.4);
      root.add(satcomNose);

      // High-Aspect Wingspan
      const wing = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 1.4), wingMat);
      wing.position.set(0, 0.15, 0.4);
      root.add(wing);

      // Inverted V-Tail Empennage
      const tailLeft = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.8), wingMat);
      tailLeft.rotation.z = Math.PI / 3.5;
      tailLeft.position.set(0.9, 0.8, -2.8);
      const tailRight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.8), wingMat);
      tailRight.rotation.z = -Math.PI / 3.5;
      tailRight.position.set(-0.9, 0.8, -2.8);
      root.add(tailLeft);
      root.add(tailRight);

      // EO/IR Gimbal Pod
      const gimbalPod = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x0891b2 })
      );
      gimbalPod.position.set(0, -0.4, 2.2);
      root.add(gimbalPod);

      // Rear Pusher Propeller
      const prop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.15), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
      prop.position.set(0, 0, -3.3);
      root.add(prop);
      rotors.push(prop);

    } else if (category === 'quad') {
      // Tactical VTOL Hexacopter
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.9 });
      const armMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
      const propMat = new THREE.MeshStandardMaterial({ color: 0x10b981, transparent: true, opacity: 0.75 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.8), frameMat);
      root.add(body);

      // 6 Radial Carbon Arms
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const r = 2.4;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;

        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, r), armMat);
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = -angle;
        arm.position.set(x / 2, 0, z / 2);
        root.add(arm);

        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.35, 12), armMat);
        motor.position.set(x, 0.2, z);
        root.add(motor);

        const prop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.15), propMat);
        prop.position.set(x, 0.38, z);
        root.add(prop);
        rotors.push(prop);
      }

      // Center EO/IR Gimbal
      const cam = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x0284c7 })
      );
      cam.position.set(0, -0.35, 1.2);
      root.add(cam);

    } else if (category === 'fpv') {
      // FPV Kamikaze Interceptor
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2 });
      const propMat = new THREE.MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 });

      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.4), frameMat);
      root.add(frame);

      // Warhead
      const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 16), new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.8 }));
      warhead.rotation.x = Math.PI / 2;
      warhead.position.set(0, 0, 1.0);
      root.add(warhead);

      // 4 High-KV Motors
      const arms = [
        { x: 1.2, z: 1.2 }, { x: -1.2, z: 1.2 },
        { x: 1.2, z: -1.2 }, { x: -1.2, z: -1.2 }
      ];
      arms.forEach(pos => {
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.25, 12), frameMat);
        motor.position.set(pos.x, 0.15, pos.z);
        root.add(motor);

        const prop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.12), propMat);
        prop.position.set(pos.x, 0.3, pos.z);
        root.add(prop);
        rotors.push(prop);
      });
    }

    return { root, rotors };
  }
}
