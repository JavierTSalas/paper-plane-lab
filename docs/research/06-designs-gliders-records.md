# 06: Glider and record designs as fold sequences

Scope: machine-codable simple-fold sequences for (a) the Nakamura Lock, (b) a square-nose basic glider, (c) "Suzanne" (Collins), (d) "Sky King" (Toda), and (e) a leading-edge-roll flying wing. Each comes with 3D shaping, trim, throw, and computed mass properties.

> **Research conditions (read first).** In this session WebFetch could not resolve any of the key hosts (foldnfly.com, wikipedia.org, guinnessworldrecords.jp, all DNS-blocked), and the shared WebSearch budget ran out early. So every web source below was checked **through search-result content only**; no page was opened directly. The facts about designers, records and individual steps are tagged with the search-confirmed URL. The step **geometry** was derived by me and then **verified by computation**, tagged **[C]**. A scratch flat-fold engine split and reflected convex facets for every step and checked that area was conserved, that the result was left-right symmetric, and that each landmark landed where claimed; CG, MAC and wing area came from 0.5 mm rasterisation. Wherever no source fixes a number, the number is a parameter with a default, tagged (unverified - model knowledge). For records, also see the sibling docs `02-flight-dynamics-validation.md` [D02] and `04-paper-and-competition-rules.md` [D04], which hold fuller, independently sourced record tables.

## Summary for implementers

1. **Nakamura Lock (NL)** is fully representable with simple folds: 1 crease + 6 folds + 3D shaping. The only free parameter is the lock gap `g` (tip-to-bottom distance after the nose fold). Default `g = W/8`; sources give 0.5–1 in (13–25 mm) [S3][S2]. Fold lines: `y_f = (H+g)/2`, `y_c = y_f − W/2`. The lock apex always lands at **y = H − W**, whatever `g` is. This makes a good unit test [C].
2. The NL flaps and lock go **outside**: the centre fold is a MOUNTAIN fold [S1][S2]. The wings get a shallow "Y" [S1]. Computed A4 values at 80 g/m²: length 161.6 mm, span 166 mm, S = 168 cm², flat-fold CG **80.4 mm aft of the nose (50 % L)**, static margin about **0 % MAC** (+0.2 %) against the quarter-MAC point [C] (section 6 gives the frame). That margin is neutral, which makes NL the best **validation target** for the centre-of-pressure model.
3. **Square-nose basic glider (SNB):** I could not reach any canonical "The Basic" diagram. I define it as corners-to-centre → triangle down (square nose) → `n` extra nose roll-folds (default 2) → parallel wing creases. With a rectangular planform the CG sits at 28–29 % chord [C]. It only trims at moderate-to-high α through flat-plate CP travel, so it flies as a slow "mushing" glider.
4. **Suzanne** (Collins; 69.14 m, 26 Feb 2012) [S8][S9]: I could **not** retrieve Collins's step list. Reported fragments (secondary sources only, low confidence): 100 g/m² A4, 1–2 mm gaps at the centre-line folds, a wing crease starting ≈ 3 mm off the keel at the nose [S11], and a "Y" rather than a "T" in front view [S13]. Ship it as **"SZ-proxy" (Suzanne-class)**: a Nakamura-family sequence with those features. Do not label it "Suzanne" until the official diagram has been checked. From memory, the real Suzanne starts with two diagonal edge-to-edge creases, not a centre-crease dart start, and has no lock (unverified - model knowledge); if so, the proxy copies its trim features but not its fold family.
5. **Sky King** (Toda; 27.9 s, 11 Apr 2009) [S15][S16]: no step list retrieved. Toda's origami planes usually need reverse folds (unverified - model knowledge), so the real design is **NOT REPRESENTABLE as verified**. Use **"SK-proxy"**: a Nakamura family plane with long wings, big dihedral and winglets. The real plane is ≈ 10 cm long [S16 via D02], so default to A6 or A5 paper.
6. **Leading-edge-roll flying wing (FW)** is LANDSCAPE: `k` roll folds of width `a` plus V-dihedral and reflex. On A4 with `a = W/8, k = 4`: chord 105 mm, AR 2.5, CG at 31 % chord [C]. Being tailless, it **needs reflex** (trailing edge up 10°).
7. All five reduce to one data schema (section 0). Each step is `CREASE | FOLD | FLIP` with a line, a mover point, a sense and a layer scope, followed by a `SHAPE3D` block (keel, wing creases, winglets, dihedral, elevator).

---

## 0. Conventions and step grammar

**Frame.** The sheet starts in portrait: `x ∈ [0, W]` along the short side, `y ∈ [0, H]` along the long side, origin at the bottom-left, nose at the top (`y = H`), front (coloured) face toward the viewer (+z). A4: `W = 210, H = 297` mm. Letter: `W = 215.9, H = 279.4` mm. **Landscape designs** (only FW here) say so and use `x ∈ [0, H]` (span) and `y ∈ [0, W]` (chord), with the leading edge at `y = W`.

