# 01 - Aerodynamics of paper airplanes: low-Re, low-AR thin flat-plate element model

**Scope.** This document gives the force, moment and drag data and formulas for the quasi-steady flat-plate element (strip) model in the Paper Plane Lab physics core. It covers 2-D and finite flat plates at Re of about 1e4 to 2.5e5, aspect ratios 0.5 to 6, and the full alpha range of 0 to 180 deg.

**Verification status (read first).** In this session WebFetch could not reach any host, because the network policy blocked typeset.io, scribd.com and every other host tried. The shared WebSearch quota also ran out partway through the research. So I did **not** read any full text.
- A tag [S#] means a search result showed that the source exists, and the result's abstract or snippet stated the claim as it is written here.
- A number tagged **(unverified - model knowledge)** comes from my training knowledge. It may be right, but it has not been checked against the paper. Most tabulated values for individual wings carry this tag.
- **(derived)** means I computed it here from the stated formulas (scripts in the session scratchpad). The arithmetic can be checked.
- **(calibration)** marks an engineering choice made in this document, tuned to the trends that are confirmed.
- **Second pass (fact-check).** A later verification pass had no web access either (WebFetch blocked for every host, search quota spent), so no cited paper was re-opened. It re-derived every formula by hand, recomputed every table and unit-test number, and read three open-source packages from PyPI ([S34]-[S36]) that confirm the Blasius, Helmbold/DATCOM, Viterna and Beard-McLain formulas. It changed the incidence definition, the force point and the bend-moment axis in section 10.2, the delta stall blend width, the added-mass rule for AR < 1 and two glide speeds. See **Verification notes** at the end.

Before the constants are frozen, check the tagged numbers against the open-access PDFs: [S7], [S10], [S14], [S15], [S19], [S25] and [S26].

---

## Summary for implementers

1. Paper planes fly at **Re = 7e3 to 2.5e5** (chord 0.05-0.25 m, speed 2-15 m/s). The flow is laminar, with a sharp leading edge (LE): the flow separates at the LE and reattaches through a bubble until stall. The results of thin plates change little with Re and free-stream turbulence [S11][S14]. Mach is below 0.05, so treat the air as incompressible.
2. Pressure on an infinitely thin plate acts **normal to the plate**. With a sharp, separated LE there is no leading-edge suction, so the only in-plane force is skin friction. That gives **CD = CD0 + CL tan(alpha)**. The induced drag then comes out of the element model by itself. **Do not add a CL^2/(pi e AR) term as well.**
3. Lift slope comes from the **parent-surface aspect ratio**: Helmbold for straight wings, CLa = 2*pi*AR/(2 + sqrt(AR^2 + 4)) [S8]. Use Lowry-Polhamus with half-chord sweep for delta (dart) surfaces.
4. Wings with AR below about 3, and most of all those with AR at or below 1, gain **nonlinear vortex lift**. Use the Polhamus form CN = Kp sin(a)cos(a) + Kv sin^2(a) [S15][S16]. Side-edge vortices carry most of the lift of low-AR rectangular plates [S14].
5. Post-stall the plate behaves as a bluff body: CN = CD90*sin(a)/(0.56 + 0.44 sin(a)). Use **CD90 = 1.17 for AR <= about 3**, rising as 1.11 + 0.018 AR [S20].
6. The centre of pressure (CoP) moves from about c/4 at small alpha to c/2 at 90 deg. In tests on low-AR plates it sits aft of c/4 in nearly every case [S19]. This shift is the self-stabilising mechanism of tailless paper planes [S23][S24].
7. For an elevator bend, the bent strip as its own element underestimates lift change by 2.8-5.6x for 5-20 % flap chord. Its pitch moment is off by -46 % to +18 %. Use thin-airfoil flap effectiveness tau instead (section 8).
8. Unit-test targets for the recommended model are in section 10.4. Examples: a dart (delta, AR 1) gives CLa of about 1.34/rad, (L/D)max of about 4.3-4.7 and CLmax of about 1.36 at about 38 deg. A glider (AR 3) gives CLa of about 3.33/rad, (L/D)max of about 5.9 and stall at about 13 deg.

---

## 1. Reynolds number range and flow regime

Re = V c / nu. Air at 20 C and 101.325 kPa has nu = 1.516e-5 m^2/s and rho = 1.204 kg/m^3 (unverified - model knowledge; these match the companion doc 02).

| chord c (m) \ V (m/s) | 2 | 5 | 10 | 15 |
|---|---|---|---|---|
| 0.05 | 6.6e3 | 1.6e4 | 3.3e4 | 4.9e4 |
| 0.10 | 1.3e4 | 3.3e4 | 6.6e4 | 9.9e4 |
| 0.15 | 2.0e4 | 4.9e4 | 9.9e4 | 1.5e5 |
| 0.25 | 3.3e4 | 8.2e4 | 1.6e5 | 2.5e5 |
(derived)

- **Typical glide.** A 5 g plane with W/S of about 1.4-2.5 N/m^2 at CL 0.17-0.3 flies at 3-5 m/s, so Re is about 2e4 to 6e4. The launch phase reaches 1e5 to 2.5e5. The companion doc 02 cites a measured dart glide at V = 4.90 m/s and CL = 0.17, giving Re of about 9.5e4 based on the 0.297 m length (Ng et al., AIAA 2009-3958; see doc 02, which cites it as [S12] there).
- **Boundary layer.** The boundary layer is laminar over the whole chord. The thickness at the trailing edge (TE) is delta99/c = 5/sqrt(Re), about 2-5 %, using Blasius (derived; unverified - model knowledge).
- **Regime.** Thin, sharp plates separate at the LE once alpha is a few degrees. The separated shear layer goes through transition and reattaches, forming an LE bubble. Stall happens when the bubble bursts or the tip vortices take over. Below Re = 7e4, thin flat and cambered plates were "relatively insensitive" to Re and turbulence, while NACA 0012 was very sensitive. The best profile at those Re was a thin plate with 5 % circular-arc camber [S11]. Traub reports low sensitivity to Re across three orders of magnitude for low-AR flat plates [S14].
- **Re effects to keep:** (a) laminar skin friction, which scales as Re^-1/2; (b) a mild rise of CLa with Re toward the inviscid value [S6]; (c) at Re of about 4e4, flat plates with larger AR (up to 8) show a nonlinearity near alpha = 0, including a sign change of lift [S7]. Item (c) is ignored for AR <= 4.
- **Paper thickness.** 80 g/m^2 paper is about 0.1 mm thick, so a single layer has t/c of 0.04-0.2 %. A folded LE of 4-8 layers has t/c of about 0.3-1.6 % (unverified - model knowledge). The MAV plates of Pelletier and Mueller had t/c = 1.93 % [S1]. MAV flat-plate data therefore cover paper wings, and slightly overstate their thickness.

## 2. Measured thin-plate wing data at low Re

**What the main sources measured (confirmed scope):**

| Source | Models | Re | Key confirmed findings |
|---|---|---|---|
| Pelletier & Mueller 2000 [S1] | Thin flat and cambered rectangular plates, t/c 1.93 %, Notre Dame tunnel | about 6e4-2e5 | Measured CL, CD, Cm(c/4). The cambered plate stays attached to a higher alpha than the flat plate. |
| Torres & Mueller 2004 [S2][S3] | Flat plates of several planforms, AR 0.5-2.0 | 7e4-2e5 | Lift is nonlinear because of tip and LE vortices. CL is linear only up to about 7-10 deg, depending on AR and Re [S6]. |
| Mueller 1999/2000 RTO [S4] | Flat and cambered plates | 2e4-2e5 | At these Re, thin plates beat conventional thick airfoils in L/D [S4]. |
| Laitone 1997 [S11] | Rectangular wings: NACA 0012, flat and cambered plates | down to 2e4 | Thin plates are insensitive to Re and turbulence. A 5 % circular-arc plate is best below 7e4. |
| Mizoguchi & Itoh 2013 [S9] | Rectangular plates, AR 0.5-several | about 1e4 | AR >= 3 behaves like a high-AR wing. Below 3 it differs, most of all at AR <= 1, because of tip vortices. In their 2012 study, AR <= 2 changes the stall and CLmax rises for AR <= 1. |
| Mizoguchi, Kajikawa & Itoh 2016 [S10] | Rectangular, AR 0.5-1.5 | 5.2e4 (also 7.6e4) | AR affects the lift slope for AR <= 1.5. CLmax rises as AR falls toward 1. Static stall hysteresis peaks at AR 1.0. |
| Ananda, Sukumar & Selig 2015 [S6] | 10 wings incl. flat plates | 7e4-2e5 | CLa of flat-plate wings rises with Re toward theory. Oswald e is about 0.3-0.8. |
| Aguilar-Cabello et al. [S7] | Flat plates, AR 1, 2, 4, 8 | 4e4-2e5 | Gives a correlation for CLa(AR, Re) with error below 5 %, built on Helmbold. |
| Ortiz, Rival & Wood 2015 [S19] | Thin plates, AR 0.4-9.0, alpha to 90 deg | about 6e4-2e5 | CoP lies closer to mid-chord than to c/4 in nearly all cases. Lower AR gives a lower CN at large alpha. |
| Traub 2023 [S14] | Re-analysis of published plates, AR 0.5-3 | 3 decades of Re | Side-edge vortex lift is the majority of lift. The Purvis method matches all data sets when LE-vortex lift is left out. |
| Winter 1936 [S18]; Okamoto & Jinba 2009 [S12] | Short-span plates; thin flat plates at Re of about 1e4 | - | Classic and Re-1e4 data sets (not read). |

**Approximate characteristics of thin rectangular flat plates at Re of about 5e4 to 1e5.** The "theory" column is exact Helmbold (derived). Every other column is **unverified - model knowledge**. Each row agrees with the confirmed trends above: CLmax and alpha_stall rise as AR falls below about 1.5, and stall is gentle at low AR.

| AR | CLa Helmbold (/rad) | CLa measured (/rad) | CLmax | alpha_stall (deg) | CD0 (t/c about 2 %) | (L/D)max |
|---|---|---|---|---|---|---|
| 0.5 | 0.773 | 0.75-0.9 (secant slope rises with alpha) | 1.0-1.25 | 40-45 | 0.02-0.03 | 2.5-4 |
| 1 | 1.483 | 1.4-1.6 | 1.1-1.25 | 30-40 (gentle) | 0.02-0.03 | 3.5-5 |
| 2 | 2.603 | 2.4-2.7 | 0.85-1.0 | 15-20 | 0.02-0.03 | 5-6.5 |
| 3 | 3.363 | 2.9-3.3 | 0.75-0.9 | 11-14 | 0.02 | 6-7.5 |
| 6 | 4.529 | 3.8-4.4 | 0.65-0.85 | 8-10 | 0.015-0.02 | 7-9 |

## 3. Lift-curve slope and vortex lift versus AR

**Formulas.** All are per rad, incompressible, for alpha in the linear range:
- **Helmbold:** CLa = 2*pi*AR/(2 + sqrt(AR^2 + 4)) [S8][S34]. The general form with section slope a0 is CLa = a0*AR/(a0/pi + sqrt((a0/pi)^2 + AR^2)) [S8]. It is valid for straight wings of any AR, and for flat plates down to AR of about 0.5. The Aguilar-Cabello correlation for flat plates (AR 1-8, Re 4e4-2e5) builds on this formula [S7].
- **Jones slender wing:** CLa = pi*AR/2. Valid for AR << 1, and for slender deltas up to AR of about 1 (unverified - model knowledge; R. T. Jones, NACA Rep. 835).
- **Lowry-Polhamus (DATCOM form):** CLa = 2*pi*AR/(2 + sqrt(AR^2*(beta^2 + tan^2(Lambda_c/2))/kappa^2 + 4)), with beta = 1 and kappa = a0/(2*pi) = 1. For unswept wings it reduces exactly to Helmbold. For a delta with taper ratio 0, tan(Lambda_c/2) = 2/AR (derived: the half-chord line runs from c_r/2 at the root to c_r at the tip over b/2, and AR = 2b/c_r). The same formula is coded in [S34], which cites Raymer sect. 12.4.1 and DATCOM; Raymer's version takes the sweep of the maximum-thickness line, DATCOM the half-chord line. The attribution to NACA TN 3911 is unverified - model knowledge.

| AR | Helmbold (rect) | Jones pi*AR/2 | Lowry-Polhamus delta | e_eff = CLa/(pi AR) with no LE suction |
|---|---|---|---|---|
| 0.5 | 0.773 | 0.785 | 0.645 | 0.49 |
| 1 | 1.483 | 1.571 | 1.257 | 0.47 |
| 2 | 2.603 | 3.142 | 2.300 | 0.41 |
| 3 | 3.363 | 4.712 | 3.078 | 0.36 |
| 6 | 4.529 | 9.425 | - | 0.24 |
(derived)

**Polhamus leading-edge-suction analogy.** For a sharp-edged wing, CL = Kp sin(a)cos^2(a) + Kv cos(a)sin^2(a). Kp is the potential-flow constant and Kv the vortex-lift constant [S15][S16]. The matching normal-force form is CN = Kp sin(a)cos(a) + Kv sin^2(a). The suction force that is lost at the edge reappears as vortex lift normal to the plate.
- **Delta wings.** Kp is roughly the lifting-surface CLa (about 1.26-1.45/rad at AR 1). Kv is about pi for slender deltas and rises only slowly with AR, to about 3.1-3.4 at AR 1-2 (unverified - model knowledge).
  - Check (derived): Polhamus's relation is Kv = (Kp - Kp^2*Ki)/cos(Lambda_LE), with Ki = dCDi/dCL^2 (relation unverified - model knowledge). With Ki = 1/(pi*AR) and tan(Lambda_LE) = 4/AR, the slender limit Kp = pi*AR/2 gives Kv -> pi exactly. With the Lowry-Polhamus Kp it gives 3.11 at AR 1 and 3.26 at AR 2; with the Jones Kp, 3.24 and 3.51.
- **Rectangular wings.** Lamar extended the analogy to separation at the side edges (Kv,se) and tabulated limiting values for rectangular wings [S17]. Traub finds that side-edge vortex lift dominates for AR 0.5-1.5. He also questions any LE-vortex lift for an unswept LE [S14].
- **Recommended for rectangular paper wings: Kv(AR) = 2.3 * clamp((3 - AR)/2, 0, 1)** (calibration). This gives Kv = 2.3 at AR <= 1, 1.15 at AR 2 and 0 at AR >= 3, which matches the AR >= 3 boundary in [S9]. It reproduces CLmax of about 1.19 at about 36 deg for AR 1 and about 1.08 at about 45 deg for AR 0.5 (derived). At AR 1 and 35 deg, the vortex term is 52 % of CN, consistent with [S14].
- **Delta (dart) surfaces with Lambda_LE >= 60 deg:** Kv = pi (unverified - model knowledge, Polhamus).

## 4. Drag

**Laminar skin friction (Blasius, both faces):** Cf,2 = 2 x 1.328/sqrt(Re) = 2.656/sqrt(Re), based on planform area. Valid for laminar flow, Re 1e3 to about 5e5. [S34] codes the one-face mean value 1.328/sqrt(Re_L), cites Cengel & Cimbala Table 10-4, gives Re_L <= 5e5 as the limit and says to double it for two faces. The lower limit of 1e3 is unverified - model knowledge.

| Re | 1e4 | 2e4 | 5e4 | 1e5 | 2e5 |
|---|---|---|---|---|---|
| 2.656/sqrt(Re) | 0.0266 | 0.0188 | 0.0119 | 0.0084 | 0.0059 |
| Recommended CD0 = 2.656/sqrt(Re) + 0.006 | 0.033 | 0.025 | 0.018 | 0.014 | 0.012 |
(derived; the +0.006 term is a calibration)

Measured CDmin for thin plates with t/c of about 2 % at Re 6e4-1e5 is about 0.015-0.03 (unverified - model knowledge). That is 1.5-2.5 times Blasius, because of LE/TE pressure drag and the bubble. The +0.006 edge term covers this for paper, whose edges are thinner than those of the MAV models.

**Blunt folded edges.** A rounded fold of thickness t at Re_t = V t/nu of about 50-500 behaves like a cylinder, with Cd of about 1-1.5 on its frontal area. That adds dCD0 of about 1.2 t/c, or about 0.003 for t = 0.4 mm and c = 0.15 m. This is small next to friction (derived; unverified inputs). No measured data on paper-fold LEs was found.

**Zero leading-edge suction (key result).** For an infinitely thin plate, pressure can only act along the normal. An in-plane pressure force needs a finite LE suction peak, and that collapses when the flow separates at a sharp edge. The total force is therefore CN normal to the plate plus friction CA along it. This gives CL = CN cos(a) - CA sin(a) and CD = CN sin(a) + CA cos(a). For small alpha, **CD = CD0 + CL tan(a), roughly CD0 + CL^2/CLa** (derived). It is equivalent to an Oswald e_eff = CLa/(pi AR) (table in section 3). That is 0.47 at AR 1 and 0.36 at AR 3, at the low end of the measured 0.3-0.8 [S6]. Measured wings with rounded LEs recover some suction.

**Max L/D with zero suction:** (L/D)max = 0.5*sqrt(CLa/CD0), at CL* = sqrt(CD0*CLa) (derived). With CD0 = 0.02 this gives AR 1 = 4.3 (alpha 6.7 deg), AR 2 = 5.7, AR 3 = 6.5 (4.4 deg) and AR 6 = 7.5 (3.8 deg).

## 5. Post-stall and full envelope (0-180 deg)

**Normal-plate drag CD90 versus AR.** White and Hoerner tables give b/h = 1: 1.18; 5: 1.20; 10: 1.30; 20: 1.50; infinite: 1.98 (unverified - model knowledge). Viterna's wind-turbine correlation, CDmax = 1.11 + 0.018 AR (AR <= 50), comes from Texas A&M post-stall data [S20][S21] and matches that table within about 5 % (1.13, 1.20, 1.29, 1.47 at AR 1, 5, 10, 20; derived). A normal plate does not distinguish AR from 1/AR, so use **CD90 = max(1.17, 1.11 + 0.018*max(AR, 1/AR))**.

**Bluff-body normal-force shape.**
- Hoerner's 2-D fit is CN = 1/(0.222 + 0.283/sin(a)) (unverified - model knowledge). Normalised, it becomes **CN = CD90 * sin(a)/(0.56 + 0.44 sin(a))**, the form also used in wind-turbine post-stall models such as Lindenburg's (ECN) (unverified - model knowledge). Values of CN/CD90: 0.38 at 15 deg, 0.81 at 45 deg, 0.92 at 60 deg, 1 at 90 deg (derived).
- Kirchhoff-Rayleigh free-streamline theory gives CN = 2*pi*sin(a)/(4 + pi sin(a)). That is only 0.88 at 90 deg, against the measured 2.0 for a 2-D plate [S22], so its magnitude is unusable.
- Its shape, however, is exactly the bluff-body shape above (derived): (4 + pi) sin(a)/(4 + pi sin(a)) = sin(a)/(0.5601 + 0.4399 sin(a)), and Hoerner's 0.222 and 0.283 are 1/2 and 2/pi divided by 1.98/0.8798. The recommended CN is therefore Kirchhoff-Rayleigh rescaled to the measured CD90. It is a 2-D shape applied to finite plates (calibration).

**Real-time full-envelope practice.**
- **Viterna-Corrigan:** CD = CDmax sin^2(a) + B2 cos(a) and CL = (CDmax/2) sin(2a) + A2 cos^2(a)/sin(a). A2 and B2 make the curves continuous with (CLs, CDs) at the stall angle alpha_s: A2 = (CLs - CDmax sin(as)cos(as)) sin(as)/cos^2(as) and B2 = (CDs - CDmax sin^2(as))/cos(as). It is a best fit, not a theory [S21]. These forms of CL, CD, A2 and B2, and CDmax = 1.11 + 0.018 AR, match NREL's CCBlade implementation line for line [S35]. There AR is the blade aspect ratio (rotor radius over the chord at 75 % radius).
- **Beard & McLain sigmoid blend:** sigma = (1 + e^(-M(a - a0)) + e^(M(a + a0)))/((1 + e^(-M(a - a0)))(1 + e^(M(a + a0)))), and post-stall CL = 2 sign(a) sin^2(a) cos(a). Both forms are coded this way in [S36]. The attribution to Beard & McLain and the constants M of about 50 and a0 of about 0.47 rad are unverified - model knowledge ([S36] loads its own values from a data file).
- **Khan & Nahon (2015) and Selig (2010)** use component or segment breakdowns with flat-plate post-stall coefficients. I could not retrieve their equations (unverified).

**Reversed flow (TE first).** A single paper strip is symmetric fore and aft, so evaluate the incidence alpha_p in [0, 90 deg] against the plate plane. Measure x_cp from whichever edge is upstream. The same CN(alpha_p) then covers 0-180 deg and every sign. Do not use cambered-airfoil 360-deg tables: the camber of a paper plane is represented geometrically by separate bent elements.

## 6. Centre of pressure

**Data and theory.**
- Thin-airfoil theory puts the aerodynamic centre (AC) of a flat plate at c/4 (unverified - model knowledge).
- Low-AR plates have their CoP closer to the centre than to c/4 in nearly all measured cases, AR 0.4-9 up to 90 deg [S19]. At 90 deg it is at c/2.
- Kirchhoff-Rayleigh (fully separated): x_cp/c = 0.5 - 0.75 cos(a)/(4 + pi sin(a)) from the LE. That gives 0.36 at 20 deg, 0.38 at 30, 0.42 at 45, 0.44 at 60 and 0.50 at 90 (derived; formula unverified - model knowledge, Lamb's Hydrodynamics). Its small-alpha limit of 0.31 is wrong for attached flow.
- Joessel's historical fit: x_cp/c = 0.195 + 0.305 sin(a) (unverified - model knowledge).

**Recommended fit (calibration):** x_cp/c = k0 + (0.5 - k0) sin(alpha_p), with k0 = 0.25 for rectangular or trapezoidal strips.
- It equals c/4 at alpha = 0 and c/2 at 90 deg. It stays within 0.03c of Kirchhoff-Rayleigh for 30-90 deg, and it is aft of c/4 for alpha > 0 as [S19] reports.
- Vortex-lift (Kv) normal force acts at **0.5 c_local** (calibration). Combine: x_cp = (CNp*x_p + CNv*0.5c)/(CNp + CNv).

**Strip-model AC error on deltas (derived).**
- Take a delta made of streamwise strips with CoP at k*c_local and uniform strip loading. Its AC lies at x_ac/c_r = 1/3 + 2k/3 from the apex.
- With k = 0.25 that gives 0.50 c_r. Slender-wing theory and the area centroid give 2/3 c_r (unverified - model knowledge).
- **For delta and dart surfaces use k0 = 0.5** (so x_ac = 2/3 c_r). Otherwise the AC of a dart sits 0.17 c_r too far forward, and the static margin comes out too small by that amount.

**Li, Goodwill, Wang & Ristroph (JFM 937 A6, 2022) [S23][S24].**
- Controlled experiments on thin plates in water, varying the centre-of-mass (COM) location, plus a quasi-steady dynamic model.
- Flight modes named include fluttering, tumbling, bounding and stable gliding, depending on where the COM sits [S23].
- The press summary [S24] stresses that the COM must be "just right". Paper planes reach it by folding the front edge over several times or adding a paper clip.
- The stabilising effect comes from the CoP moving with alpha. It "does not occur for traditional airfoils", whose CoP stays fixed [S24].
- Trim condition for a tailless plate: x_cm = x_cp(alpha_trim). With the fit above, a COM at 0.27c trims at alpha of about 4.6 deg and one at 0.30c at about 11.5 deg (derived). A forward COM gives a low alpha and a fast, steep glide.
- Their numeric COM bounds were not retrieved (unverified).

## 7. Unsteady and falling-paper regimes

- **Phase diagram.** Andersen, Pesavento & Wang (JFM 541, 2005) map fluttering, tumbling and steady descent over Re, the dimensionless moment of inertia I* and the thickness ratio [S25][S26]. Flutter turns into tumble through a homoclinic bifurcation, and the period diverges logarithmically at the transition [S26].
- **Thresholds disagree between studies:**
  - numerical: 0.2 < I* < 0.3, for thickness ratios 1/4-2/5;
  - a chaotic band at 0.12 < I* < 0.35;
  - Belmonte et al. 1998: Fr of about 0.67, which is about I* = 0.4 [S27].
- **Definition and paper values.** I* = 8 rho_s h/(3 pi rho_f l) for a plate of width l (unverified - model knowledge). For 80 g/m^2 paper (rho_s h = 0.080 kg/m^2) and rho_f = 1.204 kg/m^3 this becomes I* = 0.0564/l (derived): 1.13 at l = 0.05 m, 0.56 at 0.10 m, 0.27 at 0.21 m and 0.19 at 0.297 m.
  - Prefactor check (derived): 8 rho_s h/(3 pi rho_f l) equals 32 I/(pi rho_f l^4) with I = rho_s h l^3/12 per unit span. That is the plate's moment of inertia over that of a fluid cylinder of diameter l. With this prefactor, Belmonte's Fr = 0.67 (Fr^2 = rho_s h/(rho_f l)) maps to I* = 0.38, and aluminium plates in water with h/l = 1/14, 1/8 and 1/5 give I* = 0.16, 0.29 and 0.48, the values I recall from [S25] (unverified - model knowledge).
  - A loose A4 sheet therefore sits near flutter or the chaotic band, while strips narrower than about 0.15 m tumble.
  - Paper's h/l of 3e-4 to 2e-3 is far thinner than any tested plate, so treat this as an extrapolation.
- **Falling disks.** Field et al. (Nature 1997) found steady, periodic, chaotic and tumbling regimes for disks, using I* = pi rho_d h/(64 rho_f d) (unverified - model knowledge, not retrieved).
- **Low-Re fits.** Falling-plate models use CL = 1.2 sin(2a) and CD = 1.4 - cos(2a) [S27]. These are Re of about 1e2-1e3 fits (CD90 = 2.4) and are **not** valid for planes at 1e4-1e5. Use them only for a "drop a loose sheet" toy mode, together with the added mass, rotational lift (C_R of about pi) and dynamic CoP that falling-paper models need [S28] (constants unverified - model knowledge).
- **Added mass.**
  - 2-D normal: rho*pi*c^2/4 per unit span. A 3-D rectangle gives m_a = rho C_A pi a^2 l/4, where a = min(c, b) is the **shorter** side and l = max(c, b) the longer. C_A depends on l/a: 0.58 at 1, 0.76 at 2, 0.83 at 3, 0.87 at 4, 0.90 at 5 and 1 at infinity (unverified - model knowledge, DNV-RP-H103-type table).
  - Corrected in verification: the earlier form rho C_A(AR) pi c^2 b/4 holds only for AR >= 1. For a surface with AR < 1 (chord longer than span) swap the roles as above, otherwise the added mass is overstated by about 1/AR.
  - Example: c = 0.10 m, b = 0.20 m gives m_a = 1.43 g, **about 29 % of a 5 g sheet**, for plunge only (derived).
  - Pitch added inertia is rho*pi*c^4/128 per span about mid-chord. That is 7.3e-7 kg m^2 for a 0.12 x 0.12 m wing, a few % of a plane's I_yy.
  - Buoyancy is negligible (rho_air/rho_paper of about 0.0015).
  - Doc 02 gives the integration approach.

## 8. Elevator (TE up-bend) effectiveness

Thin-airfoil theory (Glauert; unverified - model knowledge, re-derived here). The flap-chord ratio is E = c_f/c and the hinge angle is theta_h = arccos(2E - 1). Then:
- tau = dalpha_eff/ddelta = 1 - (theta_h - sin(theta_h))/pi, and dCl/ddelta = 2*pi*tau;
- dCm,c/4/ddelta = -(1/2) sin(theta_h)(1 - cos(theta_h)) per rad.

The "separate element" approach treats the bent strip as its own 2-D plate. Then tau_sep = E, and dCm,c/4/ddelta = -2*pi*E*(0.75 - 0.75E).

| E | tau (theory) | Cl_delta (/rad) | Cm_delta theory | tau_sep | Cm_delta separate |
|---|---|---|---|---|---|
| 0.05 | 0.282 | 1.77 | -0.414 | 0.05 | -0.224 |
| 0.10 | 0.396 | 2.49 | -0.540 | 0.10 | -0.424 |
| 0.15 | 0.481 | 3.02 | -0.607 | 0.15 | -0.601 |
| 0.20 | 0.550 | 3.46 | -0.640 | 0.20 | -0.754 |
| 0.30 | 0.661 | 4.15 | -0.642 | 0.30 | -0.990 |
(derived)

**Verdict.**
- The separate-element approach misses the circulation the camber adds over the whole chord. Its lift change is 18-36 % of theory for E = 0.05-0.2.
- Its pitch moment, which sets trim, is off by -46 % to +18 %.
- **Recommendation:** for each wing strip carrying a bend, use alpha_eff = alpha + tau(E)*delta in the attached CN. Add dCm,c/4 = Cm_delta*delta*(CLa,3D/(2*pi)).
- Keep the bent strip in the geometry for mass, inertia and the post-stall normal force only. Blend the camber terms out with the stall sigma.
- Viscous plain-flap effectiveness is usually below thin-airfoil theory (unverified - model knowledge). Expose a factor eta_f, default 0.8 (calibration).
- **Sign convention (added in verification).** The formulas above use the textbook sign: delta_flap > 0 is TE down, which adds lift and a nose-down moment (Cm_delta < 0). Section 10.2 defines delta > 0 as TE bent toward +n, the opposite sense when n is the upper-surface normal. The moment to apply there is M_b = -Cm_delta * delta * eta_f * (Kp/(2*pi)) * q * S_e * c_e * (1 - s) about the axis (x cross n). For x forward and n up that axis is the right-wing (+y) axis, so an up-bent TE gives nose-up (derived).
- **Low-AR limit (added in verification).** tau(E) is a 2-D result. In slender-wing theory the lift depends only on the incidence at the TE, so tau -> 1 as AR -> 0 whatever E is (unverified - model knowledge; R. T. Jones). For a dart (AR about 1) the true effectiveness lies between tau(E) and 1, so the default eta_f = 0.8 probably understates elevator power there. Treat eta_f as a per-surface tuning value (0.8 to about 1.5) and set it from trim tests.
- **Camber helps at these Re:** the best profile below Re 7e4 is 5 % camber [S11], and cambered plates stay attached to a higher alpha [S1].

## 9. Measurements of real paper airplanes

- **Ng, Kng, Pey & Schlueter**, "On the Aerodynamics of Paper Airplanes", AIAA 2009-3958, 27th Applied Aerodynamics Conference [S29]. Companion doc 02 reports, from that paper:
  - dart flight V = 4.90 m/s, mean CL = 0.17 and L/D of about 5, roughly constant across models;
  - water-tunnel tests at Re of about 9e4, with drag above the flight values because of the fixture.
  - I did not open the paper. Coverage titled "Paper Airplanes in Water" [S30] agrees with the water-tunnel testing.
  - **Cross-check (derived):** the recommended model below needs CD0 of about 0.016-0.018 to give L/D 4.7-5 at CL 0.17 for an AR 1 delta. That is consistent with section 4.
- **CFD studies of the dart** [S31][S32][S33]: numbers not retrieved.
- **Ristroph group** [S23][S24]: front-edge folding and paper clips position the COM, and the CoP shift explains passive stability.
- **No public wind-tunnel CL, CD or Cm polars of real folded paper planes** were found apart from [S29]. For validation use doc 02's V3/V4 targets, which are CLmax 1.2-1.7 at 33-45 deg and no sharp stall for a dart.

## 10. RECOMMENDED ELEMENT MODEL

### 10.1 Per surface (precompute once per fold state)
- Group elements into lifting surfaces: wing pair, keel, each winglet, and so on.
- Aspect ratio:
  - AR = b^2/S, using projected span across both wings for the wing pair.
  - Keel attached under a wing: AR_eff = 2h^2/S_keel, with the wing acting as a reflection plane (unverified - model knowledge).
- Potential constant Kp:
  - straight or rectangular: **Kp = 2*pi*AR/(2 + sqrt(AR^2 + 4))** [S8][S7];
  - delta: Lowry-Polhamus with tan(Lambda_c/2) = 2/AR (section 3).
  - Optional Re factor k_Re = clamp(0.85 + 0.15*log10(Re/1e4), 0.85, 1) (calibration, following the trend in [S6]).
- Vortex constant Kv:
  - rectangular: **Kv = 2.3*clamp((3 - AR)/2, 0, 1)** (calibration; [S9][S14]);
  - delta with Lambda_LE >= 60 deg: **Kv = pi** (Polhamus; unverified - model knowledge).
- Stall:
  - alpha_s = min(45 deg, 9 deg + 26 deg * exp(1 - AR)) (calibration). This gives 45 deg at AR 0.5, 35 at 1, 18.6 at 2, 12.5 at 3 and 9.2 at 6.
  - Blend width, rectangular: d_alpha_s = 4 deg + 6 deg * clamp((3 - AR)/2, 0, 1.25) (calibration). [S10] reports stall hysteresis peaking at AR 1, which fits an abrupt stall there. With this width the AR 1 plate falls from CL 1.19 at 35.8 deg to 0.66 at 45 deg (derived). The size of that drop has not been checked against data.
  - Blend width, delta with Lambda_LE >= 60 deg: **d_alpha_s = 20 deg** (calibration, changed in verification). With the rectangular rule (10 deg) the dart lost half its lift between 36 and 45 deg (CL 1.33 to 0.66, derived), which contradicts doc 02's V4 target of "no sharp stall". With 20 deg, CLmax is 1.36 at 37.7 deg and CL is still 1.10 at 45 deg and 0.78 at 50 deg (derived).
- **CD90 = max(1.17, 1.11 + 0.018*max(AR, 1/AR))** [S20].
- CoP base: k0 = 0.25 for rectangular or trapezoidal strips, 0.5 for delta strips (section 6).

### 10.2 Per element per step (spanwise strip, area S_e, chord c_e; unit vectors n (normal) and x (chord, toward the LE))
```
v   = V_cg + omega x r_eval - W(r_eval, t)   // element velocity relative to the air.
                                             // r_eval = 3/4-chord point from upstream edge (Pistolesi; unverified - model knowledge);
                                             // pick the upstream edge from v at mid-chord
vn  = v.n ; vx = v.x ; V = |v| ; q = 0.5 rho V^2 ; Re = V c_e / nu
vt  = sqrt(max(V^2 - vn^2, 0))              // in-plane speed, chordwise AND spanwise
upstream = (vx >= 0) ? LE : TE              // symmetric plate: same CN for TE-first flow
as  = atan2(vn, vt)                         // signed incidence against the plate plane, -pi/2..pi/2 (vn>0: air strikes the +n face)
if (strip has bend && vx > 0) as += eta_f*tau(E)*delta   // delta>0 = TE bent toward +n; skip when TE-first
sg  = sign(as) ; ap = min(|as|, pi/2)
t   = clamp((ap - alpha_s)/d_alpha_s, 0, 1) ; s = t*t*(3 - 2*t)   // smoothstep: 0 attached, 1 separated
CNp = Kp*sin(ap)*cos(ap) ; CNv = Kv*sin(ap)^2
CN  = (1-s)*(CNp + CNv) + s*CD90*sin(ap)/(0.56 + 0.44*sin(ap))
F_N = -sg * q * S_e * CN * n
Cf  = 2.656/sqrt(max(Re,1e3)) + 0.006
F_T = -0.5*rho*S_e*Cf*V*(v - vn*n)           // friction on in-plane velocity, zero at 90 deg
xp  = k0 + (0.5-k0)*sin(ap)
x_cp= (1-s)*(CNp*xp + CNv*0.5)/(CNp+CNv+eps) + s*xp     // fraction of c_e from upstream edge
cx  = vx/(vt + eps)                          // chordwise direction cosine of the in-plane flow, -1..1
r_F = r_mid + (0.5 - x_cp)*c_e*cx * x        // force point; r_mid = strip mid-chord point
apply F_N at r_F; F_T at r_mid
add bend moment M_b = -Cm_delta*delta*eta_f*(Kp/(2*pi))*q*S_e*c_e*(1-s) * (x cross n)   // only when vx > 0 (section 8)
```
- **Corrected in verification: incidence.** The earlier line was as = atan2(vn, |vx|). It ignores the spanwise velocity, so a strip sliding along its own span (sideslip, flat spin, tumbling) with vx near 0 got an incidence near 90 deg from any small vn, and a full bluff-body force at full q. The incidence must be the angle between the relative wind and the plate plane, as section 5 already says. With no spanwise flow the two forms are identical, so the polars in section 10.4 do not change.
- **Corrected in verification: force point.** Measuring x_cp from "whichever edge is upstream" makes the force point jump by up to c_e/2 when vx changes sign in spanwise flow. The cx factor removes the jump (calibration). For purely chordwise flow cx = +-1 and r_F is exactly x_cp*c_e behind the upstream edge, as before.
- Under sideslip beta this form gives a strip normal force between simple-sweep theory (factor cos^2(beta)) and no reduction. That is adequate for the low-AR surfaces here (unverified - model knowledge).
- No separate induced-drag term: the normal-only force gives CD = CD0 + CL tan(a) (section 4).
- Dihedral comes in through the element normals, so lift scales as cos^2(Gamma) (derived).
- Optional LE suction for rounded edges: F_s = eta_s*q*S_e*Kp*sin^2(ae)*(1-s), pointing toward the upstream edge. Default eta_s = 0.
- Optional stall hysteresis: reattach at alpha_s - 3 deg [S10] (offset is a calibration).
- Optional added mass in the body frame: M_a = sum of m_a,e * n n^T (section 7).

### 10.3 Wind-tunnel view
Sweep alpha_p from -180 to 180 deg at fixed V. Report CL = CN cos(a) - CA sin(a), CD = CN sin(a) + CA cos(a), Cm about the CG and about c/4, and L/D.

### 10.4 Expected results for unit tests (single-surface polars of the recommended model, derived)

| Case | Inputs | CLa (0-2 deg) | (L/D)max at alpha, CL | CLmax at alpha | CN(90 deg) |
|---|---|---|---|---|---|
| Rect plate AR 1 | Re 8e4, CD0 0.0154, Kp 1.483, Kv 2.3 | 1.55 /rad | 5.2 at 5.8 deg, 0.17 | 1.19 at 35.7 deg | 1.17 |
| Rect plate AR 3 | Re 8e4, CD0 0.0154, Kv 0 | 3.34 /rad | 7.35 at 3.9 deg, 0.23 | 0.70 at 13.0 deg | 1.17 |
| **Dart** (delta AR 1 + keel at 40 % of wing area) | Re 6e4, CD0 0.0212, Kp 1.257, Kv pi, k0 0.5, d_alpha_s 20 deg | 1.34 /rad | 4.3 at 7.2 deg, 0.20 | 1.36 at 37.7 deg (CL 1.10 at 45 deg) | 1.17 |
| **Glider** (rect AR 3 + keel at 15 %) | Re 3e4, CD0 0.0236 | 3.33 /rad | 5.9 at 4.8 deg, 0.28 | 0.70 at 13.0 deg | 1.17 |

The table was recomputed independently in verification. Every entry is reproduced to the printed precision (stall angles within 0.1 deg). Here CD0 is the Blasius term times (1 + keel area fraction), plus 0.006. The alpha_s used is 35 deg for the AR 1 cases and 12.5 deg for AR 3.

**Glide checks (derived).** For m = 5 g, rho = 1.204 kg/m^3, g = 9.81 m/s^2, with V^2 = 2 m g/(rho S sqrt(CL^2 + CD^2)):
- dart, S = 0.025 m^2, CL = 0.20, L/D 4.3: V = 4.0 m/s and glide angle 13 deg (corrected in verification from 3.9 m/s);
- glider, S = 0.035 m^2, CL = 0.28, L/D 5.9: V = 2.9 m/s and glide angle 9.6 deg (corrected from 2.85 m/s).

**Evidence bands for sanity tests** (sources: [S29] via doc 02; otherwise unverified - model knowledge):
- Dart: L/D 4-6 at CL of about 0.17, V about 4.9 m/s; stall gentle at 30-45 deg.
- Glider: L/D 5-8; stall at 10-15 deg.
- Tolerance: about ±15 %.

---

## Open questions and limits
- **Not read in full text.** No tabulated values from Torres & Mueller, Pelletier & Mueller, Okamoto & Azuma, Mizoguchi or Ortiz were retrieved. Fetch them and replace the model-knowledge table in section 2.
- **Rectangular Kv.** Lamar's Kv,se for rectangular wings [S17] and Traub's Purvis-based split [S14] should replace the Kv calibration.
- **Spanwise loading.** Strip theory with a surface-level Kp spreads lift uniformly along the span, so roll damping and the spanwise centre of lift are approximate. There is no tip unloading.
- **Sideslip roll.** Low-AR flat plates develop a large roll moment in sideslip from tip-vortex asymmetry even without dihedral [S13] (magnitude not retrieved). Plain strip theory misses this, so expect too little roll-due-to-sideslip for flat (zero-dihedral) darts.
- **Re < 2e4.** Stall behaviour and the size of the bubble are uncertain. The near-zero-alpha nonlinearity of [S7] is not modelled.
- **Real paper.** Paper flexibility (wing twist and flutter at high launch speed), creased-edge geometry and humidity are not modelled.
- **Interference.** Keel-wing interference and ground effect are not covered.
- **Delta AC.** The delta AC position of 2/3 c_r comes from slender-wing theory. Lifting-surface values for AR 1-2 may sit 0.03-0.07 c_r further forward (unverified).

## Sources
(Every URL came from search results returned in this session. Full texts were not opened, because WebFetch was blocked by the network policy.)
1. [S1] Pelletier, A., Mueller, T. J., "Low Reynolds Number Aerodynamics of Low-Aspect-Ratio, Thin/Flat/Cambered-Plate Wings", J. Aircraft 37(5):825-832, 2000, doi:10.2514/2.2676. https://www.researchgate.net/publication/245429843_Low_Reynolds_Number_Aerodynamics_of_Low-Aspect-Ratio_ThinFlatCambered-Plate_Wings
2. [S2] Torres, G. E., Mueller, T. J., "Low-Aspect-Ratio Wing Aerodynamics at Low Reynolds Numbers", AIAA J. 42(5):865-873, 2004, doi:10.2514/1.439. https://www.researchgate.net/publication/245425381_Low_Aspect_Ratio_Aerodynamics_at_Low_Reynolds_Numbers
3. [S3] Univ. of Notre Dame final report UNDAS-FR-2025, "Aerodynamics of Low Aspect Ratio Wings at Low Reynolds Numbers" (DTIC ADA397533). https://apps.dtic.mil/sti/pdfs/ADA397533.pdf
4. [S4] Mueller, T. J., "Aerodynamic Measurements at Low Reynolds Numbers for Fixed Wing Micro-Air Vehicles", RTO/VKI course, 1999 (DTIC ADP010760). https://apps.dtic.mil/sti/tr/pdf/ADP010760.pdf
5. [S5] Mueller, T. J., DeLaurier, J. D., "Aerodynamics of Small Vehicles", Annu. Rev. Fluid Mech. 35:89-111, 2003. https://www.annualreviews.org/content/journals/10.1146/annurev.fluid.35.101101.161102
6. [S6] Ananda, G. K., Sukumar, P. P., Selig, M. S., "Measured aerodynamic characteristics of wings at low Reynolds numbers", Aerosp. Sci. Tech. 42:392-406, 2015. https://m-selig.ae.illinois.edu/pubs/AnandaSukumarSelig-2015-AeroSciTech-LowReWings.pdf
7. [S7] Aguilar-Cabello, J. et al., "On the lift curve slope for rectangular flat plate wings at moderate Reynolds number", J. Wind Eng. Ind. Aerodyn. https://riuma.uma.es/xmlui/bitstream/handle/10630/35767/JWE_CorrCL_R1_black.pdf?sequence=1 ; https://www.sciencedirect.com/science/article/abs/pii/S016761052030369X
8. [S8] ScienceDirect Topics, "Lift-Curve Slope" (Helmbold forms). https://www.sciencedirect.com/topics/engineering/lift-curve-slope
9. [S9] Mizoguchi, M., Itoh, H., "Effect of Aspect Ratio on Aerodynamic Characteristics at Low Reynolds Numbers", AIAA J. 51(7):1631-1639, 2013. https://arc.aiaa.org/doi/10.2514/1.J051915
10. [S10] Mizoguchi, M., Kajikawa, Y., Itoh, H., "Aerodynamic Characteristics of Low-Aspect-Ratio Wings with Various Aspect Ratios in Low Reynolds Number Flows", Trans. JSASS 59(2):56-63, 2016. https://www.jstage.jst.go.jp/article/tjsass/59/2/59_T-15-28/_article
11. [S11] Laitone, E. V., "Wind tunnel tests of wings at Reynolds numbers below 70 000", Exp. Fluids 23:405-409, 1997. https://link.springer.com/content/pdf/10.1007%2Fs003480050128.pdf
12. [S12] Okamoto, M., Jinba, Y., wing-planform study at Re of about 1e4 (Akita National College of Technology), 2009. https://akita.repo.nii.ac.jp/record/927/files/KJ00005254825.pdf
13. [S13] Shields, M., Mohseni, K., "Effects of Sideslip on the Aerodynamics of Low-Aspect-Ratio Low-Reynolds-Number Wings", AIAA J., 2012. https://arc.aiaa.org/doi/10.2514/1.J051151
14. [S14] Traub, L. W., "Examination and Prediction of the Lift Components of Low Aspect Ratio Rectangular Flat Plate Wings", Aerospace 10(7):597, 2023. https://www.mdpi.com/2226-4310/10/7/597
15. [S15] Polhamus, E. C., NASA TN D-3767, 1966 (leading-edge-suction analogy). https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19670003842.pdf
16. [S16] NASA TN D-7631 (Kp, Kv definitions). https://ntrs.nasa.gov/api/citations/19740023303/downloads/19740023303.pdf
17. [S17] Lamar, J. E., NASA TR R-428, 1974 (side-edge suction analogy; ESDU abstract). https://www.esdu.com/cgi-bin/ps.pl?t=doc&p=nasa_trr428
18. [S18] Winter, H., "Flow Phenomena on Plates and Airfoils of Short Span", NACA TM-798, 1936. https://ntrs.nasa.gov/citations/19930094619
19. [S19] Ortiz, X., Rival, D., Wood, D., "Forces and Moments on Flat Plates of Small Aspect Ratio...", Energies 8(4):2438-2453, 2015. https://mdpi-res.com/d_attachment/energies/energies-08-02438/article_deploy/energies-08-02438.pdf
20. [S20] NREL forum, "Using Viterna method in AirfoilPrep" (CDmax = 1.11 + 0.018 AR; Viterna & Janetzke, NASA TM-82944). https://forums.nrel.gov/t/using-viterna-method-in-airfoilprep/1283
21. [S21] NASA report reproducing the Viterna equations and Texas A&M basis. https://ntrs.nasa.gov/api/citations/20090001311/downloads/20090001311.pdf
22. [S22] "A Generalized Model for Predicting the Drag Coefficient of Arbitrary Bluff Shaped Bodies at High Reynolds Numbers" (Kirchhoff-Rayleigh 0.88 versus 2.0). https://arxiv.org/pdf/2308.05272
23. [S23] Li, H., Goodwill, T., Wang, Z. J., Ristroph, L., "Centre of mass location, flight modes, stability and dynamic modelling of gliders", JFM 937 A6, 2022. https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/centre-of-mass-location-flight-modes-stability-and-dynamic-modelling-of-gliders/D4983A693B836A364D19C95B4D5FFC3B
24. [S24] ScienceDaily, "For new insights into aerodynamics, scientists turn to paper airplanes", 2022. https://www.sciencedaily.com/releases/2022/03/220301131114.htm
25. [S25] Andersen, A., Pesavento, U., Wang, Z. J., "Unsteady aerodynamics of fluttering and tumbling plates", JFM 541:65-90, 2005. https://dragonfly.tam.cornell.edu/publications/S002211200500594Xa.pdf
26. [S26] Andersen, Pesavento, Wang, "Analysis of transitions between fluttering, tumbling and steady descent of falling cards", JFM 541:91-104, 2005. https://dragonfly.tam.cornell.edu/publications/S0022112005005847a.pdf
27. [S27] Falling-plate literature quoting I* thresholds and the CL = 1.2 sin 2a, CD = 1.4 - cos 2a fits (secondary): https://arxiv.org/pdf/1804.05099 ; https://arxiv.org/pdf/2406.01785 ; https://arxiv.org/html/2503.22606v1
28. [S28] Pomerenk, O., Ristroph, L., "Quasi-steady aerodynamics predicts the dynamics of flapping locomotion" (dynamic CoP and added mass in falling-paper models). https://arxiv.org/pdf/2508.19899
29. [S29] Ng B. F., Kng Q. M., Pey Y. Y., Schlueter J. U., "On the Aerodynamics of Paper Airplanes", AIAA 2009-3958. https://arc.aiaa.org/doi/abs/10.2514/6.2009-3958 (as cited in doc 02)
30. [S30] Improbable Research, "Paper Airplanes in Water", 2010. https://improbable.com/2010/04/10/paper-airplanes-in-water/
31. [S31] "CFD Analysis on Dart Paperplane", Jurnal Mekanikal (UTM). https://jurnalmekanikal.utm.my/index.php/jurnalmekanikal/article/view/550
32. [S32] "Aerodynamic Performances of Paper Planes", J. Adv. Res. Fluid Mech. Therm. Sci. https://semarakilmu.com.my/journals/index.php/fluid_mechanics_thermal_sciences/article/view/7107
33. [S33] "Aerodynamic study of the dart paper airplane for micro air vehicle application" (listing). https://metatoc.com/papers/12971-aerodynamic-study-of-the-dart-paper-airplane-for-micro-air-vehicle-application

Sources [S34]-[S36] were added in the verification pass. Each is an open-source package downloaded from PyPI, and the named functions were read in the package source. They are code that implements the formulas (two of them cite the primary literature), not the primary papers themselves.

34. [S34] AeroSandbox 4.2.10 (P. Sharpe, MIT). `aerosandbox/library/aerodynamics/viscous.py`, function `Cf_flat_plate` (Blasius 1.328/sqrt(Re_L), citing Cengel & Cimbala Table 10-4, valid Re_L <= 5e5, "double it (two sides)"). `aerosandbox/library/aerodynamics/inviscid.py`, function `CL_over_Cl` (Helmbold form AR/(2 + sqrt(4 + AR^2)); DATCOM form with sweep, citing Raymer sect. 12.4.1). https://pypi.org/project/AeroSandbox/4.2.10/
35. [S35] WISDEM 4.2.9 (NREL). `wisdem/ccblade/Polar.py`, methods `extrapolate` and `__Viterna` (cdmax = 1.11 + 0.018 AR; A, B, CL and CD forms; cites Viterna & Janetzke 1982). https://pypi.org/project/wisdem/4.2.9/
36. [S36] pyfly-fixed-wing 0.1.2 (E. Bohn; 6-DOF fixed-wing simulator for the Skywalker X8). `pyfly/pyfly.py`, lines 1203-1215 (the same sigmoid blend and flat-plate post-stall CL). The package does not name Beard & McLain; that attribution stays model knowledge. https://pypi.org/project/pyfly-fixed-wing/0.1.2/
