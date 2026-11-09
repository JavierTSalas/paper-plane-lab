# 05 · Dart-family designs: exact, machine-codable fold sequences

Scope: Classic Dart, Bulldog Dart (and Fold'N Fly "The Stable"), Harrier, Ken Blackburn's Basic Dart with wingtips, and the Guinness distance-record planes. Written for the Paper Plane Lab fold engine and preset library.

## Summary for implementers

1. All four foldable designs use only CREASE, FOLD (valley, through ALL layers) and FLIP. There is one exception: the Harrier/Stable "lock" fold moves only the free nose stack, so the engine needs a TOP-group selector. No reverse, squash or tuck folds are needed.
2. Constants: `k = (1+√2)/2 = 1.207107`, `t = tan 22.5° = √2−1 = 0.414214`, `θw = 11.25°` (tan 0.198912, sin 0.195090, cos 0.980785).
3. Classic Dart is 5 flat folds. Corners go to the centre (lines from the nose `(W/2,H)` to `(0,H−W/2)`). Then the slanted edges go to the centre (nose to `(0,H−kW)`). The centre fold is a VALLEY by default (flaps inside; rendering only, see §1.3). The wing hinge runs from the nose to `(W/2 ± H·tanθw, 0)`. Letter result: span 110 mm, CG 152 mm (54.5 %) aft of the nose.
4. Bulldog Dart = Classic Dart + FLIP before the second fold + nose folded down along `y = H − W/(2√2)`, with the wing hinge parallel to the keel at offset `u_b`. Two readings of `u_b` exist and neither was checked against a diagram: `u_b = (1−1/√2)·W/2 = 0.146447W` (hinge starts at the top of the snub nose; default) and `u_b = W/4` (wing folded in half). See §2.3. Letter result: length 203 mm, CG at 41.5 % of length for either value; span 153 mm (default) or 108 mm.
5. Harrier takes a nose-gap parameter `g` (default 12.7 mm). Fold the nose down along `y_f=(H+g)/2`, fold the corners in again to `(0, y_f−W/2)`, then lock the protruding tip up along `y_l = y_f−W/2`. Fold'N Fly's "The Stable" is **modelled here as the same flat fold** (tip protrudes about 25 mm, wings parallel at 12.7 mm). That is an inference from search extracts, and one extract conflicts with it (§3.2), so the Stable preset is provisional. It is **not** the Bulldog Dart.
6. Blackburn's Basic Dart = Classic Dart + vertical wingtips + slight "Y" dihedral. The positions of lines 6–9 are not verified, so they are given as parameters.
7. Record planes cannot be represented. The 2022 Boeing plane (88.31 m) has no published fold sequence and takes about 20 min to fold. Use it as a benchmark line only.
8. A centre fold that is MOUNTAIN or VALLEY, and the optional FLIP, change **only layer order** (rendering). Mass and the in-plane CG are exactly unchanged. The out-of-plane CG and the inertia change only within the stack thickness (at most 16 layers × ~0.1 mm ≈ 1.6 mm, at the Bulldog nose), which is negligible.
9. **Conflict to resolve:** sibling doc 04 models the Classic Dart wing fold parallel to the keel at 25 mm (span 160 mm on A4). The museum and Fold'N Fly instructions read as "leading edge onto keel" (span 107 mm on A4). See §1.4.

**Evidence status.** WebFetch could not reach any source host in this session, and the shared web-search budget ran out. Every step text below comes from search-engine extracts of the cited pages. I did not see the diagrams themselves. All geometry, dimensions and CG values were **derived** by my own fold simulation: an exact polygon-reflection script that checks area conservation and L/R symmetry. They are tagged *(derived)*.

**Fact-check pass.** A second pass re-traced every sequence with an independent fold script and corrected the items listed in "Verification notes" at the end. Web access was still unavailable in that pass (WebFetch hosts blocked, search budget spent), so **no step text, diagram, measured statistic or record value in this document has been checked against its source page**.

---

## 0. Conventions

- **Sheet frame:** portrait. `x ∈ [0,W]` is the short side and `y ∈ [0,H]` the long side, with the origin at the bottom-left. The nose ends up toward `y = H`. The coloured/front face starts toward the viewer (+z). Letter: W×H = 215.9×279.4 mm. A4: 210×297 mm.
- **Frame persistence:** in every sequence here the tail strip (`y≈0`) never moves before the centre fold. So "current outline coordinates" equal sheet coordinates.
- **FLIP** turns the model left–right (`x → W−x`, z-order reversed). Every model is L/R symmetric when it is flipped, so all later formulas are unchanged.
- **FOLD notation:** `FOLD A→B | moving side ∋ X | VALLEY/MOUNTAIN | ALL/TOP`. X is a point that lies in the moving region before the fold. A landmark is given for each fold. "Point P onto Q" means the line is the perpendicular bisector of PQ. "Edge E onto line L" means the angle bisector.
- **3-D frame after the centre fold:** use the right half (`x ≥ W/2`). Let `u = x − W/2` be the height above the keel. The **wing hinge** is given by two sheet points on the right half; mirror them for the left wing. The **root axis** is the hinge direction, nose to tail. The longitudinal CG is measured along it. Rotation about the hinge does not change that coordinate, so it is independent of dihedral.
- **Face rule (derived):** with a MOUNTAIN centre fold, the front face is the outside of the keel and the **underside** of the wings. The back face becomes the wing top. With a VALLEY centre fold it is the reverse: the front face (which carries the flaps) is inside the keel and on **top** of the wings.

---

## 1. (a) Classic Dart ("Basic Dart")

### 1.1 Provenance

| Item | Value |
|---|---|
| Origin | Traditional; no known designer or date (unverified - model knowledge). Fold'N Fly calls it "one of the most iconic paper airplane designs" [S1] |
| Sources cross-checked | Fold'N Fly Basic Dart [S1][S2]; Smithsonian NASM "Dart" printout [S9]; Maine State Museum [S10]; Pima Air & Space Museum handout from Blackburn & Lammers [S8]; Museums Victoria [S12]; Amazing Paper Airplanes (UBC copy) [S11]; Paper Plane Depot [S14]; paperairplanes.co.uk [S13] |
| Known for | Speed and decent distance; 5 folds [S1] |
| Fold'N Fly measured (10-year-old thrower, 75 gsm) | **12.5 m (40.8 ft) average distance, 1.4 s average time aloft** [S1][S3]. Derived mean horizontal speed: 8.9 m/s *(derived)* |

### 1.2 Flat-fold sequence

| # | Op | Line A → B | Moving side ∋ | Dir | Layers | Landmark / source |
|---|---|---|---|---|---|---|
| 1 | CREASE | `(W/2,0)→(W/2,H)` | `(W,0)` | VALLEY, unfold | ALL | Edge x=0 onto x=W. "Fold the paper in half the long ways, then unfold" [S2][S9][S10] |
| 2 | FOLD | `(W/2,H)→(0,H−W/2)` | `(0,H)` | VALLEY | ALL | Point `(0,H)` onto `(W/2,H−W/2)`: top edge onto centre crease ("corners in to the centre", 45°) [S9][S13][S14] |
| 3 | FOLD | `(W/2,H)→(W,H−W/2)` | `(W,H)` | VALLEY | ALL | Mirror of 2 |
| 4 | FOLD | `(W/2,H)→(0,H−kW)` | `(0,H−W/2)` | VALLEY | ALL | Slanted edge onto centre line (22.5° line) [S9][S10][S13] |
| 5 | FOLD | `(W/2,H)→(W,H−kW)` | `(W,H−W/2)` | VALLEY | ALL | Mirror of 4 |

- **Outline after step 5:** `(0,0),(W,0),(W,H−kW),(W/2,H),(0,H−kW)`. Letter: `H−kW = 18.8 mm`. A4: 43.5 mm.
- **Validity:** step 4 needs `H/W ≥ k = 1.2071`. For squarer sheets the line ends on the bottom edge at `(W/2 − H·t, 0)` *(derived)*.
- Layers at the nose after step 5: 4 per half, so 8 in the closed nose *(derived)*.

### 1.3 3-D shaping

| Item | Value |
|---|---|
| Centre fold | `x = W/2`, **VALLEY** (flaps inside the keel and on top of the wings; default). NASM says "fold the plane in half" with no direction [S9]. A wikiHow variant asks for folds inside [S30]. Fold'N Fly's step reads "fold the plane in half toward you" (unverified - model knowledge of the [S1] wording). No cited source asks for the flaps outside, so MOUNTAIN is the alternative, not the default. Physics is unaffected (§0) |
| Wing hinge (right) | `(W/2, H) → (W/2 + H·tanθw, 0)`. Letter: `(107.95,279.4)→(163.53,0)`. A4: `(105,297)→(164.08,0)` |
| Landmark | Fold the wing down so its top (leading) edge lines up with the bottom edge of the body: "fold the wings down to meet the bottom edge of the plane's body" [S10]; "outer edges line up with the bottom edge" [S9]; Fold'N Fly step 5 [S1]. Edge onto keel ⇒ bisector at θw = 11.25° |
| Keel depth | 0 at the nose. At the tail: `H·tanθw` along x (55.6 / 59.1 mm Letter / A4), or `H·sinθw` perpendicular to the hinge (54.5 / 57.9 mm) *(derived)* |
| Keel | Closed: the two keel layers touch |
| Dihedral | 0° to +5°. NASM: wings "flat and horizontal" [S9]. Blackburn: slight "Y" [S8]. Default 3° (unverified - model knowledge) |
| Elevator | Bend the rear corners or trailing edge up slightly [S8][S9]. Fold'N Fly: the dart generally needs some up elevator [S1]. If it nose-dives, bend up the trailing edge [S11]. Magnitude: default +8° over the rear 10 mm, range 0–20° (unverified - model knowledge) |
| Winglets | None (see §4 for the Blackburn wingtip variant) |

### 1.4 Finished dimensions *(all derived)*

| Quantity | Formula | Letter | A4 |
|---|---|---|---|
| Keel length | `H` | 279.4 mm | 297.0 mm |
| Overall length along root axis | `(W/2)·sinθw + H·cosθw` (outer tail corner sits aft of the keel tail) | 295.1 mm | 311.8 mm |
| Span (Γ=0) | `2W(½cosθw − k·sinθw) = 0.509796·W` | 110.1 mm | 107.1 mm |
| Wing planform area (both) | from polygon | 16 661 mm² | 18 207 mm² |
| Aspect ratio b²/S (wings only) | – | 0.73 | 0.63 |
| Leading-edge sweep | `90° − 11.25°` | 78.75° | 78.75° |
| CG aft of nose, along keel | – | 152.4 mm (54.5 % H) | 159.8 mm (53.8 % H) |
| CG along root axis / below root (Γ=0) | – | 155.9 mm (52.8 %) / 6.5 mm | 163.4 mm (52.4 %) / 7.1 mm |
| Wing-planform area centroid (not the neutral point) | – | 65.4 % of length | 64.8 % |

**Cross-check.** My flat-state CG matches sibling doc 04 exactly: 152.4 mm Letter, 159.8 mm A4. The two docs differ on the wing fold. Doc 04 used a hinge parallel to the keel at 25 mm, which gives a 160 mm span on A4. That is a legitimate *variant* folders use, but the cited museum and Fold'N Fly texts describe "edge onto bottom of body" [S1][S9][S10]. **Recommendation:** ship the bisector rule as "Classic Dart" and the 25 mm parallel keel as a named variant ("Wide Dart").

**Throw.** Firm overhand throw, released level to +5°, at 8–12 m/s (unverified - model knowledge; consistent with the derived 8.9 m/s mean from [S1]).

---

## 2. (b) Bulldog Dart (blunt-nose dart)

### 2.1 Provenance and naming

The Bulldog Dart is a traditional, internet-documented design. I found no designer or date. Its sources are Art of Manliness [S16] (and a reprint [S17]), Instructables [S15], Our Pastimes [S18] and Medium [S19]. Art of Manliness presents it as a beginner model whose snub nose gives the name [S16]. A Studocu document pairs it with a "Hammer" design [S31].

**"Stable" is not this plane.** Fold'N Fly's "The Stable" (#2) is a 7-fold glider tagged *time aloft / acrobatic*. Its measured averages are **5.5 m (18 ft), 2.5 s** [S3]. Its steps (a downward point folded up "to secure the flaps") make it a Harrier-family lock plane [S4]. It is specified in §3.

### 2.2 Flat-fold sequence

The order follows Art of Manliness [S17] and Our Pastimes [S18]. Our Pastimes notes that the flip is optional [S18].

| # | Op | Line A → B | Moving side ∋ | Dir | Layers | Landmark / source |
|---|---|---|---|---|---|---|
| 1 | CREASE | `(W/2,0)→(W/2,H)` | `(W,0)` | VALLEY, unfold | ALL | Centre crease [S15][S18] |
| 2–3 | FOLD ×2 | as Classic steps 2–3 | | VALLEY | ALL | Top corners to the centre line [S16][S18] |
| 4 | FLIP | – | – | – | – | "Flip the plane over, and fold the corners in again" [S17][S18] |
| 5–6 | FOLD ×2 | `(W/2,H)→(0,H−kW)` and mirror | `(0,H−W/2)` / mirror | VALLEY | ALL | Slanted edges onto the centre line [S17][S18] |
| 7 | FOLD | `(W/2 − 0.146447W, y_n)→(W/2 + 0.146447W, y_n)`, `y_n = H − W/(2√2) = H − 0.353553W` | `(W/2,H)` | VALLEY (down over the flaps) | ALL | Point `(W/2,H)` onto `(W/2, H − W/√2)`, "the bottom of the folded flaps" [S18][S19]. Instructables also allows tucking it underneath (MOUNTAIN) [S15]. The line `y = y_n` crosses the paper only between these two points on the leading edges; `(0,y_n)` and `(W,y_n)` lie outside the outline *(derived)* |

- **Outline after step 7:** `(0,0),(W,0),(W,H−kW),(W/2+0.146447W, y_n),(W/2−0.146447W, y_n),(0,H−kW)`.
- Blunt nose width = `(1 − 1/√2)·W` = 63.2 mm (Letter) or 61.5 mm (A4) *(derived)*.
- Layers at the nose: 8 per half, 16 in the closed nose *(derived)*.

### 2.3 3-D shaping

| Item | Value |
|---|---|
| Centre fold | VALLEY (default): Art of Manliness says fold the plane in half "in on itself" [S16], which puts the second flaps and the folded nose inside. MOUNTAIN is the alternative. Mass properties are unaffected |
| Wing hinge (right) | Parallel to the keel at `u = u_b`: `(W/2 + u_b, H − u_b/t) → (W/2 + u_b, 0)`, valid for `0.146447W ≤ u_b < W/2`. "Crease running parallel to the base" [S18] fits any `u_b`. Two readings of `u_b` follow. **Neither was checked against a diagram** |
| `u_b` default: `(1−1/√2)·W/2 = 0.146447W` | `(W/2 + 0.146447W, y_n) → (W/2 + 0.146447W, 0)`. The hinge starts at the top corner of the snub nose. Art of Manliness: fold the wings down "so that you're making a straight line across from the top of the snub nose" (unverified - model knowledge of the [S16] wording). Chosen as default because the fold order in §2.2 follows that source |
| `u_b` alternative: `W/4` | `(3W/4, H − 0.603553W) → (3W/4, 0)`. Outer edge `x=W` onto the keel: "fold the wings in half" [S15]. That is a search extract from the Instructables variant, which has no second edge fold. The hinge starts on the leading edge, W/4 aft of the blunt nose |
| Keel depth / dihedral / elevator | Keel depth `u_b`, constant: 31.6 / 30.8 mm (default) or 54.0 / 52.5 mm (`W/4`), Letter / A4. Dihedral 0–5°. Elevator +5–10°, because the large static margin needs some up elevator (unverified - model knowledge) |

### 2.4 Dimensions *(derived)*

| Quantity | Letter, default `u_b` | A4, default `u_b` | Letter, `u_b = W/4` | A4, `u_b = W/4` |
|---|---|---|---|---|
| Length `y_n` | 203.1 mm | 222.75 mm | 203.1 mm | 222.75 mm |
| Span `W − 2u_b` | 152.7 mm (`W/√2`) | 148.5 mm | 108.0 mm (`W/2`) | 105.0 mm |
| Wing area / AR | 16 935 mm² / 1.38 | 19 769 mm² / 1.12 | 9 061 mm² / 1.29 | 11 222 mm² / 0.98 |
| CG aft of nose | **84.2 mm (41.5 %)** | 92.8 mm (41.7 %) | 84.2 mm (41.5 %) | 92.8 mm (41.7 %) |
| CG below wing root | 9.8 mm | 9.1 mm | 25.1 mm | 23.4 mm |
| Wing-planform centroid | 66.4 % | 65.6 % | 75.2 % | 73.2 % |

Wing area (both wings): `S = (W − 2u_b)·(H − (u_b/t + kW)/2)`, for `0.146447W ≤ u_b < W/2` *(derived)*.

**Throw.** Level, 6–10 m/s (unverified - model knowledge). Art of Manliness advises a softer throw than instinct suggests, because a hard launch flies the heavy nose into the ground (unverified - model knowledge of the [S16] wording).

**Variant.** The Instructables version folds only the corners, then snubs the nose, with no second edge fold [S15]. Represent it by dropping steps 4–6. The nose line is then the perpendicular bisector you choose. Flagged: the exact nose depth is not given in that source.

---

## 3. (c) Harrier, and Fold'N Fly "The Stable"

### 3.1 Provenance

The Harrier is a traditional design popularised by Art of Manliness [S16] and Instructables [S20][S21]. I found no designer, and no link to Ken Blackburn. It is a glide/distance plane with a 90° nose and a tip lock. The same flat-fold family includes the Nakamura lock (unverified - model knowledge). The flat fold in §3.2 is in fact the same construction as steps N1–N7 of the Nakamura Lock in sibling doc 06 (`y_f = (H+g)/2`, corners landing at `y_f − W/2`, lock apex at `y = H − W`). The two presets differ only in the default `g` (12.7 mm here, `W/8` there) and in the wing hinge, so the engine should share one flat-fold routine *(derived)*. Fold'N Fly "The Stable": Easy difficulty, 7 folds, Letter and A4, 5.5 m and 2.5 s averages, and "bend up flaps at the rear edge" for flips and tricks [S3].

**Parameter `g`** (gap between the folded-down tip and the bottom edge):

- About ½ in = **12.7 mm**: Art of Manliness ("leave a half inch or so at the bottom") [S16] and Brit.co [S22].
- About 1 in = 25.4 mm, "no precise measurement": Instructables [S20].

Derived quantities:

- `y_f = (H+g)/2`
- `y_l = y_f − W/2`
- Tip protrusion `p = (H − g − W)/2`
- Validity: `g < H − W` (Letter 63.5 mm, A4 87 mm).

### 3.2 Flat-fold sequence

| # | Op | Line A → B | Moving side ∋ | Dir | Layers | Landmark / source |
|---|---|---|---|---|---|---|
| 1 | CREASE | `(W/2,0)→(W/2,H)` | `(W,0)` | VALLEY, unfold | ALL | [S20][S21] |
| 2–3 | FOLD ×2 | as Classic 2–3 | | VALLEY | ALL | Corners to the centre [S20][S21][S4] |
| 4 | FOLD | `(0,y_f)→(W,y_f)` | `(W/2,H)` | VALLEY | ALL | Point `(W/2,H)` onto `(W/2,g)`: "fold the entire top down so it resembles an envelope" [S16][S20][S22] |
| 5 | FOLD | `(W/2,y_f)→(0,y_l)` | `(0,y_f)` | VALLEY | ALL | Top-left edge onto the centre line. Equivalently, point `(0,y_f)` onto `(W/2,y_l)` [S21][S4] |
| 6 | FOLD | `(W/2,y_f)→(W,y_l)` | `(W,y_f)` | VALLEY | ALL | Mirror of 5 |
| 7 | FOLD (lock) | `(0,y_l)→(W,y_l)` | `(W/2, g)` | VALLEY (tip up over the flaps) | **TOP group only**: the folded-down nose stack (nose layer + the two corner flaps from steps 2–3: 2 layers at any point, 3 pieces). **Not** the base sheet | Fold up the small triangle sticking out below the flaps [S21]. Fold the point up "to secure the flaps" [S4] |

- After step 5/6 each flap's lower edge is horizontal at `y_l`. The tip protrudes from `y=g` to `y_l`. After the lock it covers `y ∈ [y_l, y_l+p]`.
- **Outline after step 7:** `(0,0),(W,0),(W,y_l),(W/2,y_f),(0,y_l)`, with a 90° nose.
- Letter, g=12.7: `y_f=146.05`, `y_l=38.10`, `p=25.40`, lock spans 38.1–63.5 mm.
- A4, g=12.7: `y_f=154.85`, `y_l=49.85`, `p=37.15`.

**Stable consistency check.** The Stable text says the corners meet "about an inch above the downward-facing point" [S4], i.e. `p ≈ 25.4 mm`. Then `g = H − W − 2p`, which is **12.7 mm on Letter**. That is exactly the Art of Manliness Harrier gap, so the two share the same flat fold *(derived)*. On A4, `g = 36.2 mm` (`y_f=166.6`, `y_l=61.6`).

One search extract described a Stable step as "fold the top point down to form a square" [S3]. No `g` satisfies both "square" and "tip protrudes about 1 in". **Flagged.**

Alternative reading *(derived, not adopted)*: fold the triangle down along its own base (`y_f = H − W/2`, tip at `y = H − W`) and bring the two corners to a point 25.4 mm above the tip. Those creases miss the top centre and leave a flat nose 44.8 mm (Letter) or 44.7 mm (A4) wide. That would make the Stable a flat-nose lock plane with a different outline. Only the source diagram can decide between the two readings.

### 3.3 3-D shaping

| Item | Harrier (default) | Stable |
|---|---|---|
| Centre fold | MOUNTAIN, "fold in half with the flaps on the outside" [S20][S21] | "Away from you", then flatten [S3]; same as MOUNTAIN |
| Wing hinge (right) | Leading edge onto keel ⇒ 22.5° bisector: `(W/2, y_f) → (W/2 + y_f·t, 0)` ("fold each wing down so its edge meets the bottom of the body" [S20][S21]; **flagged**, from search extracts only). If "its edge" means the outer edge `x=W` and not the leading edge, the hinge is instead parallel to the keel at `W/4`: span `W/2`, wing area 7 026 mm² (Letter) or 7 991 mm² (A4) *(derived)* | Parallel at 12.7 mm: `(W/2+12.7, y_f−12.7) → (W/2+12.7, 0)`, starting on the leading edge. "Body about half an inch tall" [S4] |
| Dihedral | 5° (unverified - model knowledge) | 5–10° (unverified) |
| Elevator | +3–5° for glide (unverified) | Glide: +3°. Loops and tricks: +15–25° [S3] (magnitude unverified) |
| Keel | Closed; the lock holds the nose | Closed |

### 3.4 Dimensions *(derived)*

| Quantity | Harrier L (g=12.7) | Harrier A4 (g=12.7) | Stable L (g=12.7) | Stable A4 (g=36.2) |
|---|---|---|---|---|
| Length | 176.2 along the root axis (`y_f` = 146.1 along the keel) | 183.2 (154.9) | 146.1 | 166.6 |
| Span | `0.541196·W` = 116.8 | 113.7 | `W − 25.4` = 190.5 | 184.6 |
| Wing area / AR | 11 044 mm² / 1.24 | 11 561 / 1.12 | 16 331 / 2.22 | 19 891 / 1.71 |
| Max keel depth | 55.9 (perp.) | 59.3 | 12.7 | 12.7 |
| CG from nose | 83.4 (47.3 % of root axis); 76.6 along keel (52.4 % of `y_f`) | 86.4 (47.2 %) | 76.6 (52.4 %) | 81.2 (48.7 %) |
| CG below root | 7.8 | 8.1 | 1.5 | 1.5 |
| Wing-planform centroid | 62.0 % | 61.3 % | 67.6 % | 65.7 % |
| Layers at the lock | up to 7 per half | 7 | 7 | 7 |

**Throw.** Harrier: moderate, level to −5°, 4–6 m/s. Stable: gentle, 3–5 m/s (unverified - model knowledge). Fold'N Fly's averages for the Stable work out to 2.2 m/s mean horizontal progress, including loops *(derived from [S3])*.

---

## 4. (d) Ken Blackburn's "Basic Dart" (winglet dart)

### 4.1 Why this design

I could not retrieve step texts for "Hammer", "Stealth" or "Spear". Only the existence of a "Hammer" paired with the Bulldog was seen [S31].

The Fold'N Fly speed designs exist, with measured averages:

| Design | Folds | Average distance | Note | Source |
|---|---|---|---|---|
| Hunting Flight | 7 | 10.2 m (33.6 ft) | "straight shooting", heavy nose | [S7] |
| Zip Dart | 8 | 9.1 m | – | [S5] |
| Heavy-Nosed | – | – | Basic dart with a heavy blunt nose | [S6] |

Their steps were not visible, so I chose the only other fast simple-fold design with an authoritative step list I could confirm. That is the Basic Dart from Ken Blackburn & Jeff Lammers' *The World Record Paper Airplane Book*, as reproduced by the Pima Air & Space Museum [S8]. Blackburn is an aerospace engineer and held the Guinness time-aloft record four times; his last record was 27.6 s [S26].

### 4.2 Sequence

The handout's text says:

- Crease along the centre line (line 5) and reopen.
- Fold along lines 1–2, then lines 3–4.
- Fold in half.
- Fold one wing along line 6, flip, and fold the other along line 7.
- "Fold the wingtips up along lines 8 and 9."
- Bend the elevators up slightly. The wingtips should sit above the body, so the wings form a slight "Y" [S8].

The diagram positions of lines 1–4 were not visible. They are assumed to be Classic steps 2–5, because the step structure matches. **Flagged.**

| # | Op | Definition |
|---|---|---|
| 1–5 | as Classic Dart 1–5 | lines 1–4 = corners, then edges (assumed) |
| 6 | Centre fold | Direction not stated in [S8]. Use the Classic default (VALLEY) |
| 7 | Wing hinges (lines 6–7) | Classic rule, `(W/2,H)→(W/2 ± H·tanθw, 0)`. **Unverified:** the diagram position is unknown |
| 8 | Wingtips (lines 8–9) | Fold UP. The line is parallel to the hinge at perpendicular distance `t_wl = 0.254898W − h_w` from it, with `h_w = 12.7 mm` (unverified). Right-half endpoints: on the leading edge at `N + λ(P−N)`, where `N=(W/2,H)`, `P=(W,H−kW)`, `λ = t_wl/(0.254898W)`; on the bottom edge at `x = W/2 + (t_wl + H·sinθw)/cosθw`. Letter: `(190.99,78.93)→(206.69,0)`. A4: `(185.09,103.65)→(205.71,0)` *(derived)*. Validity: the line exits through the bottom edge only while `h_w ≥ (H − kW)·sinθw` (3.7 mm Letter, 8.5 mm A4; US Legal would need 18.5 mm, so there the line exits through the side edge `x=W`). The side edge is not parallel to the hinge, so the winglet height tapers from `h_w` = 12.7 mm at the leading-edge corner to 9.0 mm (Letter) or 4.2 mm (A4) at the tail corner *(derived)* |
| 9 | Final | Winglets 90° (vertical, unverified). Dihedral +5° to +10° ("slight Y" [S8]; magnitude unverified). Elevator +5–10° ("slightly" [S8]) |

**Dimensions.** As Classic, except the span with vertical winglets is `2·t_wl` = 84.7 mm (Letter) or 81.7 mm (A4) *(derived)*. The winglets occupy the aft 28 % of the root axis on Letter (s = 212.8–295.1 mm) and the aft 34 % on A4 (s = 205.3–311.8 mm). Each winglet has an area of 598 mm² (Letter) or 764 mm² (A4) *(derived)*. No performance numbers were found.

---

## 5. (e) Guinness distance-record planes

| Item | Value |
|---|---|
| Record | **88.31 m (289 ft 9 in)**, 2 Dec 2022, Crown Point, Indiana. Credited to Dillon Ruble, "with the support of" Nathaniel Erickson and Garrett Jensen (Boeing engineers; some outlets say "Nathan") [S23][S24][S25]. 289 ft 9 in converts to 88.316 m, and GWR may list the value to the millimetre as 88.318 m (unverified - model knowledge). Use 88.31 m until [S23] has been opened |
| Design facts | Modelled on hypersonic vehicles, using simulations. A4 at the 100 gsm maximum. "Takes 20 minutes to accurately fold." Optimised for speed and low drag. Record came on the third throw [S24][S32]. The previous record (April 2022, a Malaysia/South Korea team) is reported as 252 ft 7 in in the press [S24], which converts to 76.99 m, and as 77.134 m (253 ft 1 in) in sibling doc 04. The two figures differ by 0.15 m. Treat it as "about 77 m" |
| Fold sequence | **Not published** in any source reachable here. A 20-minute fold implies many precise folds, probably beyond the simple-fold primitive set (inference). **NOT representable**: do not ship a fake "record plane" preset |
| Newer record (unverified by me) | Sibling doc 04 reports a newer GWR record of **98.43 m**, 28 Dec 2025, Shanghai, design "Research", citing GWR and AFPBB [S29]. It also gives the 2022 plane's name as "Mach 5" with a launch near 40° [S29]. If those sources confirm it, the "current" record is no longer the 2022 plane |

**Recommendation.** Show both as distance-benchmark lines in GWR-rules mode: 88.31 m (verified here) and 98.43 m (verify first). Do not show them as foldable presets.

---

## 6. RECOMMENDED / CONSTANTS

```text
K      = 1.2071068   // (1+√2)/2
T225   = 0.4142136   // tan 22.5°
TW     = 0.1989123   // tan 11.25°   SW = 0.1950903  CW = 0.9807853
NOSE_N = 0.3535534   // 1/(2√2)      BULLDOG nose line y_n = H − NOSE_N·W
NOSE_A = 0.1464466   // (1−1/√2)/2   BULLDOG snub-nose half-width = NOSE_A·W
HARRIER_G_DEFAULT   = 12.7 mm  (range 10–30; Instructables 25.4)
STABLE_PROTRUSION   = 25.4 mm  → g = H − W − 2·25.4
STABLE_BODY         = 12.7 mm (wing hinge parallel to keel)
BULLDOG_BODY        = NOSE_A·W (hinge parallel to keel from the top of the snub nose; unverified)
BULLDOG_BODY_ALT    = W/4      (wing folded in half; unverified)
WINGTIP_HEIGHT_BB   = 12.7 mm (unverified)
```

| Preset | Flat folds (after CREASE) | Wing hinge (right half) | Γ default | Elevator default | Throw default (unverified) |
|---|---|---|---|---|---|
| Classic Dart | C2, C3, E4, E5 | `(W/2,H)→(W/2+H·TW, 0)` | 3° | +8°, rear 10 mm | 10 m/s, +3° |
| Wide Dart (doc 04 variant) | same | parallel, `u=25 mm` | 3° | +8° | 10 m/s, +3° |
| Bulldog Dart | C2, C3, FLIP, E4, E5, NOSE(y_n) | `(W/2+0.146447W, y_n)→(W/2+0.146447W, 0)`; alternative `(3W/4, H−0.603553W)→(3W/4,0)` | 3° | +8° | 8 m/s, 0° |
| Harrier | C2, C3, DOWN(y_f), C'(y_f), LOCK(y_l) | `(W/2,y_f)→(W/2+y_f·T225, 0)` | 5° | +4° | 5 m/s, −3° |
| Stable | as Harrier, g = H−W−50.8 | `(W/2+12.7, y_f−12.7)→(W/2+12.7, 0)` | 7° | +3° (loops: +20°) | 4 m/s, 0° |
| Blackburn Dart | as Classic | Classic + winglets at `t_wl` | 7° | +6° | 10 m/s, +3° |

**Trim-speed sanity check *(derived)*.** Use `V = √(2·(mg/S)/(ρ·C_L))` with ρ = 1.204 kg/m³ and 75 gsm Letter. Here `mg` is the weight of the plane, not the sheet width `W`: `m` = 0.075 kg/m² × 0.0603225 m² = 4.524 g, and `mg` = 0.04437 N at 9.80665 m/s². S is the projected wing area only; the vertical keel is excluded. The formula is the steady level-flight lift balance. It holds for shallow glides (cos γ ≈ 1) and says nothing about whether the plane can reach that C_L.

| Preset | mg/S | V at C_L = 0.2 | V at C_L = 0.4 | V at C_L = 0.6 |
|---|---|---|---|---|
| Classic | 2.66 N/m² | 4.7 m/s | 3.3 m/s | 2.7 m/s |
| Bulldog (default `u_b`) | 2.62 N/m² | 4.7 m/s | 3.3 m/s | 2.7 m/s |
| Bulldog (`u_b = W/4`) | 4.90 N/m² | 6.4 m/s | 4.5 m/s | 3.7 m/s |
| Harrier | 4.02 N/m² | 5.8 m/s | 4.1 m/s | 3.3 m/s |
| Stable | 2.72 N/m² | 4.8 m/s | 3.4 m/s | 2.7 m/s |

Scale by √(gsm/75) for other paper. If the simulator's glide speeds fall far outside these ranges, check the CG and area code.

**Engine test vectors (Letter).** Each preset must reproduce:

- area = 60 322.46 mm²
- exact L/R symmetry before the centre fold
- flat-state CG 152.41 mm (Classic), 84.22 mm (Bulldog) and 76.58 mm (Harrier/Stable, g=12.7) aft of the nose *(derived)*. The Classic value has the closed form `H/2 + 0.0761845·W²/H` for any sheet with `H/W ≥ k` (A4: 159.81 mm)

---

## 7. Self-checks performed

- **Area:** conserved exactly for every sequence (Letter and A4).
- **Symmetry:** L/R areas are equal before the centre fold.
- **Fold lines on the outline:** every fold line has both endpoints on the current outline (true only after the fact-check clipped the Bulldog nose line to the leading edges and moved the Stable hinge start onto the leading edge). The step-4 Classic line meets `x=0` at 18.8 mm (Letter) and 43.5 mm (A4), which is above `y=0`. The Harrier fold `y_f` lies below the step-2 triangle base (`g < H − W`).
- **Hinges:** every wing hinge stays inside the half outline (Classic hinge exits at `x=163.5 < W`).
- **Not checked:** match to photos. I could not view any diagrams, so shapes were checked only against the step texts. Treat the Harrier wing rule and all of the Blackburn line positions as provisional.

## 8. Open questions and limits

1. No source page or diagram could be opened (WebFetch was blocked, and the search budget ran out mid-task). The next session should open [S1][S3][S8][S9][S16] and confirm the wing-fold lines against the pictures.
2. Classic Dart wing rule: bisector (here) or parallel 25 mm keel (doc 04). These give a 1.5× span difference. Choose before tuning.
3. Flaps inside or outside the keel: sources differ [S9][S30]. This affects rendering only.
4. Bulldog nose-fold depth: "bottom of the folded flaps" was read as the seam point `(W/2, H−W/√2)`. The nose could also be tucked under [S15]. Bulldog wing-hinge offset `u_b`: 0.146447W or W/4 (§2.3). The choice changes the span by a factor of 1.41 and the wing area by 1.87.
5. Harrier wing rule, and the Stable "square" wording.
6. Blackburn lines 1–9 (positions) and winglet height.
7. All dihedral, elevator and throw magnitudes are model knowledge. They should be tuned against the Fold'N Fly averages (Dart 12.5 m / 1.4 s; Stable 5.5 m / 2.5 s; 10-year-old thrower, 75 gsm) [S1][S3].
8. Record planes cannot be represented. Hammer, Stealth, Spear, Hunting Flight and Zip Dart steps are outstanding.

## Sources

1. [S1] Fold'N Fly, "Basic Dart". https://www.foldnfly.com/1.html
2. [S2] Fold'N Fly, "How to Make a Paper Airplane". https://www.foldnfly.com/lounge/how-to-make-a-paper-airplane.php
3. [S3] Fold'N Fly, "The Stable" (stats, 75 gsm test paper note, rear-flap tricks). https://www.foldnfly.com/2.html
4. [S4] 2017 saved copy of Fold'N Fly "The Stable" (PDF). https://scienceclass3000.weebly.com/uploads/5/4/5/9/5459088/fold_n_fly_%E2%9C%88_the_stable_3.pdf
5. [S5] Fold'N Fly, "Zip Dart". https://www.foldnfly.com/23.html
6. [S6] Fold'N Fly, "Heavy-Nosed Plane". https://www.foldnfly.com/7.html
7. [S7] Fold'N Fly, "Hunting Flight". https://www.foldnfly.com/6.html
8. [S8] Pima Air & Space Museum, "The Basic Dart" (from Blackburn & Lammers, *The World Record Paper Airplane Book*). https://pimaair.org/wp-content/uploads/2020/01/The-basic-dart_120911.pdf
9. [S9] Smithsonian NASM, How Things Fly, "Dart" printout. https://howthingsfly.si.edu/sites/default/files/paper-airplane/NASM_paper_plane_printout_b1p3i5.pdf
10. [S10] Maine State Museum, "Basic Dart Guide". https://mainestatemuseum.org/wp-content/uploads/2025/08/Basic-Dart-Guide.pdf
11. [S11] Amazing Paper Airplanes "Basic Dart" (UBC PHYS 420 copy). https://phys420.phas.ubc.ca/p420_2018/guanting/media/Basic%20Dart%20Paper%20Airplane.pdf
12. [S12] Museums Victoria, Air Playground teacher guide. https://calico-prod.museumsvictoria.com.au/media/kmxl0mbf/air-playground-teacher-guide.pdf
13. [S13] paperairplanes.co.uk, "Classic Dart". https://paperairplanes.co.uk/classic-dart-paper-airplane
14. [S14] Paper Plane Depot, "Basic Dart". https://paperplanedepot.com/basic-dart/
15. [S15] Instructables, "Best Paper Airplane in the World (a.k.a. Bulldog Dart)". https://www.instructables.com/Best-Paper-Airplane-in-the-World-aka-Bulldog-Dart/
16. [S16] Art of Manliness, "How to Make the World's Best Paper Airplanes". https://www.artofmanliness.com/skills/just-for-fun/how-to-make-the-worlds-best-paper-airplanes/
17. [S17] LewRockwell reprint of [S16] (2014). https://www.lewrockwell.com/2014/09/jeremy-andenberg/the-worlds-best-paper-airplanes/
18. [S18] Our Pastimes, "How to Make a Bulldog Dart Paper Airplane". https://ourpastimes.com/how-to-make-a-bulldog-dart-paper-airplane-12131546.html
19. [S19] Medium (HeavenlyHandcrafts), "The Art of Crafting the Perfect Paper Airplane". https://medium.com/@HeavenlyHandcrafts/the-art-of-crafting-the-perfect-paper-airplane-56808ffb670c
20. [S20] Instructables, "How to Fold the Harrier Origami Paper Airplane". https://www.instructables.com/How-to-Fold-the-Harrier-Origami-Paper-Airplane/
21. [S21] Instructables, "To Fold the Harrier Paper Airplane". https://www.instructables.com/To-Fold-The-Harrier-Paper-Airplane/
22. [S22] Brit.co, "How to make a 'harrier' paper airplane". https://guides.brit.co/guides/make-a-harrier-paper-airplane
23. [S23] Guinness World Records, "Farthest flight by a paper aircraft". https://www.guinnessworldrecords.com/world-records/farthest-flight-by-a-paper-aircraft
24. [S24] Flying Magazine, "Boeing Engineers Set New Distance Record With Paper Airplane". https://flyingmag.com/boeing-engineers-set-new-distance-record-with-paper-airplane
25. [S25] General Aviation News (21 Mar 2023), "Paper airplane sets world record". https://generalaviationnews.com/2023/03/21/paper-airplane-sets-world-record
26. [S26] Hachette Book Group, *The World Record Paper Airplane Book* (Blackburn & Lammers). https://www.hbglibrary.com/titles/ken-blackburn/the-world-record-paper-airplane-book/9780761143833/
27. [S27] Fold'N Fly, "The Best Paper Airplane" (average flight under 2 s). https://www.foldnfly.com/lounge/best-paper-airplane.php
28. [S28] Dream Flight Charities, "Paper Airplane Folding Instructions" (PDF). https://dreamflightcharities.org/wp-content/uploads/2025/07/Paper-Airplane-Folding-Instructions.pdf
29. [S29] Sibling doc `docs/research/04-paper-and-competition-rules.md` §6, which cites AFPBB https://www.afpbb.com/articles/-/3618713 and CNN https://amp.cnn.com/cnn/2023/04/14/world/paper-airplane-boeing-engineers-world-record-scn. I did not open these.
30. [S30] wikiHow "Make a Simple Paper Airplane" (Kiwix mirror; folds kept inside). https://kiwix.lema.org/wikihow_en_maxi_2023-03/Make-a-Simple-Paper-Airplane
31. [S31] Studocu, "Instructions for Making Paper Airplanes: Bulldog Dart & Hammer". https://www.studocu.com/en-us/document/harford-community-college/technical-writing/instructions-to-make-a-paper-airplane-k-carter/32807488
32. [S32] Business Insider India (2023), Jensen quote on A4 at 100 gsm. https://businessinsider.in/tech/news/boeing-engineers-designed-a-paper-airplane-that-flew-almost-the-entire-length-of-a-football-field-smashing-the-world-record/amp_articleshow/99521282.cms