**Step types.**
```
CREASE  line(P1,P2)                       # fold all layers, then unfold; leaves a crease line
FOLD    line(P1,P2), mover=Pm, sense=VALLEY|MOUNTAIN, scope=ALL|TOP
        # points on the Pm side of the line are reflected across it.
        # VALLEY: the moving part ends on the viewer side (on top). MOUNTAIN: it ends behind.
        # ALL: every layer the line cuts on the mover side moves.
        # TOP: only the uppermost connected flap at Pm moves (identify it by the step tag that created it).
FLIP    turn over left-right: x -> W - x (or the current outline width), front <-> back
SHAPE3D keel(sense), wingCrease{L,R}(P1,P2), winglet{L,R}(P1,P2, angle),
        dihedral Γ (deg, each side), elevator{chord c_e, span range, δ_e}
```
- **Landmarks** are listed alongside each fold for the folding animation and for checking. "A onto B" means the line is the perpendicular bisector of AB. "Edge E onto line L" means the line is the angle bisector of E and L.
- **Coordinates** are in the *current flat outline*. For these designs the flat model never moves or flips before SHAPE3D, so the current coordinates equal the sheet coordinates of the stationary layer.
- **Checks run on every sequence [C]:** total facet area = W·H. CG x = W/2, which proves symmetry. For `scope=ALL` folds, both endpoints of the fold line lie on the current model outline. For `scope=TOP` folds (N7, Z7) they lie on the outline of the *moving flap*, in the interior of the model, so do not assert the model-outline test there. Landmark images land as stated.
- **SHAPE3D crease senses, seen from the front face (derived):** with a MOUNTAIN keel the wing creases are VALLEY and creases for up-turned winglets are MOUNTAIN. The front face ends up as the fuselage outside and the wing underside. FW has no keel and its front face is the top surface, so its dihedral, tip-fin and reflex creases are all VALLEY.

---

## 1. (a) Nakamura Lock (NL)

| Item | Value |
|---|---|
| Designer | Eiji Nakamura, per most sources. A few pages give "Akio" or "Takuo" [S5]; treat those as errors (unverified). Date: not confirmed. Nakamura's English-language book *Flying Origami* is from 1972, so the design is probably 1970s or earlier, not 1980s (unverified - model knowledge) |
| Known for | A stable, durable "flat/blunt nose that won't crumple" glider that is easy to fold [S5]. The name comes from the small triangle that locks the corner flaps [S1][S6] |
| Family | Dart start, then nose-down fold, corners again, lock. SZ-proxy and SK-proxy are parameter variants of this family |
| Throw | "Gentle, level push" [S5]. If the nose rises and stalls, bend the trailing edges down a little [S5] |

**Parameter.** `g` is the distance from the nose-flap tip to the bottom edge after N4. Sources: "about 1 inch" [S3]. Another classroom PDF says ½ inch and "don't let the point touch the bottom" (search snippet only; I could not identify which page it came from). One guide folds "to meet the bottom edge" [S4], which is the degenerate `g = 0` case. The Matthews sheet pre-creases "about one inch of the tip" [S2]. **Default `g = W/8`** (26.25 mm A4, 27.0 mm Letter). Allowed range: `0 < g < H − W` (A4 < 87 mm), because at `g = H − W` the lock disappears.
Derived: `y_f = (H+g)/2`, `y_c = y_f − W/2`, lock height `s = (H − W − g)/2`.
A4: `y_f = 161.625`, `y_c = 56.625`, `s = 30.375` mm. Letter: `y_f = 153.19`, `y_c = 45.24`, `s = 18.26` mm.

| # | Op | Line P1 → P2 | Mover | Sense / scope | Landmark | A4 numbers (mm) |
|---|---|---|---|---|---|---|
| N1 | CREASE | (W/2, 0) → (W/2, H) | – | valley crease | long centre line | x = 105 |
| N2 | FOLD | (W/2, H) → (0, H − W/2) | (0, H) | VALLEY / ALL | left top edge onto centre crease (45°) | (105,297)→(0,192) |
| N3 | FOLD | (W/2, H) → (W, H − W/2) | (W, H) | VALLEY / ALL | mirror of N2 | (105,297)→(210,192) |
| N4 | FOLD | (0, y_f) → (W, y_f) | (W/2, H) | VALLEY / ALL | nose point (W/2, H) onto (W/2, g). Line lies `s` below the triangle base, so a full-width band folds down too | y = 161.625; tip lands at (105, 26.25) |
| N5 | FOLD | (W/2, y_f) → (0, y_c) | (0, y_f) | VALLEY / ALL | new top edge (left half) onto centre crease. The corner lands at (W/2, y_c), "about two-thirds down" | (105,161.6)→(0,56.6) |
| N6 | FOLD | (W/2, y_f) → (W, y_c) | (W, y_f) | VALLEY / ALL | mirror of N5 | (105,161.6)→(210,56.6) |
| N7 | FOLD (lock) | (W/2 − s, y_c) → (W/2 + s, y_c) | (W/2, g) | VALLEY / **TOP** (N4 flap only) | fold the exposed small triangle up along the lower edge of the N5/N6 flaps; it holds them [S1][S6]. Its apex lands at (W/2, **H − W**) | line y = 56.625, x 74.6–135.4; apex lands at (105, 87) |

