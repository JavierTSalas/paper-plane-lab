# 02 - Flight dynamics, numerical method, human launch and validation targets

Research note for the Paper Plane Lab physics core. All units SI unless stated. Air at 20 C indoors: rho = 1.204 kg/m^3, nu = 1.506e-5 m^2/s (mu 1.813e-5 Pa s / rho, the Sutherland value used in 03-wind-atmosphere.md; this note first said 1.52e-5), g = 9.80665 m/s^2 (standard values, unverified - model knowledge). Source tags [S#] map to the list at the end. "Derived" means computed here from cited inputs (the arithmetic is shown or reproducible). "(unverified - model knowledge)" means I could not confirm it online during this session.

**Access caveat.** In this session WebFetch could not reach outside hosts, and the web-search budget ran out before the end. Every [S#] claim was confirmed by search-engine results for that URL (title plus extracted text), not by reading the full document. Items I could not confirm are tagged. A later fact-check pass re-derived every formula and derived number, opened four sources on GitHub ([S45]-[S48]) and corrected several items; see **Verification notes** at the end.

## Summary for implementers

1. Integrate a 6-DOF rigid body in body axes: quaternion attitude, classical RK4, **fixed dt = 1 ms** (1000 Hz, about 16-17 substeps per 60 Hz frame). Renormalise q after each step. RK4 is stable when |lambda*dt| <= 2.785 [S23].
2. The stiffest physical mode is **roll subsidence**. On an A4 plane with a 0.20 m span, the time constant is about 2-34 ms at 5-20 m/s, depending on Ixx (|lambda| up to about 770 1/s at a 27 m/s launch with the lowest Ixx). Short period and heave are 5-80 ms. So dt = 16.7 ms goes unstable (above about 6 m/s at the lowest Ixx) and dt <= 2 ms is needed. A semi-implicit scheme is **not** required at 1 ms. Add a stiffness guard (section 1.4).
3. The aerodynamics are an element model: each element sees v_i = v_B + omega x r_i - R^T w(x_i, t). Rate damping comes out of the omega x r term with no extra code. Use at least 6 spanwise strips per semispan: the geometric error is 0.5/N^2, so N = 6 gives 1.4 % (derived). Do **not** cut a strip into equal chordwise elements that all use the same CN(alpha): that puts the steady centre of pressure near mid-chord instead of the quarter chord (section 2, "Chordwise split").
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
| Re at 5 m/s (MAC) | 6.2e4 | 6.6e4 |

Helmbold: CL_alpha = 2*pi*A / (2 + sqrt(A^2 + 4)). It holds for low-AR straight or flat-plate wings at incompressible speeds [S25], and tends to the slender-wing value pi*A/2 as A goes to 0 and to 2*pi as A grows (limits checked).

**Sweep correction (added in verification).** For swept and delta surfaces the DATCOM / Raymer form is CL_alpha = 2*pi*A / (2 + sqrt(A^2 (1 + tan^2(Lambda)) + 4)) at low speed, with Lambda the half-chord sweep in DATCOM (Raymer uses the sweep of the maximum-thickness line) [S45]. It equals Helmbold at zero sweep. For a delta, A tan(Lambda_c/2) = 2, so it becomes 2*pi*A / (2 + sqrt(A^2 + 8)) (derived): **1.74 /rad for A and 1.15 /rad for B**, which is 14-16 % below the unswept values in the table. The tables below use the unswept form, so their roll, heave and pitch rates are high by up to that margin and the time constants are lower bounds. Both forms are for attached flow (|alpha| below about 10 deg) at incompressible speeds; vortex lift (section 2) adds to them at higher alpha.

**Linear damping derivatives** (strip integration over the planform; derivations reproducible):
- Roll: L_p = -(rho V S b^2 / 4) * |C_lp|. For a delta, C_lp = -CL_alpha/12 by strip theory (derived: integral of c(y) y^2 dy = c_r b^3/48). Slender-wing theory gives -pi A/32 (attribution to Ribner is unverified - model knowledge; the value was re-derived in verification from the cross-flow added roll inertia pi rho s^4/8 at the trailing edge). The strip value is 20 % (A) to 27 % (B) larger than the slender one (derived).
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

All values in this table are derived. The roll column uses the slender C_lp = -pi A/32; with the strip value -CL_alpha/12 (used in section 1.3) the roll time constants are 16 % (A) to 21 % (B) shorter. In the short period, a larger static margin raises omega_n and lowers zeta: for A, Kn 0.05 gives zeta 0.88 and Kn 0.25 gives zeta 0.63. The pitch-damping integral b L^3/36 assumes lift spread evenly over the area and the CG at the centroid. With one element per spanwise strip (section 2) it is 0.4-1.7 times that value for Kn 0.05-0.25 (derived), so treat zeta as 0.6-0.9, not as a validation target.

### 1.3 Stability of explicit RK4

RK4 is absolutely stable on the negative real axis for h*|lambda| <= 2.785 [S23]. Its imaginary-axis limit is about 2.83 (unverified - model knowledge).

| Worst case | abs(lambda) (1/s) | Largest stable dt | dt for abs(lambda dt) = 0.5 (accurate) |
|---|---|---|---|
| A, 5 m/s, Ixx 2e-6 (strip C_lp) | 141 | 19.7 ms | 3.5 ms |
| A, 20 m/s | 566 | 4.9 ms | 0.9 ms |
| A, 27 m/s | 764 | 3.6 ms | 0.65 ms |
| Tumbling / high rate (est. 2x) | about 1500 | 1.9 ms | 0.33 ms |

Conclusions (derived):
- **One RK4 step per 60 Hz frame (16.7 ms) is unstable** above about 6 m/s at the lowest Ixx (2e-6 kg m^2) and above about 24 m/s at Ixx 8e-6 (strip C_lp, no added mass). It is inaccurate well before it is unstable.
- **dt = 1 ms keeps |lambda dt| below 0.8** for every human throw. The integration error per step is then about (lambda dt)^5/120, under 3e-3, and far smaller in the cruise phase.
- A semi-implicit scheme is not needed. Semi-implicit (symplectic) Euler is only first order and stable for |lambda dt| < 2, so it brings no benefit at 1 ms. It is acceptable only as a "low-power" fallback with dt <= 0.5 ms.
- Added mass lengthens every time constant (roughly 1.3-2.5x for heave and roll), so the dt above stays conservative.

### 1.4 Stiffness guard and determinism

- **Guard.** At each step estimate lambda_est = max over the axes of [sum_i 0.5 rho |v_i| A_i CN'_i r_i^2] / I_axis, with CN' about 2 per rad. Sub-divide the step until lambda_est*dt <= 1.0. This covers tumbles and gusts (unverified - model knowledge; design suggestion).
- **Rendering.** Run fixed-dt physics with an accumulator and interpolate the render pose between steps (unverified - model knowledge, standard game-loop practice).
- **Determinism for global rankings.** IEEE-754 + - * / and sqrt are correctly rounded and reproducible. ECMAScript Math.sin, cos, atan2, exp and pow are "implementation-approximated", so they can differ between V8 and JavaScriptCore. In a chaotic flight, last-bit differences can grow (unverified - model knowledge; the ECMA-262 wording itself was confirmed against the spec source in 08-platform-leaderboard.md, section 3.2). For leaderboard verification:
  - use one pure-JS fdlibm-style math module everywhere in the physics core;
  - re-simulate submitted (design, throw, seed) tuples on the server (a Cloudflare Worker runs V8).

## 2. Real-time full-envelope element / strip models

| Model | What it does | Relevance |
|---|---|---|
| Selig 2010, 2014 [S15][S16] | 6-DOF real-time model over the full **+-180 deg alpha and beta**, built from components using first-principles aerodynamics plus lookup tables. Runs in real time in the FS One RC simulator. Selig rejects full-envelope system identification as impractical. | The architecture to copy: components, then segments, then tables over +-180 deg. |
| Khan & Nahon 2015-16, Khan thesis [S17] | "Component breakdown" model for agile fixed-wing UAVs over the complete AoA range. It treats quasi-steady and unsteady effects and a simplified wing-tail interference, was validated against bench and wind-tunnel tests, and ran pilot-in-the-loop in X-Plane. | Confirms a strip/component model plus a post-stall flat-plate blend is enough for real-time agile flight. |
| Andersen, Pesavento, Wang 2005 [S18] | Quasi-steady model of freely falling plates (flutter and tumble, Re about 1e3), fitted to measured trajectories. Circulation is dominated by a term proportional to **angular velocity**, not translation. | Shows what to do when a paper plane tumbles: lift needs a rotational-circulation term. The model's form and coefficients (C_T = 1.2, C_R = pi, A = 1.4, B = 1.0, mu1 = mu2 = 0.2) are unverified - model knowledge. This set is believed to be the one used in the companion paper (Part 2, J. Fluid Mech. 541:91-104), while the fits in [S18] differ per experiment; read both before coding it. |
| MIT perching gliders (Cory & Tedrake 2008) | Flat-plate glider with CL = 2 sin(a) cos(a) and CD = 2 sin^2(a) through post-stall [S46] (confirmed in verification: Tedrake's course notes give exactly these coefficients and say they "captured very well" the measured glider dynamics). Equivalent to a normal-force coefficient CN = 2 sin(a) with no tangential force. | A cheap first-pass full-envelope plate model. |

**How these models work (for our element model):**

1. **Local velocity.** Each element evaluates v_i = v_B + omega x r_i - wind(x_i). Roll, pitch and yaw damping and the asymmetric lift in a turn all emerge from omega x r_i. Do **not** add separate C_lp, C_mq or C_nr terms as well; that counts the damping twice.
2. **Coefficients.** Use normal-force-based full-envelope tables or functions per element, CN(alpha_i) and CT(alpha_i) over +-180 deg [S15]. Use the **3D lift slope of the parent surface** (Helmbold) rather than 2*pi. Otherwise strip theory over-predicts lift by a factor of 2.4 at AR 2, 3.1 at AR 1.43 and 4.2 at AR 1 (derived: 2*pi / CL_alpha,Helmbold). Wind-tunnel data for low-AR thin plates (AR 0.5-2, Re 7e4-2e5, four planforms, with lift slope and centre of lift) is in Torres & Mueller [S24]. That is the right dataset for checking the per-surface slopes.
3. **Stall.** In the Selig and Khan & Nahon class of models, stall is a table or a smooth blend from attached-flow to flat-plate coefficients. A commonly used sigmoid blend is sigma(alpha) with M of about 50 and alpha_0 of about 0.47 rad (Beard & McLain). The two parameter values were confirmed in verification in the authors' own simulator parameter file (M = 50.0, alpha0 = 0.47, for their Aerosonde UAV) [S47]; the blend formula itself is unverified - model knowledge. alpha_0 = 0.47 rad centres the blend at 27 deg and was tuned for that UAV's aerofoil wing, so it is a starting point only for rectangular paper wings and does not apply to darts (next bullets).
   - Paper darts are low-AR, highly swept deltas. They do not stall sharply: a leading-edge vortex keeps lift growing.
   - CFD on a classic dart gives **CL_max 1.46-1.49 at alpha_stall 37.5-40 deg** [S14].
   - Schluter's water-tunnel and LES work attributes the high lift at low Re to the high-sweep delta, and finds that the centre fold improves performance [S13].
   - A Polhamus-type split, CL = Kp sin(a) cos^2(a) + Kv sin^2(a) cos(a), suits dart elements (unverified - model knowledge).
4. **Unsteadiness.** Use the reduced frequency k = omega c/(2V).
   - Phugoid at 5 m/s: k is about 0.05, so quasi-steady is fine.
   - Short period: k is about 0.5-1.1 (0.54 for B and 0.89 for A at Kn 0.10; 1.1 for A at Kn 0.25), so it is strongly unsteady (derived). Quasi-steady coefficients will not get short-period transients exactly. Those modes are over-damped or decay within 0.1 s, so glide outcomes are barely affected.
   - An optional first-order lag on element CN (time constant about c/V) is the cheap fix (unverified - model knowledge).

**How many elements?** Midpoint-rule strip sums of the roll and pitch inertia integrals over a delta have a relative error of **0.5/N^2** for N strips per semispan or chord: 12.5 % at N = 2, 3.1 % at N = 4, **1.4 % at N = 6**, 0.8 % at N = 8 (derived).

**Chordwise split: caution (added in verification, derived).** This note first recommended a 6 x 6 grid per wing panel. That is wrong unless the chordwise elements are weighted. If a strip is cut into Nc equal chordwise elements that all use the same CN(alpha) and each apply their force at their own quarter chord, the strip's steady centre of pressure sits at (0.5 - 0.25/Nc) c: 0.25 c for Nc = 1, 0.375 c for Nc = 2 and **0.458 c for Nc = 6**. Thin-aerofoil theory puts it at 0.25 c in attached flow, and it moves toward 0.5 c only after stall. An unweighted 6 x 6 grid therefore puts the neutral point of a rectangular wing about 0.2 c too far aft, so designs that are unstable in reality would fly in the simulator. For a delta the same grid gives x_np = 0.64 c_r, and one element per strip gives 0.50 c_r (derived); the slender-wing value is 0.667 c_r and real AR 1-2 deltas lie in between (section 4).

Recommended grid (this matches ARCHITECTURE.md section 6):
- spanwise strips only: at least 6 per semispan on the wings (8-12 per wing is fine), 2-4 on the keel, 2-3 per winglet;
- one element per strip, plus one flap element for the elevator part of that strip;
- take alpha_i from the velocity at the strip's 3/4-chord point and apply the force at a centre of pressure that moves from 0.25 c (attached) toward 0.5 c (alpha = 90 deg). The 3/4-chord rule reproduces the thin-aerofoil lift due to pitch rate (re-derived in verification). The centre-of-pressure correction for low AR and deltas belongs to the aerodynamics note;
- if a chordwise split is wanted anyway, weight the elements by the flat-plate loading: the fraction of normal force ahead of chord fraction xi is (theta + sin(theta))/pi, with xi = (1 - cos(theta))/2. For six equal elements the weights are 0.505, 0.187, 0.126, 0.090, 0.061, 0.031 from the leading edge (derived; attached flow only). The continuous loading has its resultant at exactly 0.25 c; the six-element version gives 0.23 c with each force at the element's quarter chord and 0.27 c with it at the element's mid-chord;
- 30-60 elements in total.

Cost at 1 kHz with 4 RK stages and 50 elements is about 2e5 element evaluations per second, a few percent of one phone core in JIT JS (estimate). A "low" quality setting can use 4 strips per semispan, with 3 % error.

## 3. Added mass (apparent inertia)

Potential-flow results for an infinitely thin 2D plate of chord l, per unit span [S19][S20]:
- Normal translation: **m22 = pi rho l^2 / 4**, the mass of a fluid cylinder one chord in diameter.
- Rotation about mid-chord: **I_a = pi rho l^4 / 128**. About a point offset d from mid-chord: I_a = (pi rho l^4/128)(1 + 8 (2d/l)^2) [S19].
- Tangential: m11 = 0.

A PIV study confirms these terms on a translating and rotating flat plate [S20]. In 3D, a circular disc moving broadside has m_a = (8/3) rho a^3 (unverified - model knowledge, Lamb/Newman). For a planform of area S this becomes **m_a,z = (8/3) rho (S/pi)^1.5 = 0.479 rho S^1.5**.

| Paper plane | m_a,z, 3D disc-equivalent | Slender-strip | Ratio to m = 4.99 g | Added roll inertia (slender / strip) | Added pitch inertia about the CG (chordwise strip / slender; both upper bounds) |
|---|---|---|---|---|---|
| A (b 0.20 m) | 2.7 g | 3.5 g | **0.54-0.71** | 2.7e-6 / 4.9e-6 kg m^2 (about 0.3-2.5 Ixx) | **1.16e-5 / 1.23e-5** (about 0.65 Iyy) |
| B (dart) | 1.6 g | 1.7 g | **0.33-0.34** | 0.6e-6 / 1.7e-6 | **9.9e-6 / 6.7e-6** (about 0.3-0.5 Iyy) |
| 1 kg RC model, S 0.3 m^2 (comparison) | 95 g | - | 0.10 | - | - |

All values in this table are derived. Formulas for a delta with the apex forward and the CG at the centroid (2/3 c_r):
- m_a = pi rho b^2 c_r / 12 (slender)
- I_a,roll = pi rho b^4 c_r / 640 (slender); pi rho c_r^2 b^3 / 480 (chordwise strip)
- I_a,pitch = pi rho b c_r^4 (1/640 + 1/1080) (chordwise strip, with the offset term); pi rho b^2 c_r^3 / 270 (slender)

**Corrected in verification.** The pitch column first read 7.3e-6 (A) and 6.2e-6 (B). Those are pi rho b c_r^4 / 640, the strip sum about each strip's own mid-chord, which leaves out the (1 + 8 (2d/l)^2) offset term that this section and section 9 prescribe. With the offset the values are 59 % larger. The 3D truth is below both columns, as it is for m_a,z (2.7 g disc-equivalent against 4.9 g from chordwise strips for A).

**Verdict.**
- Added mass changes nothing in a steady glide, because there is no acceleration.
- It slows heave, roll and short-period transients by 15-60 % and reduces gust response. That makes the plane feel "floaty", which is a real feature of paper planes.
- Falling-plate models include it [S18][S19]. Conventional RC simulators [S15][S17] are not documented as including it (unverified). That is justified for them, because m_a/m is about 0.1.

**Implementation.**
- Add the diagonal (m_a,z, I_a,x, I_a,y) to the acceleration side only.
- Make the added mass react to the **air-relative** acceleration (v_B' - R^T w_W'), so that gusts push the plane.
- **Do not** add the Munk moment (m22 - m11) u w. In steady 2D flow it equals exactly the pitching moment of lift acting at the quarter chord about mid-chord (not found online, but re-derived in verification, Verification notes row 9; the Munk moment is described in [S36]). Any centre-of-pressure table measured or fitted to steady data already contains it.
- The full Kirchhoff form [S36] is only correct if the steady CP model is built without that term.
- Keeping the rigid-body values in the omega x (m v) terms also drops the Kirchhoff term omega x (M_a v) from the left-hand side of the force equation. With only m_a,z non-zero that term is (q m_a,z w, -p m_a,z w, 0) in body axes (derived in verification). It is small in a glide, where w is small, but it is of the same order as the retained terms in a tumble; the falling-plate models keep it (unverified - model knowledge for [S18]). Treat tumbling behaviour as qualitative.

## 4. Stability physics to explain to users

| Concept | Formula | Notes |
|---|---|---|
| Static margin | Kn = (x_np - x_cg)/c = -dCm_cg/dCL | Must be > 0. For a slender delta (AR toward 0), x_np is at the area centroid = 2/3 c_r from the apex = 50 % MAC (unverified - model knowledge). At high AR it tends to the quarter-MAC point = 0.50 c_r (derived). Real AR 1-2 deltas lie in between, at about 0.58-0.63 c_r, 37-45 % MAC (unverified - model knowledge; check against the aerodynamics note and [S24]). 0.05 c_r of neutral-point error is 7.5 % MAC, the size of a typical static margin, so the element model's x_np for a flat delta is itself a validation item. |
| Trim | alpha_trim = Cm0 / (CL_alpha * Kn) | A flat, uncambered wing has Cm0 = 0 about its AC. With the CG ahead of the AC it can only trim at CL = 0, so it dives. Up-elevator (trailing-edge reflex) gives Cm0 > 0. More static margin needs more up-elevator. |
| Elevator effect (thin aerofoil, flap chord fraction E) | dCm_c/4/d(delta) = -0.5 sin(th)(1 - cos(th)), dCl/d(delta) = 2(pi - th + sin(th)), with cos(th) = 2E - 1 | E = 0.10 gives -0.54 /rad and 2.49 /rad. **5 deg up gives dCm = +0.047 and dCl = -0.22 (2D)**. Scale by about CL_alpha,3D/2pi at low AR (unverified - model knowledge; values derived). |
| Phugoid | omega_n = sqrt(2) g / V, **T = pi sqrt(2) V/g = 0.453 V s**, zeta = 1/(sqrt(2) L/D) [S21][S22]. The period formula was confirmed in verification in [S48] ("pi sqrt(2) v_t/g", from Lanchester's z'' + g z/z_t = g with z_t = v_t^2/(2g)). | Dart at 4.9 m/s: T = 2.22 s, wavelength 10.9 m, zeta = 0.14 at L/D = 5 (derived). This is the "swoop then stall" seen after a too-fast throw. |
| Short period | see section 1.2 | omega_n 15-60 rad/s at 3-5 m/s, zeta 0.5-0.9. Essentially invisible to the eye. |
| Roll subsidence | tau = Ixx/abs(L_p) | 2-80 ms |
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
| Implied peak height (Blackburn) | 0.5 * 27^2/(2g) = **18.6 m (about 61 ft)**; the ideal no-drag ceiling is 37 m; [S11] quotes a 33 m theoretical maximum | Derived from [S11]. Press accounts say "about 60 ft" (search snippet, unattributed). Medium. Drag cross-check (derived in verification): a vertical launch with quadratic drag peaks at h = (v_t^2/2g) ln(1 + v0^2/v_t^2), with v_t^2 = 2 m g/(rho CD0 S). Reaching 50 % of the ideal height from 27 m/s needs CD0 S = 2.7e-4 m^2 for a 4.83 g Letter sheet, which is CD0 = 0.012 on S = 0.022 m^2. That is about two-sided turbulent skin friction alone at Re 2.3e5. CD0 = 0.020 gives 14.8 m and CD0 = 0.030 gives 11.9 m; the ascent takes 1.3-1.9 s. So 18.6 m is the top of the plausible range, not the middle. |
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
| Dart flight speed | **4.90 m/s** (l = 0.297 m, Re = 95,000) | [S12] | Medium-high: AIAA conference paper, flight tests. Corroborated in verification: an independent university course quotes "L/D of 5.0 (a value close to measurements in Feng et al. 2009)" and "an average value of 4.9 m/s" for the trim velocity from this same paper [S48]. CL = 0.17 was not re-confirmed, but it is consistent: it gives W/S = 2.46 N/m^2, the wing loading of an A4 dart. |
| Dart average flight CL | **0.17** | [S12] | Medium-high |
| Dart L/D from glide distance | **about 5, roughly constant**. Centre-fold models are slightly better; there is little difference between models except at very high lift. | [S12] | Medium-high |
| Water-tunnel dart drag | Higher than in flight, attributed to the model fixture (U = 0.6 m/s in water, Re 91,000) | [S12] | Note: do not tune CD to raw tunnel data |
| Dart CL_max, alpha_stall | 1.46-1.49 at 37.5-40 deg (ventral gap open or closed) | [S14] | Medium: CFD |
| Implied dart wing loading, sink, glide angle | W/S = 0.5 rho V^2 CL = **2.46 N/m^2**, so S of about 0.020 m^2 for 4.99 g; gamma = atan(1/5) = **11.3 deg**; sink V sin(gamma) = **0.96 m/s** (the small-angle value V/(L/D) is 0.98) | Derived from [S12] | Medium |
| Student L/D vs AR tests | Average L/D rose from 4.05 to 8.64 with aspect ratio, then fell at AR 14.8 | [S44] | Low (student-level proceedings; which of the two [S44] papers holds the figure is unconfirmed). The video-tracked glide angles of 32-59 deg in [S43] are throw-transient values, not steady glides. |
| Glider archetype (A4 80 g/m^2, S 0.035-0.045 m^2) | W/S 1.1-1.4 N/m^2; at CL 0.6, V = 1.7-2.0 m/s; sink 0.25-0.4 m/s at L/D 5-7 | Derived (unverified inputs) | Low, and optimistic. S of 0.035-0.045 m^2 is 56-72 % of the A4 sheet, more than a single-sheet glider with a folded-up nose keeps as wing. From 18.6 m these sink rates would give 47-75 s aloft, far beyond the 31.2 s record. Treat 0.25-0.4 m/s as a floor that no single-sheet plane should beat, not as a target. |

### 6.2 Records and competitions

| Record / event | Value | Details | Source | Firmness |
|---|---|---|---|---|
| **Farthest flight (current)** | **98.43 m (322 ft 11 in)** | Liu Liwen, Tang Shuai, Yang Shian, Huang Yizhou, Qiao Yuchen, Wang Chenghao (China). Shanghai, 28 Dec 2025. Venue: Shanghai Auto Exhibition Center, Jiading. New "Research" design. Announced 19 Jan 2026. | [S1][S2] | High for distance and date; medium for venue and design |
| Previous distance | **88.31 m (289 ft 9 in)** | Dillon Ruble with Nathaniel Erickson and Garrett Jensen. Crown Point, Indiana, 2 Dec 2022. A4 paper. About 40 deg launch, flight about 6 s, so a mean horizontal speed of about 14.7 m/s (derived). Guinness may list the value to the millimetre as 88.318 m (unverified - model knowledge). | [S1][S6] | High (distance), medium (angle, time) |
| Earlier distance ladder | 77.134 m (Apr 2022, Korea; press reports give 252 ft 7 in, which is 76.99 m, see 04-paper-and-competition-rules.md section 6); **69.14 m** (226 ft 10 in, Ayoob/Collins "Suzanne", 26 Feb 2012, McClellan hangar); 63.19 m (207 ft 4 in, Stephen Krieger); 58.82 m (193 ft, Tony Felch, May 1985) | | [S5][S7] plus search reports | High |
| **Longest time aloft (current)** | **31.2 s** | Rao Chongyi, Wang Chenghao, Tang Shuai, Liu Liwen, Yang Shian, Jia Siyi, Pan Zichen. Kunshan, Jiangsu, 11 Feb 2026. Individual times reported as 31.15 s and 31.25 s. | [S3][S4] | High (time), medium (individual splits) |
| Previous time aloft | **29.2 s** | Takuo Toda, Fukuyama, 19 Dec 2010. The design name "Zero Fighter" comes from one secondary source and is unconfirmed (as in 04-paper-and-competition-rules.md). | [S3][S40] | High (time, date) |
| Toda 2009 | 27.9 s (27.91) | Fukuyama, 11 Apr 2009, "Sky King", beat the previous record by 0.3 s | [S8][S39] | High |
| Blackburn | **27.6 s** | Georgia Dome, Atlanta, 8 Oct 1998. Letter-size paper, near-vertical throw at about 60 mph, peak about 18 m (derived). Earlier marks 16.89 s (1983) and 18.80 s (1994). | [S9][S11] | High (time), medium (speed and height) |
| Red Bull Paper Wings World Final 2022, distance | **61.11 m** (Lazar Krstic, SRB). A 57.07 m throw by Yicheng Sun (GBR) is also reported, but his placing is unconfirmed (the fact-check of 04-paper-and-competition-rules.md found a source headline saying he came sixth); do not use it as a reference value. | Hangar-7, Salzburg. Single A4 sheet of at most 100 g/m^2, no cutting or gluing. | [S26][S28] | High for the winning distance only |
| Red Bull 2022, airtime | Final won with **14.86 s** (Rana Muhammad Usman Saeed, PAK). A 16.66 s qualifying throw is reported by a single source. A 16.39 s "event record" attributed to Krstic also appeared in a search snippet; Krstic won the distance category, so that attribution is doubtful (unverified). Use 14.86 s only. | | [S26][S42] | High for 14.86 s; low for 16.66 s and 16.39 s |
| Red Bull 2015, airtime podium | 14.36 s / 13.76 s / 12.18 s | Hambardzumyan (ARM), Ma Ieng (HKG), Hayashi (JPN) | [S27] | Medium (year attribution from search snippet) |
| Red Bull format | Three categories (distance, airtime, aerobatics). World finals at Hangar-7, Salzburg; the 2012 final was monitored by Guinness officials. | | [S41] | High |

**Implied sink rates** (derived, assuming a peak height of about 18.6 m and about 2.5 s of ascent): 27.6 s gives a mean sink of 0.74 m/s, 29.2 s gives 0.70 m/s and 31.2 s gives 0.65 m/s. A record-class design with its best throw should therefore reach a **mean sink of about 0.6-0.75 m/s over the whole glide, including turns**. That is about twice the glider archetype's straight-line minimum sink of 0.25-0.4 m/s. Turning and pitch-oscillation losses explain part of the gap; the rest means the archetype is optimistic (see its row in section 6.1). If the true peak was lower than 18.6 m (section 5 drag cross-check: 12-19 m), the implied mean sink is lower in proportion, for example 0.5-0.6 m/s from 15 m.

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
- **Sink rate:** w_s = -(dh/dt - w_z,wind), averaged over the window. **Minimum sink** and **best glide** come from a virtual-tunnel trim sweep: for each elevator setting, find the trim alpha, then gamma = atan(CD/CL), V = sqrt(2 (W/S)/(rho C_R)) with C_R = sqrt(CL^2 + CD^2), and w_s = V sin(gamma) [S35]. This is the same as V = sqrt(2 (W/S) cos(gamma)/(rho CL)), because cos(gamma) = CL/C_R. (Corrected in verification: this line first had both cos(gamma) and C_R, which makes V too low by sqrt(cos(gamma)): 1 % at 11 deg, 7 % at 30 deg.)
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
| Elements | Spanwise strips, one element per strip plus a flap element: at least 6 per semispan on wings, 2-4 on the keel, 2-3 per winglet (30-60 total); low quality 4 per semispan. Alpha from the 3/4-chord point; force at a centre of pressure moving from 0.25 c to 0.5 c. No unweighted chordwise split (section 2). |
| Element lift slope | Parent-surface Helmbold CL_alpha = 2 pi A/(2 + sqrt(A^2 + 4)) [S25] for unswept surfaces; with sweep, 2 pi A/(2 + sqrt(A^2 (1 + tan^2(Lambda_c/2)) + 4)) [S45] (section 1.2). The aerodynamics note decides which is coded. |
| Added mass | m_a,z = 0.479 rho S^1.5; I_a,x = pi rho integral of s(x)^4 / 8 dx along the length, with s(x) the local **semi**-span (slender), or the strip sum of (pi rho c^2/4) y^2 dy; I_a,y = sum over strips of (pi rho c^4/128)(1 + 8(2d/c)^2) dy, with d the distance from the strip's mid-chord to the CG [S19]. The strip sums are upper bounds: scale them by m_a,z / (strip sum of pi rho c^2/4 dy), about 0.55 for plane A (unverified - design suggestion). Acceleration side only; no Munk term. |
| Air | rho = 1.204 kg/m^3 (20 C), 1.225 (15 C, ISA); nu = 1.506e-5 m^2/s (20 C); g = 9.80665 m/s^2 |
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
| V4 | Dart virtual tunnel, alpha sweep | CL_max 1.1-1.6 at alpha 33-45 deg; no sharp stall | Band | [S14]; band changed in verification from 1.2-1.7 (see Verification notes, row 12) |
| V5 | Phugoid after a 1.5x trim-speed launch | T = pi sqrt(2) V/g; zeta about 1/(sqrt(2) L/D) | T +-15 %, zeta +-50 % | [S21][S22][S48] |
| V6 | Static-margin consistency | Move the CG 5 % MAC aft: Kn drops 0.050; x_np is unchanged | +-0.005 | Definition |
| V7 | Roll-rate decay, A at 5 m/s, p0 = 10 rad/s | Exponential decay, tau of about 7-34 ms (by Ixx and C_lp model; longer with added mass and with the swept lift slope) | +-30 % vs linear estimate | Derived (section 1.2) |
| V8 | dt convergence | Distance and time aloft at dt 1 ms vs 0.25 ms | < 0.5 % | Numerical |
| V9 | Casual indoor throw: adult, 8 m/s, +5 deg, h 1.8 m, dart | 6-15 m, 1.5-3.5 s | Plausibility band | Derived from [S12][S31] |
| V10 | Time-aloft record attempt: best glider, 27 m/s, 85 deg, still dome air | Peak 11-22 m (lower bound widened in verification, section 5 drag cross-check); total 20-32 s; never > 35 s | Band | [S3][S9][S11] |
| V11 | Same throw by a "good" competitor (about 20 m/s) | 12-17 s | Band | [S26][S27][S42] |
| V12 | Distance attempt: best dart, 25-30 m/s, 35-45 deg, still air | 60-100 m, flight time 5-7 s; mean horizontal speed about 13-17 m/s | Max reachable in [80, 105] m | [S1][S6][S26] |
| V13 | Distance, strong amateur (15 m/s) | 20-45 m | Band | Derived; below the Red Bull 2022 winning 61.11 m [S26] |

## Open questions and limits

- **Full texts not read** (network block). The Khan & Nahon equations, Selig's segment count, the APW coefficients and the exact Guinness measurement rules need checking against the PDFs. Fetch [S12], [S15], [S17], [S18] and the Guinness pages once the hosts are allowed. Only [S45]-[S48] were opened in full, in the verification pass.
- **Neutral point of low-AR surfaces.** Neither element layout reproduces a real delta's neutral point by itself (0.50 c_r with quarter-chord strips, 0.64-0.667 c_r with even area loading, about 0.58-0.63 c_r expected). The aerodynamics note must supply an AR-dependent centre of pressure, and the flat-delta x_np should be a tunnel test.
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

Sources [S45]-[S48] were added and **opened in full** during the verification pass (GitHub raw files were the only reachable host).

45. [S45] AeroSandbox (P. Sharpe), `aerosandbox/library/aerodynamics/inviscid.py`, function `CL_over_Cl`: CL/Cl = A / (2 + sqrt(4 + A^2 beta^2/eta^2 + (tan(sweep) A/eta)^2)), with the code comment "Formulation from Raymer, Sect. 12.4.1; citing DATCOM". Secondary source (open-source library quoting the textbook). https://raw.githubusercontent.com/peterdsharpe/AeroSandbox/master/aerosandbox/library/aerodynamics/inviscid.py
46. [S46] R. Tedrake, "Underactuated Robotics" course notes (MIT), trajectory-optimisation chapter, case study "A glider that can land on a perch like a bird": c_lift = 2 sin(alpha) cos(alpha), c_drag = 2 sin^2(alpha), citing Cory & Tedrake 2008 and Hoerner. https://raw.githubusercontent.com/RussTedrake/underactuated/master/book/trajopt.html
47. [S47] Beard & McLain, `mavsim_public` (companion code to "Small Unmanned Aircraft: Theory and Practice"), `aerosonde_parameters.py`: M = 50.0, alpha0 = 0.47, epsilon = 0.16. https://raw.githubusercontent.com/byu-magicc/mavsim_public/main/mavsim_python/parameters/aerosonde_parameters.py
48. [S48] L. A. Barba et al., "Practical Numerical Methods with Python" (the `numerical-mooc` course, George Washington University), module 1 "The phugoid model of glider flight": lesson 2 (period 2 pi sqrt(z_t/g) = pi sqrt(2) v_t/g) and lesson 3 (paper-airplane challenge: L/D 5.0 and trim velocity 4.9 m/s, citing Feng et al., "On the aerodynamics of paper airplanes", AIAA paper 2009-3958). https://raw.githubusercontent.com/numerical-mooc/numerical-mooc/master/lessons/01_phugoid/01_02_Phugoid_Oscillation.ipynb ; https://raw.githubusercontent.com/numerical-mooc/numerical-mooc/master/lessons/01_phugoid/01_03_PhugoidFullModel.ipynb

## Verification notes

Fact-check pass, 2026-11-09.

**Method and its limit.** WebSearch returned "budget used up" for every query in this pass (no search ran). WebFetch failed with a DNS error for lactea.ufpr.br, guinnessworldrecords.com and core.ac.uk, so none of [S1]-[S44] was opened and **no record, competition result or measured paper-plane number was re-read at its source**. `raw.githubusercontent.com` was reachable, and four sources were opened there in full ([S45]-[S48]). Everything else was checked by (a) re-deriving each formula by hand, with units and limiting cases, (b) recomputing every derived number with a throwaway script, (c) comparing with notes 03, 04 and 08 (04 and 08 have had their own fact-check), and (d) model knowledge, which is not evidence and is labelled as such. This note contains no fold sequences, so no fold geometry was traced.

**Checked** (where a check led to a change, the last column points to it)

| # | Claim | How checked | Result |
|---|---|---|---|
| 1 | RK4 stability limits 2.785 (real axis) and 2.83 (imaginary axis) (sections 1.3, summary) | Bisection on abs(R(z)) = 1 with R = 1 + z + z^2/2 + z^3/6 + z^4/24 | 2.78529 and 2.82843 (= 2 sqrt(2)). Correct |
| 2 | Rigid-body equations (section 1.1) | Compared term by term with the standard body-axis Newton-Euler form; Hamilton quaternion kinematics | Correct. Buoyancy 0.15 % of weight reproduces |
| 3 | Helmbold formula and the values 2.01 and 1.36 /rad (section 1.2) | Limits A to 0 (pi A/2) and A to infinity (2 pi); recomputed; [S45] reduces to it at zero sweep | Correct for unswept wings. Sweep form added (change 3) |
| 4 | C_lp = -CL_alpha/12 (strip, delta) and -pi A/32 (slender) | Strip: integral of c y^2 dy = c_r b^3/48. Slender: L = -U p (pi rho s^4/8) at the trailing edge, s = b/2, gives -pi A/32 | Both correct |
| 5 | Time-constant tables (sections 1.2, 1.3): mass, S, AR, sweep, MAC, W/S, mu, roll, heave, short period, phugoid | All 7 rows recomputed | Reproduce to the digits shown. Two labelling points fixed (changes 4, 5) |
| 6 | Phugoid T = pi sqrt(2) V/g, zeta = 1/(sqrt(2) L/D) | [S48] opened: "pi sqrt(2) v_t/g". zeta is the Lanchester small-perturbation value (model knowledge) | Period confirmed at source. 2.22 s, 10.9 m, 0.14 reproduce |
| 7 | Dart anchor from [S12]: 4.90 m/s, L/D about 5 | [S48] opened: quotes L/D 5.0 and 4.9 m/s from the same AIAA paper | Corroborated by an independent secondary source. CL = 0.17 and Re = 95,000 not re-read; Re = V l/nu = 9.7e4 at 20 C is consistent |
| 8 | Added-mass formulas: plate pi rho l^2/4, pi rho l^4/128, offset factor 1 + 8(2d/l)^2, disc (8/3) rho a^3 so 0.479 rho S^1.5, slender delta pi rho b^2 c_r/12 and pi rho b^4 c_r/640 | Re-derived: parallel-axis I = I_mid + m22 d^2; cross-flow integration along the root chord. Disc value from model knowledge (Lamb) | Formulas correct. Heave and roll columns reproduce. Pitch column was wrong (change 1) |
| 9 | Munk moment equals the moment of quarter-chord lift about mid-chord | (m22 - m11) U^2 sin(a) cos(a) = pi rho c^2 U^2 sin(a) cos(a)/4; plate lift pi rho U^2 c sin(a), normal component times c/4 gives the same | Exact. The "do not add it twice" advice stands |
| 10 | Thin-aerofoil flap formulas and the values -0.54, 2.49, +0.047, -0.22 | Re-derived from the Glauert coefficients A0, A1, A2 of a hinged camber line; cos(theta_h) = 2E - 1 | Correct |
| 11 | Strip-count error 0.5/N^2 | Midpoint sums for the roll and the pitch integral of a delta | Exactly 0.5/N^2 for both (12.5, 3.1, 1.4, 0.8 %) |
| 12 | CL_max 1.46-1.49 at 37.5-40 deg from [S14] | Polhamus form with K_p 1.15-1.36 and K_v = pi (model knowledge) gives 1.37-1.51 at those angles and at most 1.6 near 50 deg | The CFD value sits at the no-vortex-breakdown limit, so it is an upper value. Measured sharp-edged slender deltas reach about 1.1-1.35 (unverified - model knowledge). V4 band moved to 1.1-1.6 |
| 13 | Full-envelope plate models | [S46] and [S47] opened | Flat-plate CL, CD confirmed; Beard & McLain M = 50, alpha_0 = 0.47 confirmed. APW coefficients still unverified |
| 14 | Dihedral, fin, spiral, trim, glide and minimum-sink formulas (section 4) | Re-derived the strip dihedral integral for a trapezoid; others compared with standard forms | Correct as written |
| 15 | Blackburn numbers: 60 mph = 26.8 m/s, 18.6 m, 37 m; implied sink 0.74 / 0.70 / 0.65 m/s; ballistic 10.197 m; dynamic pressure 241-439 Pa | Recomputed | Arithmetic correct. The 50 % energy assumption is optimistic (change 8) |
| 16 | Pre-2023 records and 2022 Red Bull winners | Model knowledge and note 04 only | 69.14 m, 88.31 m, 29.2 s, 27.9 s, 27.6 s, 16.89 s, 18.80 s, 61.11 m and 14.86 s agree. Not evidence |
| 17 | ECMAScript determinism statement (section 1.4) | Note 08 opened the ECMA-262 source | Consistent with note 08 |

**Changed, and why**

1. **Added pitch inertia (section 3) was 37 % low.** 7.3e-6 and 6.2e-6 kg m^2 left out the offset term that the same section prescribes. Now 1.16e-5 (A) and 9.9e-6 (B) with the offset, and 1.23e-5 / 6.7e-6 from slender-body theory; formulas added.
2. **Sink-speed formula (section 8) mixed two correct forms.** V = sqrt(2 (W/S) cos(gamma)/(rho C_R)) has one cos(gamma) too many. Now V = sqrt(2 (W/S)/(rho C_R)), equal to the section 4 form.
3. **6 x 6 element grid withdrawn (summary item 3, sections 2 and 9).** Equal chordwise elements with the same CN(alpha) put the centre of pressure at 0.458 c instead of 0.25 c. This also contradicted ARCHITECTURE.md, which uses spanwise strips with a quarter-chord centre of pressure and says the research note wins on conflict. Now: spanwise strips, alpha at 3/4 chord, moving centre of pressure, optional weighted chordwise split. The sweep-corrected lift slope [S45] was added next to Helmbold: 1.74 and 1.15 /rad for the two deltas.
4. **Roll numbers were inconsistent between tables.** The section 1.2 table uses the slender C_lp and section 1.3 uses the strip C_lp; both are now labelled. "Agree within 20 %" is 20-27 %. The summary's "2-17 ms" is 2-34 ms across the Ixx range.
5. **"16.7 ms is unstable above about 5 m/s"** holds only at the lowest Ixx: about 6 m/s there, 24 m/s at Ixx 8e-6.
6. **Strip over-prediction "factor 3-4"** is 2.4 (AR 2) to 4.2 (AR 1). **Short-period reduced frequency** is 0.5-1.1, not 0.8-1.1.
7. **Dart sink** 0.98 m/s was the small-angle value; V sin(gamma) is 0.96 m/s.
8. **Glider archetype and peak height.** The archetype's 0.25-0.4 m/s sink would give 47-75 s from 18.6 m, so it cannot be "consistent" with the 27.6-31.2 s records; it is now labelled a floor. A quadratic-drag ascent shows that 18.6 m from 27 m/s needs CD0 of about 0.012, so the V10 peak band is now 11-22 m.
9. **Records.** 77.0 m is 77.134 m. The Red Bull 57.07 m "2nd place" and the 16.39 s "Krstic" airtime are marked unconfirmed, following note 04's fact-check; V13 no longer cites 57 m.
10. **Neutral point of a delta (section 4)** was given as 2/3 c_r without the AR dependence. Range and its effect on static margin added, tagged as model knowledge.
11. **Kirchhoff force term.** Section 1.1 drops omega x (M_a v) as well as the Munk moment; the dropped force is now stated in section 3.
12. **Air viscosity** 1.52e-5 changed to 1.506e-5 m^2/s to match note 03; Re for plane B at 5 m/s becomes 6.6e4.
13. **Tags.** The MIT flat-plate model and the Beard & McLain parameters lost their "unverified" tags ([S46], [S47]); the APW coefficient set gained a warning that it probably belongs to the companion paper.

**Still uncertain**

- **[S1]-[S44] are all unopened.** The 2025/26 records (98.43 m, 31.2 s, names, venues, dates), the Red Bull rules and results, Blackburn's 60 mph, [S14]'s CL_max and the CL = 0.17 of [S12] rest on the first author's search-result text. Notes 02 and 04 agree with each other on the records, but they may share the same search results. Check [S1], [S3], [S11], [S12] and [S14] by hand before the validation table is frozen.
- **No citation was removed.** None could be shown to be dead or fabricated without network access; none is known to be good either, apart from [S45]-[S48].
- **APW coefficients, Selig's and Khan & Nahon's model details, the Polhamus constants and the delta neutral-point range** are model knowledge.
- **The inertia estimates** (Ixx 1e-6 to 8e-6, Iyy about 2e-5 kg m^2) drive every time constant and were not checked against a folded-layer computation. If a design comes out below Ixx = 1e-6 kg m^2, its roll mode is stiffer than any row tabulated here; the stiffness guard, not the fixed 1 ms step, is what covers that case.
- **Pitch damping and short-period zeta** differ by a factor of 0.4-1.7 between loading assumptions. Quasi-steady strip theory also omits the thin-aerofoil rate term of the moment. Neither affects glide distance much, but both affect how fast a porpoise dies out.
- **Throw-speed data** remain anecdotal; release spin rates are design bounds, not measurements.
