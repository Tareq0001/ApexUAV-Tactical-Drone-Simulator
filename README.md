# ApexUAV [Defense Edition] — Tactical UAS Flight Dynamics, Avionics & GCS Simulator

[![Defense Standard](https://img.shields.io/badge/Military_Standard-STANAG_4586_%7C_MIL--STD--810H-blue?style=for-the-badge)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
[![Language](https://img.shields.io/badge/Architecture-TypeScript_60%25_%7C_C%2B%2B_30%25_%7C_Python_10%25-3178c6?style=for-the-badge&logo=typescript)](https://github.com/Tareq0001/ApexUAV-Tactical-Drone-Simulator)
[![CI Pipeline](https://img.shields.io/badge/CI_Status-Passing_23_Tests-emerald?style=for-the-badge&logo=githubactions)](https://github.com/Tareq0001/ApexUAV-Tactical-Drone-Simulator/actions)
[![Live GCS](https://img.shields.io/badge/Live_GCS_Simulator-Tareq0001.github.io-emerald?style=for-the-badge&logo=github)](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)

> **An enterprise-grade, mission-critical Tactical Unmanned Aerial System (UAS) Ground Control Station (GCS), 6-Degree-of-Freedom (6-DoF) non-linear rigid-body aerodynamic simulator, and C++17 embedded flight control firmware engineered strictly in alignment with military defense standards (STANAG 4586, MAVLink v2 binary protocol, MIL-STD-810H, MIL-F-8785C). Designed for aerospace engineering evaluations, pilot academy qualification, multi-UAV autonomous swarm operations, and defense autonomy research.**

---

## 🎖️ Defense & Aerospace Architecture

ApexUAV is structured as a **modular aerospace engineering codebase** combining real-time TypeScript avionics, embedded C++17 flight control firmware, and a Python SITL telemetry bridge.

```
ApexUAV-Tactical-Drone-Simulator/
├── .github/workflows/
│   └── ci.yml                     # Automated CI: Vitest suite, Vite build, Python verification
├── firmware_cpp/
│   ├── px4_attitude_control.hpp   # C++17 SO(3) Lie group attitude observer & 6-DoF mixer header
│   └── px4_attitude_control.cpp   # Full implementation: Mahony filter, geometric attitude PID, desaturation
├── python_sitl/
│   ├── mavlink_bridge.py          # Python UDP 14550 MAVLink v2 router for QGroundControl/PX4
│   └── requirements.txt           # pymavlink, numpy, scipy
├── src/
│   ├── core/
│   │   └── math.ts                # Vector3D, Quaternion4D, Euler, and frame transformations
│   ├── flight_dynamics/
│   │   ├── 6dof_engine.ts         # Non-linear 6-DoF rigid-body aerodynamics & 200Hz sub-stepping
│   │   └── atmosphere_dryden.ts   # MIL-F-8785C Dryden wind turbulence & ISA atmospheric models
│   ├── autonomy/
│   │   └── swarm_controller.ts    # Multi-UAV leader-follower consensus & APF collision avoidance
│   ├── avionics/
│   │   ├── pid.ts                 # Cascade PID attitude/rate controller with anti-windup & filter
│   │   ├── ekf3.ts                # 15-state Extended Kalman Filter (IMU, GNSS, Baro, EW Jamming)
│   │   └── ballistics_computer.ts # 3D True Proportional Navigation (TPN) & CCIP trajectory solver
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
│   ├── avionics.test.ts           # Cascade PID convergence & EKF3 EW jamming tests
│   └── atmosphere_swarm.test.ts   # Dryden ISA, Swarm APF avoidance & Ballistic TPN guidance tests
├── index.html                     # Clean GCS dashboard markup loading /src/main.ts
├── vite.config.ts                 # Bundler configuration
├── tsconfig.json                  # Strict TypeScript compiler options
└── package.json                   # Dependencies: Three.js, Vitest, Vite, TypeScript
```

---

## 🔬 Core Engineering Subsystems

### 1. Embedded C++17 PX4 Attitude & Mixer Firmware (`firmware_cpp/`)
- **Geometric Control on SO(3):** Implements non-linear attitude tracking directly on the Special Orthogonal Lie group $\mathrm{SO}(3)$, eliminating gimbal lock singularities and large-angle unwinding errors:
  $$\mathbf{e}_R = \frac{1}{2}\left(\mathbf{R}_{sp}^T \mathbf{R} - \mathbf{R}^T \mathbf{R}_{sp}\right)^\vee$$
- **Mahony Non-Linear Complementary Observer:** Fuses 3-axis accelerometer gravity and magnetometer heading with internal integration of DC gyroscope bias $\dot{\hat{\mathbf{b}}}_\omega = -k_i \mathbf{e}$.
- **6-DoF Actuator Mixer Matrix:** Geometry allocation for Quad-X, Hexa-X, Octo-X, Fixed-Wing, and VTOL Tiltrotor configurations with priority motor desaturation ($\text{Roll/Pitch} > \text{Yaw} > \text{Thrust}$).

### 2. 6-DoF Non-Linear Aerodynamics (`src/flight_dynamics/6dof_engine.ts`)
- **Newton-Euler Equations of Motion:** Incorporates dynamic pressure $\bar{q} = \frac{1}{2} \rho V^2$, angle of attack $\alpha$, sideslip $\beta$, induced drag $C_{Di} = \frac{C_L^2}{\pi e AR}$, and rotating frame Coriolis accelerations $(\mathbf{a} = \frac{\mathbf{F}}{m} - \boldsymbol{\omega} \times \mathbf{v})$.
- **Euler-Singularity-Free Kinematics:** Uses unit quaternions with conjugate gravity transformation $\mathbf{F}_{grav\_body} = \mathbf{q}^* \otimes \mathbf{F}_{grav\_NED} \otimes \mathbf{q}$ to guarantee complete numerical stability in steep dives, rolls, and inverted maneuvers.
- **200Hz Sub-Stepping:** High-rate inner integration loop prevents numerical drift during extreme angular rates.

### 3. MIL-F-8785C Dryden Wind Turbulence & ISA Atmosphere (`src/flight_dynamics/atmosphere_dryden.ts`)
- **International Standard Atmosphere (ISA):** Exact temperature lapse rate and barometric pressure formulas from sea level up through the isothermal Stratosphere ($11,000\text{ m} - 20,000\text{ m}$).
- **Dryden Spectral Gust Filters:** Discrete Euler-Maruyama stochastic realizations of military Dryden transfer functions driven by Box-Muller Gaussian white noise:
  $$\dot{u}_g = -\frac{V}{L_u} u_g + \sigma_u \sqrt{\frac{2V}{L_u}} \eta_u$$
- Dynamically coupled with boundary layer logarithmic wind shear and airframe aerodynamic moment perturbations.

### 4. Autonomous Multi-UAV Swarm & Consensus Formation (`src/autonomy/swarm_controller.ts`)
- **Distributed Leader-Follower Consensus:** PD consensus tracking maintaining rigid tactical geometry (V-Wedge, Combat Diamond, Orbit Ring) with heading-referenced coordination.
- **Artificial Potential Field (APF) Collision Avoidance:** Hyperbolic repulsive gradient potential preventing inter-agent collisions and keeping safe separation:
  $$\mathbf{F}_{rep} = k_{rep} \left(\frac{1}{d} - \frac{1}{d_0}\right) \frac{1}{d^2} \hat{\mathbf{u}}$$
- Rendered live in Three.js as coordinated wingman drones (`ALPHA-2`, `ALPHA-3`, `ALPHA-4`) with navigation strobes and delta airframes.

### 5. Tactical Ballistics & True Proportional Navigation (`src/avionics/ballistics_computer.ts`)
- **3D True Proportional Navigation (TPN):** Generates normal acceleration steering commands perpendicular to the Line of Sight (LOS) to drive LOS rate $\boldsymbol{\Omega}$ to zero on optimal intercept paths:
  $$\mathbf{a}_{cmd} = N V_c (\boldsymbol{\Omega} \times \hat{\boldsymbol{\lambda}})$$
- **Zero-Effort-Miss (ZEM):** Real-time calculation of miss distance at closest approach and estimated time-to-go $t_{go}$.
- **Continuously Computed Impact Point (CCIP):** Numerical forward integration of gravity and quadratic aerodynamic drag predicting ground impact coordinates for air-to-ground ordnance.

### 6. 15-State Extended Kalman Filter (`src/avionics/ekf3.ts`)
- States: Position NED $[x, y, z]$, Velocity NED $[v_x, v_y, v_z]$, Quaternion $[\mathbf{q}]$, Gyro Bias $[\mathbf{b}_\omega]$, and Accel Bias $[\mathbf{b}_a]$.
- **Electronic Warfare (EW) Resiliency:** Detects GPS RF jamming signals and innovation covariance blowouts; automatically falls back to inertial dead-reckoning.

### 7. STANAG 4586 MAVLink v2 Binary Protocol (`src/mavlink/mavlink_v2.ts`)
- Authentic packet structure with magic byte `0xFD`, sequence counting, system/component addressing, and 24-bit message IDs.
- Standard X.25 CRC-16 CCITT accumulator with per-message `CRC_EXTRA` validation:
  - `HEARTBEAT` (#0, CRC_EXTRA: 50)
  - `SYS_STATUS` (#1, CRC_EXTRA: 124)
  - `ATTITUDE` (#30, CRC_EXTRA: 39)
  - `GLOBAL_POSITION_INT` (#33, CRC_EXTRA: 104)

---

## 🧪 Automated Test Verification

All avionics, dynamics, swarm, and ballistics components are verified through continuous integration tests using **Vitest**:

```bash
# Execute full aerospace unit test suite
npm test
```

```
 ✓ tests/mavlink.test.ts (3 tests)
 ✓ tests/avionics.test.ts (4 tests)
 ✓ tests/flight_dynamics.test.ts (4 tests)
 ✓ tests/atmosphere_swarm.test.ts (12 tests)

 Test Files  4 passed (4)
      Tests  23 passed (23)
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

# 3. Type-check & execute test suite
npm run lint
npm test

# 4. Compile production bundle to dist/
npm run build
```

---

## 🌐 Live GCS Deployment

- **Tactical Flight Simulator:** [https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/](https://tareq0001.github.io/ApexUAV-Tactical-Drone-Simulator/)
- **Author:** Eng. Tareq Aboushi
- **Target Standard:** STANAG 4586 | MIL-STD-810H | MIL-F-8785C | GACA Part 107
- **Portfolio Integration:** Master Saudi Defense & Intelligence Engineering Portfolio