**Self-check [C].** After N4 the step-2 flaps lie under the N4 flap (they were folded with it). After N5/N6 each folded flap is the right triangle (W/2, y_f), (W/2, y_c), (0, y_c), so its lower edge is horizontal at `y_c`. Below `y_c` only the base layer and the N4 tip remain, so N7 is a legal TOP-flap simple fold. The N7 mover is **two layers thick**: the N4 main layer plus the N2/N3 corner-flap halves under it (3 facets, 1845 mm² of paper on A4). The "N4 flap" selector must therefore take every facet that N4 moved and N5/N6 did not. The N7 line ends where the 45° edges of the N4 flap cross `y_c`; those points are inside the model outline (section 0). The outline after N6 is a pentagon: nose apex (W/2, y_f), shoulders at (0, y_c) and (W, y_c), and the full-width bottom edge. Area is conserved (62 370 mm² A4), the model is 13 facets, and CG x = 105.00.

**SHAPE3D.**
- **Keel:** MOUNTAIN along x = W/2, so the flaps and lock end up **outside**. Sources: "fold along the centre line with the folded paper facing outward" [S1]; "fold the entire plane in half so the tip ends up on the outside" [S2]. Result: the lock sits on the underside of the fuselage and the top wing surfaces show the clean back face (derived). Keel **closed** (halves together); optional 25 × 30 mm tape (rules in [D04]).
- **Wing creases** (each wing folded down, then out [S1]). Left: from **(W/2 − d_n, y_f − d_n)** on the leading edge to **(W/2 − d_t, 0)** on the trailing edge; right is the mirror. Defaults: `d_n = W/16`, `d_t = W/8` (A4: (91.875, 148.5) → (78.75, 0)), giving a fuselage depth of 13 mm at the nose and 26 mm at the tail (unverified - model knowledge; no source gives these).
- **Dihedral** Γ = 7° each side, range 5–10°, a shallow "Y" ([S1] "down, then out"; trim recipe in [D02]).
- **Elevator:** a hinge parallel to the trailing edge at `c_e = 12 mm` over the outer half of each semispan, starting at δ_e = +2° (+0.4 mm), range −5…+10°. Bend down if it stalls [S5]; bend up 1–3 mm if it dives [D02].
- **Winglets:** none.
- **Finished size [C]:** length `L = y_f = (H+g)/2` along the keel. Span `b = 2·(W/2 − d(y_c))·cos ε·cos Γ`, where `d(y) = d_t + (d_n − d_t)·y/(y_f − d_n)` and `ε = atan((d_t − d_n)/(y_f − d_n))` is the tilt of the wing crease against the keel (A4: ε = 5.05°, b = 165.6 mm). The cos ε factor is needed because the wing swings about the crease, so the tip distance that counts is perpendicular to the crease, not to the keel.
- **Tilted crease, 3D consequences [C]:** because `d_t ≠ d_n`, the wing root is not parallel to the keel. After the wings fold down, the root chord is the whole crease (149.1 mm on A4), streamwise strips run parallel to the crease, and the trailing-edge corners of the wings sit aft of the keel's tail end (A4: 6.1 mm measured along the keel, 9.2 mm along the root). Section 6 uses this root-aligned frame for MAC, AC and static margin.

---

## 2. (b) Square-nose basic glider (SNB)

| Item | Value |
|---|---|
| Origin | Generic classroom design. No single designer. The Fold'N'Fly page for "The Basic" could not be reached, so **this definition is mine**. It is built only from operations that sources describe for this family: corners to centre, then fold the triangle down for a flat nose; "fold over the front edge to make the nose heavier" [S1] |
| Known for | First plane, straight unswept leading edge, slow and stable-ish, very forgiving |
| Parameters | `n` extra nose folds (default 2, range 0–3); strip `a = W/8`; wing crease depth `d = W/8` |

| # | Op | Line P1 → P2 | Mover | Sense / scope | Landmark | A4 (mm) |
|---|---|---|---|---|---|---|
| B1 | CREASE | (W/2, 0) → (W/2, H) | – | – | centre line | x = 105 |
| B2 | FOLD | (W/2, H) → (0, H − W/2) | (0, H) | VALLEY / ALL | left top edge onto centre | as N2 |
| B3 | FOLD | (W/2, H) → (W, H − W/2) | (W, H) | VALLEY / ALL | mirror | as N3 |
| B4 | FOLD | (0, H − W/2) → (W, H − W/2) | (W/2, H) | VALLEY / ALL | apex (W/2, H) onto (W/2, H − W), i.e. along the triangle base: **square nose** | y = 192; apex lands at (105, 87) |
| B5.i (i = 1..n) | FOLD | (0, y_i) → (W, y_i), where y_i = H − W/2 − i·a and y_0 = H − W/2 | (W/2, y_{i−1}) | VALLEY / ALL | roll the top edge down by `a` | y = 165.75, 139.5 |

