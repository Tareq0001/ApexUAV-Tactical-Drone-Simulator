/**
 * ApexUAV Defense Edition — Main Application Entrypoint
 * STANAG 4586 / MIL-STD-810H UAS Flight Simulator & Tactical GCS
 */

import * as THREE from 'three';
import { SimEngine } from './simulation/sim_engine.ts';
import { HUDRenderer } from './ui/hud_renderer.ts';
import { TacticalMapRenderer } from './ui/tactical_map.ts';
import { MavlinkV2Framer } from './mavlink/mavlink_v2.ts';

// Bilingual Dictionary
const I18N: Record<string, Record<string, string>> = {
  en: {
    subDesc: "Tactical Unmanned Aerial Systems (UAS) Flight Dynamics, GCS & AI Defense Academy",
    fixed: "Saqr-1 MALE Long-Endurance",
    quad: "Tactical VTOL Hexacopter",
    fpv: "FPV Kamikaze Interceptor",
    academy: "PILOT DEFENSE ACADEMY",
    mission1: "Navigate through 6 aerial reconnaissance corridors while maintaining laser lock on moving tactical targets without radar detection.",
    arm: "ARM MOTORS",
    disarm: "DISARM MOTORS",
    hover: "LOITER ORBIT",
    rth: "RTL FAILSAFE",
    designate: "LOCK TARGET",
    designated: "TARGET LOCKED",
    throttleYaw: "THROTTLE / YAW",
    pitchRoll: "PITCH / ROLL",
    scoreText: "Recon Waypoints Cleared:",
    mapTitle: "MGRS TACTICAL AIRSPACE MAP",
    mavlinkTitle: "MAVLink v2 TELEMETRY STREAM",
    jamming: "EW JAMMING",
    jammingActive: "EW JAMMED (EKF ACTIVE)"
  },
  ar: {
    subDesc: "ديناميكا طيران الطائرات المسيرة التكتيكية، محطة التحكم الأرضية وأكاديمية الدفاع الجوي",
    fixed: "مسيرة صقر-1 الاستراتيجية للمدى البعيد",
    quad: "مسيرة إقلاع عمودي تكتيكية (VTOL)",
    fpv: "مسيرة انتحارية اعتراضية نقطية (FPV)",
    academy: "أكاديمية تدريب طياري المسيرات الدفاعية",
    mission1: "حلق عبر 6 ممرات استطلاع جوي تكتيكية مع تثبيت القفل الليزري على الأهداف المتحركة وتفادي الرادارات الأرضية.",
    arm: "تشغيل المحركات",
    disarm: "إيقاف المحركات",
    hover: "دوران استطلاعي",
    rth: "العودة التلقائية لقاعدة الإقلاع",
    designate: "قفل الهدف ليزرياً",
    designated: "تم قفل الهدف",
    throttleYaw: "قوة الدفع / الانعراج",
    pitchRoll: "الميلان / الانحدار",
    scoreText: "بوابات الاستطلاع المنجزة:",
    mapTitle: "خريطة العمليات الجوية التكتيكية (MGRS)",
    mavlinkTitle: "بث بروتوكول القياس عن بعد MAVLink",
    jamming: "تشويش إلكتروني",
    jammingActive: "تشويش نشط (تفعيل ملاحة القصور الذاتي)"
  }
};

let currentLang = 'en';

class Application {
  private sim: SimEngine;
  private hud: HUDRenderer;
  private mapRenderer: TacticalMapRenderer;
  private mavlink: MavlinkV2Framer;
  private lastTime: number = performance.now();
  private lastMavlinkTime: number = 0;

  constructor() {
    this.sim = new SimEngine('threeContainer');
    this.hud = new HUDRenderer();

    const canvas = document.getElementById('tacMapCanvas') as HTMLCanvasElement;
    this.mapRenderer = new TacticalMapRenderer(canvas);
    this.mavlink = new MavlinkV2Framer(1, 1);

    this.setupGimbals();
    this.setupKeyboard();
    this.setupUI();

    window.addEventListener('resize', () => {
      this.sim.onResize();
      this.updateHUDLayout();
    });

    this.updateHUDLayout();
    this.animate();
  }

