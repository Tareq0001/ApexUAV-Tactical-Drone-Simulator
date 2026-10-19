# ApexUAV [Defense Edition] — Tactical UAS Flight Dynamics, Avionics & GCS Simulator

[![Defense Standard](https://img.shields.io/badge/Military_Standard-STANAG_4586_%7C_MIL--STD--810H-blue?style=for-the-badge)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
[![Language](https://img.shields.io/badge/Architecture-TypeScript_85%25_%7C_Python_15%25-3178c6?style=for-the-badge&logo=typescript)](https://github.com/Tareq0001/ApexUAV-Tactical-Drone-Simulator)
[![CI Pipeline](https://img.shields.io/badge/CI_Status-Passing_11_Tests-emerald?style=for-the-badge&logo=githubactions)](https://github.com/Tareq0001/ApexUAV-Tactical-Drone-Simulator/actions)
[![Live GCS](https://img.shields.io/badge/Live_GCS_Simulator-Tareq0001.github.io-emerald?style=for-the-badge&logo=github)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)

> **An enterprise-grade, mission-critical Tactical Unmanned Aerial System (UAS) Ground Control Station (GCS) and 6-Degree-of-Freedom (6-DoF) non-linear rigid-body aerodynamic simulator engineered strictly in alignment with military defense standards (STANAG 4586, MAVLink v2 binary protocol, MIL-STD-810H). Designed for aerospace engineering evaluations, pilot academy qualification, and defense autonomy research.**

---

## 🎖️ Defense & Aerospace Architecture

ApexUAV is structured as a **modular aerospace engineering codebase** combining real-time TypeScript avionics with a Python SITL telemetry bridge.

```
ApexUAV-Tactical-Drone-Simulator/
├── .github/workflows/
│   └── ci.yml                     # Automated CI: Vitest suite, Vite build, Python verification
├── python_sitl/
│   ├── mavlink_bridge.py          # Python UDP 14550 MAVLink v2 router for QGroundControl/PX4
│   └── requirements.txt           # pymavlink, numpy, scipy
├── src/
│   ├── core/
│   │   └── math.ts                # Vector3D, Quaternion4D, Euler, and frame transformations
│   ├── flight_dynamics/
│   │   └── 6dof_engine.ts         # Non-linear 6-DoF rigid-body aerodynamics & 200Hz sub-stepping
│   ├── avionics/
│   │   ├── pid.ts                 # Cascade PID attitude/rate controller with anti-windup & filter
│   │   └── ekf3.ts                # 15-state Extended Kalman Filter (IMU, GNSS, Baro, EW Jamming)
│   ├── mavlink/
│   │   └── mavlink_v2.ts          # Authentic MAVLink v2 binary framer & X.25 CRC-16 checksums
│   ├── navigation/
│   │   └── mission_planner.ts     # Waypoint sequencing, ray-casting geofence & safe RTL transit
│   ├── vision/
│   │   └── target_tracker.ts      # EO/IR optical target tracking & laser slant range kinematics
│   ├── simulation/
│   │   ├── drone_models.ts        # Procedural 3D airframes (Saqr-1 MALE, Hexacopter, FPV)
│   │   └── sim_engine.ts          # Integrated multi-rate simulation orchestrator & audio engine
│   ├── ui/
│   │   ├── hud_renderer.ts        # MIL-STD-1787 roll-stabilized HUD, pitch ladder, airspeed/alt tapes
│   │   └── tactical_map.ts        # Canvas-based 2D MGRS radar map with sensor FOV & breadcrumbs
│   └── main.ts                    # Application bootstrap, GCS human interface & input loops
├── tests/
│   ├── flight_dynamics.test.ts    # Aerodynamic lift/drag trim & ground penetration tests
│   ├── mavlink.test.ts            # Binary framing, packet integrity & CRC corruption tests
│   └── avionics.test.ts           # Cascade PID convergence & EKF3 EW jamming tests
├── index.html                     # Clean GCS dashboard markup loading /src/main.ts
├── vite.config.ts                 # Bundler configuration
├── tsconfig.json                  # Strict TypeScript compiler options
└── package.json                   # Dependencies: Three.js, Vitest, Vite, TypeScript
```

---

## 🔬 Core Engineering Subsystems

### 1. 6-DoF Non-Linear Aerodynamics (`src/flight_dynamics/6dof_engine.ts`)
- **Newton-Euler Equations of Motion:** Incorporates dynamic pressure $q = \frac{1}{2} \rho V^2$, angle of attack $\alpha$, sideslip $\beta$, induced drag $C_{Di} = \frac{C_L^2}{\pi e AR}$, and rotating frame Coriolis accelerations $(\mathbf{a} = \frac{\mathbf{F}}{m} - \boldsymbol{\omega} \times \mathbf{v})$.
- **Euler-Singularity-Free Kinematics:** Uses unit quaternions with conjugate gravity transformation $\mathbf{F}_{grav\_body} = \mathbf{q}^* \otimes \mathbf{F}_{grav\_NED} \otimes \mathbf{q}$ to guarantee complete numerical stability in steep dives, rolls, and inverted maneuvers.
- **200Hz Sub-Stepping:** High-rate inner integration loop prevents numerical drift during extreme angular rates.

### 2. 15-State Extended Kalman Filter (`src/avionics/ekf3.ts`)
- States: Position NED $[x, y, z]$, Velocity NED $[v_x, v_y, v_z]$, Quaternion $[\mathbf{q}]$, Gyro Bias $[\mathbf{b}_\omega]$, and Accel Bias $[\mathbf{b}_a]$.
- **Electronic Warfare (EW) Resiliency:** Detects GPS RF jamming signals and innovation covariance blowouts; automatically falls back to inertial dead-reckoning.

### 3. STANAG 4586 MAVLink v2 Binary Protocol (`src/mavlink/mavlink_v2.ts`)
- Authentic packet structure with magic byte `0xFD`, sequence counting, system/component addressing, and 24-bit message IDs.
- Standard X.25 CRC-16 CCITT accumulator with per-message `CRC_EXTRA` validation:
  - `HEARTBEAT` (#0, CRC_EXTRA: 50)
  - `SYS_STATUS` (#1, CRC_EXTRA: 124)
  - `ATTITUDE` (#30, CRC_EXTRA: 39)
  - `GLOBAL_POSITION_INT` (#33, CRC_EXTRA: 104)

### 4. Cascade Attitude & Rate PID Controller (`src/avionics/pid.ts`)
- **Outer Loop:** Attitude angle error $\to$ desired angular rate setpoint $(\dot{\phi}, \dot{\theta}, \dot{\psi})$.
- **Inner Loop:** Angular rate error $\to$ control surface deflection / motor command with anti-windup clamping and first-order low-pass derivative filtering.

### 5. Multi-Spectrum Optical Tracking & Laser Designator (`src/vision/target_tracker.ts`)
- Dynamic 2D camera viewport projection of 3D tactical ground targets (Armored Fighting Vehicles, Radar Outposts).
- Triangulation of Slant Range, Target Azimuth, and Elevation angle for military fire-control coordination.

---

## 🧪 Automated Test Verification

All avionics and dynamics components are verified through continuous integration tests using **Vitest**:

```bash
# Execute full aerospace unit test suite
npm test
```

```
 ✓ tests/mavlink.test.ts (3 tests)
 ✓ tests/avionics.test.ts (4 tests)
 ✓ tests/flight_dynamics.test.ts (4 tests)

 Test Files  3 passed (3)
      Tests  11 passed (11)
```

---

## 🐍 Python SITL MAVLink Bridge (`python_sitl/mavlink_bridge.py`)

A standalone Python service routing telemetry over UDP port 14550 to standard Ground Control Stations (QGroundControl, PX4 SITL, Mission Planner):

```bash
# Setup Python virtual environment
cd python_sitl
pip install -r requirements.txt

# Run telemetry router
python mavlink_bridge.py
```

---

## 💻 Building & Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Compile production bundle to dist/
npm run build
```

---

## 🌐 Live GCS Deployment

- **Tactical Flight Simulator:** [https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
- **Author:** Eng. Tareq Aboushi
- **Target Standard:** STANAG 4586 | MIL-STD-810H | GACA Part 107
- **Portfolio Integration:** Master Saudi Defense & Intelligence Engineering Portfolio