**SHAPE3D.** Keel MOUNTAIN at x = W/2, flaps outside. Wing creases parallel to the keel: left (W/2 − d, 0) → (W/2 − d, y_n), right mirrored (A4: x = 78.75 and 131.25). Dihedral 7°. Elevator 0° default (range −10…+10°). No winglets.
**Finished size:** `L = H − W/2 − n·a` (A4, n = 2: 139.5 mm). `b = (W − 2d)·cos Γ` (156.3 mm).
**Physics flag [C]:** the CG is 40.1 mm aft of the nose, 28.8 % of chord, behind the 25 % point. By the small-α quarter-chord rule the plane is unstable. It trims where the flat-plate centre of pressure has moved aft to the CG, so the aero model **must** include CP travel with α, or this preset will tumble. The A4 CG ratio for each `n` is 38.8 % / 33.0 % / 28.8 % / 26.2 % (n = 0..3; CG 74.4 / 54.8 / 40.1 / 29.7 mm) [C]. With the centre-of-pressure fit of `01-aerodynamics.md` (x_cp/c = 0.25 + 0.25·sin α for rectangular strips, a calibration), those ratios trim at α ≈ 34° / 19° / 9° / 3° (derived). So n = 0 only mushes, and n = 2 is the first usable glider.

---

## 3. (c) Suzanne: confirmed facts and the SZ-proxy

