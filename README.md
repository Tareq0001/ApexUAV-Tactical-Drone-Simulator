# ApexUAV [Defense Edition] — Tactical UAS Ground Control Station & Mission Simulator

[![Live Demo](https://img.shields.io/badge/Live_GCS_Simulator-Tareq0001.github.io-emerald?style=for-the-badge&logo=github)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
[![Defense Standard](https://img.shields.io/badge/Military_Standard-STANAG_4586_%7C_MIL--STD--810H-blue?style=for-the-badge)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
[![Telemetry](https://img.shields.io/badge/Protocol-MAVLink_v2_%7C_EKF3_Fusion-orange?style=for-the-badge)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)

> **A mission-critical, military-grade Tactical Unmanned Aerial System (UAS) Ground Control Station (GCS) and 6-DoF flight simulator designed strictly in alignment with defense aerospace standards (STANAG 4586, MAVLink v2, MIL-STD-810H). Features multi-category defense UAVs (MALE Saqr-1, Tactical VTOL Hexacopter, FPV Interceptor), AI-powered target acquisition, Electronic Warfare (EW) GPS-jamming resilience, and MGRS military grid operations.**

---

## 🎖️ Defense & Aerospace Engineering Capabilities

### 1. Multi-Category Tactical Fleet (Saudi Defense Focus)
- **Saqr-1 MALE Long-Endurance UAS:** High-altitude reconnaissance platform featuring a high-aspect-ratio 12m composite wingspan, bulbous SATCOM nose fairing, inverted V-tail empennage, and retractable EO/IR turret.
- **Tactical VTOL Hexacopter:** 6-rotor heavy multirotor platform optimized for forward-operating-base (FOB) tactical perimeter security, structural surveillance, and precision hover loiter.
- **FPV Kamikaze Interceptor:** High-agility loitering munition with high-KV brushless motors delivering an 8:1 thrust-to-weight ratio for counter-UAS and high-speed threat interdiction.

### 2. Autonomous Guidance, Navigation & Control (GNC)
- **6-DoF Rigid-Body Dynamics:** Full non-linear aerodynamic simulation incorporating quaternions, gyroscopic precession, motor torque reaction, and aerodynamic drag tensors.
- **EKF3 Multi-Sensor Fusion:** Real-time integration of 3-axis Accelerometer, 3-axis Gyroscope, Magnetometer, Barometric Altimeter, and GNSS RTK positioning.
- **Electronic Warfare (EW) & GPS-Denied Resiliency:** Automated failsafe transition to dead-reckoning and optical flow navigation upon detection of high-power RF electronic jamming.

### 3. STANAG 4586 Interoperable Ground Control Station (GCS)
- **MAVLink v2 Protocol Stream:** Live bidirectional telemetry decoding `HEARTBEAT`, `SYS_STATUS`, `GPS_RAW_INT`, `ATTITUDE`, `VFR_HUD`, and `COMMAND_ACK`.
- **MGRS Tactical Airspace Map:** Military Grid Reference System (Zone 38Q - Saudi Airspace) live tracking, mission waypoints, and dynamic aircraft orientation vectors.
- **Military Standard Heads-Up Display (HUD):** Dynamic roll-stabilized artificial horizon, pitch ladder, Indicated Airspeed (IAS) tape, barometric MSL altitude tape, and digital compass tape.

### 4. AI Target Acquisition & EO/IR Gimbal Payloads
- **Multi-Spectrum Sensors:** Instant toggle between Daylight HD Optical, FLIR White-Hot/Ironbow Thermal Infrared, and High-Gain Night Vision (NVG Green Phosphor).
- **AI Optical Target Tracking:** Real-time 2D screen projection of 3D tactical ground targets (Armored Fighting Vehicles, Radar Masts) with confidence scores, laser rangefinder distance, and bearing calculation.
- **Laser Designator Lock:** Precision target lock-on transmitting MGRS target coordinates to defense command networks.

---

## 🛠️ Architecture & Tech Stack

| Domain | Technology / Protocol | Description |
| :--- | :--- | :--- |
| **3D Engine** | Three.js (r128) / WebGL | Tactical desert military airbase, PBR shaders, dynamic shadows |
| **HUD & Avionics** | Inline SVG / Canvas 2D | Roll-stabilized pitch ladder, airspeed/altitude tapes, CRT scanlines |
| **Avionics Protocol**| MAVLink v2 / UDP 14550 | Standardized military UAV command & telemetry packet simulation |
| **State Estimation** | EKF3 Fusion Simulator | Multi-rate sensor fusion and GNSS-denied inertial navigation |
| **Human Interface** | Dual Virtual RC Gimbals | Mode-2 (Left: Throttle/Yaw, Right: Pitch/Roll) touch and keyboard |
| **Acoustic Engine** | Web Audio API | Procedural turbofan & brushless motor RPM harmonic synthesis |

---

## 🚀 Live Tactical GCS Deployment

- **Online Defense Simulator:** [https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
- **Author:** Eng. Tareq Aboushi (Tareq0001)
- **Standards:** STANAG 4586 | MIL-STD-810H | GACA Part 107
