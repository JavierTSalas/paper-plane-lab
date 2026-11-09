# 04 · Paper, Sizes, Mechanics and Competition Rules

Research note for **Paper Plane Lab** (physics core + leaderboards). Date: 2026-11-09.

> **How sources were checked.** WebFetch to guinnessworldrecords.com, redbull.com and cl.cam.ac.uk was blocked by this session's network policy, so every tag below points to a URL whose content was confirmed **through search-engine result text**, not by opening the page in full. Numbers that are my own arithmetic from tagged inputs are marked **(derived)** and show the formula. Claims I could not find online are marked **(unverified - model knowledge)**. A later fact-check pass re-derived every formula and number and traced the dart folds numerically, but had no web access at all, so no source was re-opened; see **Verification notes** at the end.

## Summary for implementers

1. **Default paper: 80 g/m² at 0.106 mm caliper** (density 755 kg/m³). That is the world-standard office sheet, sits between US 20 lb (75.2 g/m²) and 24 lb (90.2 g/m²), and is under the 100 g/m² limit used by both Guinness and Red Bull [S5][S7][S28][S32]. One A4 sheet = **4.990 g**, one US Letter sheet = **4.826 g** (derived: m = grammage × w × h).
2. Sheet sizes are exact (mm): A4 210×297, A3 297×420, A5 148×210, A6 105×148, B5 176×250, Letter 215.9×279.4, Legal 215.9×355.6, Tabloid 279.4×431.8 [S1][S3][S4].
3. **Paper is not rigid at paper-plane loads.** Effective bending stiffness per unit width of one layer: D_MD ≈ 3.7×10⁻⁴ N·m, D_CD ≈ 1.8×10⁻⁴ N·m (derived from L&W data [S7], ±30 %). An unsupported single-layer 80 mm wing panel would deflect by centimetres at 1 g, and launch loads reach about 10 g. Rigid-body results are valid only for multi-layer, creased, braced wings. Say this in the UI.
4. **Creases relax.** Fold angles reopen quickly at first, then logarithmically in time [S17][S18][S19]. Trim folds (elevator, dihedral) drift. This is a real but second-order effect, so treat it as cosmetic or optional.
5. **Surface roughness does not matter.** Copy paper is aerodynamically smooth at Re ≈ 10⁴–10⁵: Re_k ≲ 13 against a critical ~600 [S27]. Model skin friction as a smooth plate. Layer steps and blunt folded edges matter much more.
6. **Official scoring.** Red Bull wording: distance is measured from a base point on the launch line to the **first** point where the plane touches the ground **or any object**; airtime runs from leaving the hand to the **first** contact with the ground or any object [S32][S33]. GWR's measuring text is not public; the app assumes the same first-touch convention for GWR-style boards (assumption). Both bodies require an indoor, still-air venue and a hand throw from behind a line [S30][S31][S32]. **"No run-up" is a Red Bull rule only** [S32]; it is not confirmed for GWR (§5.1).
7. **Current records:** distance **98.43 m** (Liu Liwen et al., Shanghai, 28 Dec 2025) [S28][S37]; airtime **31.2 s** (seven-person Chinese team, Kunshan, 11 Feb 2026) [S29][S40].
8. Leaderboards: offer "GWR-style" and "Red Bull-style" Distance and Airtime under fixed indoor still-air conditions (23 °C, 50 % RH, ISO 187 [S13]). Outdoor and wind results go on a separate, unofficial board.

---

## 1. Paper sizes

ISO 216 A-series sheets keep the ratio √2 ≈ 1.4142, and each size is half the area of the one before [S1][S2]. ISO 216 tolerances: ±1.5 mm for dimensions up to 150 mm, ±2 mm for 150–600 mm [S1]. US Letter (8.5×11 in) is the base sheet of ANSI/ASME Y14.1 (ANSI A), and Tabloid/Ledger (11×17 in) is ANSI B [S3][S4]. Legal (8.5×14 in) is **not** part of Y14.1. One source traces the Letter, Legal and Tabloid names to ANSI X3.151-1987 [S4]. Inch values convert exactly at 1 in = 25.4 mm.

| Name | Width mm | Height mm | Aspect (h/w) | Area m² | Source |
|---|---|---|---|---|---|
| A3 | 297 | 420 | 1.414 | 0.124740 | [S1][S2] |
| A4 | 210 | 297 | 1.414 | 0.062370 | [S1][S2] |
| A5 | 148 | 210 | 1.419 | 0.031080 | [S1][S2] |
| A6 | 105 | 148 | 1.410 | 0.015540 | [S1][S2] |
| B5 (ISO) | 176 | 250 | 1.420 | 0.044000 | [S1] |
| US Letter (ANSI A) | 215.9 | 279.4 | 1.294 | 0.060322 | [S3][S4] |
| US Legal | 215.9 | 355.6 | 1.647 | 0.076774 | [S4] |
| Tabloid / Ledger (ANSI B) | 279.4 | 431.8 | 1.545 | 0.120645 | [S3][S4] |
| Half-letter ("Statement") | 139.7 | 215.9 | 1.545 | 0.030161 | 5.5×8.5 in (unverified - model knowledge for the name) |
| Origami square 150 | 150 | 150 | 1.000 | 0.022500 | 15 cm kami is the common retail size (unverified - model knowledge) |
| Origami square 210 | 210 | 210 | 1.000 | 0.044100 | A4 trimmed square (unverified - model knowledge) |

Note: Japanese JIS B5 is 182×257 mm, which is different from ISO B5 (unverified - model knowledge). Use ISO B5 unless you label the size "JIS B5".

## 2. Grammage, caliper and sheet mass

**US bond conversion.** Bond basis weight is the mass of 500 sheets of 17×22 in, so 1 lb bond = 453.59237 g / (500 × 0.4318 m × 0.5588 m) = **3.7597 g/m²** (derived). Sources give the factor as 3.760, with 20 lb = 75.2 g/m² and 24 lb ≈ 90 g/m² [S5][S6]. The factor applies only to bond: a "20 lb cover" sheet is far heavier [S6].

**Caliper of 80 g/m² office paper (data sheets).**

| Product (80 g/m²) | Caliper µm | Bulk cm³/g | Bendtsen roughness ml/min | L&W bending resistance MD / CD (mN) | Source |
|---|---|---|---|---|---|
| Lomax copy paper | 106 ± 3 | 1.32 | 200 ± 50 | 110 ± 15 / 55 ± 15 | [S7] |
| Navigator Organizer | 110 | – | 120 | ≥100 / ≥35 | [S8] |
| International Paper IP Basic | 104 | – | 220 ± 60 | – | [S9] |
| Xerox Business | 106 | – | – | – | [S10] |
| Antalis Explorer | 108 | 1.35 | – | – | [S11] |
| Lomax economy / premium grades | 93–103 / 106–114 | – | 130–300 / 80–160 | ≥100 / ≥35 (premium) | [S12] |