  private setupGimbals(): void {
    const setupGimbalStick = (baseId: string, knobId: string, onMove: (nx: number, ny: number) => void) => {
      const base = document.getElementById(baseId);
      const knob = document.getElementById(knobId);
      if (!base || !knob) return;

      let isDragging = false;
      const handleMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;
        const rect = base.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        let dx = clientX - (rect.left + rect.width / 2);
        let dy = clientY - (rect.top + rect.height / 2);
        const maxR = rect.width / 2 - 10;
        const dist = Math.hypot(dx, dy);

        if (dist > maxR) {
          dx = (dx / dist) * maxR;
          dy = (dy / dist) * maxR;
        }

        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        onMove(dx / maxR, dy / maxR);
      };

      const handleEnd = () => {
        isDragging = false;
        knob.style.transform = `translate(0px, 0px)`;
        onMove(0, 0);
      };

      base.addEventListener('mousedown', (e) => { isDragging = true; handleMove(e); });
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);

      base.addEventListener('touchstart', (e) => { isDragging = true; handleMove(e); }, { passive: false });
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    };

    // Mode 2 Left: Throttle (Y), Yaw (X)
    setupGimbalStick('leftGimbal', 'leftKnob', (nx, ny) => {
      this.sim.inputs.yaw = nx;
      this.sim.inputs.throttle = 0.5 - ny * 0.5;
      this.sim.isAutoLoiter = false;
    });

    // Mode 2 Right: Roll (X), Pitch (Y)
    setupGimbalStick('rightGimbal', 'rightKnob', (nx, ny) => {
      this.sim.inputs.roll = nx;
      this.sim.inputs.pitch = -ny;
      this.sim.isAutoLoiter = false;
    });
  }

  private setupKeyboard(): void {
    const keys: Record<string, boolean> = {};

    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      this.sim.isAutoLoiter = false;
      this.sim.initAudio();

      if (keys['w']) this.sim.inputs.throttle = Math.min(1.0, this.sim.inputs.throttle + 0.03);
      if (keys['s']) this.sim.inputs.throttle = Math.max(0.0, this.sim.inputs.throttle - 0.03);
      if (keys['a']) this.sim.inputs.yaw = -1;
      else if (keys['d']) this.sim.inputs.yaw = 1;

      if (keys['arrowup'] || keys['i']) this.sim.inputs.pitch = 1;
      else if (keys['arrowdown'] || keys['k']) this.sim.inputs.pitch = -1;

      if (keys['arrowleft'] || keys['j']) this.sim.inputs.roll = -1;
      else if (keys['arrowright'] || keys['l']) this.sim.inputs.roll = 1;
    });

    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
      if (!keys['a'] && !keys['d']) this.sim.inputs.yaw = 0;
      if (!keys['arrowup'] && !keys['arrowdown'] && !keys['i'] && !keys['k']) this.sim.inputs.pitch = 0;
      if (!keys['arrowleft'] && !keys['arrowright'] && !keys['j'] && !keys['l']) this.sim.inputs.roll = 0;
    });
  }

  private setupUI(): void {
    // Airframe switches
    const fixedBtn = document.getElementById('droneFixedBtn');
    const quadBtn = document.getElementById('droneQuadBtn');
    const fpvBtn = document.getElementById('droneFpvBtn');

    fixedBtn?.addEventListener('click', () => {
      this.sim.setDroneCategory('fixed');
      if (fixedBtn) fixedBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white shadow-md shadow-emerald-600/30 flex items-center space-x-1.5";
      if (quadBtn) quadBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-emerald-300 flex items-center space-x-1.5";
      if (fpvBtn) fpvBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-emerald-300 flex items-center space-x-1.5";
      this.logMavlink("[UAS] Airframe switched to Saqr-1 MALE Long-Endurance.");
    });

    quadBtn?.addEventListener('click', () => {
      this.sim.setDroneCategory('quad');
      if (quadBtn) quadBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white shadow-md shadow-emerald-600/30 flex items-center space-x-1.5";
      if (fixedBtn) fixedBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-emerald-300 flex items-center space-x-1.5";
      if (fpvBtn) fpvBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-emerald-300 flex items-center space-x-1.5";
      this.logMavlink("[UAS] Airframe switched to Tactical VTOL Hexacopter.");
    });

    fpvBtn?.addEventListener('click', () => {
      this.sim.setDroneCategory('fpv');
      if (fpvBtn) fpvBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white shadow-md shadow-emerald-600/30 flex items-center space-x-1.5";
      if (fixedBtn) fixedBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-emerald-300 flex items-center space-x-1.5";
      if (quadBtn) quadBtn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-emerald-300 flex items-center space-x-1.5";
      this.logMavlink("[UAS] Airframe switched to FPV Kamikaze Interceptor.");
    });

    // Vision Mode
    const camModes = ['RGB HD', 'FLIR THERMAL', 'NVG NIGHT'];
    let camModeIdx = 0;
    const camBtn = document.getElementById('camModeBtn');
    camBtn?.addEventListener('click', () => {
      camModeIdx = (camModeIdx + 1) % camModes.length;
      const mode = camModes[camModeIdx];
      const txt = document.getElementById('txtCamMode');
      if (txt) txt.innerText = mode;
      const container = document.getElementById('threeContainer');
      if (container) {
        if (mode === 'FLIR THERMAL') container.className = 'w-full h-full relative cursor-crosshair flir-thermal';
        else if (mode === 'NVG NIGHT') container.className = 'w-full h-full relative cursor-crosshair nvg-mode';
        else container.className = 'w-full h-full relative cursor-crosshair';
      }
      this.logMavlink(`[PAYLOAD] EO/IR sensor switched to: ${mode}`);
    });

    // Electronic Warfare Jamming
    const jamBtn = document.getElementById('jammingBtn');
    jamBtn?.addEventListener('click', () => {
      this.sim.isJamming = !this.sim.isJamming;
      const txt = document.getElementById('txtJamming');
      const gpsBadge = document.getElementById('telGps');
      const rssiBadge = document.getElementById('telRssi');

      if (this.sim.isJamming) {
        if (jamBtn) jamBtn.className = "px-2.5 py-1 text-xs font-bold rounded bg-rose-600 text-white animate-pulse transition flex items-center space-x-1";
        if (txt) txt.innerText = I18N[currentLang].jammingActive;
        if (gpsBadge) {
          gpsBadge.innerText = "NO-FIX (JAMMED)";
          gpsBadge.className = "font-bold text-rose-500 font-mono";
        }
        if (rssiBadge) {
          rssiBadge.innerText = "-105 dBm (LOST)";
          rssiBadge.className = "font-bold text-rose-500 font-mono";
        }
        this.logMavlink("[EW ALERT] High-power RF Jamming Detected! GPS Lost. Engaging EKF Dead-Reckoning!");
      } else {
        if (jamBtn) jamBtn.className = "px-2.5 py-1 text-xs font-bold rounded bg-rose-950/80 border border-rose-600/60 hover:bg-rose-900 text-rose-300 transition flex items-center space-x-1";
        if (txt) txt.innerText = I18N[currentLang].jamming;
        if (gpsBadge) {
          gpsBadge.innerText = "18 3D-FIX";
          gpsBadge.className = "font-bold text-emerald-400 font-mono";
        }
        if (rssiBadge) {
          rssiBadge.innerText = "-54 dBm (99%)";
          rssiBadge.className = "font-bold text-emerald-400 font-mono";
        }
        this.logMavlink("[EW] Jamming cleared. GPS GNSS satellite lock restored.");
      }
    });

    // Arm / Disarm
    const armBtn = document.getElementById('armBtn');
    armBtn?.addEventListener('click', () => {
      this.sim.isArmed = !this.sim.isArmed;
      const armText = document.getElementById('txtArm');
      const statusBadge = document.getElementById('telArmStatus');
      if (this.sim.isArmed) {
        if (armBtn) armBtn.className = "px-3 py-1.5 text-xs font-bold rounded bg-emerald-950 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900 transition flex items-center space-x-1";
        if (armText) armText.innerText = I18N[currentLang].arm;
        if (statusBadge) {
          statusBadge.innerText = "ARMED (GUIDED)";
          statusBadge.className = "font-bold text-emerald-400";
        }
        this.logMavlink("[CMD] MAV_CMD_COMPONENT_ARM: Arming throttle motors.");
      } else {
        if (armBtn) armBtn.className = "px-3 py-1.5 text-xs font-bold rounded bg-rose-950 border border-rose-600/50 text-rose-300 hover:bg-rose-900 transition flex items-center space-x-1";
        if (armText) armText.innerText = I18N[currentLang].disarm;
        if (statusBadge) {
          statusBadge.innerText = "DISARMED";
          statusBadge.className = "font-bold text-rose-400";
        }
        this.logMavlink("[CMD] MAV_CMD_COMPONENT_ARM: Disarming throttle motors.");
      }
    });

    // Auto Loiter
    const autoHoverBtn = document.getElementById('autoHoverBtn');
    autoHoverBtn?.addEventListener('click', () => {
      this.sim.isAutoLoiter = !this.sim.isAutoLoiter;
      if (autoHoverBtn) {
        autoHoverBtn.className = this.sim.isAutoLoiter ?
          "px-3 py-1.5 text-xs font-bold rounded bg-emerald-950 border border-emerald-500/50 text-emerald-300 flex items-center space-x-1" :
          "px-3 py-1.5 text-xs font-bold rounded bg-slate-900 border border-slate-700 text-slate-300 flex items-center space-x-1";
      }
      this.logMavlink(this.sim.isAutoLoiter ? "[NAV] Mode changed to AUTO_LOITER." : "[NAV] Mode changed to MANUAL_GUIDED.");
    });

    // RTL Failsafe
    const rthBtn = document.getElementById('rthBtn');
    rthBtn?.addEventListener('click', () => {
      this.sim.isAutoLoiter = true;
      this.logMavlink("[SAFETY] Return-To-Launch (RTL) triggered. Flying to base.");
    });

    // Laser Target Designation Lock
    const laserBtn = document.getElementById('laserDesignatorBtn');
    laserBtn?.addEventListener('click', () => {
      this.sim.isLaserLocked = !this.sim.isLaserLocked;
      const txt = document.getElementById('txtDesignate');
      if (this.sim.isLaserLocked) {
        this.sim.targetTracker.lockTarget('TGT-01');
        if (laserBtn) laserBtn.className = "px-3 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white font-bold transition flex items-center space-x-1";
        if (txt) txt.innerText = I18N[currentLang].designated;
        this.logMavlink("[WEAPON] Laser Designator Locked on TARGET-01 (MGRS 38Q KM 1455 8942)!");
      } else {
        this.sim.targetTracker.unlockTarget();
        if (laserBtn) laserBtn.className = "px-3 py-1.5 text-xs font-bold rounded bg-rose-950 border border-rose-600/50 text-rose-300 hover:bg-rose-900 transition flex items-center space-x-1";
        if (txt) txt.innerText = I18N[currentLang].designate;
        this.logMavlink("[WEAPON] Laser Designator Standby.");
      }
    });

    // Sound Toggle
    const soundBtn = document.getElementById('soundBtn');
    soundBtn?.addEventListener('click', () => {
      this.sim.initAudio();
      this.sim.isAudioMuted = !this.sim.isAudioMuted;
      const icon = document.getElementById('soundIcon');
      if (icon) icon.className = this.sim.isAudioMuted ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high text-emerald-400";
    });

    // Language Toggle
    const langBtn = document.getElementById('langToggleBtn');
    langBtn?.addEventListener('click', () => {
      currentLang = currentLang === 'en' ? 'ar' : 'en';
      document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
      if (langBtn) langBtn.innerText = currentLang === 'ar' ? 'English' : 'عربي';

      const t = I18N[currentLang];
      const setTxt = (id: string, val: string) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
      };

      setTxt('subHeaderDesc', t.subDesc);
      setTxt('txtFixed', t.fixed);
      setTxt('txtQuad', t.quad);
      setTxt('txtFpv', t.fpv);
      setTxt('txtAcademyTitle', t.academy);
      setTxt('missionDesc', t.mission1);
      setTxt('txtAutoHover', t.hover);
      setTxt('txtRTH', t.rth);
      setTxt('txtArm', this.sim.isArmed ? t.arm : t.disarm);
      setTxt('txtDesignate', this.sim.isLaserLocked ? t.designated : t.designate);
      setTxt('leftStickLabel', t.throttleYaw);
      setTxt('rightStickLabel', t.pitchRoll);
      setTxt('scoreLabel', t.scoreText);
      setTxt('mapTitle', t.mapTitle);
      setTxt('mavlinkTitle', t.mavlinkTitle);
      setTxt('txtJamming', this.sim.isJamming ? t.jammingActive : t.jamming);
    });
  }

  private updateHUDLayout(): void {
    const container = document.getElementById('threeContainer');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const hudCenter = document.getElementById('hudCenter');
    if (hudCenter) hudCenter.setAttribute('transform', `translate(${w / 2}, ${h / 2})`);

    const altTape = document.getElementById('altTapeGroup');
    if (altTape) altTape.setAttribute('transform', `translate(${w - 75}, 0)`);

    const compass = document.getElementById('compassRect');
    if (compass) compass.setAttribute('x', `${w / 2 - 120}`);

    const compassText = document.getElementById('compassText');
    if (compassText) compassText.setAttribute('x', `${w / 2}`);
  }

  private updateTargetProjections(): void {
    const container = document.getElementById('threeContainer');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const tgts = this.sim.targetTracker.getTargets();
    tgts.forEach((tgt, idx) => {
      const posVec = new THREE.Vector3(tgt.posWorld.x, tgt.posWorld.y, tgt.posWorld.z);
      const screenPos = posVec.project(this.sim.camera);
      const elem = document.getElementById(tgt.boxId);
      if (!elem) return;

      if (screenPos.z < 1) {
        const x = (screenPos.x * 0.5 + 0.5) * w;
        const y = (-screenPos.y * 0.5 + 0.5) * h;
        elem.style.display = 'block';
        elem.style.left = `${x - 35}px`;
        elem.style.top = `${y - 25}px`;

        if (this.sim.isLaserLocked && idx === 0) {
          elem.classList.add('locked');
        } else {
          elem.classList.remove('locked');
        }
      } else {
        elem.style.display = 'none';
      }
    });
  }

  private logMavlink(msg: string): void {
    const logBox = document.getElementById('mavlinkLog');
    if (!logBox) return;
    const div = document.createElement('div');
    div.textContent = msg;
    logBox.prepend(div);
    if (logBox.children.length > 25) {
      logBox.removeChild(logBox.lastChild as Node);
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // Simulation Physics Step
    const simResult = this.sim.step(dt);

    // Update MIL-STD-1787 HUD
    this.hud.update({
      altitudeM: simResult.altitude,
      airspeedMs: simResult.airspeed,
      rollRad: simResult.droneRot.roll,
      pitchRad: simResult.droneRot.pitch,
      yawRad: simResult.droneRot.yaw,
      dronePos: simResult.dronePos
    });

    // Update 2D Tactical Airspace Radar Map
    const waypoints = this.sim.missionPlanner.getWaypoints().map(wp => ({ x: wp.posNED.y, z: wp.posNED.x }));
    this.mapRenderer.render(
      simResult.dronePos,
      simResult.droneRot.yaw,
      this.sim.targetTracker.getTargets(),
      waypoints,
      this.sim.missionPlanner.getActiveIndex()
    );

    // Update Target Optical Projections
    this.updateTargetProjections();

    // MAVLink telemetry broadcast every 200ms
    if (now - this.lastMavlinkTime > 200) {
      this.lastMavlinkTime = now;
      const hb = this.mavlink.encodeHeartbeat();
      const att = this.mavlink.encodeAttitude(
        Math.round(now),
        simResult.droneRot.roll,
        simResult.droneRot.pitch,
        simResult.droneRot.yaw,
        0, 0, 0
      );

      // Verify CRC parsing
      const parsedHb = this.mavlink.parse(hb);
      const parsedAtt = this.mavlink.parse(att);

      if (parsedHb && parsedAtt && Math.random() < 0.25) {
        const rollDeg = (simResult.droneRot.roll * 180 / Math.PI).toFixed(1);
        const pitchDeg = (simResult.droneRot.pitch * 180 / Math.PI).toFixed(1);
        this.logMavlink(`[MAV] ATTITUDE (#30): R:${rollDeg}° P:${pitchDeg}° | CRC-OK`);
      }
    }

    // Three.js Render
    this.sim.renderer.render(this.sim.scene, this.sim.camera);
  };
}

// Bootstrap application on window load
window.addEventListener('DOMContentLoaded', () => {
  new Application();
});
