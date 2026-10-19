/**
 * Integrated Tactical UAS Simulation Engine
 * Orchestrates 6-DoF dynamics, EKF3 estimation, cascade PID, Three.js 3D rendering, and audio.
 */

import * as THREE from 'three';
import { Vector3D, Vec3, Quat } from '../core/math.ts';
import { FlightDynamicsEngine } from '../flight_dynamics/6dof_engine.ts';
import { EKF3Estimator } from '../avionics/ekf3.ts';
import { CascadeAttitudeController } from '../avionics/pid.ts';
import { MissionPlanner } from '../navigation/mission_planner.ts';
import { TargetTracker } from '../vision/target_tracker.ts';
import { DroneModelFactory, DroneCategory } from './drone_models.ts';

export class SimEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  public flightEngine: FlightDynamicsEngine;
  public ekf: EKF3Estimator;
  public pid: CascadeAttitudeController;
  public missionPlanner: MissionPlanner;
  public targetTracker: TargetTracker;

  private droneRoot: THREE.Group;
  private rotors: THREE.Mesh[] = [];
  private waypointMeshes: THREE.Mesh[] = [];
  public currentCategory: DroneCategory = 'fixed';

  public isArmed: boolean = true;
  public isAutoLoiter: boolean = true;
  public isJamming: boolean = false;
  public isLaserLocked: boolean = false;

  // Sound Engine
  private audioCtx: AudioContext | null = null;
  private motorOsc: OscillatorNode | null = null;
  public isAudioMuted: boolean = true;

  // Flight Inputs
  public inputs = {
    throttle: 0.6,
    yaw: 0,
    pitch: 0,
    roll: 0
  };

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container element #${containerId} not found`);
    this.container = el;

    // Subsystems
    this.flightEngine = new FlightDynamicsEngine();
    this.ekf = new EKF3Estimator();
    this.pid = new CascadeAttitudeController();
    this.missionPlanner = new MissionPlanner();
    this.targetTracker = new TargetTracker();

    // Three.js Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020617);
    this.scene.fog = new THREE.FogExp2(0x020617, 0.004);

    this.camera = new THREE.PerspectiveCamera(55, this.container.clientWidth / this.container.clientHeight, 0.1, 4000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.droneRoot = new THREE.Group();
    this.scene.add(this.droneRoot);

    this.setupLighting();
    this.setupTerrain();
    this.setupTargets();
    this.setupWaypoints();
    this.setDroneCategory('fixed');
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x38bdf8, 0.45);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfef08a, 1.4);
    sun.position.set(150, 220, 90);
    sun.castShadow = true;
    this.scene.add(sun);
  }

  private setupTerrain(): void {
    const groundGeo = new THREE.PlaneGeometry(3000, 3000, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(3000, 180, 0x10b981, 0x0f172a);
    this.scene.add(grid);

    // Airbase Runway
    const runwayGeo = new THREE.PlaneGeometry(45, 700);
    const runwayMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    const runway = new THREE.Mesh(runwayGeo, runwayMat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(0, 0.08, 0);
    this.scene.add(runway);
  }

  private setupTargets(): void {
    const tgts = this.targetTracker.getTargets();

    // Target 1: Armored Vehicle
    const tankGroup = new THREE.Group();
    tankGroup.position.set(tgts[0].posWorld.x, tgts[0].posWorld.y, tgts[0].posWorld.z);
    const tankBody = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 9), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 }));
    tankBody.position.y = 1.25;
    tankGroup.add(tankBody);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 1.5, 12), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 }));
    turret.position.y = 2.8;
    tankGroup.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 8), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 2.8, 3.5);
    tankGroup.add(barrel);
    this.scene.add(tankGroup);

    // Target 2: Radar Mast
    const radarGroup = new THREE.Group();
    radarGroup.position.set(tgts[1].posWorld.x, tgts[1].posWorld.y, tgts[1].posWorld.z);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.5, 35, 4), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 }));
    mast.position.y = 17.5;
    radarGroup.add(mast);
    const dish = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.5), new THREE.MeshStandardMaterial({ color: 0x10b981, wireframe: true }));
    dish.position.y = 35;
    radarGroup.add(dish);
    this.scene.add(radarGroup);
  }

  private setupWaypoints(): void {
    const coords = [
      { x: 0, y: 35, z: 80, label: 'WPT-01' },
      { x: 50, y: 45, z: 180, label: 'WPT-02' },
      { x: -70, y: 55, z: 280, label: 'WPT-03' },
      { x: -120, y: 40, z: 150, label: 'WPT-04' },
      { x: 0, y: 35, z: -80, label: 'WPT-05' },
      { x: 0, y: 20, z: 0, label: 'WPT-06' }
    ];

    const ringGeo = new THREE.TorusGeometry(7, 0.35, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true });

    coords.forEach((c, idx) => {
      const mesh = new THREE.Mesh(ringGeo, ringMat.clone());
      mesh.position.set(c.x, c.y, c.z);
      this.scene.add(mesh);
      this.waypointMeshes.push(mesh);

      this.missionPlanner.addWaypoint({
        id: idx + 1,
        label: c.label,
        posNED: Vec3.create(c.z, c.x, -c.y),
        acceptanceRadiusM: 8.0,
        turnMode: 'FLY_BY'
      });
    });
  }

  public setDroneCategory(category: DroneCategory): void {
    this.currentCategory = category;
    while (this.droneRoot.children.length > 0) {
      this.droneRoot.remove(this.droneRoot.children[0]);
    }
    const airframe = DroneModelFactory.createAirframe(category);
    this.droneRoot.add(airframe.root);
    this.rotors = airframe.rotors;
  }

  public initAudio(): void {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.motorOsc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      this.motorOsc.type = 'sawtooth';
      this.motorOsc.frequency.setValueAtTime(240, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.02, this.audioCtx.currentTime);
      this.motorOsc.connect(gain);
      gain.connect(this.audioCtx.destination);
      this.motorOsc.start();
    }
  }

  public updateMotorAudio(throttle: number): void {
    if (this.isAudioMuted || !this.motorOsc || !this.audioCtx) return;
    const targetFreq = 160 + throttle * 520;
    this.motorOsc.frequency.setTargetAtTime(targetFreq, this.audioCtx.currentTime, 0.05);
  }

  public step(dt: number): {
    dronePos: Vector3D;
    droneRot: { roll: number; pitch: number; yaw: number };
    airspeed: number;
    altitude: number;
  } {
    // 1. Flight Dynamics update
    if (!this.isArmed) {
      this.flightEngine.setControls(0, 0, 0, 0);
    } else if (this.isAutoLoiter) {
      // Loiter orbit
      this.flightEngine.setControls(0.55, 0.05, 0.02, 0.08);
    } else {
      this.flightEngine.setControls(
        this.inputs.throttle,
        this.inputs.roll,
        this.inputs.pitch,
        this.inputs.yaw
      );
    }

    const state = this.flightEngine.step(dt);
    const euler = Quat.toEuler(state.attitude);

    // 2. EKF3 Prediction & GPS Update
    this.ekf.predict({
      accel: Vec3.create(0, 0, -9.8),
      gyro: state.angularVelocity,
      timestampSec: performance.now() / 1000
    }, dt);

    this.ekf.updateGPS({
      latDeg: 24.7136,
      lonDeg: 46.6753,
      altM: -state.positionNED.z,
      velNED: Vec3.create(state.velocityBody.x, state.velocityBody.y, state.velocityBody.z),
      fixType: this.isJamming ? 0 : 3,
      jammed: this.isJamming,
      timestampSec: performance.now() / 1000
    });

    // 3. Three.js Visual Mesh update
    const posX = state.positionNED.y;
    const posY = -state.positionNED.z;
    const posZ = state.positionNED.x;

    this.droneRoot.position.set(posX, posY, posZ);
    this.droneRoot.rotation.set(euler.pitch, euler.yaw, -euler.roll);

    // Spin Propellers
    this.rotors.forEach(r => {
      r.rotation.y += 0.4 + state.throttle * 0.9;
    });

    this.updateMotorAudio(state.throttle);

    // Chase Camera tracking
    const camOffset = new THREE.Vector3(0, 3.2, -8.5).applyEuler(new THREE.Euler(0, euler.yaw, 0));
    this.camera.position.set(posX, posY, posZ).add(camOffset);
    this.camera.lookAt(posX, posY + 1.2, posZ + 8);

    // Update targets
    this.targetTracker.updateTargets(dt);

    // Check Waypoints
    const activeIdx = this.missionPlanner.getActiveIndex();
    const navResult = this.missionPlanner.updateNavigation(state.positionNED);
    if (navResult.reachedWaypoint && this.waypointMeshes[activeIdx]) {
      (this.waypointMeshes[activeIdx].material as THREE.MeshBasicMaterial).color.setHex(0x38bdf8);
    }

    const airspeed = Vec3.length(state.velocityBody);

    return {
      dronePos: Vec3.create(posX, posY, posZ),
      droneRot: euler,
      airspeed,
      altitude: posY
    };
  }

  public onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