So 80 g/m² office paper is **93–114 µm thick, typically 104–110 µm**. Apparent density ρ = grammage / caliper = 0.080 kg/m² / 106 µm = **755 kg/m³** (range 0.70–0.86 g/cm³ over the table) (derived). Bulk is the inverse of density [S7][S11].

| Grade | Grammage g/m² | Caliper (µm) at 755 kg/m³ | A4 sheet g | Letter sheet g |
|---|---|---|---|---|
| US 20 lb bond | 75.2 | ≈ 100 (derived) | 4.690 | 4.536 |
| **80 g/m² office (default)** | **80** | **106** (measured median, [S7][S10]) | **4.990** | **4.826** |
| US 24 lb bond | 90.2 | ≈ 119 (derived) | 5.626 | 5.441 |
| Competition maximum | 100 | ≈ 132 (derived) | 6.237 | 6.032 |

Formulas: `m_sheet [kg] = G [kg/m²] · w [m] · h [m]`, `t = G / ρ`. Real caliper at a given grammage varies with density by about ±8 %, and heavier premium papers are often denser. The derived calipers are therefore estimates.

**Recommended single default: G = 80 g/m², t = 0.106 mm.** Reasons:
- It is the dominant office grade worldwide (A4 80 g/m²), and it is 6.4 % heavier than US 20 lb (80 / 75.2, derived).
- Both record bodies allow it, since both set the limit at 100 g/m² [S28][S31][S32].
- The caliper is the median of the measured data sheets.

Record teams go up to the 100 g/m² limit. The 2022 Boeing team said "we ended up going with A4-sized paper and went up to the maximum for weight, 100 grams per square meter" [S44]. If the fixed-thickness rule is ever relaxed, "Competition 100 g/m²" is the one extra stock worth adding.

## 3. Mechanical behaviour relevant to realism

### 3.1 Stiffness, modulus and grain (MD vs CD)

- **Test methods.** L&W **bending resistance** (ISO 2493-1) is reported as a force in **mN**. **Bending stiffness** (ISO 5628, L&W 5°/two-point) is reported in **mN·m** [S14]. Taber is a third method, reported as a bending moment (1 Taber unit = 1 g·cm = 0.0981 mN·m; unverified - model knowledge). Values from different methods cannot be compared directly.
- **MD > CD.** Machine-direction (grain) stiffness is consistently higher. Office-paper data sheets give MD/CD ≈ **2.0–2.9** [S7][S8]. Paper and board generally run 1.2–2 [S15], and lab handsheets 1.75–4.08 [S16].
- **Converting L&W force to stiffness** (small-angle cantilever, Euler–Bernoulli): `S_b = D = F·l² / (3·θ·b)`, with θ in rad. The standard geometry is θ = 15° and b = 38 mm, with l = 10 mm used for thin papers (geometry: unverified - model knowledge). With l = 10 mm, the Lomax values give (derived):

| | MD | CD |
|---|---|---|
| L&W bending resistance F | 110 mN [S7] | 55 mN [S7] |
| D per unit width (N·m = N·m²/m) | **3.7×10⁻⁴** | **1.8×10⁻⁴** |
| Effective bending modulus E_b = 12·D/t³ (t = 106 µm) | **3.7 GPa** | **1.9 GPa** |
| With Navigator minima (100/35 mN) | 3.4×10⁻⁴ / 3.4 GPa | 1.2×10⁻⁴ / 1.2 GPa |

The l = 10 mm assumption is required for consistency: l = 50 mm would imply E ≈ 93 GPa, which is impossible for a cellulose sheet. Tensile moduli of copy paper are typically quoted at ~4–7 GPa MD and ~2–3 GPa CD (unverified - model knowledge), which is consistent with the derived E_b. Poisson's ratio is ~0.2–0.3 (unverified - model knowledge).
- **Grain of cut-size sheets.** A4 and Letter copy paper is usually long-grain, meaning MD is parallel to the long edge (unverified - model knowledge). For a plane whose fuselage runs along the long edge, **spanwise wing bending therefore uses the weaker CD stiffness**.

### 3.2 Why wings droop and flutter

- **Elasto-gravity length** `L_eg = (D / (G·g))^(1/3)` = **61 mm (CD) to 78 mm (MD)** for one 80 g/m² layer (derived). An unsupported single-layer strip longer than ~6–8 cm sags visibly under its own weight.
- **Cantilever tip deflection** under uniform pressure p (cylindrical bending, small deflection, valid while δ/L ≲ 0.1): `δ = p·L⁴ / (8·D)` (derived from beam theory). Wing loading of an A4 dart is ≈ 2.2 N/m² (§7).

| Load case (single layer, D_CD = 1.8×10⁻⁴ N·m) | L = 50 mm | L = 80 mm |
|---|---|---|
| Self-weight, plane held by the keel, p = G·g = 0.785 N/m² | 3.4 mm | 22 mm † |
| 1 g flight, net p = W/S − G·g = 1.4 N/m² | 6.1 mm † | 40 mm † |
| 5 g launch, net p = 5·1.4 = 7.0 N/m² | 30 mm † | >> L † |

† δ/L > 0.1, so the entry is outside small-deflection validity. Linear theory overestimates there; read these as "large", not as a number to code. In flight the panel's own weight (inertia) opposes lift, so the bending load on a single-layer panel is n·(W/S − G·g), not n·W/S, assuming lift is spread evenly over the wing (derived). Using the gross n·W/S (2.2 and 11 N/m²) would give 9.5 / 63 mm and 48 mm, about 1.6× too much.

- **Launch load factor** (derived): `n = q·C_L / (W/S)`, with `q = ½ρV²`. At V = 20 m/s, q = 238 Pa, so **each 0.01 of C_L adds ≈ 1.1 g** at W/S = 2.2 N/m². A hard throw at C_L = 0.1 loads the wings to ~10 g. This is why record distance planes are thrown fast at near-zero lift and are folded thick and stiff. The 2022 team chose a "low-drag" design and a ~40° launch angle [S42].
- **Layers stiffen.** n stacked layers that can slide give D ≈ n·D₁. Layers locked by creases or tape give up to D ≈ n³·D₁ (unverified - model knowledge, standard plate theory). A 4-layer locked leading edge is up to 64× stiffer than one layer. Creases and dihedral also add geometric stiffness, because a V-section resists bending far better than a flat plate.
- **Flutter.** Trailing-edge or wingtip flutter at high speed is an aeroelastic instability of thin, low-stiffness surfaces. I found no paper-plane-specific measurement (unverified - model knowledge). The rigid model cannot produce it.

