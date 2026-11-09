# 07 · Computational origami for the simple-fold engine

Scope: data model, simple folds with layer selection, fold-line construction, flat-foldability facts, rigid "open to 3D" kinematics, robust geometry, mass properties, fold animation and prior art. Researched 2026-11-09.

Tags: `[S#]` is a numbered source below. **(derived)** means derived in this note; every formula marked this way was checked numerically [S26]. **(unverified - model knowledge)** means I could not confirm it online. **(engineering choice)** means a tunable decision, not a fact.

## Summary for implementers

1. **State.** A folded state is a list of **convex faces in sheet coordinates** (metres, front side = +z). Each face has a 2D isometry `x_f = A_f·p + b_f` (A_f ∈ O(2), parity π_f = det A_f = ±1). One **global stacking order** (array, bottom → top) covers the whole state. Convex faces overlap in one connected region, which FOLD requires before face orders mean anything [S1]. A total order is always enough for simple folds (derived, §2.3).
2. **Simple fold.** A fold is a line ℓ in folded coordinates `{x : n·x = d}`, a moving side, valley or mountain, and a moving set S. Split the faces of S that cross ℓ. Reflect S with `A' = (I − 2nnᵀ)A`, `b' = (I − 2nnᵀ)b + 2dn`. Put S on **top (valley)** or **bottom (mountain)** in **reversed** order. This is Rabbit Ear's all-layers rule [S3].
3. **Which layers can move.** The valid subsets are fixpoints of two closures: (a) adjacency across every edge not on ℓ; (b) on the moving side, every face that overlaps a moving face and lies above it (valley) or below it (mountain) must move too (derived). Offer the distinct fixpoints seeded from "top k layers under the finger". All layers is always valid.
4. **Editor folds.** Huzita–Justin O1–O5 cover every paper-plane step. Their formulas are in §3 and were checked numerically [S26]. O6 (a cubic with up to 3 solutions [S10]) and O7 are not needed.
5. **3D pose.** The pose is a laminar tree of hinges on the final flat state. Each hinge is a partial simple fold with |φ| < 180°. A face's world transform is the product of Rodrigues rotations from root to leaf, all expressed in the flat frame. Two non-flat hinges must never cross inside the paper (Belcastro–Hull vertex condition [S18]).
6. **Mass.** Compute shoelace moments per face in sheet coordinates, push them through the face's 3D rigid transform, sum them and multiply by σ = grammage. Total mass is exactly σ × sheet area, which makes a free unit test (A4 at 80 g/m² = 4.990 g, matching doc 04).
7. **Tolerances.** Scale tolerances with sheet size L: side test 1e-9·L, vertex weld 1e-7·L, smallest allowed physical feature 1 mm (engineering choice). For comparison, Rabbit Ear uses 1e-6 absolute [S3] and Flat-Folder uses L_min/300 on import [S20].
8. **Libraries.** Don't bundle Rabbit Ear: it is GPL-3.0 and about 79 kB gzipped [S3][S26]. Use FOLD (MIT) for file I/O [S1][S2]. For silhouette union at design time only, use polygon-clipping (MIT, 9.7 kB gz) or martinez (MIT, 6.8 kB gz) [S22][S23][S26].
9. **Thickness.** Thickness "creep" is about π(n−1)t, which is 1.0 mm for 4 layers at t = 0.106 mm (derived). Ignore it in the physics and fake it visually.

---

## 1. Data models

### 1.1 FOLD format v1.2 [S1]

| Field | Specified meaning | Use here |
|---|---|---|
| `vertices_coords` | `[x,y]` or `[x,y,z]` per vertex | sheet coordinates (CP frame) and folded coordinates (folded frame) |
| `edges_vertices` | `[u,v]` endpoints | – |
| `edges_assignment` | `B` border, `M` mountain, `V` valley, `F` flat (unfolded) crease, `U` unassigned, `C` cut, `J` join (C and J added in v1.2) | CP export |
| `edges_foldAngle` | degrees in [−180, 180]; **+ valley, − mountain**; 0 for F/U/B; sign must match the assignment | ±180 after a flat fold, φ in the 3D pose |
| `faces_vertices` | counter-clockwise; "the counterclockwise ordering of each face defines the side/sign of its normal vector" | sheet coordinates are y-up, so the front side has normal +z |
| `faceOrders` | `[f,g,s]`: +1 means f is above g, "on the side pointed to by g's normal vector in the folded state"; −1 means below; 0 or omitted means unknown | export `s = sign(z_f − z_g)·π_g` (derived) |
| `frame_classes` / `frame_attributes` | `creasePattern`, `foldedForm`; `2D`, `3D`, `selfTouching`, `convexFaces` … | – |
| `file_frames`, `frame_parent`, `frame_inherit` | multiple frames, organised as a tree with property inheritance | store the fold sequence one frame per step |

The spec states: "Two faces have a consistent 'above' or 'below' relationship only if they overlap in a single connected region… guaranteed by convex faces" [S1]. **So keep every face convex.** Splitting a convex face by a line always yields two convex faces.

### 1.2 Rabbit Ear (Robby Kraft) [S3]