| Item | Value |
|---|---|
| Designer / origin | John M. Collins ("The Paper Airplane Guy"); named after his wife [S9]. Published in *The New World Champion Paper Airplane Book* [S11]. ([S14] probably lists a different Collins book; see Sources) |
| Known for | Guinness distance record **69.14 m (226 ft 10 in)**, thrown by ex-Cal quarterback **Joe Ayoob**, **26 Feb 2012**, in a hangar at the former McClellan AFB near Sacramento [S8][S9]. It beat the previous record by 5.95 m [S9]. Press coverage calls it a *glider*, not a dart [S9] |
| Launch | Hard overhand throw with a short run-up, on the 4th of 10 attempts. One report says a foot lifted during the throw [S10]. Release speed and angle were not published (search confirmed none). Distance records throw at about 40° (Mach 5, [D02]); assume 30–40° at 20–27 m/s for Suzanne-class (unverified) |
| Reported build facts (low confidence: [S11] is a third-party book summary and [S12][S13] are hobby blogs, none is Collins's own text) | 100 g/m² un-watermarked A4 (or letter cut down); **1–2 mm gaps** at specific folds; wing crease starts **≈ 3 mm** up from the nose/keel, holding the layer below with a thumb [S11]. Wings pulled into a slight **"Y", not a "T"** [S13]. One write-up warns its template does not work at A4 scale as printed [S12]. Rules allow one 25 × 30 mm tape piece [D04] |
| Superseded | 77 m (2022), 88.31 m (2022), 98.43 m (28 Dec 2025) [D02][D04]. The 2025 value is taken from the sibling docs, whose own notes say its sources were never opened |

**Fold sequence: NOT VERIFIED.** The official step list could not be retrieved, so the **SZ-proxy** below is a Nakamura-family stand-in that carries every confirmed Suzanne feature. Parameters: `γ = 1.5 mm` gap, `g = W/8`, `y_f = (H+g)/2`, `y_c = y_f − W/2 + γ`. Paper: A4 at 100 g/m².

| # | Op | Line | Mover | Sense / scope | Landmark | A4 (mm) |
|---|---|---|---|---|---|---|
| Z1 | CREASE | (W/2,0) → (W/2,H) | – | – | centre | x = 105 |
| Z2 | FOLD | (W/2 − γ, H) → (0, H − W/2 + γ) | (0,H) | VALLEY / ALL | left top edge onto the line x = W/2 − γ (leaves a 2γ gap) | (103.5,297)→(0,193.5) |
| Z3 | FOLD | (W/2 + γ, H) → (W, H − W/2 + γ) | (W,H) | VALLEY / ALL | mirror | (106.5,297)→(210,193.5) |
| Z4 | FOLD | (0, y_f) → (W, y_f) | (W/2,H) | VALLEY / ALL | nose onto (W/2, g) | y = 161.625 |
| Z5 | FOLD | (W/2 − γ, y_f) → (0, y_c) | (0, y_f) | VALLEY / ALL | top edge onto x = W/2 − γ | (103.5,161.6)→(0,58.1) |
| Z6 | FOLD | (W/2 + γ, y_f) → (W, y_c) | (W, y_f) | VALLEY / ALL | mirror | (106.5,161.6)→(210,58.1) |
| Z7 | FOLD (lock) | (W/2 − γ − h, y_c) → (W/2 + γ + h, y_c), with h = y_c − g. This is the line y = y_c clipped to the exposed tip | (W/2, g) | VALLEY / TOP (Z4 flap) | tip up over the flaps. The tip is a trapezoid with a 2γ-wide flat end, which lands on y = 2·y_c − g | y = 58.125, x 71.6–138.4; lock height h = 31.9; flat end lands at y = 90 |

**SHAPE3D.** Keel MOUNTAIN, flaps outside; tape under the keel near the CG (allowed). Wing creases: left (W/2 − 3, y_f − (3 − γ)) → (W/2 − W/16, 0), i.e. A4 (102, 160.1) → (91.9, 0); right mirrored. Dihedral 10° ("Y"). Elevator δ_e = +2°, range 0…+6°. No winglets.
**Finished size [C]:** L = 161.6 mm, b = 187.8 mm, S = 203 cm², mass 6.24 g. Area is conserved, CG x = 105.00, 13 facets.

---

## 4. (d) Sky King: confirmed facts and the SK-proxy

| Item | Value |
|---|---|
| Designer | **Takuo Toda**, Hiroshima, chairman of the Japan Origami Airplane Association [S18] |
| Record | **27.9 s**, 11 Apr 2009, Fukuyama, Hiroshima. It beat a US record that had stood for 11 years [S15]: Blackburn's 27.6 s from 1998 [D02] |
| Construction | Sources conflict. TIME: "single sheet of paper, no cuts and no gluing" [S16]. The Register: the 27.9 s plane was "held together with cellophane tape" [S17]. Toda later flew a **paper-only** plane for **26.1 s** in Dec 2009 [S17][S22]. TIME also gives the plane as **about 10 cm long** (per [D02]) |
| Later | 29.2 s, 19 Dec 2010, Fukuyama [S18]. One report says "27.5 s in 2009" [S20] (conflict). Possibly another design ("Zero Fighter", unconfirmed [D02][D04]). Superseded by 31.2 s (11 Feb 2026) [D02][D04] |
| Launch | Near-vertical hard throw (Toda: the record "depended on how high the plane flew"; elite launches ≈ 27 m/s [D02]) |
| Literature | Toda, *Ultra Long Flight Paper Airplanes* (Tuttle) [S21]; Popular Science 2012 video on folding the longest-flying planes [S19] (content not seen) |

**Fold sequence: NOT REPRESENTABLE as verified.** No step list was retrievable. Toda's origami aircraft usually form fins and tailplanes with **inside-reverse folds**, which this engine excludes (unverified - model knowledge). **SK-proxy** (time-aloft, Sky King-class) gets yaw stiffness from winglets instead of a fin. It is the NL sequence with: `g = W/4` (y_f = 174.75, y_c = 69.75, s = 17.25 on A4), wing creases left (W/2 − W/32, y_f − W/32) → (W/2 − W/16, 0), and winglet creases left (e, 0) → (e, y_c + e) and right (W − e, 0) → (W − e, y_c + e) with `e = W/16`. (y_c + e is exactly where x = e meets the leading edge [C].) Final angles: winglets **up 75–90°**, dihedral **12°**, elevator **+5°** (≈ 1 mm on a 12 mm flap), keel closed and taped.
**Default sheet: A6 (105 × 148)** gives L ≈ 87 mm, close to the "about 10 cm" report. Scaling does not change wing loading or the ballistic coefficient m/(C_D S), both ∝ grammage. It does lower Re and make the airframe stiffer for 25 m/s launches (unverified - model knowledge).
**Consistency check (derived):** 27.9–29.2 s at a mean sink of 0.6–0.75 m/s [D02] needs ≈ 15–20 m of height after a ≈ 2.5 s climb ((27.9 − 2.5)·0.6 = 15.2 m; (29.2 − 2.5)·0.75 = 20.0 m). That brackets the 18.6 m peak estimate in [D02].

---

## 5. (e) Leading-edge-roll flying wing (FW), LANDSCAPE

Generic tailless "hang glider". No designer is claimed, and this sequence is **unverified - model knowledge**, built from simple folds. **Frame: landscape**, `x ∈ [0, H]` span, `y ∈ [0, W]` chord, leading edge at `y = W`, front face up. Parameters: `a = W/8`, `k = 4` folds, tip fin `e = H/20`.

| # | Op | Line | Mover | Sense / scope | Landmark | A4 (mm) |
|---|---|---|---|---|---|---|
| F1..Fk | FOLD | (0, W − i·a) → (H, W − i·a), i = 1..k | (H/2, W − (i−1)·a) | **MOUNTAIN** / ALL (roll goes under, top stays clean) | roll the leading edge under by `a` | y = 183.75, 157.5, 131.25, 105 |
| F5 | CREASE | (H/2, 0) → (H/2, W − k·a) | – | valley | centre for V-dihedral | x = 148.5 |

**SHAPE3D.** No keel (V crease only). Dihedral 8° each side. Tip fins: creases x = e and x = H − e, folded **up 90°** (A4 e = 14.85 mm). Reflex: hinge at y = 0.15·c across the span with δ = **+10°** (c = W − k·a = 105 mm, hinge at 15.75 mm). Throw: release level at 2–3 m/s from shoulder height, held at the rear centre.
**CG formula [C]:** `x_cg = [(k+1)·a²/2 + (c − a)(a + (c − a)/2)] / W` from the leading edge. For A4 with k = 4 that is 32.8 mm (31.2 % c); with k = 5 it is 23.0 mm (29.2 % c). With `a = W/8` the CG never gets ahead of 29.2 % chord (k = 5; k = 3, 4, 6 give 35.0, 31.2, 31.2 %). Narrower strips can go further forward, e.g. 26.7 % for a = W/10, k = 7 and 25.0 % for a = W/12, k = 9, but only by shrinking the chord to 0.30 W and 0.25 W and stacking 8–10 layers [C]. For the defaults here the CG is behind quarter-chord, and a flat tailless wing has no pitching moment about its aerodynamic centre anyway [D02], so **reflex is mandatory**. A single roll strip carries k+1 layers (5 layers ≈ 0.53 mm, which is fine).

---

## 6. Computed properties (all presets) [C]

These are flat-fold mass properties plus SHAPE3D defaults, recomputed with exact polygon arithmetic (no raster). Two frames are used, and they must not be mixed:
- **Flat frame** (columns L and "CG flat"): the flat-folded model before SHAPE3D, distances along the keel (sheet y) from the nose point (W/2, y_f). These are the unit-test values.
- **Root frame** (columns b, S, "CG 3D", MAC, AC25, SM): the shaped model, distances along the wing-root crease from the projection of the nose point onto that axis. Strips for MAC run parallel to the root crease, which is the streamwise direction of the folded wing. In this frame the station of any point is simply its sheet position projected onto the crease direction, so it does not depend on Γ. Winglets (SK-proxy) count as mass but not as planform. S and b are projected by cos Γ.

For SNB and FW the creases are parallel to the keel, so both frames agree. AC25 is the quarter-MAC point, and SM = (AC25 − CG 3D)/MAC is a *small-α indicator only*. V is the steady-glide speed at C_L = 0.3 / 0.5 with ρ = 1.204 kg/m³.

| Preset | L (mm) | b (mm) | S (cm²) | AR | CG flat mm (% L) | CG 3D mm | MAC mm | AC25 mm | SM % MAC | m (g) | W/S (N/m²) | V @ C_L 0.3 / 0.5 (m/s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NL A4 80 g/m² | 161.6 | 165.6 | 168 | 1.64 | 80.4 (50 %) | 83.1 | 110.4 | 83.3 | +0.2 | 4.99 | 2.92 | 4.0 / 3.1 |
| NL Letter 80 g/m² | 153.2 | 168.6 | 155 | 1.84 | 77.3 (50 %) | 80.1 | 101.5 | 82.1 | +1.9 | 4.83 | 3.06 | 4.1 / 3.2 |
| SNB n=2 A4 | 139.5 | 156.3 | 218 | 1.12 | 40.1 (29 %) | 40.1 | 139.5 | 34.9 | −3.8 | 4.99 | 2.24 | 3.5 / 2.7 |
| SNB n=2 Letter | 117.5 | 160.7 | 189 | 1.37 | 33.0 (28 %) | 33.0 | 117.5 | 29.4 | −3.0 | 4.83 | 2.51 | 3.7 / 2.9 |
| SZ-proxy A4 100 g/m² | 161.6 | 187.8 | 203 | 1.74 | 80.0 (50 %) | 82.1 | 117.7 | 76.2 | −5.0 | 6.24 | 3.01 | 4.1 / 3.2 |
| SK-proxy A4 80 g/m² (A6: lengths ×0.5, S and m ×0.25) | 174.8 | 160.3 | 199 | 1.29 | 82.6 (47 %) | 83.9 | 130.7 | 78.1 | −4.4 | 4.99 | 2.46 | 3.7 / 2.9 |
| FW A4 k=4 | c 105 | 264.7 | 278 | 2.52 | 32.8 (31 % c) | 32.8 | 105 | 26.2 | −6.2 | 4.99 | 1.76 | 3.1 / 2.4 |
| FW A4 k=5 | c 78.8 | 264.7 | 208 | 3.36 | 23.0 (29 % c) | 23.0 | 78.8 | 19.7 | −4.2 | 4.99 | 2.35 | 3.6 / 2.8 |

How to read the table:
- **Why the two CG columns differ.** The NL, SZ and SK wing creases are tilted 5.1°, 3.6° and 2.2° against the keel. Folding a wing down about a tilted crease carries its mass slightly aft relative to the keel line. Measured along the keel, the NL A4 CG moves from 80.4 mm (flat) to 81.8 mm (shaped). Measured along the root crease, which is the axis that sets the wing's moment arm, it is 83.1 mm behind the projected nose point. The root-frame CG of the three presets is 1.3–2.8 mm larger than the flat value for this reason [C]. Assert the flat value on the flat model and the 3D value on the shaped model, never the other way round.
- **Earlier version of this table.** It measured MAC with keel-parallel strips on the flat sheet. That gave MAC 100.3 / 91.3 / 110.1 mm for NL A4 / NL Letter / SZ, which is 7–10 % too short for the folded wing. Its SK row also counted the vertical winglets as planform for MAC and AC (MAC 121.1 mm, SM −0.9 %) but not for S and b.
- **Lateral and vertical CG.** CG x = W/2 exactly. The vertical CG lies 0.9–1.5 mm below the wing root for NL and SNB, and 4.3–4.5 mm *above* it for the shallow-keel proxies with 10–12° dihedral [C].
- **SM near zero.** Every Nakamura-family SM lands within about ±5 % MAC. Low-AR wings with a swept leading edge put the real AC aft of quarter-MAC (unverified - model knowledge), and the [D04] dart has SM ≈ +9 %. So a correct strip model should show NL as **roughly neutral to mildly stable, needing slight up-elevator** (expected, not proven). If the simulated NL tumbles, check the CP model before the fold. For the rectangular SNB at AR ≈ 1.1 the real small-α AC is probably *ahead* of quarter-chord (unverified - model knowledge), so its −3 to −4 % understates the small-α instability.
- **Reynolds number.** At 3–4 m/s on a 0.1 m MAC, Re ≈ 2–3 × 10⁴. At a 25 m/s launch it is ≈ 1.7 × 10⁵ (ν = 1.5 × 10⁻⁵ m²/s).
- **Grammage scaling.** Mass, W/S and V² scale linearly with grammage. CG ratios do not change.

---

## 7. RECOMMENDED / CONSTANTS

```
FRAME: portrait W x H, origin bottom-left, nose +y, front face +z; FW uses landscape (x span 0..H, y chord 0..W)

NAKAMURA_LOCK:  g = W/8  (range 0.06W..0.25W, must be < H-W)
  y_f = (H+g)/2 ; y_c = y_f - W/2 ; s = (H-W-g)/2 ; lockApexY = H - W (invariant)
  keel = MOUNTAIN (flaps outside) ; d_n = W/16 ; d_t = W/8 ; dihedral = 7 deg (5..10)
  elevator: c_e = 12 mm, outer 50 % semispan, delta = +2 deg (-5..+10)
  throw: level, 3-4.5 m/s, pitch 0..-5 deg   (gentle level push [S5]; trim speed 3.1-4.0 m/s = V at C_L 0.5-0.3, section 6)
SQUARE_NOSE: n = 2 (0..3), a = W/8, d = W/8, dihedral 7, elevator 0 (-10..+10); throw level 2.5-4 m/s (trim 2.7-3.5 m/s)
SZ_PROXY: A4 100 g/m2, gamma = 1.5 mm (1..2), g = W/8, d_n = 3 mm, d_t = W/16, dihedral 10, elevator +2 (0..+6)
  throw: 20-27 m/s at 30-40 deg (unverified), tape 25x30 mm allowed
SK_PROXY: default sheet A6, g = W/4, d_n = W/32, d_t = W/16, winglet e = W/16 at 75-90 deg up,
  dihedral 12, elevator +5 ; throw: near vertical (75-90 deg) 20-27 m/s [D02]
FLYING_WING: landscape, a = W/8, k = 4 (MOUNTAIN rolls), V-dihedral 8, tip fins e = H/20 up 90,
  reflex hinge 0.15c at +10 deg ; throw level 2-3 m/s
TEST INVARIANTS (FLAT model, before SHAPE3D): area = W*H ; cg_x = W/2 ; NL lock apex y = H-W ;
  facet count NL = SZ = SK = 13 ; SNB = 4 + 4n ;
  NL A4 CG 80.42 mm aft of nose ; NL Letter 77.32 ; SZ A4 80.01 ; SK A4 82.65 ;
  SNB A4 n=2 CG 40.11 mm (n = 0,1,3: 74.43, 54.76, 29.71) ; FW A4 k=4 CG 32.81 mm from LE (k=5: 22.97)
  (exact polygon values; allow +-0.05 mm)
AFTER SHAPE3D (NL A4): CG 81.8 mm aft of nose along the keel = 83.1 mm along the wing root ; MAC 110.4 mm ; b 165.6 mm
```

**Family fingerprint** (for showing "related planes"): NL, SZ-proxy and SK-proxy share the operation signature `CREASE·FOLD45·FOLD45·FOLDH·FOLD45·FOLD45·FOLDH(TOP)` and differ only in parameters. SNB shares the first four steps. FW is unrelated. A Hamming or Levenshtein distance on this signature plus normalised parameters gives a cheap similarity score (design choice).

---

## 8. Open questions and limits

1. **Suzanne and Sky King step lists are not verified.** Both are book designs ([S11][S14]; [S21]). Before a preset carries their names, someone must check the official diagrams in the book or the designer's video. Diagram artwork is copyrighted; describing a fold sequence in your own words and with attribution is the usual practice, but get the lead's or a legal check (not legal advice).
2. **Fold'N'Fly** (canonical NL, "The Basic", Sea Glider pages) and **Wikipedia** were DNS-blocked. Allowing `www.foldnfly.com` and `en.wikipedia.org` would let the NL wing-crease depths and the SNB definition be checked.
3. **NL `g`:** sources span 13–25 mm, and one says "to the bottom edge" [S3][S4] (plus an unidentified PDF snippet). "Corners meet about two-thirds down" fits `g ≈ W/8` (65 % on A4) [C]. NL wing-crease depths `d_n`, `d_t` have no source.
4. **Sky King construction conflict** (tape vs. no tape [S16][S17]). The 2009 time is given as 27.9 s by most sources and 27.5 s by one [S20].
5. **Stability numbers** use a quarter-MAC AC. They are indicators for validating the aero model, not predictions.
6. **Flap side for SNB and FW** (inside or outside, roll over or under) is a design choice; mass effects are under 0.5 mm.
7. **Paper deformation** at 20–27 m/s launches, which the record throws need, is not modelled ([D02] flags it).

## Sources

1. [S1] CSIRO Double Helix, "Nakamura lock plane". https://blog.doublehelix.csiro.au/nakamura-lock-plane/
2. [S2] Mr Matthews, "Nakamura Lock – Paper Airplane Instructions" (PDF). http://themrmatthews.weebly.com/uploads/5/4/5/3/5453968/nakamura_lock.pdf
3. [S3] Boredom Wizard, "Best paper airplane designs" (≈ 1 inch below the tip). https://boredomwizard.com/paper-airplane-designs/
4. [S4] Kidspot NZ, "Make a Nakamura Lock paper plane". https://kidspot.co.nz/activities/how-to-make-a-nakamura-lock-paper-plane/
5. [S5] The Kid Should See This, "How to fold the Nakamura Lock paper airplane". https://thekidshouldseethis.com/post/how-to-fold-the-nakamura-lock-paper-airplane
6. [S6] Chikicha, "Long-distance flyer (Nakamura Lock)". https://www.chikicha.com/buzz-buzz/how-to-make-the-best-paper-airplane--the-long-distance-flyer--nakamura-lock
7. [S8] Guinness World Records news, Feb 2012, "Is this the farthest ever flight by a paper airplane?" https://www.guinnessworldrecords.com/news/2012/2/video-is-this-the-farthest-ever-flight-by-a-paper-airplane
8. [S9] HowStuffWorks, "Guy who set the paper airplane world record shows how it's done". https://science.howstuffworks.com/innovation/everyday-innovations/paper-airplane-guy-john-collins-world-record.htm
9. [S10] Ingeniøren (2012), Ayoob record report. https://ing.dk/artikel/tidligere-quarterback-saetter-verdensrekord-papirfly
10. [S11] Bookey summary of J. M. Collins, *The New World Champion Paper Airplane Book* (PDF). https://cdn.bookey.app/files/pdf/book/en/the-new-world-champion-paper-airplane-book.pdf
11. [S12] HobbyCaptain, "World record paper plane Suzanne" (2021). https://hobbycaptain.com/2021/04/29/world-record-paper-plane-suzanne/
12. [S13] L. Kratzke, "How to make the Suzanne paper airplane (easier)" (2021). http://lankratzke.blogspot.com/2021/01/how-to-make-paper-airplane-with-less.html
13. [S14] MIT Press Bookstore listing, ISBN 9781580085779 (Collins). https://mitpressbookstore.mit.edu/book/9781580085779
14. [S15] Japan Times, 17 May 2009, "New flight record for paper plane set". https://www.japantimes.co.jp/news/2009/05/17/national/new-flight-record-for-paper-plane-set/
15. [S16] TIME (2009), Sky King. https://content.time.com/time/specials/packages/article/0,28804,1934027_1934003_1933991,00.html
16. [S17] The Register, 29 Dec 2009, paper-plane record. https://www.theregister.com/2009/12/29/paper_plane_record/
17. [S18] Guinness World Records Japan, "Longest time flying a paper aircraft". https://www.guinnessworldrecords.jp/world-records/longest-time-flying-a-paper-aircraft
18. [S19] Popular Science (Apr 2012), "How to fold the longest-flying paper airplanes". https://www.popsci.com/technology/article/2012-04/video-how-fold-longest-flying-paper-airplanes/
19. [S20] BBS Bhutan, report on Toda. https://www.bbs.bt/news/?p=122229
20. [S21] Linden Tree Books, T. Toda, *Ultra Long Flight Paper Airplanes* (Tuttle). https://www.lindentreebooks.com/ultra-long-flight-paper-airplanes-20-incredible-pl.html
21. [S22] News24, 27 Dec 2009, paper-plane flying record. https://www.news24.com/world/news/paper-plane-flying-record-20091227
22. [D02] `docs/research/02-flight-dynamics-validation.md` (sibling doc: records, launch speeds, trim recipe).
23. [D04] `docs/research/04-paper-and-competition-rules.md` (sibling doc: GWR/Red Bull rules, record ladder, dart geometry).
24. [C] Computed in this document with a scratch flat-fold engine (facet split and reflect, 0.5 mm raster). Reproducible from the formulas above.

(S7 was dropped because its search snippet did not support any claim used here.)