### 3.3 Crease spring-back

- A folded sheet springs open almost instantly to an initial angle, then reopens **logarithmically in time** over several decades [S19]. Thiria & Adda-Bedia measured the force needed to hold a fold of paper or Mylar and found it **decays logarithmically** in time (Arrhenius-type activation) [S18]. Benusiglio et al. tied crease curvature to an elasto-plastic model and found the same logarithmic reopening. In their tests, humidity sped up unfolding in woven fabric but not in bulk polymer sheets [S17]. Creased paperboard shows the same log-time release, and it also depends on bending speed [S20].
- Farain reports that the log-rate is a **material constant independent of folding force or sheet thickness**: ≈0.1 for Mylar and ≈6 for paper (published version; the arXiv v1 says 0.01 and 5.7). I could not confirm the units [S19].
- Model form for optional use: `θ(t) = θ_i + β·ln(t/t₀)` for t ≫ t₀, where θ is the opening angle and β is per-material. For trim folds in office paper, β of order 1–3° per decade of time is plausible (unverified - model knowledge). Use it only for cosmetic "the plane relaxes" behaviour, never in record scoring.

### 3.4 Humidity

- Standard test atmosphere for paper: **23 °C, 50 % RH** (ISO 187; 1990 edition tolerances ±1 °C and ±2 % RH). 27 °C / 65 % RH is permitted in tropical zones [S13].
- Paper stiffness falls with moisture. Salmén–Back give `ln(E/E₀) = A − B·mc` for moisture content mc above ~5 % [S21]. Tensile stiffness decays roughly exponentially with moisture and is more sensitive to it than strength is [S21]. Kersavage found peak modulus at ~6 % mc [S22]. Elastic and hygroexpansion properties are coupled [S23].
- No copy-paper-specific slope was found online. Going from 50 % to 90 % RH raises mc from ~7 % to ~15 % and cuts stiffness by roughly 30–50 % (unverified - model knowledge). Humidity also causes curl and cockle, which change camber.

### 3.5 Which effects should the rigid model list as limitations?

| Effect | Size | Recommendation |
|---|---|---|
| Wing bending/twist under load (aeroelasticity) | **Large** for single-layer panels and at launch (§3.2) | State it as the main limitation. Optionally reduce effective dihedral or wash-out with speed. |
| Trailing-edge/tip flutter | Large at high speed, not quantified | Limitation note only |
| Crease relaxation (trim drift) | Moderate: degrees over minutes | Optional cosmetic |
| Humidity softening/curl | Moderate at extreme RH | Fix the model at 50 % RH; mention it |
| Grain direction | Moderate on stiffness, none on mass | Ignore in rigid model |
| Surface roughness | **Negligible** (§4) | Ignore |

## 4. Surface roughness and skin friction

- Paper roughness is measured as air leakage: Bendtsen in ml/min, Bekk in s, Parker Print-Surf (PPS) in µm. None of these is a profilometer Ra [S24]. 80 g/m² office papers measure **80–300 ml/min Bendtsen** [S7][S8][S9][S12]. Uncoated office paper is typically PPS ≈ 4–7 µm (unverified - model knowledge), so take an equivalent roughness height **k ≈ 5–10 µm**.
- **Laminar transition test.** Roughness trips a laminar boundary layer only when `Re_k = u_k·k/ν` reaches ~600 (Braslow & Knox; isolated elements 325–1000) [S27]. Using the free-stream U as an upper bound for u_k, with k = 10 µm and ν = 1.54×10⁻⁵ m²/s: Re_k ≤ 3.2 at 5 m/s and ≤ 13 at 20 m/s (derived). That is two orders of magnitude below critical.
- **Turbulent test.** Surfaces are hydraulically smooth for k_s⁺ < 5 and fully rough above ~60–70 [S25]. Schlichting's admissible roughness has the form `k_adm ≈ 100·ν/U` (a newer analysis argues for a 3× tighter bound) [S26]. That gives k_adm = 308 µm at 5 m/s and 77 µm at 20 m/s (derived), well above paper's ~10 µm.
- For scale, the Blasius laminar thickness `δ ≈ 5.0·x/√Re_x` is ≈ 2.8 mm at x = 0.1 m and 5 m/s (formula: unverified - model knowledge; value derived, Re_x = 3.25×10⁴). Paper roughness is ~0.4 % of that.
- **Conclusion: treat paper as aerodynamically smooth.** Use smooth flat-plate laminar friction, e.g. Blasius mean `C_f = 1.328/√Re_L` per wetted side for Re_L ≲ 5×10⁵ (unverified - model knowledge; the aero research note owns the final friction law).
- What does matter: **layer steps** (0.106 mm each), **blunt multi-layer leading edges** (0.4–0.9 mm for 4–8 layers), sharp folded edges that fix separation, and tape edges.

## 5. Official rules

### 5.1 Guinness World Records (GWR)

GWR does not publish its full guidelines; they are issued to applicants. Public statements:

| Item | Distance ("Farthest flight by a paper aircraft") | Duration ("Longest time flying a paper aircraft") |
|---|---|---|
| Paper | One sheet, maximum A4, ≤ 100 g/m² [S30][S31] | One sheet of A4, < 100 g/m² [S30]. "No larger than A4" [S40] |
| Modification | Folded only: no glue, tears or cuts [S31] | Reported: "can be cut but not spliced" [S40] (conflicts with [S31]; the categories may differ) |
| Tape | One small piece of clear tape, **25 mm × 30 mm** [S31] | Tape area ≤ **2.5 × 3 cm** [S40] |
| Venue | Indoors [S31]. Record page describes a plane with "clear recognisable wings" [S28] | Indoors in a "closed-air environment" [S30] |
| Launch | Hand throw from behind a line; a foot crossing the line disqualifies [S31]. **Run-up: no source found.** Footage of the 2012 and 2022 record throws shows the thrower taking a few steps before release (unverified - model knowledge), so do not code "no run-up" as a GWR rule | Hand launch. Record attempts throw nearly straight up (Blackburn: baseball-style throw [S47]) |
| Attempts | Not public | Toda's attempts followed GWR rules allowing **10 tries** [S49] |
| Timing/measuring | Not public. Published distance records are quoted to 0.01 m (69.14, 88.31, 98.43 m) or 0.001 m (77.134 m) [S28][S57] | One search summary of the GWR page says time is recorded to the nearest 0.01 s (not confirmed). The four GWR airtime records in §6 are all quoted to **0.1 s** (27.6, 27.9, 29.2, 31.2 s) [S29][S47][S48]; some pre-1998 records were quoted to 0.01 s, e.g. 16.89 s (unverified - model knowledge) |