I read the source of npm `rabbit-ear` 0.9.41 (2026-10-16).
- **Graph.** A plain FOLD-keyed object. `flatFold(graph, {vector, origin}, assignment="V", epsilon=1e-6)` builds `faces_layer` (stack position), `faces_matrix2` (2×3 affine per face), `faces_winding` (parity) and `faces_crease` (the fold line pulled back into each face's sheet frame via `invertMatrix2`). It then splits every crossing face: an all-layers fold.
- **Assignment and layers.** A new crease gets `assignment` when the face's winding is true and the opposite assignment otherwise. Layers are rebuilt by `foldFacesLayer`: non-folding faces keep their relative order at the bottom, and folding faces, sorted by **descending** old layer, are appended on top.
- **Other entry points.** `simpleFoldLine/Ray/Segment` produce pairwise `faceOrders` instead of a global layer list. `module/axioms` implements O1–O7 in both vector/origin and normal/distance form; O6 goes through a polynomial (cubic) solver.
- **Licence.** GPL-3.0 (package.json `"GPLv3"`; licence file is GNU GPL v3). Learn from it, but don't ship it unless the app is GPL.

### 1.3 Origami Simulator (Ghassaei, Demaine, Gershenfeld) [S4][S5]

- **Method.** It folds **all creases at once**, "iteratively solving for small displacements in the geometry of an initially flat sheet due to forces exerted by creases", using GPU fragment shaders. It builds on Schenk & Guest and on Tachi [S4]. Mesh edges are beams in a pin-jointed truss with axial and angular constraints, and θ_target is < 0 for mountain, > 0 for valley and 0 for facet creases [S5].
- **Source defaults** [S4]:

  | Quantity | Value |
  |---|---|
  | Axial stiffness | `k_axial = 20/l0` |
  | Crease stiffness | `k_crease = 0.7·l0`; facet creases also `0.7·l0` |
  | Face stiffness | 0.2 |
  | Damping | ratio ζ = 0.45; beams `c = 2ζ√(k·m_min)`, creases `2ζ√k` |
  | Integration | Euler by default (Verlet optional) |
  | Time step | `dt = 0.9/(2π·max √(k/m_min))` |

- **SVG import colours** (source `pattern.js`): black = border, red `#ff0000` = mountain, blue `#0000ff` = valley, green = cut, yellow = triangulation (facet), magenta = undriven hinge. The target angle is ±opacity × 180°.
- **Licence:** MIT, © 2018 Amanda Ghassaei.
- **Fit for this app.** It has no layer order and no step sequence, so it can't be our core. It is a good **external validator**: export FOLD from our engine and load it there.

### 1.4 Minimal model for sequential simple folds

The model the brief proposes is enough: convex faces, one isometry per face and one layer order.
- A face carries immutable sheet-space vertices, `A_f` (a 2×2 orthogonal matrix), `b_f` and `π_f = det A_f`.
- Folded coordinates are always **derived** as `A_f p + b_f` and never stored as truth. This prevents drift: every fold re-reflects exact sheet data.
- Edges hold `{v0, v1, faces[2], assignment, foldAngle}`. The state holds `order: FaceId[]`.
- **Texture.** Every face's UV is simply its sheet coordinate divided by (w, h). That makes multi-colour and patterned paper free: the front and back textures are indexed in sheet space.

---

## 2. Simple-fold algorithms

### 2.1 Literature

| Work | Result relevant here |
|---|---|
| Arkin, Bender, Demaine et al., "When Can You Fold a Map?" (Comput. Geom. 2004) [S6] | **Definitions.** A simple fold rotates a portion of paper by ±180° about a line segment without self-intersection. **One-layer** folds exactly one layer, **all-layers** must fold every layer overlapping the crease, and **some-layers** may fold any number. **Hierarchy.** One-layer- or all-layers-foldable ⇒ some-layers-foldable ⇒ flat-foldable. **Special cases.** In 1D, flat-foldable ⇔ one-layer simple-foldable. Orthogonal maps on a rectangle are efficiently decidable, while slight generalisations are (weakly) NP-complete. **Limit.** The crane is not simple-foldable. |
| Akitaya, Demaine, Ku, "Simple Folding is Really Hard" (JIP 25, 2017) [S7] | Formalises the models and adds **infinite** variants, in which the fold line crosses the whole paper and exactly one, at least one, or all layers are folded. Deciding simple foldability is strongly NP-hard. Orthogonal map folding stays polynomial. |
| Akitaya et al., "Infinite All-Layers Simple Foldability" (2019) [S8] | Follow-up work on the all-layers model. |
| Bern & Hayes 1996, as cited in [S9] | Flat-foldability of a general crease pattern is NP-hard, whether or not M/V is assigned (reduction from NAE-3SAT). |

**Implication.** Running a known sequence forward is cheap (polynomial per fold); inferring a sequence or layer order from a drawn crease pattern is NP-hard [S7][S9]. Store designs as fold sequences.

### 2.2 One simple fold

Folded-plane line ℓ: `n·x = d` with |n| = 1, where n points into the moving half-plane H. Reflection: `R(x) = x − 2(n·x − d)n`.

1. **Choose the moving set S** (§2.3). For all-layers, S is every face with area in H.
2. **Split.** For each f ∈ S that crosses ℓ, pull ℓ back to sheet space: `n_s = A_fᵀ n`, `d_s = d − n·b_f`. Clip f's sheet polygon (§6.2), keep the H half in S and the other half stationary, and record the new edge as a **hinge**.
3. **Reflect.** For f ∈ S: `A_f ← (I − 2nnᵀ)A_f`, `b_f ← (I − 2nnᵀ)b_f + 2dn`, `π_f ← −π_f`.
4. **Re-stack.**
   - **Valley** (flap toward viewer): `order ← [stationary in old order] ++ [S in reversed old order]`.
   - **Mountain:** `order ← [S reversed] ++ [stationary]`.
   - This matches Rabbit Ear's `foldFacesLayer` [S3].
5. **Assign creases.** Each hinge edge, and each edge lying on ℓ that joins a moving face to a stationary face, gets sheet-space assignment `V` if π_f(before) = +1 and `M` if −1 for a valley fold, and the swap of those for a mountain fold. Fold angle is ±180 [S1][S3].

### 2.3 Which layer subsets are physically foldable (derived)

These conditions are derived here from rigid 180° rotation. They are consistent with the some-layers model of [S6][S7], but they are not quoted from those papers.

- **C1 – Connectivity.** If f ∈ S shares an edge **not lying on ℓ** with face g, then g's H-part ∈ S, and g is split if it crosses ℓ. The paper can't tear, and existing flat creases stay at ±180°. Disallowing edges on ℓ between two faces that are both in H prevents an accidental "unfold".
- **C2 – No blocking.**
  - **Valley:** if f ∈ S and g ∉ S, and g∩H overlaps f with positive area, then g must be **below** f. Otherwise g sits in the path of the rotating flap.
  - **Mountain:** mirror image; g must be above f.
  - Stationary layers that only *touch* ℓ from the other side are fine: the flap wraps around their edge. That wrap is where real creep comes from (§7.4).
- **C3 – Non-trivial.** S ≠ ∅, and at least one face stays stationary. Folding everything with nothing stationary is just "turn over".

**UI procedure.**
1. Sort the faces under the touch point (in H) from the top. Seed with the top k for k = 1…K.
2. Iterate C1 and C2 to a fixpoint (C2 adds the blocking face rather than rejecting).
3. Dedupe the results and offer them as "fold 1 / 2 / … / all layers".

Every fixpoint satisfies C1 and C2 by construction. All-layers is always valid.

**Why a total order survives** (derived): after a valley fold, every moved face is above every stationary face it now overlaps, because the flap arrives from above. Moved-moved pairs are inverted by the reflection, and stationary pairs are unchanged. By induction one array is always a consistent stacking.

**Not simple folds:** inside and outside reverse folds, squash, petal, and tucks between layers. Add them later as dedicated macros.

---

## 3. Geometric references for the editor

Lines are written `{x : n·x = d}` with |n| = 1, and `u = (−n_y, n_x)` is the line direction. All formulas below were verified numerically [S26]. The solution counts for O5 and O6 come from [S10]. The O7 count is derived.

| Axiom [S10][S11] | Fold line | Solutions |
|---|---|---|
| **O1** through p1, p2 | `u = (p2−p1)/‖p2−p1‖`, `n = (−u_y, u_x)`, `d = n·p1` | 1 |
| **O2** p1 onto p2 | `n = (p2−p1)/‖p2−p1‖`, `d = n·(p1+p2)/2` (perpendicular bisector) | 1 |
| **O3** line l1 onto l2 | for s ∈ {+1, −1}: `n = (n1 − s·n2)/k`, `d = (d1 − s·d2)/k` with `k = ‖n1 − s·n2‖`; drop the candidate if k < ε | 2, or 1 if parallel (midline) |
| **O4** through p, ⊥ l | `n = u_l`, `d = n·p` | 1 |
| **O5** through p2, p1 onto l | `h = n·p2 − d`, `f = p2 − h·n`, `r = ‖p1−p2‖`; none if r < \|h\|; `q = f ± √(r²−h²)·u`; fold = O2(p1, q), skipping q = p1 | 0–2 |
| **O6** p1 onto l1 **and** p2 onto l2 | roots of a cubic (Rabbit Ear `axiom6` [S3]) | 0–3 |
| **O7** p onto l1, ⊥ l2 | `t = (d1 − n1·p)/(n1·u2)`; none if n1·u2 ≈ 0; `q = p + t·u2`; fold = O2(p, q) | 0–1 |

Background on the axioms:
- Justin published all seven in 1986. Huzita rediscovered O1–O6, and Hatori found O7 [S10].
- Lang showed the list is complete [S10][S11][S12].
- Lucero counts **eight** elementary operations, the extra one being "fold along a given line" [S13].

**Paper-plane coverage** (engineering mapping):

| Step | Operation |
|---|---|
| Fold in half lengthwise | O3 with parallel edges (or O2 corner to corner) |
| Corners to centre line | O3 (bisector of top edge and centre crease) or O5 (pivot at top-centre) |
| Slanted edge to centre | O3 |
| Nose tip down to a mark; Nakamura lock | O2 |
| Elevator or flap cut-in ⊥ trailing edge | O4 |
| Wing fold parallel to keel at height h | a "measured parallel" helper: `n = n_keel`, `d = d_keel + h` (not an axiom) |

**Snapping on touch screens** (engineering choices):
- **Targets.** Measure snap radii in **screen** pixels, not paper units: 22 CSS px for points and 14 px for lines, with release hysteresis at 1.5×. Apple HIG 44 pt, Material 48 dp and WCAG 2.2 24 CSS px targets are the usual references (unverified - model knowledge).
- **Priority:** folded-state vertex > edge midpoint > crease/edge intersection > nearest point on an edge > free.
- **Free lines** snap to 15° steps, and to an O3 bisector within 3°.
- **Gesture:** touch the point to move (the seed, which also picks the layer group), drag to the destination, and the fold is O2(p, q) by default. If q snaps to a line while a pivot is pinned, use O5.
- **Feedback:** show a live ghost of the folded flap and an offset loupe, because the finger hides the target.

---

## 4. Flat-foldability facts worth teaching

**Maekawa.** At a flat-folded interior vertex, **M − V = ±2**, which forces the degree to be even [S14][S15].

**Kawasaki (Kawasaki–Justin, Husimi).**
- The alternating sum of sector angles is 0. On a flat sheet, that is equivalent to **sum of alternate angles = 180°** [S14][S15].
- It is necessary but not sufficient. Even local plus global M/V checks don't decide flat-foldability, which is NP-hard [S9].
- Flat-Folder flags a vertex when `|Σ even angles − π| > 1e-5` rad [S20].
- Flat-folded crease patterns are face-2-colourable, so faces across a ±180° crease have opposite parity (unverified - model knowledge).

**Engine use.** Simple folds always produce flat-foldable patterns. So Maekawa, Kawasaki and the parity rule should hold at every interior vertex after every fold. Make them **runtime assertions and unit tests**, not user-facing validators.

**Diagram conventions:**

| Convention | Valley | Mountain | Other |
|---|---|---|---|
| Yoshizawa–Randlett diagrams [S16][S17] | dashed line | dash-dot or dash-dot-dot (varies by author) | thin line = existing crease; dotted line = hidden edge or fold not yet made |
| Origami Simulator SVG [S4] | blue | red | black border, green cut, yellow facet, magenta hinge |
| Flat-Folder SVG [S20] | blue | red | gray = F (flat) |

**Recommendation:** in crease-pattern views use red = mountain and blue = valley **plus** the Yoshizawa–Randlett line styles. The line style keeps the meaning readable for colour-blind users.

**One-line explanations for the professor:**
- "A valley comes toward you; a mountain goes away."
- "Around any point where folds meet, mountains and valleys always differ by two."
- "Every other angle adds up to a straight line."

---

## 5. From flat-folded to 3D

- **Hinge.** A hinge is a partial simple fold on the **final flat state**: a line ℓ_h, a moving set M_h found with §2.3 (C1 and C2, seeded by layers), and an angle φ_h with |φ_h| < π. The keel is the clearest case: the two fuselage halves are stacked on the *same* side of the keel crease, so the "open keel" hinge is a some-layers hinge that moves the upper half-stack.
- **Rotation.** The axis is the point p0 on ℓ (at the stack height) with direction u, oriented so that the moving side is on the left (`n = ẑ × u`). Then **φ > 0 lifts the flap toward +z (valley)** (derived). Rodrigues: `R(u,φ) = I·cosφ + sinφ·[u]× + (1 − cosφ)·uuᵀ`, and `x' = R(x − p0) + p0`.
- **Forward kinematics.** The hinges form a tree whose moving sets are **laminar**: any two are either nested or disjoint. Parents come first, for example keel half → wing → winglet or elevator. With every axis written in the flat frame, a face's body transform is `M_f = H_root ∘ … ∘ H_leaf` over the hinges whose sets contain f (derived).
- **Consistency conditions:**
  - **Separation.** Every edge between M_h and the rest of the parent body lies on ℓ_h.
  - **No crossing.** No two non-flat hinges cross inside any face.
  - **Flat creases stay flat.** Inside a body, earlier creases stay at ±180°.
  - These are the local cases of the Belcastro–Hull condition, which says the ordered product of the rotation matrices around each interior vertex must be I [S18]. Two straight creases crossing at a vertex can only fold rigidly if one of them stays at 0 or ±180° (derived from [S18]).
  - Tachi's rigid-origami simulator works by projecting onto this constraint manifold. We avoid needing it by keeping the hinge tree acyclic [S19].
- **Collision.** Clamp hinge ranges so bodies can't interpenetrate (wing vs keel), and check this at design time only.

---

## 6. Robust 2D geometry in floating point

### 6.1 Tolerances (engineering choices; L = longest sheet side)

| Name | Value | Purpose |
|---|---|---|
| `EPS_SIDE` | 1e-9·L (≈0.3 nm on A4) | classify a vertex as on ℓ / + / − |
| `EPS_WELD` | 1e-7·L | merge a new vertex with an existing one |
| `MIN_FEATURE` | 1 mm | reject or snap a fold that would create an edge, flap or sliver narrower than this (real paper can't hold it) |
| `EPS_ANGLE` | 1e-9 rad | parallel test in O3, O7 |
| Reference values | Rabbit Ear 1e-6 [S3]; Flat-Folder import weld L_min/300, Kawasaki 1e-5 [S20] | – |

Store unit vectors renormalised, and recompute folded coordinates from sheet coordinates after every step. If exact orientation is ever needed (for example in the overlap test), `robust-predicates` (Unlicense, Shewchuk port) costs **1.3 kB gz** [S25][S26]. Note that its README assumes the y axis points down. **SVG is y-down too**, so keep the engine y-up and flip only when rendering.

### 6.2 Convex polygon by a line (Sutherland–Hodgman, one half-plane)

```
s_i = n·P_i − d ; cls_i = (s_i > EPS) ? + : (s_i < −EPS) ? − : 0
if no '+' or no '−': no split (face lies on one side; touching is not crossing)
for each edge (P_i, P_j):
  emit P_i into side(cls_i) (both sides if 0)
  if {cls_i, cls_j} = {+, −}: X = P_i + s_i/(s_i − s_j)·(P_j − P_i); emit X into both sides
```

- **Shared edges.** Compute X from the edge's canonical direction (lower vertex id first), and cache it by edge id. Both faces then receive the bit-identical vertex, so no T-junction appears. C1 already forces any neighbour of a split edge to be split as well (derived).
- **Overlap test for C2:** clip f against each edge half-plane of g, and treat area > (MIN_FEATURE)² as overlap. The cost is O(F²) per fold, run on fold, never per frame.

### 6.3 Silhouette union (only for outlines and per-body aero planforms)

Bundle sizes are my own esbuild 0.24 minified, `gzip -9` measurements [S26].

| Library | Licence | Version (date) | min / gz | Notes |
|---|---|---|---|---|
| polygon-clipping | MIT | 0.15.7 (2023-12-18) | 29.6 / **9.7 kB** | Martinez–Rueda–Feito, O((n+k) log n); infinite-loop guards "usually caused by floating-point math round-off errors" [S22] |
| martinez-polygon-clipping | MIT | 0.9.1 (2026-11-08) | 19.4 / **6.8 kB** | handles holes, self-intersections and degenerate overlaps [S23]; pin ≥ 0.8.1 because 0.9.1 is one day old |
| clipper2-js | BSL-1.0 | 1.2.4 (2024-01-01) | 67.0 / **18.6 kB** | integer-coordinate Clipper2 port; oddly declares Angular peer dependencies, though none were bundled [S24] |
| rabbit-ear (whole) | GPL-3.0 | 0.9.41 | 259.7 / **78.6 kB** | reference only |

In the renderer, painter's order (bottom → top) replaces any union.

### 6.4 Area, centroid and second moments of a polygon

For CCW vertices (x_i, y_i) with `c_i = x_i·y_{i+1} − x_{i+1}·y_i` [S27]:

```
A    = ½ Σ c_i
Sx   = ∫x dA  = (1/6)  Σ (x_i + x_{i+1}) c_i          Sy = (1/6) Σ (y_i + y_{i+1}) c_i
Sxx  = ∫x² dA = (1/12) Σ (x_i² + x_i x_{i+1} + x_{i+1}²) c_i
Syy  = ∫y² dA = (1/12) Σ (y_i² + y_i y_{i+1} + y_{i+1}²) c_i
Sxy  = ∫xy dA = (1/24) Σ (x_i y_{i+1} + 2x_i y_i + 2x_{i+1} y_{i+1} + x_{i+1} y_i) c_i
```

Note that engineering texts write "I_xx" for ∫y² dA. Checks [S26]:
- An A4 rectangle reproduces `a³b/3`, `ab³/3` and `a²b²/4` to 1e-15.
- A random convex 12-gon matches a 2×10⁶-sample Monte Carlo to 4 digits.

**Thin lamina in 3D** (derived; verified by Monte Carlo [S26]). Face f maps sheet point p to `X = R_f[p;0] + t_f`. Define `q = [Sx, Sy, 0]` and `Q = [[Sxx,Sxy,0],[Sxy,Syy,0],[0,0,0]]`. Then:

```
s_f = R_f q + A_f t_f                                         (first moment, m²·m)
J_f = R_f Q R_fᵀ + (R_f q) t_fᵀ + t_f (R_f q)ᵀ + A_f t_f t_fᵀ  (∫X Xᵀ dA)
```

Zero thickness is a safe approximation: the out-of-plane thickness term is `σt²/12` per unit area, which is about 1e-7 of the in-plane terms (derived).

---

## 7. Animating a fold

### 7.1 SVG top view (orthographic, derived)

A point at signed distance `s = n·x − d` projects to `x' = x − (1 − cosθ)·s·n`. With k = 1 − cosθ, the SVG transform is `matrix(1−k·nx², −k·nx·ny, −k·nx·ny, 1−k·ny², k·d·nx, k·d·ny)`. θ = π gives the reflection exactly.
- **Visible side:** front colour when `π_f·sign(cosθ) > 0`, back colour otherwise.
- **Draw order:**
  - Valley: the moving group is drawn **above** everything for all θ ∈ (0, π].
  - Mountain: the moving group is drawn **below** everything.
  - Inside the group: old order while θ < π/2, reversed after.
- **Depth cue:** a drop shadow offset ∝ sinθ.

### 7.2 3D (Three.js)

- **Build geometry from sheet coordinates** (always CCW) and embed each isometry as `E(A) = [[A,0],[0,det A]]`, which is in SO(3) (verified [S26]). Winding is never mirrored, so `FrontSide` = paper front and `BackSide` = paper back.
- **Layer heights.** Put layer i at `z = i·δ`, with δ = t = 0.106 mm (doc 04), or exaggerate δ, or use polygon offset against z-fighting.
- **Animating the flap.** Rotate the moving group by `θ(t) = π·ease(t)` about ℓ at the top-of-stack height, then snap to the new layer heights. The jump is ≤ N·δ, which is invisible.

### 7.3 Easing (engineering choices)

| Item | Choice |
|---|---|
| Curve | `easeInOutSine e = (1 − cos πt)/2`, or a slightly ease-out-heavy cubic |
| Duration | 0.8 s per fold; 1.2–1.5 s in the professor tutorial |
| End beat | 120–150 ms "crease press" highlight along ℓ |
| Optional realism | a flap curl that decays to 0 on landing |

### 7.4 Thickness creep

- **Size (derived).** Folding a stack of n layers through 180° puts layer k on a radius of about (k − ½)t. The outermost layer therefore uses about **π(n−1)t** more length than the innermost one. At t = 0.106 mm that is 0.33 mm for 2 layers, 1.0 mm for 4 and 2.3 mm for 8.
- **Effect.** On a ~0.3 m plane this shifts flap edges and the CG by under 0.5 % of chord.
- **Decision.** Ignore creep in geometry and mass. Optionally round the rendered fold edges with a radius of about n·t/2.

---

## 8. Open-source projects worth learning from

| Project | Licence | Approach | Limits |
|---|---|---|---|
| FOLD (edemaine) [S1][S2] | MIT | file spec plus JS conversion and filter utilities (npm `fold` 0.12.0, 2023) | no folding engine |
| Rabbit Ear [S3] | GPL-3.0 | full JS origami library: axioms, all-layers `flatFold`, `simpleFold*`, layer solving, SVG | copyleft; 78.6 kB gz |
| Origami Simulator [S4][S5] | MIT | GPU compliant bar-and-hinge model, all creases simultaneously, FOLD and SVG import | no layering or sequence; facets deform |
| Flat-Folder (Jason Ku) [S20] | MIT | finds every valid flat layer order of a crease pattern (details below) | for CP analysis, not sequential folding |
| ORIPA (Mitani) [S21] | GPL-3.0 | Java crease-pattern editor with folded-shape estimation (first released 2005, open source 2012) | desktop Java |
| Paper-plane sims: charlestytler/PaperAirplaneSim (MATLAB, after Stengel's Princeton example), nissmar/Paper_Plane_VCL (C++), LOrangex/suzanne-paper-plane-lab (MIT, Three.js; presets, clips, dihedral, winglets, AoA and L/D telemetry) [S28] | as noted | point-mass or preset airframes | **none builds the airframe from folds** (search summary [S28]); this is the gap Paper Plane Lab fills |

Flat-Folder detail: it builds an overlap graph of cells and solves Boolean faceOrder variables under four constraint types [S20]:

| Constraint | Valid assignments |
|---|---|
| taco-taco | 16 of 64 |
| taco-tortilla | 4 of 8 |
| tortilla-tortilla | 2 of 4 |
| transitivity | 6 of 8 |

The constraint graph is O(n³) and takes O(n⁵) to build [S20].

---

## 9. RECOMMENDED ENGINE DESIGN

### 9.1 Data structures (pure TS, immutable snapshots for undo)

```
Sheet   { w, h: m; sigma: kg/m² (0.080); front, back: Material }
Vertex  { id; p: [x,y] sheet m }                       // never moved
Face    { id; v: VertexId[] (CCW, convex); A: [a,b,c,d]; b: [x,y]; parity: ±1; bodyId? }
Edge    { id; v0, v1; f: [FaceId, FaceId|null]; asg: 'B'|'M'|'V'|'F'; angle: deg }
State   { vertices; faces; edges; order: FaceId[] /*bottom→top*/; stepIndex }
FoldOp  { line: {n,d} folded; side: ±1; kind: 'V'|'M'; seed: {pt, k}|'all' }
Hinge   { id; parent: HingeId|null; line; side; seed; phi: rad; range: [min,max] }
```

### 9.2 (i) A simple fold with layer selection

1. **Validate ℓ.** Normalise n, reject ‖n‖ < EPS_ANGLE, and orient n toward the side the user grabbed.
2. **Choose the moving set.** For seed k, S₀ is the top k faces (bottom k for mountain) whose folded polygon contains the seed point within H. Repeat until nothing changes:
   - C1: add the H-part of every face that shares a non-ℓ edge with S.
   - C2: add every face whose H-part overlaps S by more than MIN_FEATURE² and lies above it (valley) or below it (mountain).
3. **Reject degenerate results.** Fail if S = ∅, if nothing stays stationary (offer "turn over" instead), or if any split creates a part narrower than MIN_FEATURE (offer to snap ℓ to the nearby vertex).
4. **Split** each f ∈ S that crosses ℓ in sheet space (§6.2). Use the edge-cached intersection vertices. Each half inherits f's index in `order`; the stationary half stays and the H half joins S.
5. **Reflect** S (§2.2 step 3) and **re-stack** it (§2.2 step 4).
6. **Assign creases.** For each hinge edge set `asg = (kind==='V') === (parityBefore===+1) ? 'V' : 'M'` and `angle = asg==='V' ? 180 : −180`. An `F` edge that now lies on ℓ between a moving face and a stationary face is re-assigned the same way.
7. **Assert invariants:** ΣA_f = w·h (1e-9 relative); det A_f = π_f; Maekawa and Kawasaki at interior vertices; faces across ±180° edges have opposite parity.

### 9.3 (ii) 3D pose from hinge angles

1. **Order the hinges** topologically, parents first.
2. **Split each body.** Within the parent's face set, compute M_h with §2.3 at φ = π semantics, and split the faces crossing ℓ_h. Check that the sets are laminar and that every cross-edge lies on ℓ_h.
3. **Compose transforms.** For each face, `M_f = Π H(h)` over the hinges containing f, from root to leaf, with `H(h): x ↦ R(u_h, φ_h)(x − p0_h) + p0_h` written in the flat frame.
4. **Assemble the face transform:** `R_f = R_Mf·E(A_f)` and `t_f = R_Mf·[b_f; z_f] + t_Mf`, with `z_f = order.indexOf(f)·δ`.
5. **Clamp** φ to the range that avoids interpenetration. A static table per preset is enough.

### 9.4 (iii) Mass properties

1. Compute the per-face moments (§6.4) once per fold step. They live in sheet space and depend only on the face polygon.
2. For each pose, sum `ΣA`, `Σs_f` and `ΣJ_f`.
3. `m = σ·ΣA`, `c = Σs_f/ΣA`, `J_c = ΣJ_f − ΣA·c cᵀ`, `I_cg = σ·(tr(J_c)·𝟙 − J_c)` (kg·m²).
4. Add ballast as point masses: `m_b(|r|²𝟙 − r rᵀ)`.

### 9.5 Edge cases

- **ℓ misses the paper.** No operation.
- **ℓ collinear with existing edges.** No split. Edges at 0° become hinges. Edges at ±180° with both faces in H are handled by C1, so nothing unfolds.
- **ℓ through vertices.** Vertices are classified as 0; a face that only touches ℓ is not split.
- **Slivers or near misses.** Snap ℓ to the vertex when the distance is under the snap radius.
- **Mountain fold of the top layer only.** Usually impossible, because C2 pulls in the layers below. Explain it as "you'd have to tuck it", a tuck macro.
- **Face blow-up.** All-layers folds can double the face count. Cap at 512 faces (engineering choice).
- **y-down SVG.** Flip only at render time.
- **Undo.** Use immutable snapshots, which are tiny.
- **Design fingerprint** (for spotting near-identical planes): sort the crease segments in normalised sheet coordinates quantised to 1 mm with their M/V. Take the minimum hash over the 4 rectangle symmetries × front/back flip, where a flip swaps M and V (engineering choice).

### 9.6 Constants

| Constant | Value | Source |
|---|---|---|
| Sheet thickness t | 0.106 mm | doc 04 |
| σ (grammage) | 0.080 kg/m² | doc 04 |
| EPS_SIDE / EPS_WELD | 1e-9·L / 1e-7·L | engineering choice |
| MIN_FEATURE | 1 mm | engineering choice |
| Kawasaki assert tolerance | 1e-5 rad | [S20] |
| Snap radius, point / line | 22 / 14 CSS px | engineering choice |
| Fold animation | 0.8 s, easeInOutSine | engineering choice |
| Render layer gap δ | t (exaggerate if z-fighting) | engineering choice |
| Max faces | 512 | engineering choice |

---

## Open questions and limits

- **Blocked sources.** `arxiv.org`, `erikdemaine.org` and `scripts.mit.edu` were blocked in this session, and the web-search quota ran out. Claims tagged S5–S19 and S27–S28 are confirmed by search results, not by reading the full papers. The exact formal some-layers condition in Arkin et al. and Akitaya et al. still needs checking against the PDFs. My C1/C2 rule is derived.
- **2-colourability** of flat crease patterns and the touch-target figures are unverified.
- **Non-simple folds** are out of scope for the core engine: reverse folds, squash folds and tucks between layers. Some plane designs (certain tail locks) need them.
- **Rigid-panel assumption.** Real wings bend. Doc 04's elasto-gravity length of 61–78 mm suggests single-layer spans sag. A compliant-panel model (Origami-Simulator style [S4]) could come later for visuals.
- **Creep** is estimated, not measured.

## Sources

1. [S1] E. Demaine et al., FOLD file format spec v1.2 – https://raw.githubusercontent.com/edemaine/fold/main/doc/spec.md (opened)
2. [S2] npm `fold` 0.12.0, MIT – https://registry.npmjs.org/fold (opened)
3. [S3] R. Kraft, Rabbit Ear 0.9.41 source (`graph/fold/flatFold.js`, `simpleFold.js`, `axioms/axioms.js`, `math/constant.js`, licence), GPL-3.0 – https://registry.npmjs.org/rabbit-ear ; https://rabbitear.org (opened)
4. [S4] A. Ghassaei, Origami Simulator README, LICENSE (MIT) and source `js/pattern.js`, `js/globals.js`, `js/beam.js`, `js/crease.js`, `js/dynamic/dynamicSolver.js` – https://raw.githubusercontent.com/amandaghassaei/OrigamiSimulator/master/README.md (opened)
5. [S5] Ghassaei, Demaine, Gershenfeld, "Fast, Interactive Origami Simulation using GPU Computation", Origami7 (OSME 2018) pp. 1151–1166 – https://erikdemaine.org/papers/OrigamiSimulator_Origami7/ (search-confirmed)
6. [S6] Arkin, Bender, Demaine, Demaine, Mitchell, Sethia, Skiena, "When Can You Fold a Map?", Comput. Geom. 29 (2004) 23–46; arXiv cs/0011026 – https://arxiv.org/abs/cs/0011026 (search-confirmed)
7. [S7] Akitaya, Demaine, Ku, "Simple Folding is Really Hard", J. Inf. Process. 25 (2017) 580–589 – https://www.jstage.jst.go.jp/article/ipsjjip/25/0/25_580/_article (search-confirmed)
8. [S8] Akitaya et al., "Infinite All-Layers Simple Foldability", arXiv 1901.08564 – https://arxiv.org/abs/1901.08564 (search-confirmed)
9. [S9] Akitaya et al., "Box Pleating is Hard" (cites Bern & Hayes 1996) – https://scripts.mit.edu/~jasonku/pdf/BOXPLEATINGHARD_LNCS2016.pdf (search-confirmed)
10. [S10] "Huzita–Hatori axioms", Wikipedia – https://en.wikipedia.org/wiki/Huzita%E2%80%93Hatori_axioms (search-confirmed)
11. [S11] R. J. Lang, "Huzita-Justin Axioms" – https://langorigami.com/article/huzita-justin-axioms/ (search-confirmed)
12. [S12] Alperin & Lang, "One-, Two-, and Multi-Fold Origami Axioms" (4OSME) – https://websites.math.leidenuniv.nl/edixhoven/talks/2017/2017_03_27origami_LiOdag/o4_multifold_axioms.pdf (search-confirmed)
13. [S13] J. C. Lucero, "On the elementary single-fold operations of origami", arXiv 1610.09923 – https://arxiv.org/abs/1610.09923 (search-confirmed)
14. [S14] T. Hull, "The Combinatorics of Flat Folds: a Survey", arXiv 1307.1065 – https://arxiv.org/abs/1307.1065 (search-confirmed)
15. [S15] "Kawasaki's theorem", Wikipedia – https://en.wikipedia.org/wiki/Kawasaki%27s_theorem (search-confirmed)
16. [S16] "Yoshizawa–Randlett system", Wikipedia – https://en.wikipedia.org/wiki/Yoshizawa%E2%80%93Randlett_system (search-confirmed)
17. [S17] Wikibooks, "Origami/Techniques/Yoshizawa-Randlett system" – https://en.wikibooks.org/wiki/Origami/Techniques/Yoshizawa-Randlett_system (search-confirmed)
18. [S18] belcastro & Hull, "Modelling the folding of paper into three dimensions using affine transformations", Linear Algebra Appl. 348 (2002) 273–282, doi:10.1016/S0024-3795(01)00608-5 – https://scholarworks.uni.edu/facpub/3391 (search-confirmed)
19. [S19] T. Tachi, "Simulation of Rigid Origami" (4OSME) – https://www.tsg.ne.jp/TT/cg/SimulationOfRigidOrigami_tachi_4OSME.pdf (search-confirmed)
20. [S20] J. S. Ku, Flat-Folder README and LICENSE (MIT) – https://raw.githubusercontent.com/origamimagiro/flat-folder/main/README.md (opened)
21. [S21] ORIPA README and LICENSE (GPL-3.0) – https://raw.githubusercontent.com/oripa/oripa/master/README.md (opened)
22. [S22] polygon-clipping 0.15.7 README – https://registry.npmjs.org/polygon-clipping (opened)
23. [S23] martinez-polygon-clipping 0.9.1 README – https://registry.npmjs.org/martinez-polygon-clipping (opened)
24. [S24] clipper2-js 1.2.4 package metadata – https://registry.npmjs.org/clipper2-js (opened)
25. [S25] robust-predicates 3.0.3 README (port of Shewchuk, https://www.cs.cmu.edu/~quake/robust.html) – https://registry.npmjs.org/robust-predicates (opened)
26. [S26] This research: esbuild 0.24.0 `--bundle --minify` plus `gzip -9` bundle measurements, and NumPy checks (rectangle closed forms, 2×10⁶-sample Monte Carlo, axiom reflections), 2026-11-09.
27. [S27] matgeom `polygonSecondAreaMoments` – https://octave.sourceforge.io/matgeom/function/polygonSecondAreaMoments.html ; Penn State ME481 notes – https://www.me.psu.edu/sommer/me481/notes_07_02.pdf (search-confirmed)
28. [S28] READMEs: https://raw.githubusercontent.com/charlestytler/PaperAirplaneSim/master/README.md , https://raw.githubusercontent.com/nissmar/Paper_Plane_VCL/master/README.md , https://raw.githubusercontent.com/LOrangex/suzanne-paper-plane-lab/main/README.md (opened); the "none generates airframe from folds" finding comes from a web-search summary.
