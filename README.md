# ApexUAV — Tactical Drone Flight Simulator & Pilot Academy

[![Live Demo](https://img.shields.io/badge/Live_Demo-Tareq0001.github.io-emerald?style=for-the-badge&logo=github)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
[![Standard](https://img.shields.io/badge/Aerodynamics-6DoF_Multirotor_%7C_Fixed--Wing-blue?style=for-the-badge)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
[![Three.js](https://img.shields.io/badge/WebGL-Three.js_HUD_Engine-orange?style=for-the-badge&logo=three.js)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)

> **A professional, browser-based tactical drone flight simulator and pilot certification academy featuring multi-category UAV flight dynamics (Industrial Quadcopter, Fixed-Wing Long Endurance, Acro FPV Interceptor), 3D aerodynamic physics, FLIR thermal imaging, and on-screen dual RC transmitter gimbals.**

---

## ⚡ Core Engineering & Flight Dynamics

1. **3 Distinct UAV Categories**
   - **Industrial Heavy Quadcopter (X-Frame):** Stable PID attitude and altitude-hold hover, high payload capacity, inspection gimbal.
   - **Fixed-Wing Long-Endurance (Pusher Propeller):** High-speed aerodynamic lift/drag cruise, V-tail stabilization, extended range surveillance.
   - **Acro FPV Tactical Interceptor:** Aggressive angular rates ($>900^\circ/\text{s}$), high thrust-to-weight ratio (8:1), high-speed slalom obstacle navigation.

2. **Sensors & Multi-Spectrum Gimbal Vision**
   - **HD RGB Daylight:** Crystal-clear inspection feed.
   - **FLIR Thermal (White-Hot / Ironbow):** Contrast-inverted thermal infrared shader detecting heat signatures.
   - **Night Vision (NVG Green Phosphor):** High-gain light amplification with sensor grain noise.

3. **Military-Standard Heads-Up Display (HUD)**
   - Dynamic Artificial Horizon and pitch ladder with roll tilt.
   - Real-time airspeed indicator (IAS) and barometric altitude tape.
   - Magnetic compass heading tape with cardinal coordinates.
   - Telemetry strip: 6S LiPo battery voltage, current draw, and RC link quality (RSSI / dBm).

4. **Pilot Certification Academy & Obstacle Course**
   - 6 aerial ring waypoint gates with precision proximity detection.
   - Automated scorekeeper and mission objective tracker.
   - Return-to-Home (RTH) and Auto-Hover fail-safe stabilization.

5. **Dual Control Ergonomics (Touch & Keyboard)**
   - Tactile on-screen Dual Virtual RC Transmitter Gimbals (Mode 2: Left stick Throttle/Yaw, Right stick Pitch/Roll).
   - Full keyboard flight controls (W/S Throttle, A/D Yaw, Arrow keys Pitch/Roll).
   - Procedural Web Audio API sound generator for electric brushless motor RPM whine.

---

## 🛠️ Architecture & Tech Stack

- **Graphics & 3D:** Three.js (r128), Custom SVG HUD overlay, procedural runway and transmission pylons.
- **Flight Physics:** 6-DoF rigid body mechanics, gravity integration, aerodynamic drag, thrust-to-weight vectors.
- **Audio:** Web Audio API oscillator synthesis.
- **UI:** Tactile glassmorphism floating controls, bilingual English/Arabic interface.

---

## 🚀 Live Deployment

- **Online Flight Simulator:** [https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
- **Author:** Tareq Aboushi (Tareq0001)