Other GWR paper-plane titles require an "unmodified, flat, standard A4" sheet (fold-and-throw skills record) [S58].

### 5.2 Red Bull Paper Wings

Sources are the official rules page [S32] and the 2022 World Final rules [S33]. I found no 2025/2026 rulebook.

| Item | Rule |
|---|---|
| Paper | One piece of paper, **standard A4, "not more than 100 grams"** (meaning 100 g/m²; a 100 g/m² A4 sheet is 6.2 g). Must be built **on site from the provided official paper** [S32] |
| Modification | **Folding only**: no ripping, gluing, cutting, stapling or ballast [S33]. No tape |
| Launch | Thrown **unaided from behind a straight launch line**. Touching the line or beyond during launch makes the attempt invalid. **No run-up or fast walk; no ramps or devices** [S32] |
| Distance measurement | Measured from the **base point on the starting line** to the **first point where the plane hits the ground or any object**, by standard tape or laser/video [S32] |
| Airtime measurement | From the moment the plane **leaves the hand** to its **first contact with the ground or any object** [S32][S33]. One summary says results are counted in tenths of a second; published results use 0.01 s (e.g. the 14.86 s winning time, §6) [S33][S34] |
| Attempts | Two distance throws, best counts (secondary sources) [S55] |
| Venue | Indoors without wind. World Final at Hangar-7, Salzburg [S33] |
| Aerobatics | Judged on creativity, submitted as video [S33] |

**Implementation consequences.** (a) Distance is the straight-line ground distance from a fixed base point to the *first* touchdown, not where the plane slides to. (b) In airtime, **hitting a wall, the ceiling or a light ends the flight**, so indoor venues need collision volumes. (c) Neither body allows outdoor or wind-assisted flights.

## 6. Records

| Record | Value | Who | Where / when | Plane, paper, notes | Source |
|---|---|---|---|---|---|
| **Farthest flight (current)** | **98.43 m** (322 ft 11 in) | Liu Liwen (thrower), with Tang Shuai, Yang Shian, Huang Yizhou, Qiao Yuchen, Wang Chenghao (China) | Shanghai, 28 Dec 2025. Shanghai Automobile Exhibition Center, Jiading [S37] | New design named "Research". Record came on the 9th throw of the team's 3rd attempt day. Paper stock not published | [S28][S37][S38][S50] |
| Previous distance | 88.31 m (289 ft 9 in) | Dillon Ruble, with Nathaniel Erickson and Garrett Jensen (USA, Boeing engineers) | Crown Point, Indiana, 2 Dec 2022 | "Mach 5" (hypersonic-inspired, low-drag). A4 at **100 g/m²**. Launch ≈ 40°, 3rd throw, folding takes >20 min. GWR may list the value to the millimetre as 88.318 m (unverified - model knowledge); 289 ft 9 in = 88.32 m | [S28][S42][S43][S44] |
| Earlier distance | ≈ 77 m (77.134 m; 252 ft 7 in in one report) | Kim Kyu Tae, Shin Moo Joon, Chee Yie Jian | South Korea, Apr 2022 | – | [S57][S59] |
| Earlier distance | 69.14 m (226 ft 10 in) | Joe Ayoob (thrower); design by John M. Collins | McClellan AFB hangar, near Sacramento, 26 Feb 2012 | "Suzanne" glider, single uncut A4 sheet | [S45][S46] |
| Earlier distance | 63.19 m (2003, Stephen Krieger; spelled "Kreiger" in some reports); 58.82 m (May 1985, Tony Felch, first GWR distance record) | – | – | – | [S30] |
| **Longest time aloft (current)** | **31.2 s** | Tang Shuai, Yang Shian, Liu Liwen, Wang Chenghao, Rao Chongyi, Pan Zichen, Jia Siyi (China) | Kunshan Sports Center, Jiangsu, 11 Feb 2026 | Team brought its 10 best designs. Individual flights reported as 31.15–31.25 s. Design and paper not published | [S29][S39][S40] |
| Previous time | 29.2 s | Takuo Toda (Japan) | Fukuyama City, Hiroshima, 19 Dec 2010 | One secondary source names the design "Zero Fighter" (unconfirmed) | [S29][S41] |
| Earlier time | 27.9 s (2009, Toda, "Sky King"); 27.6 s (8 Oct 1998, Ken Blackburn, Georgia Dome, Atlanta) | – | – | Blackburn's "World Record Paper Airplane" glider, thrown straight up | [S47][S48] |
| Red Bull World Final 2022 | Distance **61.11 m**; airtime **14.86 s** (super final; 16.66 s qualifying is a Red Bull record, single-sourced) | Lazar Krstić (Serbia); Rana Muhammad Usman Saeed (Pakistan) | Hangar-7, Salzburg, May 2022 | A 57.07 m distance throw by Yicheng Sun (GB) is also reported, but his placing is unconfirmed (unverified): this note first called it the runner-up, while the URL of [S36] reads "yorkshire-student-comes-sixth", which may refer to him. Do not use it as a reference value | [S34][S35][S36] |

Other titles: GWR lists a "farthest distance to hit a target with a paper aircraft" record (Raman Suri, Cranfield University, 26 May 2026, ~20 m per one summary) [S56]. The largest-paper-aircraft title has passed from TU Braunschweig (2013) to a University of Pisa team (no size figure confirmed) [S30].

## 7. Finished dimensions and mass distribution of classic designs

Published measurements are scarce. The dart has been studied in water-tunnel and LES work by Ng, Kng, Pey & Schlüter (AIAA 2009-3958) and Schlüter (Proc. IMechE G 228(4):567–576, 2014). They found that its high-sweep delta gives high C_L at low Re and that the centre fold (keel) improves performance [S51][S52]. A CFD study reports the dart's "aspect ratio" as 0.5408 [S53]. That number matches **span / overall length (b/L)**, not b²/S. For a pure delta whose root chord is the overall length, b²/S = 2·b/L, which gives ≈ 1.1. Thin-plate glider studies find an optimum centre-of-mass position and maximum glide ratios of ~3–4 [S54].

