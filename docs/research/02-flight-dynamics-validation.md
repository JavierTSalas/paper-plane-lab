# 02 - Flight dynamics, numerical method, human launch and validation targets

Research note for the Paper Plane Lab physics core. All units SI unless stated. Air at 20 C indoors: rho = 1.204 kg/m^3, nu = 1.52e-5 m^2/s, g = 9.80665 m/s^2 (standard values, unverified - model knowledge). Source tags [S#] map to the list at the end. "Derived" means computed here from cited inputs (the arithmetic is shown or reproducible). "(unverified - model knowledge)" means I could not confirm it online during this session.

**Access caveat.** In this session WebFetch could not reach outside hosts, and the web-search budget ran out before the end. Every [S#] claim was confirmed by search-engine results for that URL (title plus extracted text), not by reading the full document. Items I could not confirm are tagged.

## Summary for implementers

1. Integrate a 6-DOF rigid body in body axes: quaternion attitude, classical RK4, **fixed dt = 1 ms** (1000 Hz, about 16-17 substeps per 60 Hz frame). Renormalise q after each step. RK4 is stable when |lambda*dt| <= 2.785 [S23].
2. The stiffest physical mode is **roll subsidence**. On an A4 plane with a 0.20 m span, the time constant is about 2-17 ms at 5-20 m/s (|lambda| up to about 770 1/s at 27 m/s launch). Short period and heave are 5-80 ms. So dt = 16.7 ms is unstable and dt <= 2 ms is needed. A semi-implicit scheme is **not** required at 1 ms. Add a stiffness guard (section 1.4).
3. The aerodynamics are an element model: each element sees v_i = v_B + omega x r_i - R^T w(x_i, t). Rate damping comes out of the omega x r term with no extra code. Use at least 6 x 6 elements per lifting surface: the geometric error is 0.5/N^2, so N = 6 gives 1.4 % (derived).
4. Paper planes have a relative density mu = 2m/(rho S c) of only about 1.6-2.1 (an RC model is about 20). **Added mass is not negligible.** For normal translation it is about 0.3-0.7 m, and for roll inertia about 0.3-2.5 Ixx (derived). Add a diagonal apparent-mass and inertia term. Do not add a Munk moment on top of measured centre-of-pressure data, because that counts it twice.
5. The main steady-glide anchor is the dart from Ng et al. [S12]: V = 4.90 m/s, C_L = 0.17, L/D of about 5, so sink is about 1.0 m/s, the glide angle about 11 deg and W/S about 2.5 N/m^2 (derived).
6. Records to bound the simulator. Distance: **98.43 m** (Liu Liwen and team, Shanghai, 28 Dec 2025) [S1][S2]. Time aloft: **31.2 s** (team in Kunshan, 11 Feb 2026) [S3]. Older marks are Toda 29.2 s (2010) and Blackburn 27.6 s (1998) [S3][S9]. A record time-aloft launch is near vertical at about 27 m/s (60 mph) [S9][S11].
7. The in-app throw should run 2-30 m/s, with an angle from -20 to +90 deg and a release height of 0.8-2.3 m. Casual throws are 5-11 m/s [S31][S32], and an elite throw is about 27 m/s [S11].
8. Score as in competitions. A flight ends at the **first touch** of the ground, wall or ceiling. Distance is horizontal, from the throw line to the first-touch point [S29]. A rest-point distance can be shown as a secondary number [S30].

---

## 1. 6-DOF rigid-body equations, integrator and step size

### 1.1 Equations (body axes, origin at the CG)

The state is x = [p_W (3), v_B (3), q (4, Hamilton, unit), omega_B (3)]. R(q) rotates body to world. These are the standard flat-earth rigid-body equations (unverified - model knowledge; any flight-simulation text, e.g. Stevens & Lewis).

```
p_W'     = R(q) v_B
v_B'     = F_B / m  - omega_B x v_B                     (F_B = sum F_i + m R^T g_W)
q'       = 0.5 * q (x) [0, omega_B]                     (quaternion product)
omega_B' = I^-1 ( M_B - omega_B x (I omega_B) )         (M_B = sum r_i x F_i, r_i from the CG)
element air-relative velocity:  v_i = v_B + omega_B x r_i - R^T w_W(p_W + R r_i, t)
```

- I is the full 3x3 tensor built from the folded layers. Paper planes are left-right symmetric, so Ixy = Iyz = 0 but **Ixz != 0** once dihedral and keel are present. Invert I once per geometry.
- Renormalise q after every full RK4 step, not after every stage.
- Gravity acts at the CG. The paper's buoyancy is about rho*V_paper*g, which is 1.2*(0.0624 m^2 * 0.1 mm)*g, or 7.5e-6 kg-equivalent. That is 0.15 % of the weight and can be ignored (derived).

**With added mass** (section 3): replace m and I with M_tot = m*1 + diag(m_ax, m_ay, m_az) and I_tot = I + diag(I_ax, I_ay, I_az) in the acceleration terms only. Keep the gyroscopic terms omega x (m v) and omega x (I omega) with the rigid-body values. Section 3 explains why.

### 1.2 Worked example: A4, 80 g/m^2

The mass is 0.210 x 0.297 x 0.080 = **4.99 g**, so W = 0.0489 N (derived). Two planforms are modelled as deltas with the apex forward. Inertias are estimated: Iyy is about m L^2/18 for a triangular lamina, and Ixx is about m b^2/24, reduced because keel layers sit near the centreline (unverified - model knowledge).

| | A: task spec (b 0.20 m, L 0.28 m) | B: Ng-type dart (b 0.135 m, L 0.297 m) |
|---|---|---|
| S (planform) | 0.028 m^2 | 0.020 m^2 (matches the S implied by [S12]) |
| AR = b^2/S, LE sweep | 1.43, 70 deg | 0.91, 77 deg (Schluter quotes about 75 deg [S13]) |
| CL_alpha (Helmbold [S25]) | 2.01 /rad | 1.36 /rad |
| MAC (2/3 c_r) | 0.187 m | 0.198 m |
| W/S | 1.75 N/m^2 (1.78 g/dm^2) | 2.44 N/m^2 |
| Ixx / Iyy (est.) | 2e-6 to 8e-6 / 1.8e-5 kg m^2 | 1e-6 to 4e-6 / 2.0e-5 kg m^2 |
| Re at 5 m/s (MAC) | 6.2e4 | 6.5e4 |

Helmbold: CL_alpha = 2*pi*A / (2 + sqrt(A^2 + 4)). It holds for low-AR straight or flat-plate wings at incompressible speeds [S25], and tends to the slender-wing value pi*A/2 as A goes to 0.

**Linear damping derivatives** (strip integration over the planform; derivations reproducible):
- Roll: L_p = -(rho V S b^2 / 4) * |C_lp|. For a delta, C_lp = -CL_alpha/12 by strip theory (derived: integral of c(y) y^2 dy = c_r b^3/48). Slender-wing theory gives -pi A/32 (unverified - model knowledge, classical Ribner result). The two agree within 20 %.
- Heave: Z_w = -(rho V S CL_alpha)/2, giving tau_z = m/|Z_w|.
- Pitch rate: M_q = -(rho V CL_alpha / 2) * integral of (x - x_cg)^2 dA. For a delta the integral is b L^3/36 (derived).
- Short period in alpha-q form: omega_n^2 = (|M_alpha| + a1 |M_q|)/Iyy and 2 zeta omega_n = a1 + |M_q|/Iyy. Here a1 = rho V S CL_alpha/(2m) and M_alpha = -q_bar S CL_alpha Kn c (unverified - model knowledge, standard two-state approximation).

| V (m/s) | Plane | Roll tau (ms), by Ixx | Heave tau (ms), without / with added mass | Short period, Kn 0.10 | Phugoid T (s) |
|---|---|---|---|---|---|
| 3 | A | 14 / 28 / 56 | 49 / 76 | omega_n 29 rad/s, zeta 0.79 | 1.36 |
| 5 | A | 8.5 / 17 / 34 | 29 / 45 | 48 rad/s, 0.79 | 2.27 |
| 10 | A | 4.2 / 8.5 / 17 | 15 / 23 | 95 rad/s, 0.79 | 4.53 |
| 20 | A | 2.1 / 4.2 / 8.5 | 7.4 / 11 | 191 rad/s, 0.79 | 9.06 |
| 27 (record launch) | A | 1.6 / 3.1 / 6.3 | 5.4 / 8.4 | 258 rad/s, 0.79 | 12.2 |
| 5 | B | 20 / 41 / 82 | 61 / 81 | 27 rad/s, 0.67 | 2.27 |
| 20 | B | 5.1 / 10 / 20 | 15 / 20 | 109 rad/s, 0.67 | 9.06 |

All values in this table are derived. In the short period, a larger static margin raises omega_n and lowers zeta: for A, Kn 0.05 gives zeta 0.88 and Kn 0.25 gives zeta 0.63.

### 1.3 Stability of explicit RK4

RK4 is absolutely stable on the negative real axis for h*|lambda| <= 2.785 [S23]. Its imaginary-axis limit is about 2.83 (unverified - model knowledge).

| Worst case | |lambda| (1/s) | Largest stable dt | dt for |lambda dt| = 0.5 (accurate) |
|---|---|---|---|
| A, 5 m/s, Ixx 2e-6 (strip C_lp) | 141 | 19.7 ms | 3.5 ms |
| A, 20 m/s | 566 | 4.9 ms | 0.9 ms |
| A, 27 m/s | 764 | 3.6 ms | 0.65 ms |
| Tumbling / high rate (est. 2x) | about 1500 | 1.9 ms | 0.33 ms |

Conclusions (derived):
- **One RK4 step per 60 Hz frame (16.7 ms) is unstable** for any throw faster than about 5 m/s.
- **dt = 1 ms keeps |lambda dt| below 0.8** for every human throw. The integration error per step is then about (lambda dt)^5/120, under 3e-3, and far smaller in the cruise phase.
- A semi-implicit scheme is not needed. Semi-implicit (symplectic) Euler is only first order and stable for |lambda dt| < 2, so it brings no benefit at 1 ms. It is acceptable only as a "low-power" fallback with dt <= 0.5 ms.
- Added mass lengthens every time constant (roughly 1.3-2.5x for heave and roll), so the dt above stays conservative.

### 1.4 Stiffness guard and determinism

- **Guard.** At each step estimate lambda_est = max over the axes of [sum_i 0.5 rho |v_i| A_i CN'_i r_i^2] / I_axis, with CN' about 2 per rad. Sub-divide the step until lambda_est*dt <= 1.0. This covers tumbles and gusts (unverified - model knowledge; design suggestion).
- **Rendering.** Run fixed-dt physics with an accumulator and interpolate the render pose between steps (unverified - model knowledge, standard game-loop practice).
- **Determinism for global rankings.** IEEE-754 + - * / and sqrt are correctly rounded and reproducible. ECMAScript Math.sin, cos, atan2, exp and pow are "implementation-approximated", so they can differ between V8 and JavaScriptCore. In a chaotic flight, last-bit differences can grow (unverified - model knowledge). For leaderboard verification:
  - use one pure-JS fdlibm-style math module everywhere in the physics core;
  - re-simulate submitted (design, throw, seed) tuples on the server (a Cloudflare Worker runs V8).

## 2. Real-time full-envelope element / strip models

| Model | What it does | Relevance |
|---|---|---|
| Selig 2010, 2014 [S15][S16] | 6-DOF real-time model over the full **+-180 deg alpha and beta**, built from components using first-principles aerodynamics plus lookup tables. Runs in real time in the FS One RC simulator. Selig rejects full-envelope system identification as impractical. | The architecture to copy: components, then segments, then tables over +-180 deg. |
| Khan & Nahon 2015-16, Khan thesis [S17] | "Component breakdown" model for agile fixed-wing UAVs over the complete AoA range. It treats quasi-steady and unsteady effects and a simplified wing-tail interference, was validated against bench and wind-tunnel tests, and ran pilot-in-the-loop in X-Plane. | Confirms a strip/component model plus a post-stall flat-plate blend is enough for real-time agile flight. |
| Andersen, Pesavento, Wang 2005 [S18] | Quasi-steady model of freely falling plates (flutter and tumble, Re about 1e3), fitted to measured trajectories. Circulation is dominated by a term proportional to **angular velocity**, not translation. | Shows what to do when a paper plane tumbles: lift needs a rotational-circulation term. The model's form and coefficients (C_T = 1.2, C_R = pi, A = 1.4, B = 1.0, mu1 = mu2 = 0.2) are unverified - model knowledge. |
| MIT perching gliders (Cory & Tedrake 2008) | Flat-plate glider with CL = 2 sin(a) cos(a) and CD = 2 sin^2(a) through post-stall (unverified - model knowledge) | A cheap first-pass full-envelope plate model. |

**How these models work (for our element model):**

1. **Local velocity.** Each element evaluates v_i = v_B + omega x r_i - wind(x_i). Roll, pitch and yaw damping and the asymmetric lift in a turn all emerge from omega x r_i. Do **not** add separate C_lp, C_mq or C_nr terms as well; that counts the damping twice.
2. **Coefficients.** Use normal-force-based full-envelope tables or functions per element, CN(alpha_i) and CT(alpha_i) over +-180 deg [S15]. Use the **3D lift slope of the parent surface** (Helmbold) rather than 2*pi. Otherwise strip theory over-predicts lift on AR 1-2 wings by a factor of 3-4 (derived: 2*pi / 2.0). Wind-tunnel data for low-AR thin plates (AR 0.5-2, Re 7e4-2e5, four planforms, with lift slope and centre of lift) is in Torres & Mueller [S24]. That is the right dataset for checking the per-surface slopes.
3. **Stall.** In the Selig and Khan & Nahon class of models, stall is a table or a smooth blend from attached-flow to flat-plate coefficients. A commonly used sigmoid blend is sigma(alpha) with M of about 50 and alpha_0 of about 0.47 rad (Beard & McLain; unverified - model knowledge).
   - Paper darts are low-AR, highly swept deltas. They do not stall sharply: a leading-edge vortex keeps lift growing.
   - CFD on a classic dart gives **CL_max 1.46-1.49 at alpha_stall 37.5-40 deg** [S14].
   - Schluter's water-tunnel and LES work attributes the high lift at low Re to the high-sweep delta, and finds that the centre fold improves performance [S13].
   - A Polhamus-type split, CL = Kp sin(a) cos^2(a) + Kv sin^2(a) cos(a), suits dart elements (unverified - model knowledge).
4. **Unsteadiness.** Use the reduced frequency k = omega c/(2V).
   - Phugoid at 5 m/s: k is about 0.05, so quasi-steady is fine.
   - Short period: k is about 0.8-1.1, so it is strongly unsteady (derived). Quasi-steady coefficients will not get short-period transients exactly. Those modes are over-damped or decay within 0.1 s, so glide outcomes are barely affected.
   - An optional first-order lag on element CN (time constant about c/V) is the cheap fix (unverified - model knowledge).

**How many elements?** Midpoint-rule strip sums of the roll and pitch inertia integrals over a delta have a relative error of **0.5/N^2** for N strips per semispan or chord: 12.5 % at N = 2, 3.1 % at N = 4, **1.4 % at N = 6**, 0.8 % at N = 8 (derived).

Recommended grid:
- 6 spanwise x 6 chordwise per wing panel;
- 4 x 4 for the keel and each winglet;
- 6 x 2 for an elevator strip;
- 80-100 elements in total.

Cost at 1 kHz with 4 RK stages is about 4e5 element evaluations per second, or about 10 % of one phone core in JIT JS (estimate). A "low" quality setting can use 4 x 4, with 3 % error.

## 3. Added mass (apparent inertia)

Potential-flow results for an infinitely thin 2D plate of chord l, per unit span [S19][S20]:
- Normal translation: **m22 = pi rho l^2 / 4**, the mass of a fluid cylinder one chord in diameter.
- Rotation about mid-chord: **I_a = pi rho l^4 / 128**. About a point offset d from mid-chord: I_a = (pi rho l^4/128)(1 + 8 (2d/l)^2) [S19].
- Tangential: m11 = 0.

A PIV study confirms these terms on a translating and rotating flat plate [S20]. In 3D, a circular disc moving broadside has m_a = (8/3) rho a^3 (unverified - model knowledge, Lamb/Newman). For a planform of area S this becomes **m_a,z = (8/3) rho (S/pi)^1.5 = 0.479 rho S^1.5**.

| Paper plane | m_a,z, 3D disc-equivalent | Slender-strip | Ratio to m = 4.99 g | Added roll inertia (slender / strip) | Added pitch inertia (strip, upper bound) |
|---|---|---|---|---|---|
| A (b 0.20 m) | 2.7 g | 3.5 g | **0.54-0.71** | 2.7e-6 / 4.9e-6 kg m^2 (about 0.3-2.5 Ixx) | 7.3e-6 (about 0.4 Iyy) |
| B (dart) | 1.6 g | 1.7 g | **0.33-0.34** | 0.6e-6 / 1.7e-6 | 6.2e-6 (about 0.3 Iyy) |
| 1 kg RC model, S 0.3 m^2 (comparison) | 96 g | - | 0.10 | - | - |

All values in this table are derived. Slender-strip formulas for a delta with the apex forward:
- m_a = pi rho b^2 c_r / 12
- I_a,roll = pi rho b^4 c_r / 640

**Verdict.**
- Added mass changes nothing in a steady glide, because there is no acceleration.
- It slows heave, roll and short-period transients by 15-60 % and reduces gust response. That makes the plane feel "floaty", which is a real feature of paper planes.
- Falling-plate models include it [S18][S19]. Conventional RC simulators [S15][S17] are not documented as including it (unverified). That is justified for them, because m_a/m is about 0.1.

**Implementation.**
- Add the diagonal (m_a,z, I_a,x, I_a,y) to the acceleration side only.
- Make the added mass react to the **air-relative** acceleration (v_B' - R^T w_W'), so that gusts push the plane.
- **Do not** add the Munk moment (m22 - m11) u w. In steady 2D flow it equals exactly the pitching moment of lift acting at the quarter chord about mid-chord (unverified - model knowledge; the Munk moment is described in [S36]). Any centre-of-pressure table measured or fitted to steady data already contains it.
- The full Kirchhoff form [S36] is only correct if the steady CP model is built without that term.

## 4. Stability physics to explain to users

| Concept | Formula | Notes |
|---|---|---|
| Static margin | Kn = (x_np - x_cg)/c = -dCm_cg/dCL | Must be > 0. For a slender delta, x_np is about the area centroid = 2/3 c_r from the apex (unverified - model knowledge). |
| Trim | alpha_trim = Cm0 / (CL_alpha * Kn) | A flat, uncambered wing has Cm0 = 0 about its AC. With the CG ahead of the AC it can only trim at CL = 0, so it dives. Up-elevator (trailing-edge reflex) gives Cm0 > 0. More static margin needs more up-elevator. |
| Elevator effect (thin aerofoil, flap chord fraction E) | dCm_c/4/d(delta) = -0.5 sin(th)(1 - cos(th)), dCl/d(delta) = 2(pi - th + sin(th)), with cos(th) = 2E - 1 | E = 0.10 gives -0.54 /rad and 2.49 /rad. **5 deg up gives dCm = +0.047 and dCl = -0.22 (2D)**. Scale by about CL_alpha,3D/2pi at low AR (unverified - model knowledge; values derived). |
| Phugoid | omega_n = sqrt(2) g / V, **T = pi sqrt(2) V/g = 0.453 V s**, zeta = 1/(sqrt(2) L/D) [S21][S22] | Dart at 4.9 m/s: T = 2.22 s, wavelength 10.9 m, zeta = 0.14 at L/D = 5 (derived). This is the "swoop then stall" seen after a too-fast throw. |
| Short period | see section 1.2 | omega_n 15-60 rad/s at 3-5 m/s, zeta 0.5-0.9. Essentially invisible to the eye. |
| Roll subsidence | tau = Ixx/|L_p| | 2-80 ms |
| Dihedral effect | C_l_beta of about -CL_alpha Gamma (1 + 2 lambda) / (6 (1 + lambda)); rectangular -CL_alpha Gamma/4, delta -CL_alpha Gamma/6 | Strip theory (unverified - model knowledge). Wing sweep adds more dihedral effect as CL rises (unverified). |
| Fin / keel | dC_n_beta of about CL_alpha,v (S_v l_v)/(S b) > 0; dC_l_beta of about -CL_alpha,v (S_v/S)(z_v/b) | A fin **above** the roll axis helps roll stability. The **keel below** the CG gives an anhedral (destabilising) roll effect, which wing dihedral must outweigh (unverified - model knowledge). |
| Spiral criterion | stable if C_l_beta C_n_r - C_n_beta C_l_r > 0 | A big keel with flat wings gives a spiral dive. Lots of dihedral with a small fin gives Dutch roll or wallowing (unverified - model knowledge). |
| Glide | tan(gamma) = 1/(L/D); V = sqrt(2 (W/S) cos(gamma) / (rho CL)); w_sink = V sin(gamma) | Minimum sink is at the minimum-power condition [S35]. With a parabolic polar, CL_md = sqrt(CD0/k) and CL_ms = sqrt(3 CD0/k) (unverified - model knowledge). |

**Practitioner advice (with sourcing status):**
- **Blackburn.** A record needs good folds, a good throw and good design. He uses a near-vertical, baseball-style throw starting with the tail near the ground, and letter-size paper [S9][S10]. His own trimming pages (paperplane.org) could not be retrieved here.
- **Toda.** Breaking the record "depended on how high the plane flew", per The Telegraph via [S9]. Sky King was one sheet plus some cellophane tape, about 10 cm long [S39]. His records: 27.9 s in 2009 [S8] and 29.2 s in 2010 with "Zero Fighter" [S3][S40].
- **Collins.** Wing loading predicts sink rate better than glide ratio does [S34]. "Suzanne", thrown by Ayoob, set the 69.14 m distance record [S7].
- **Elevator effect** (practitioner and educational pages, low evidential weight):
  - bending the trailing edges up slightly adds "elevator", which slows the plane and makes it more stable [S37];
  - bending both flaps the same way controls pitch [S38];
  - the nearer the CG is to the neutral point, the more sensitive the plane is to elevator [S37].
- **Standard trim recipe** (unverified - model knowledge; consistent with [S37][S38]):
  - **dives**: add 1-3 mm of up-bend at the trailing edge;
  - **stalls or porpoises**: remove up-bend or move the CG forward;
  - **turns left**: raise the right trailing edge, or bend the keel/rudder trailing edge right;
  - **rolls off in a spiral**: add dihedral (a shallow "Y" seen from the front, about 5-10 deg) or reduce the keel.

## 5. Human throw data (bounds for the throw control)

| Quantity | Value | Source / firmness |
|---|---|---|
| "Average person" throw speed | about 20 mph, so **8.9 m/s** | [S31], hobby site, low |
| Radar-gun crowd (incl. children) | 20-40 km/h, so **5.6-11 m/s**; one personal best 74.7 km/h = **20.8 m/s** | [S32], forum, anecdotal, low |
| Elite time-aloft launch (Blackburn) | about **27 m/s (60 mph)**, near vertical. His baseball pitch was measured at about 65 mph (29 m/s). About 50 % of the launch KE becomes height. | [S11] (student physics journal, estimate), [S9]. Medium. |
| Implied peak height (Blackburn) | 0.5 * 27^2/(2g) = **18.6 m (about 61 ft)**; the ideal no-drag ceiling is 37 m; [S11] quotes a 33 m theoretical maximum | Derived from [S11]. Press accounts say "about 60 ft" (search snippet, unattributed). Medium. |
| Launcher-assisted (60 fps video) | up to **25 m/s** | [S33], school poster, low |
| Distance-record launch angle | **about 40 deg** "throw as hard as possible"; flight about 6 s | [S6], press interview, medium |
| Time-aloft launch | near vertical (about 80-90 deg); the plane then rolls or pitches over into a glide | [S9][S10], medium |
| Structural limit | whether 80 g/m^2 paper keeps its shape at about 27 m/s is open | [S11] |
| Release height | child 1.0-1.5 m, adult 1.6-2.3 m (overhand) | unverified - model knowledge |
| Release rates | no measurements found; suggest pitch rate +-8 rad/s and roll rate +-5 rad/s as user-error scatter | unverified - design bound |

**Recommended control ranges:**
- speed 2-30 m/s (default 7 m/s; "strong" 15 m/s; "pro" up to 27-30 m/s);
- launch angle -20 to +90 deg;
- release height 0.8-2.3 m;
- roll misalignment +-20 deg;
- a seeded scatter of about 5 % on speed and +-2 deg on angle.

Above about 20 m/s, warn that real paper may deform. Optionally model a dynamic-pressure threshold of about 250-450 Pa (V of 20-27 m/s) that scales up the elevator or causes flutter (unverified).

## 6. Validation targets: real-world numbers

### 6.1 Measured aerodynamics of real paper planes

| Quantity | Value | Source | Firmness |
|---|---|---|---|
| Dart flight speed | **4.90 m/s** (l = 0.297 m, Re = 95,000) | [S12] | Medium-high: AIAA conference paper, flight tests |
| Dart average flight CL | **0.17** | [S12] | Medium-high |
| Dart L/D from glide distance | **about 5, roughly constant**. Centre-fold models are slightly better; there is little difference between models except at very high lift. | [S12] | Medium-high |
| Water-tunnel dart drag | Higher than in flight, attributed to the model fixture (U = 0.6 m/s in water, Re 91,000) | [S12] | Note: do not tune CD to raw tunnel data |
| Dart CL_max, alpha_stall | 1.46-1.49 at 37.5-40 deg (ventral gap open or closed) | [S14] | Medium: CFD |
| Implied dart wing loading, sink, glide angle | W/S = 0.5 rho V^2 CL = **2.46 N/m^2**, so S of about 0.020 m^2 for 4.99 g; sink V/(L/D) = **0.98 m/s**; gamma = **11.3 deg** | Derived from [S12] | Medium |
| Student L/D vs AR tests | Average L/D rose from 4.05 to 8.64 with aspect ratio, then fell at AR 14.8 | [S44] | Low (student-level proceedings; which of the two [S44] papers holds the figure is unconfirmed). The video-tracked glide angles of 32-59 deg in [S43] are throw-transient values, not steady glides. |
| Glider archetype (A4 80 g/m^2, S 0.035-0.045 m^2) | W/S 1.1-1.4 N/m^2; at CL 0.6, V = 1.7-2.0 m/s; sink 0.25-0.4 m/s at L/D 5-7 | Derived (unverified inputs) | Low. Use only as a plausibility band. |

### 6.2 Records and competitions

| Record / event | Value | Details | Source | Firmness |
|---|---|---|---|---|
| **Farthest flight (current)** | **98.43 m (322 ft 11 in)** | Liu Liwen, Tang Shuai, Yang Shian, Huang Yizhou, Qiao Yuchen, Wang Chenghao (China). Shanghai, 28 Dec 2025. Venue: Shanghai Auto Exhibition Center, Jiading. New "Research" design. Announced 19 Jan 2026. | [S1][S2] | High for distance and date; medium for venue and design |
| Previous distance | **88.31 m (289 ft 9 in)** | Dillon Ruble with Nathaniel Erickson and Garrett Jensen. Crown Point, Indiana, 2 Dec 2022. A4 paper. About 40 deg launch, flight about 6 s, so a mean horizontal speed of about 14.7 m/s (derived). | [S1][S6] | High (distance), medium (angle, time) |
| Earlier distance ladder | 77.0 m (252 ft 7 in, Apr 2022, Korea); **69.14 m** (226 ft 10 in, Ayoob/Collins "Suzanne", 26 Feb 2012, McClellan hangar); 63.19 m (207 ft 4 in, Stephen Krieger); 58.82 m (193 ft, Tony Felch, May 1985) | | [S5][S7] plus search reports | High |
| **Longest time aloft (current)** | **31.2 s** | Rao Chongyi, Wang Chenghao, Tang Shuai, Liu Liwen, Yang Shian, Jia Siyi, Pan Zichen. Kunshan, Jiangsu, 11 Feb 2026. Individual times reported as 31.15 s and 31.25 s. | [S3][S4] | High (time), medium (individual splits) |
| Previous time aloft | **29.2 s** | Takuo Toda, Fukuyama, 19 Dec 2010 ("Zero Fighter") | [S3][S40] | High |
| Toda 2009 | 27.9 s (27.91) | Fukuyama, 11 Apr 2009, "Sky King", beat the previous record by 0.3 s | [S8][S39] | High |
| Blackburn | **27.6 s** | Georgia Dome, Atlanta, 8 Oct 1998. Letter-size paper, near-vertical throw at about 60 mph, peak about 18 m (derived). Earlier marks 16.89 s (1983) and 18.80 s (1994). | [S9][S11] | High (time), medium (speed and height) |
| Red Bull Paper Wings World Final 2022, distance | **61.11 m** (Lazar Krstic, SRB); 2nd 57.07 m (Yicheng Sun, GBR) | Hangar-7, Salzburg. Single A4 sheet of at most 100 g/m^2, no cutting or gluing. | [S26][S28] | High |
| Red Bull 2022, airtime | Final won with **14.86 s** (Rana Muhammad Usman Saeed, PAK), qualifying throw 16.66 s. A 16.39 s event record is also reported for Krstic. | | [S26][S42] | Medium (sources conflict on the best round) |
| Red Bull 2015, airtime podium | 14.36 s / 13.76 s / 12.18 s | Hambardzumyan (ARM), Ma Ieng (HKG), Hayashi (JPN) | [S27] | Medium (year attribution from search snippet) |
| Red Bull format | Three categories (distance, airtime, aerobatics). World finals at Hangar-7, Salzburg; the 2012 final was monitored by Guinness officials. | | [S41] | High |

**Implied sink rates** (derived, assuming a peak height of about 18.6 m and about 2.5 s of ascent): 27.6 s gives a mean sink of 0.74 m/s, 29.2 s gives 0.70 m/s and 31.2 s gives 0.65 m/s. A record-class design with its best throw should therefore reach a **mean sink of about 0.6-0.75 m/s over the whole glide, including turns**. That is consistent with the glider archetype's straight-line minimum sink of 0.25-0.4 m/s plus turning and pitch-oscillation losses.

## 7. Ground contact and indoor walls

**Measurement rules.**
- Red Bull: distance is measured from lift-off to the **landing point** inside the official zone, by laser in m/mm, best of two trials, single A4 sheet [S28][S29].
- One university contest following Red Bull wording measures instead from the start line to the **furthest part of the plane at rest** [S30].
- Time aloft is timed from the moment the plane leaves the hand [S39].
- I could not confirm the exact Guinness stop criterion (unverified).

**Recommended model.**

1. **Contact detection.** Every substep, test a hull point set against the ground plane and the room's walls and ceiling. The set is all element corners, or about 12 points: nose, wingtips, trailing corners, keel bottom and winglet tips. At first penetration, linearly interpolate the time and point between substeps. Without interpolation the error is at most V*dt, which is 5 mm at 5 m/s.
2. **Official mode** (leaderboards). The flight ends at the first touch of the ground, a wall, the ceiling or an obstacle.
   - Distance is the horizontal distance from the throw line, or the release point projected onto the ground, to the first-touch point.
   - Airtime runs from release to first touch.
   - Report both "distance along the throw axis" and "radial distance". Use along-axis for ranking, as a competition tape does along the lane (unverified - design choice).
3. **Casual mode** (visual only). Allow a slide or tumble. Use normal restitution e of about 0.1-0.2 and Coulomb friction mu of about 0.3-0.5 for paper on floor (unverified - model knowledge). Strongly damp the angular velocity on contact. Show "rest distance" as a secondary statistic [S30].
4. **Walls and ceiling indoors.** Official runs end on contact. In casual mode, use the same inelastic bounce, and a "crumple" visual above about 8 m/s of normal impact (unverified).

## 8. Performance metrics from a simulated flight

- **Wing loading:** W/S in N/m^2. Also show g/dm^2 = 1000 m / (100 S). Use the projected planform area of the lifting surfaces.
- **L/D (instantaneous):** let D_a = -F_aero . v_hat_air and L_a = |F_aero - (F_aero . v_hat_air) v_hat_air|. Then L/D = L_a/D_a, using air-relative velocity.
- **Steady phase:** the window, at least 1 s long, after the throw transient where |dV/dt| < 0.05 g, |d(gamma)/dt| < 2 deg/s and alpha changes by less than 1 deg. If none exists, report "no steady glide (phugoid)", and average over an integer number of phugoid periods T = pi sqrt(2) V/g.
- **Glide ratio (air-mass):** E = (horizontal distance relative to air) / (height lost) over the steady window. Ground-relative E is also reported outdoors. In still air, E should equal the mean L/D within 2 % (internal check).
- **Sink rate:** w_s = -(dh/dt - w_z,wind), averaged over the window. **Minimum sink** and **best glide** come from a virtual-tunnel trim sweep: for each elevator setting, find the trim alpha, then V = sqrt(2 (W/S) cos(gamma)/(rho C_R)) with C_R = sqrt(CL^2 + CD^2), and w_s = V sin(gamma) [S35].
- **Neutral point and static margin** (virtual tunnel):
  - hold the body fixed with omega = 0 at the trim speed;
  - evaluate CL and Cm_cg at alpha_trim +- 0.5 deg;
  - Kn = -(Cm(+) - Cm(-))/(CL(+) - CL(-));
  - x_np = x_cg + Kn c (c = MAC; quote it as % MAC and in mm from the nose).
  - Check: shifting the CG by dx changes Kn by dx/c, while x_np stays fixed to within 1 % of c.
- **Polars:** sweep alpha from -180 to 180 deg in 1 deg steps (0.25 deg between -10 and 45 deg) at a fixed Re or V. Store CL, CD, Cm and L/D. Mark alpha_stall where dCL/d(alpha) first changes sign.
- **Other stats:** max height, time aloft, horizontal distance, mean and max speed, Re range, max load factor, phugoid period (from zero crossings of d(gamma)/dt), and turn radius.

## 9. RECOMMENDED NUMERICAL SETUP and CONSTANTS

| Item | Value |
|---|---|
| Integrator | Classical RK4, fixed step |
| dt | **1.0 ms** (range 0.5-2 ms). Add the stiffness guard to sub-divide until lambda_est dt <= 1. Never exceed 2 ms when V > 15 m/s. |
| Substeps per frame | Accumulator; about 16-17 at 60 Hz; cap at 64 per frame, then slow-motion |
| Attitude | Unit quaternion, Hamilton convention, renormalised every step |
| Frames | Body origin at the CG. Compute I, CG and element r_i once per fold state. |
| Elements | 6 x 6 per wing panel, 4 x 4 keel and winglets, 6 x 2 elevator (80-100 total); low quality 4 x 4 |
| Element lift slope | Parent-surface Helmbold CL_alpha = 2 pi A/(2 + sqrt(A^2 + 4)) [S25] |
| Added mass | m_a,z = 0.479 rho S^1.5; I_a,x = pi rho integral of s(x)^4 / 8 dx (slender) or strip; I_a,y = sum over strips of pi rho c^4/128 (with the 1 + 8(2d/l)^2 offset [S19]). Acceleration side only; no Munk term. |
| Air | rho = 1.204 kg/m^3 (20 C), 1.225 (15 C, ISA); nu = 1.52e-5 m^2/s; g = 9.80665 m/s^2 |
| Paper | A4 0.210 x 0.297 m; 80 g/m^2, so 4.99 g; Letter 0.2159 x 0.2794 m |
| Throw bounds | V 2-30 m/s; angle -20 to 90 deg; release height 0.8-2.3 m; rates +-8 rad/s pitch, +-5 rad/s roll |
| Contact | First-touch end (official); interpolated contact time |
| Determinism | Seeded PRNG; deterministic math module; server re-simulation for rankings |

### VALIDATION TABLE

| # | Scenario | Expected result | Tolerance | Source |
|---|---|---|---|---|
| V1 | Ballistic check (aero off), 10 m/s at 45 deg | Exact parabola; range 10.197 m from z = 0 | < 1 mm | Physics |
| V2 | Torque-free spinning body, 10 s | Kinetic energy and angular momentum conserved | < 1e-6 relative | Physics |
| V3 | Classic A4 dart, still air, trimmed | V = 4.9 m/s, CL = 0.17, L/D = 5, sink 1.0 m/s, gamma 11 deg | V +-15 %, L/D 4-6 | [S12] |
| V4 | Dart virtual tunnel, alpha sweep | CL_max 1.2-1.7 at alpha 33-45 deg; no sharp stall | +-20 % / +-5 deg | [S14] |
| V5 | Phugoid after a 1.5x trim-speed launch | T = pi sqrt(2) V/g; zeta about 1/(sqrt(2) L/D) | T +-15 %, zeta +-50 % | [S21][S22] |
| V6 | Static-margin consistency | Move the CG 5 % MAC aft: Kn drops 0.050; x_np is unchanged | +-0.005 | Definition |
| V7 | Roll-rate decay, A at 5 m/s, p0 = 10 rad/s | Exponential decay, tau of about 8-34 ms (by Ixx; longer with added mass) | +-30 % vs linear estimate | Derived (section 1.2) |
| V8 | dt convergence | Distance and time aloft at dt 1 ms vs 0.25 ms | < 0.5 % | Numerical |
| V9 | Casual indoor throw: adult, 8 m/s, +5 deg, h 1.8 m, dart | 6-15 m, 1.5-3.5 s | Plausibility band | Derived from [S12][S31] |
| V10 | Time-aloft record attempt: best glider, 27 m/s, 85 deg, still dome air | Peak 15-22 m; total 20-32 s; never > 35 s | Band | [S3][S9][S11] |
| V11 | Same throw by a "good" competitor (about 20 m/s) | 12-17 s | Band | [S26][S27][S42] |
| V12 | Distance attempt: best dart, 25-30 m/s, 35-45 deg, still air | 60-100 m, flight time 5-7 s; mean horizontal speed about 13-17 m/s | Max reachable in [80, 105] m | [S1][S6][S26] |
| V13 | Distance, strong amateur (15 m/s) | 20-45 m | Band | Derived; below the Red Bull finals' 57-61 m [S26] |

## Open questions and limits

- **Full texts not read** (network block). The Khan & Nahon equations, Selig's segment count, the APW coefficients and the exact Guinness measurement rules need checking against the PDFs. Fetch [S12], [S15], [S17], [S18] and the Guinness pages once the hosts are allowed.
- **No peer-reviewed throw-speed survey was found.** Casual-throw speeds are anecdotal [S31][S32]. Release spin rates are unmeasured.
- **Red Bull results.** The best 2022 airtime round is reported in conflicting ways (16.39 s vs 16.66 s). I found no 2025 world-final data.
- **Inertia values are estimates.** The app computes them from the layers, so the time constants in section 1.2 will change with each design.
- **Quasi-steady limits.** The short period is strongly unsteady (k about 1). Tumbling needs a rotational-circulation term [S18]. Indoor Re is 4e4-1e5, where laminar separation makes CD depend on Re (see the aerodynamics research note).
- **Structural deformation** at record launch speeds is not modelled [S11]. It is a likely source of sim-versus-reality gaps for hard throws.
- **The 31.2 s record's design, paper and launch speed are not documented** in the sources found.

## Sources

1. [S1] Guinness World Records, "Farthest flight by a paper aircraft". https://www.guinnessworldrecords.com/world-records/farthest-flight-by-a-paper-aircraft
2. [S2] AFPBB News (CGTN report), 98.43 m Chinese youth record. https://www.afpbb.com/articles/-/3618713
3. [S3] Guinness World Records, "Longest flying paper aircraft - duration". https://www.guinnessworldrecords.com/world-records/longest-time-flying-a-paper-aircraft/
4. [S4] Ratopati, "Chinese Teenagers Shatter 15-Year-Old World Record...". https://english.ratopati.com/story/49683
5. [S5] Guinness World Records news (May 2026), "Evolution of the paper plane flight and how far it's actually possible to throw one". https://www.guinnessworldrecords.com/news/2026/5/evolution-of-the-paper-plane-flight-and-how-far-its-actually-possible-to-throw-one
6. [S6] Business Insider via Yahoo, "Boeing engineers designed a paper airplane..." https://ca.news.yahoo.com/boeing-engineers-designed-paper-airplane-143032179.html ; Flying Magazine. https://www.flyingmag.com/boeing-engineers-set-new-distance-record-with-paper-airplane/
7. [S7] ESPN (2012), "Joe Ayoob sets paper airplane record". https://www.espn.com/espn/page2/story/_/id/7625552/former-cal-quarterback-joe-ayoob-sets-world-record-longest-throw-paper-airplane
8. [S8] Japan Times (2009), "New flight record for paper plane set". https://www.japantimes.co.jp/news/2009/05/17/national/new-flight-record-for-paper-plane-set/
9. [S9] Wikipedia, "Ken Blackburn (aeronautical engineer)". https://en.wikipedia.org/wiki/Ken_Blackburn_(aeronautical_engineer)
10. [S10] Christian Science Monitor (1997), "A Light Flight for the Record Books". https://www.csmonitor.com/1997/0429/042997.home.kidspace.1.html
11. [S11] Back, Hall, Brown, Turner (2011), "P1_6 Paper Planes - Long-Haul Flight", Journal of Physics Special Topics, Univ. of Leicester. https://journals.le.ac.uk/index.php/pst/article/view/2045 ; PDF https://core.ac.uk/download/267013002.pdf
12. [S12] Ng et al. (with J. Schluter), "On the Aerodynamics of Paper Airplanes", AIAA 2009-3958. https://arc.aiaa.org/doi/abs/10.2514/6.2009-3958 ; full text https://lactea.ufpr.br/wp-content/uploads/2018/08/On_the_Aerodynamics_of_Paper_Airplanes.pdf
13. [S13] Schluter, "Aerodynamic study of the dart paper airplane for micro air vehicle application", Proc. IMechE Part G (abstract). https://metatoc.com/papers/12971-aerodynamic-study-of-the-dart-paper-airplane-for-micro-air-vehicle-application
14. [S14] "Flow analysis on the ventral gap of a paper airplane" (NWPU). https://pure.nwpu.edu.cn/zh/publications/flow-analysis-on-the-ventral-gap-of-a-paper-airplane/
15. [S15] Selig (2010), "Modeling Full-Envelope Aerodynamics of Small UAVs in Realtime", AIAA 2010-7635. https://m-selig.web.engr.illinois.edu/pubs/Selig-2010-AIAA-2010-7635-FullEnvelopeAeroSim.pdf
16. [S16] Selig (2014), "Real-Time Flight Simulation of Highly Maneuverable Unmanned Aerial Vehicles", J. Aircraft. https://m-selig.web.engr.illinois.edu/pubs/Selig-2014-JofAC-FlightSim-FINAL.pdf
17. [S17] Khan, W. (2016), PhD thesis, McGill (dynamics modelling of agile fixed-wing UAVs; with Khan & Nahon 2015 ICUAS). https://escholarship.mcgill.ca/downloads/dj52w7317
18. [S18] Andersen, Pesavento, Wang (2005), "Unsteady aerodynamics of fluttering and tumbling plates", J. Fluid Mech. 541:65-90. https://dragonfly.tam.cornell.edu/publications/2005_JFM_Andersen_Pesavento_Wang_a.pdf
19. [S19] arXiv:2408.08864, "Aerodynamic equilibria and flight stability of plates at intermediate Reynolds numbers". https://arxiv.org/pdf/2408.08864
20. [S20] "Quantification of added-mass effects using particle image velocimetry data for a translating and rotating flat plate", J. Fluid Mech. (2019). https://www.repository.cam.ac.uk/handle/1810/290433
21. [S21] Wikipedia, "Phugoid". https://en.wikipedia.org/wiki/Phugoid
22. [S22] MIT OCW 16.01 Unified Engineering, phugoid notes. https://ocw.mit.edu/courses/16-01-unified-engineering-i-ii-iii-iv-fall-2005-spring-2006/4e932d24f9d4b17918820220ce1bd11e_phugoid.pdf
23. [S23] arXiv:1309.1317 (internal stability of explicit RK methods; RK4 real interval [-2.7853, 0]). https://arxiv.org/pdf/1309.1317 ; RK stability function notes. https://jonshiach.github.io/ODEs-book/_pages/4.2_RK_stability_function.html
24. [S24] Torres & Mueller (2004), "Low-aspect-ratio wing aerodynamics at low Reynolds numbers", AIAA J. 42(5):865-873 (AR 0.5-2, Re 7e4-2e5). https://doi.org/10.2514/1.439
25. [S25] UTM lecture notes, "Finite Wing Theory" (Helmbold equation). https://people.utm.my/shabudin/wp-content/blogs.dir/1281/files/2018/03/2-Finite-wing-Theory.pdf
26. [S26] Red Bull, "Red Bull Paper Wings World Final 2022 results". https://www.redbull.com/us-en/red-bull-paper-wings-world-final-results
27. [S27] Red Bull, "Red Bull Paper Wings World Finals report". https://www.redbull.com/int-en/red-bull-paper-wings-world-finals-report
28. [S28] Red Bull, "Red Bull Paper Wings World Final rules". https://www.redbull.com/int-en/events/red-bull-paper-wings-world-final/red-bull-paper-wings-world-final-rules
29. [S29] Wings Magazine (2009), "Higher, faster, further: Red Bull Paper Wings is ready for takeoff". https://wingsmagazine.com/higher-faster-further-red-bull-paper-wings-is-ready-for-takeoff-2549
30. [S30] Kwantlen Polytechnic University, Paper Airplane Contest Rules 2014. https://www.kpu.ca/sites/default/files/Science%20and%20Horticulture/PaperAirplaneContestRules2014.pdf
31. [S31] Fold'N Fly, "Paper Airplane Launchers". https://www.foldnfly.com/lounge/paper-airplane-launcher.php
32. [S32] Tennis-Warehouse forum, "How fast can you throw a paper airplane?" https://tt.tennis-warehouse.com/index.php?threads/how-fast-can-you-throw-a-paper-airplane.540107/
33. [S33] Kobe High School (2021) poster, "How to fly a paper airplane optimally". https://seika.ssh.kobe-hs.org/media/common/KagakuEigo/2021/poster/2021-HowToFlyAPaperAirplane---.pdf
34. [S34] John Collins, National Paper Airplane Contest, "Sink Rate". https://johncollins333.wixsite.com/paperairplanecontest/sink-rate
35. [S35] Virginia Tech AOE 3104, "Gliding Flight (Steady State)". https://archive.aoe.vt.edu/lutze/AOE3104/glidingflight.pdf
36. [S36] MIT OCW 2.154 Lecture 23 (Kirchhoff relations, added mass). https://ocw.iti.hr/courses/mechanical-engineering/2-154-maneuvering-and-control-of-surface-and-underwater-vehicles-13-49-fall-2004/lecture-notes/lec23.pdf ; MIT Fluids modules (Munk moment). https://web.mit.edu/fluids-modules/www/potential_flows/LecturesHTML/lec12/node1.html
37. [S37] Univ. of Alaska Fairbanks student page, paper airplane design (CG, elevator). https://ffden-2.phys.uaf.edu/211_fall2013.web.dir/Cody_Gaines/Design.html
38. [S38] Fold'N Fly, "How to Steer a Paper Airplane". https://www.foldnfly.com/lounge/steer-aim.php
39. [S39] TIME (2009), Sky King, "27.9 seconds after leaving his hand". https://content.time.com/time/specials/packages/article/0,28804,1934027_1934003_1933991,00.html
40. [S40] Popular Science (2012), "How to Fold the Longest-Flying Paper Airplanes". https://www.popsci.com/technology/article/2012-04/video-how-fold-longest-flying-paper-airplanes/
41. [S41] Wikipedia, "Red Bull Paper Wings". https://en.wikipedia.org/wiki/Red_Bull_Paper_Wings
42. [S42] Sports247 (2022), Red Bull Paper Wings airtime result. https://www.sports247.my/?p=293441
43. [S43] Highlights in Science, Engineering and Technology (2024), video-tracked paper-plane glide angles. https://drpress.org/ojs/index.php/HSET/article/download/28138/27637/40038
44. [S44] Highlights in Science, Engineering and Technology, vol. 81 and vol. 93 (2024), paper-plane aspect-ratio and L/D studies. https://pdfs.semanticscholar.org/c318/735c0c0d41453e131fef5fc4284834530ff4.pdf ; https://pdfs.semanticscholar.org/e278/ab3bf021116646e1a27ef6baa6f624d07070.pdf