**Derived A4 classic dart geometry** (my fold computation, for validating the engine's mass and CG code). Steps: (1) top corners to the centre line; (2) new slanted edges to the centre line (22.5° fold lines); (3) fold in half; (4) wing folds parallel to the keel at keel depth k = 25 mm.

| Quantity | A4 (210×297) | Letter (215.9×279.4) |
|---|---|---|
| Length | 297 mm | 279.4 mm |
| Span b (flat wings) | 160 mm | 166 mm |
| Wing root chord at fold / tip chord | 236.6 / 43.5 mm | 219.0 / 18.8 mm |
| Wing area S (both wings) | 0.0224 m² | 0.0197 m² |
| Aspect ratio b²/S (span / overall length b/L) | 1.14 (0.54) | 1.40 (0.59) |
| Mass at 80 g/m² | 4.990 g | 4.826 g |
| Wing loading W/S | 2.18 N/m² | 2.40 N/m² |
| **CG aft of nose** (nose folds only; later folds are parallel to the axis) | **159.8 mm = 53.8 % L** | **152.4 mm = 54.6 % L** |
| Wing MAC / quarter-MAC aft of nose | 162 mm / 175 mm | 147 mm / 169 mm |

The CG sits 15.5 mm (9.5 % MAC) ahead of the quarter-MAC point on A4 and 16.7 mm (11.4 % MAC) on Letter (derived). Low-AR delta wings have their aerodynamic centre aft of quarter-MAC, so the dart is statically stable (unverified - model knowledge). Glide-speed check: `V = √(2(W/S)/(ρ·C_L))` = 2.7 m/s at C_L = 0.5 (A4). Re on the A4 MAC is 2.9×10⁴ at 2.7 m/s and 8.4×10⁴ at 8 m/s (derived). This matches the planned Re range. Dimensions for "Suzanne", "Mach 5" and "Research" are not published online; they are in Collins's book, or not public.

## 8. RECOMMENDED APP CONSTANTS

**Material (single paper for everything)**

| Constant | Value | Basis |
|---|---|---|
| `PAPER_GRAMMAGE` | 0.080 kg/m² | §2 |
| `PAPER_THICKNESS` | 1.06×10⁻⁴ m (0.106 mm) | median data sheet [S7][S10] |
| `PAPER_DENSITY` | 755 kg/m³ | derived |
| `PAPER_D_MD` / `PAPER_D_CD` | 3.7×10⁻⁴ / 1.8×10⁻⁴ N·m (±30 %) | derived from [S7] |
| `PAPER_E_BEND_MD` / `_CD` | 3.7 / 1.9 GPa | derived |
| `PAPER_ROUGHNESS_K` | 1×10⁻⁵ m (treated as smooth) | §4 |
| `LAYER_GAP_RENDER` | = thickness per layer | geometric |
| `TAPE_PIECE` (optional, GWR only) | 25 × 30 mm | [S31][S40] |
| `AIR_STD` (ISO 187: 23 °C, 50 % RH; 101.325 kPa is an app choice, since ISO 187 fixes temperature and humidity only (unverified - model knowledge)) | ρ = 1.19 kg/m³ (dry air 1.192, at 50 % RH 1.186), μ = 1.83×10⁻⁵ Pa·s, ν = μ/ρ = 1.54×10⁻⁵ m²/s. Compute ν from μ and ρ in code; do not store a third rounded constant | [S13]; ideal gas + Sutherland (derived) |

**Paper sizes** (portrait w × h; mass = 0.080 × w × h)

| Key | Name | w mm | h mm | Mass g |
|---|---|---|---|---|
| `A3` | ISO A3 | 297 | 420 | 9.979 |
| `A4` | ISO A4 (**default, official**) | 210 | 297 | **4.990** |
| `A5` | ISO A5 | 148 | 210 | 2.486 |
| `A6` | ISO A6 | 105 | 148 | 1.243 |
| `B5` | ISO B5 | 176 | 250 | 3.520 |
| `LETTER` | US Letter | 215.9 | 279.4 | 4.826 |
| `LEGAL` | US Legal | 215.9 | 355.6 | 6.142 |
| `TABLOID` | Tabloid/Ledger | 279.4 | 431.8 | 9.652 |
| `HALF_LETTER` | Half-letter | 139.7 | 215.9 | 2.413 |
| `SQ150` | Origami 150 | 150 | 150 | 1.800 |
| `SQ210` | Origami 210 | 210 | 210 | 3.528 |

**Leaderboard categories ("official" = record-rule compatible)**

| Category | Paper / build | Launch | Environment | Score | Basis |
|---|---|---|---|---|---|
| **GWR Distance** | A4, one sheet, folds only, no cuts; optional one 25×30 mm tape | Hand throw from behind line; line foul voids attempt. Run-up is not confirmed either way for GWR (§5.1), so treat it as a launch-speed preset, not a rule | Indoor hangar, still air, ISO 187 air | Ground distance from base point to first contact with ground or any object, 0.01 m (first-touch convention assumed from Red Bull wording). Best of N | [S28][S31][S32] |
| **GWR Airtime** | A4, one sheet, ≤ 1 tape piece | Hand throw (any angle) | Indoor tall arena, still air; walls and ceiling are colliders | Release to first contact with ground or any object. Store 0.01 s; compare and show at 0.1 s on this board, because the GWR reference values since 1998 are quoted to 0.1 s (§5.1; GWR's timing and rounding rule is not public) | [S29][S30][S40] |
| **Paper Wings Distance** | A4 "official paper", folding only, **no tape** | As above; no run-up, no devices | Indoor, no wind | As GWR Distance. Best of 2 | [S32][S33][S55] |
| **Paper Wings Airtime** | Same | Same | Same | As GWR Airtime | [S32][S33] |
| **Design Benchmark** (app-defined) | Any size | Fixed robot launch: e.g. release height 1.8 m and speeds 5/10/20 m/s, with the best pitch angle chosen automatically | Indoor still air | Distance and time. Ranks designs independent of thrower skill | app choice (unverified - model knowledge for human throw speeds) |
| **Open / Outdoor** (unofficial) | Any size/colour | Free | Outdoor wind/gust presets (seeded) | Distance/time, tagged with seed and wind | Neither GWR nor Red Bull allows outdoor flights [S30][S33] |

Leaderboard entries should store paper size, grammage, tape used (yes/no), environment preset and seed, launch parameters and app physics version, so results stay comparable.

## Open questions and limits

- **Blocked fetches.** Full GWR guideline text and the current (2025/26) Red Bull rulebook could not be read. GWR's distance-versus-duration rules on cutting conflict between sources [S31][S40]. Timing resolution (0.1 s vs 0.01 s) is unconfirmed.
- The paper stock, folding and dimensions of the 98.43 m "Research" plane and the 31.2 s plane are not published.
- The L&W-to-D conversion assumes a 10 mm bending length (§3.1). Stiffness is ±30 % across brands, and grain direction of cut sheets is assumed long-grain.
- No copy-paper-specific numbers for the humidity-modulus slope or the crease log-rate. Farain's units are unconfirmed [S19].
- The dart CG and geometry are my derivation (§7), not a published measurement; keel depth k is a free design choice.
- Human launch speeds for distance and airtime throws were outside this note's scope and are needed for the Design Benchmark presets.
- The rigid-body model ignores wing flex and flutter, the largest physical omission (§3.2).

## Sources

All were confirmed via search-result text; direct page fetches were blocked by the network policy (see note at top).

1. [S1] M. Kuhn, "International standard paper sizes" (ISO 216 summary, tolerances). https://www.cl.cam.ac.uk/~mgk25/iso-paper.html
2. [S2] papersizes.org, "Dimensions of A series paper sizes". https://papersizes.org/a-paper-sizes.htm
3. [S3] Wikipedia, "ANSI/ASME Y14.1". https://en.wikipedia.org/wiki/ANSI/ASME_Y14.1
4. [S4] Designing Buildings Wiki, "North American paper sizes". https://www.designingbuildings.co.uk/wiki/North_American_Paper_Sizes
5. [S5] PrintWiki, "Grammage". https://printwiki.org/Grammage
6. [S6] papersizes.org, "US to UK & International paper weights". https://www.papersizes.org/us-international-weights.htm
7. [S7] Lomax, 80 g/m² copy paper technical data sheet. https://cdn.lomax.dk/image/upload/dokumenter/1515200_4.pdf
8. [S8] Navigator Organizer brand datasheet. https://pim.igepa.nl/Office/Kopieerpapier/Multifunctioneel/Navigator/Navigator%20Organizer%20Brand%20Datasheet.pdf
9. [S9] International Paper "IP Basic" 80 g/m² data sheet (Conrad). https://asset.conrad.com/media10/add/160267/c1/-/en/000885055DS01/tehnicni-podatki-885055-papir-za-brizgalnelaserske-tiskalnikekopirnike-ip-basic-din-a4-80-gm2-500-listov-88070920-international-paper.pdf
10. [S10] Xerox Business A4 80 g/m² product data (Icecat). https://icecat.fr/p/xerox/003r91895/papiers-jet-d-encre-Business+A4+80g-m-+White+5x500+Sheets-802495.html
11. [S11] Antalis, Explorer iPerformance. https://www.paper.co.uk/products/office-printing-copier/explorer-iperformance/
12. [S12] Lomax office-paper grade datasheets. https://cdn.lomax.dk/image/upload/dokumenter/70232740_1.pdf and https://cdn.lomax.dk/image/upload/dokumenter/70232760_1.pdf
13. [S13] ISO 187:2022 / ISO 187:1990, paper conditioning atmosphere. https://iteh.eu/catalog/standards/iso/341979c1-78e8-4823-a546-6abcc265fd41/iso-187-2022 ; https://webstore.ansi.org/preview-pages/ISO/preview_ISO+187-1990.pdf
14. [S14] Holmen Iggesund, "General technical information" (ISO 2493-1 bending resistance in mN; ISO 5628 bending stiffness in mN·m). https://www.iggesund.com/insights/paperboard-know-how/general-technical-information/
15. [S15] KTU study on paperboard MD/CD properties. https://epubl.ktu.edu/object/elaba:3062177/3062177.pdf
16. [S16] "Regulating the deformation properties of paper by varying the degree of its anisotropy" (Forestry Journal, NArFU). https://cyberleninka.ru/article/n/regulating-the-deformation-properties-of-paper-by-varying-the-degree-of-its-anisotropy
17. [S17] A. Benusiglio, V. Mansard, A.-L. Biance, L. Bocquet, "The anatomy of a crease, from folding to ironing", Soft Matter 8, 3342 (2012), doi:10.1039/C2SM07151G. https://pubs.rsc.org/en/content/articlelanding/2012/sm/c2sm07151g
18. [S18] B. Thiria, M. Adda-Bedia, "Relaxation mechanisms in the unfolding of thin sheets", Phys. Rev. Lett. 107, 025506 (2011). https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.107.025506
19. [S19] K. Farain, "A relaxation constant in the folding of thin viscoelastic sheets", arXiv:1905.09220; Phys. Rev. Applied 13, 014031 (2020). https://arxiv.org/pdf/1905.09220
20. [S20] Nagasawa et al., "Effect of bending velocity on time-dependent release behavior of creased white-coated paperboard", Mech. Eng. J. (2016). https://doaj.org/article/0b63e666ceb14103ae8c0e1bc1a801f7
21. [S21] "The combined effects of moisture and temperature on the mechanical response of paper" (Salmén–Back relation). https://typeset.io/pdf/the-combined-effects-of-moisture-and-temperature-on-the-35mg21ny8c.pdf
22. [S22] Cellulose (2021), AFM study of paper fibres versus RH, doi:10.1007/s10570-021-04355-y. https://link.springer.com/article/10.1007/s10570-021-04355-y
23. [S23] FRC Symposium 1985, "Influence of temperature and humidity on the elastic and expansional properties of paper and the constituent fibre". https://bioresources.cnr.ncsu.edu/resources/influence-of-temperature-and-humidity-on-the-elastic-and-expansional-properties-of-paper-and-the-constituent-fibre/
24. [S24] Roughness methods (PPS µm, Bendtsen ml/min, Bekk s): UPC/TAPPI article https://www.cd6.upc.edu/content/cd6_upload/contribucions/2012013009375014873999294f2656de69333.pdf ; Smithers https://www.smithers.com/industries/packaging/manufacturers-and-users/packaging-materials-testing/paper-testing-surface-properties/roughness-and-smoothness
25. [S25] "Modulation of near-wall turbulence in the transitionally rough regime" (Nikuradse k_s⁺ thresholds), arXiv:1808.10825. https://arxiv.org/pdf/1808.10825
26. [S26] arXiv:1810.05743 (flat-plate friction; admissible roughness vs Schlichting). https://arxiv.org/abs/1810.05743v1
27. [S27] arXiv:2107.14674 (cites Braslow & Knox, Re_k ≥ 600). https://arxiv.org/pdf/2107.14674
28. [S28] Guinness World Records, "Farthest flight by a paper aircraft". https://www.guinnessworldrecords.com/world-records/farthest-flight-by-a-paper-aircraft
29. [S29] Guinness World Records, "Longest time flying a paper aircraft". https://www.guinnessworldrecords.com/world-records/longest-time-flying-a-paper-aircraft
30. [S30] Guinness World Records news (May 2026), "Evolution of the paper plane flight and how far it's actually possible to throw one". https://www.guinnessworldrecords.com/news/2026/5/evolution-of-the-paper-plane-flight-and-how-far-its-actually-possible-to-throw-one
31. [S31] Fold 'N Fly, "World record paper airplanes" (GWR rules summary). https://www.foldnfly.com/lounge/world-record-paper-airplanes.php
32. [S32] Red Bull Paper Wings, "Rules". https://paperwings.redbull.com/us-en/rules.html
33. [S33] Red Bull, "Paper Wings World Final 2022 – Rules". https://www.redbull.com/int-en/event-series/red-bull-paper-wings/red-bull-paper-wings-world-final-rules
34. [S34] Red Bull, "Red Bull Paper Wings World Final 2022: Results". https://www.redbull.com/int-en/red-bull-paper-wings-world-final-results
35. [S35] CGTN (2022), "Man throws paper plane 61m at World Finals". https://news.cgtn.com/news/2022-05-18/Man-throws-paper-plane-61m-at-World-Finals-1a8dn38mS64/index.html
36. [S36] Yorkshire Post (2022), Red Bull Paper Wings final coverage. https://www.yorkshirepost.co.uk/news/people/red-bull-paper-wings-yorkshire-student-comes-sixth-in-worlds-biggest-paper-plane-throwing-competition-3694446
37. [S37] AFPBB News (2026), 98.43 m record. https://www.afpbb.com/articles/-/3618713
38. [S38] Shanghai Daily via City News Service (2026). https://www.citynewsservice.cn/articles/shanghaidaily/news/chinese-teens-set-paper-plane-world-record-nearing-100-meters-png9o7pm
39. [S39] Oddity Central (2026), "Teen paper plane enthusiasts break 2 long-standing world records". https://www.odditycentral.com/news/teen-paper-plane-enthusiasts-break-2-long-standing-world-records-in-under-two-months.html
40. [S40] Ratopati (2026), "Chinese teenagers shatter 15-year-old world record". https://english.ratopati.com/story/49683/chinese-teens-set-world-record-by-flying-paper-planes-breaking-15-year-old-record
41. [S41] HK01 (2026), report citing Toda's 29.2 s record of Dec 2010. https://global.hk01.com/大国小事/60322098/31-22秒-上海19岁少年有望再创纸飞机滞空时间健力士世界纪录
42. [S42] CNN (14 Apr 2023), Boeing engineers' paper airplane record. https://amp.cnn.com/cnn/2023/04/14/world/paper-airplane-boeing-engineers-world-record-scn
43. [S43] Flying magazine, "Boeing engineers set new distance record with paper airplane". https://flyingmag.com/boeing-engineers-set-new-distance-record-with-paper-airplane
44. [S44] Business Insider India (2023), Jensen quote on A4, 100 g/m². https://businessinsider.in/tech/news/boeing-engineers-designed-a-paper-airplane-that-flew-almost-the-entire-length-of-a-football-field-smashing-the-world-record/amp_articleshow/99521282.cms
45. [S45] Mental Floss, "The perfect paper airplane" (Collins, Ayoob, Suzanne). https://www.mentalfloss.com/article/54488/perfect-paper-airplane
46. [S46] Ingeniøren (2012), Ayoob/Collins record. https://ing.dk/artikel/tidligere-quarterback-saetter-verdensrekord-papirfly
47. [S47] Wikipedia, "Ken Blackburn (aeronautical engineer)". https://en.wikipedia.org/wiki/Ken_Blackburn_(aeronautical_engineer)
48. [S48] Japan Times (17 May 2009), "New flight record for paper plane set". https://www.japantimes.co.jp/news/2009/05/17/national/new-flight-record-for-paper-plane-set/
49. [S49] Reuters/Screenocean (2010), Toda record attempt (10 tries). https://reuters.screenocean.com/record/467151
50. [S50] Wikipedia, "National Paper Airplane Day" (records summary). https://en.wikipedia.org/wiki/National_Paper_Airplane_Day
51. [S51] J. U. Schlüter, "Aerodynamic study of the dart paper airplane for micro air vehicle application", Proc. IMechE G 228(4):567–576 (2014), doi:10.1177/0954410013476778. https://journals.sagepub.com/doi/10.1177/0954410013476778
52. [S52] B. F. Ng, Q. M. Kng, Y. Y. Pey, J. Schlüter, "On the aerodynamics of paper airplanes", AIAA 2009-3958. https://lactea.ufpr.br/wp-content/uploads/2018/08/On_the_Aerodynamics_of_Paper_Airplanes.pdf
53. [S53] "CFD analysis on dart paper plane", Jurnal Mekanikal (UTM). https://jurnalmekanikal.utm.my/index.php/jurnalmekanikal/article/view/550
54. [S54] "Centre of mass location, flight modes, stability and dynamic modelling of gliders", J. Fluid Mech. https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/centre-of-mass-location-flight-modes-stability-and-dynamic-modelling-of-gliders/D4983A693B836A364D19C95B4D5FFC3B
55. [S55] Kentucky Kernel, "Red Bull hosts paper plane contest" (two distance throws, best counts). https://kykernel.com/6170/news/red-bull-hosts-paper-plane-contest/
56. [S56] Guinness World Records, "Farthest distance to hit a target with a paper aircraft". https://www.guinnessworldrecords.com/world-records/425597-farthest-distance-to-hit-a-target-with-a-paper-aircraft
57. [S57] WFAE/NPR (20 May 2022), Korean–Malaysian team record. https://www.wfae.org/2022-05-20/paper-airplane-enthusiasts-break-record-for-farthest-flight-by-a-paper-aircraft
58. [S58] DSAuk, "GWR individual record – fold and throw paper planes" (unmodified flat standard A4). https://dsauk.org/guinness-world-records-challenge/gwr-individual-record-paper-plane
59. [S59] Yahoo News (2023), "Engineers break record for farthest paper airplane flight" (prior mark 252 ft 7 in). https://news.yahoo.com/engineers-break-record-farthest-paper-203009388.html

## Verification notes

Fact-check pass, 2026-11-09.

**Method and its limit.** This pass had **no web access**. The turn's WebSearch budget was already spent (no query ran), and WebFetch failed with a DNS error for every host tried: guinnessworldrecords.com, foldnfly.com, paperwings.redbull.com, arxiv.org and cdn.lomax.dk. So **no source was opened, and no citation was confirmed, corrected or removed**. Every [S..] tag still rests on the author's search-result text. What was done instead: (a) every derived number was recomputed independently with a throwaway script; (b) the dart fold sequence was traced numerically (polygon clip-and-reflect, all layers, both sides); (c) formulas were re-derived and checked for units and limiting cases; (d) standards and pre-2023 records were compared with model knowledge, which is not evidence.

**Checked, no change needed**

| # | Claim | How checked | Result |
|---|---|---|---|
| 1 | Sheet sizes, areas, aspect ratios, masses at 80 g/m² (§1, §8) | Recomputed all 11 rows; ISO 216 / ANSI values match model knowledge | All correct to the digits shown |
| 2 | 1 lb bond = 3.7597 g/m² (§2) | 453.59237 g / (500 × 0.4318 m × 0.5588 m) | 3.75973. Correct |
| 3 | ρ = 755 kg/m³; calipers and sheet masses in the grade table (§2) | Recomputed | Correct (754.7; 99.6 / 119.5 / 132.5 µm) |
| 4 | `D = F·l²/(3·θ·b)` and D_MD, D_CD, E_b (§3.1) | Re-derived from the cantilever F = 3·EI·δ/l³ with θ = δ/l. Identical to the L&W form S_b = 60·F·l²/(π·α°·b). ISO 2493 geometry of 15°, 38 mm, and 50 mm or 10 mm matches model knowledge | 3.69×10⁻⁴ / 1.84×10⁻⁴ N·m; 3.71 / 1.86 GPa; l = 50 mm gives 92.8 GPa. Correct |
| 5 | Elasto-gravity length 61–78 mm (§3.2) | (D/(G·g))^(1/3) | 61.7 / 77.7 mm. Correct. At L = L_eg the self-weight tip sag is exactly L/8 |
| 6 | Launch load factor, q = 238 Pa, ≈ 1.1 g per 0.01 C_L (§3.2) | Recomputed | 1.09 g per 0.01 C_L. Correct |
| 7 | Re_k and k_adm numbers (§4) | Recomputed | Correct; last digits adjusted for ν (see below) |
| 8 | Dart fold sequence and every row of the §7 table, A4 and Letter | Numerical fold trace. Fold 1 runs from the top-edge midpoint to (±w/2, w/2) on the side edges. Fold 2 runs from the nose to (±w/2, 1.2071·w) on the side edges: y = 253.5 mm (A4), 260.6 mm (Letter), both ahead of the tail. The old corner lands on the centre line at y = 0.7071·w. Area is conserved and the CG stays on the centre line | Length, span, chords, S, AR, W/S, CG (159.81 mm / 152.41 mm), MAC and quarter-MAC all reproduce |
| 9 | ft/in equivalents of the records (§6) | Converted | 98.43 m = 322 ft 11 in; 69.14 m = 226 ft 10 in; 252 ft 7 in = 76.99 m ≠ 77.134 m, as the note already says |
| 10 | Pre-2023 records and 2022 Red Bull winners (§6) | Compared with model knowledge only | 69.14 m, 77.134 m, 88.31 m, 29.2 s, 27.9 s, 27.6 s, 61.11 m and 14.86 s agree. Not evidence |

**Changed, and why**

1. **"No run-up" was applied to GWR without a source** (summary item 6, §8 GWR Distance). The note's own §5.1 table has no GWR run-up rule, and footage of record throws shows a few approach steps (model knowledge). Now stated as a Red Bull rule only; §5.1 launch row says so.
2. **GWR airtime resolution of 0.01 s was coded into §8 on one unconfirmed summary.** The four GWR airtime records in §6 are all quoted to 0.1 s, so the reference values cannot support a 0.01 s comparison. §5.1 and §8 now say: store 0.01 s, compare and show at 0.1 s on the GWR-style board. GWR's actual timing rule is still unknown.
3. **Summary item 6 presented Red Bull's measuring wording as the rule of both bodies.** It is now attributed to Red Bull, with the GWR use marked as an assumption.
4. **Cantilever table (§3.2).** Five of the six entries exceeded the stated validity δ/L ≲ 0.1 but only two were flagged. The 1 g and 5 g rows also used the gross wing loading as the bending load. A panel's own inertia relieves it, so the net load is n·(W/S − G·g) = 1.4·n N/m². Rows recomputed and flagged. The conclusion (single-layer panels flex a lot) is unchanged.
5. **§7 label "b/c_root" was wrong.** 0.54 is span over overall length (160/297). Span over the root chord at the wing fold is 0.68. Label and the sentence about [S53] corrected.
6. **Air constants (§8).** ρ, μ and ν were three separately rounded values that do not multiply out (1.19 × 1.53×10⁻⁵ ≠ 1.83×10⁻⁵). ν is now 1.54×10⁻⁵ m²/s (μ/ρ, also the 50 % RH value), with an instruction to compute it in code. 101.325 kPa is labelled an app choice, because ISO 187 fixes temperature and humidity only (model knowledge). Dependent digits in §4 and §7 follow: Re_k 3.2, k_adm 308 µm, Blasius δ 2.8 mm (was 2.7), Re 8.4×10⁴ (was 8.5×10⁴).
7. **"Within 6 % of US 20 lb"** was 6.4 %. Reworded.
8. **Red Bull runner-up (§6).** The 57.07 m / Yicheng Sun "runner-up" claim conflicts with the URL of its own source [S36] ("comes sixth"). Now marked unverified.
9. **Red Bull timing example "14.06 s" (§5.2)** matched no result elsewhere in the note. Replaced with the 14.86 s winning time.
10. **88.31 m (§6).** Added that GWR may list 88.318 m (model knowledge, unverified).
11. Letter static-margin figure added next to the A4 one in §7 (16.7 mm, 11.4 % MAC).

**Still uncertain**

- **All 59 citations are unopened.** The 2025/26 records (98.43 m, 31.2 s, team names, venues), the target-accuracy record, the GWR May 2026 news item and the Red Bull rule wording could not be checked in any way in this pass. Check [S28], [S29], [S32] and [S33] by hand before the leaderboard reference values ship.
- **GWR rules:** run-up, cutting, measuring method, timing resolution and whether US Letter is accepted alongside A4 (model knowledge says it was, historically) all remain unconfirmed.
- **Stiffness.** D comes from a 15° / 10 mm bending-resistance test, and the 10 mm length is assumed, not read from the data sheet. Typical copy-paper tensile moduli (4–7 GPa MD, model knowledge) would give D_MD = E·t³/12 ≈ 4–7×10⁻⁴ N·m, so the true small-strain stiffness may sit above the ±30 % band. None of this enters the rigid-body model.
- **Dart recipe limit.** The §7 closed-form geometry needs h ≥ 1.207·w, so that the 22.5° fold meets the side edge. On the two square sizes it leaves through the tail edge instead. The engine must take the geometry from the fold trace, not from these formulas.
- **Literature details not re-checked:** Farain's constants and units [S19], whether Thiria & Adda-Bedia tested paper as well as Mylar [S18], the humidity findings [S17][S21][S22], the glide ratio of 3–4 [S54], the 0.5408 figure [S53], and the arXiv identifiers of [S25]–[S27].
