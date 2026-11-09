# Paper Plane Lab — Architecture and Product Spec

This file is the single source of truth for everyone working on the codebase.
Read it fully before writing code. Contracts live in `src/core/types.ts`.

## 1. Product

A cozy, game-style, mobile-first web app. You fold real paper airplanes, then test them in a
physically faithful flight lab. A kindly professor teaches you. Then the lab is yours.

Pillars, in priority order:

1. **Realism.** Folding obeys real simple-fold geometry. Flight comes from a 6-DOF rigid-body
   simulation with evidence-based low-Reynolds flat-plate aerodynamics and real wind models.
2. **Explanation.** Every number can be explained. Every flight gets a diagnosis in plain words.
   Sources are cited in-app (Notebook).
3. **Cozy.** Warm paper palette, soft shapes, SVG illustration, gentle motion, zero clutter.
   Depth lives behind menus.
4. **Mobile first.** Everything works one-handed on a 360 px wide phone. Desktop gets more room, not different features.
5. **Extensible.** A new airplane is one file plus one line in an index.

## 2. Stack and hard rules

- Vite 8, React 19, TypeScript 7 (strict), Zustand (persisted store), wouter (hash routing), three.js (flight scene only, lazy chunk).
- Vitest for unit tests. Tests live next to code as `*.test.ts`. CI = typecheck + vitest + build. Nothing heavier.
- Hosting: Cloudflare Workers static assets (`wrangler.jsonc`). No database yet. Storage is behind an interface.
- `src/core/**` is pure TypeScript. No DOM, no three, no React, no `Math.random`, no `Date.now` in simulation paths. Deterministic given a seed.
- SI units everywhere in core. Convert only at the display edge (`src/ui/format.ts`).
- No new npm dependencies without the lead's approval. Report the need instead.
- UI art is SVG (inline React components). No raster images. No icon fonts. No external font or CDN requests.
- Do not edit `src/core/types.ts`, `src/core/math/**`, `package.json`, or config files unless you own them. If a contract must change, say so in your final report.
- Commit small and often with `scripts/commit.sh "message" <your paths>`. It is path-scoped and serialised. Never `git push`. Never `git add -A`.
- `npx tsc --noEmit` checks the whole repo. Other people's unfinished files may show errors. Fix only errors in files you own; report the rest.

## 3. Layout and ownership

```
src/
  core/                 pure, deterministic, shared with the server
    types.ts            contracts (lead)
    math/               vec2/vec3/quat/mat3/rng (lead)
    paper/              sizes, stock, colour palette ids
    fold/               flat-fold engine, creases, 3D pose
    designs/            preset planes (one file each) + authoring helpers
    airframe/           PosedModel -> Airframe (mass, CG, inertia, aero elements)
    aero/               flat-plate element aerodynamics
    wind/               air properties, wind fields, turbulence
    env/                environments (physical side)
    sim/                6-DOF integrator, flight runner, metrics, diagnosis
    tunnel/             static readings, polars, trim and stability analysis
    similarity/         fingerprints, design hash, matching
    leaderboard/        arenas, scoring, ticket verification, stores
  app/                  App shell, routes, store, hooks
  ui/                   design system: tokens, components, icons, professor, charts, format
  features/
    onboarding/  hangar/  fold/  fly/  tunnel/  ranks/  notebook/
worker/                 Cloudflare Worker API (leaderboard, storage-agnostic; not wired into wrangler.jsonc yet)
docs/research/          evidence base with sources. Physics constants come from here.
```

## 4. Frames and conventions

See the header of `src/core/types.ts`. Summary:

- Sheet and table frames are 2D, metres, origin bottom-left, y up. The nose points to +y. Centreline is `x = paper.width / 2`.
- Body frame: +x nose, +y up, +z right wing. Origin on the centreline at the tail. Right-handed.
- World frame equals the three.js frame: +x downrange, +y up, +z right. Ground at y = 0.
- A positive rotation about +z pitches the nose up. About +x rolls right wing down. About +y yaws the nose LEFT.
- Quaternions `[x, y, z, w]` map body to world.

## 5. Folding model (`core/fold`)

### 5.1 Flat folding

State = list of convex pieces. Each piece: polygon in sheet coordinates, an isometry sheet -> table,
a `flipped` flag, and a unique stacking `layer`.

A **fold step** reflects the moving part across a line:

1. Classify every piece against the directed line (`left` = `cross(b - a, p - a) > 0`). Cut pieces that straddle it (epsilon = 1e-9 m; drop slivers below 1e-12 m²; warn `sliver`).
2. Pick the moving set.
   - `all`: every piece on the moving side.
   - `flap`: build the adjacency graph of the pieces on the moving side. Two pieces are adjacent when they share an edge in SHEET coordinates that lies strictly inside the moving half-plane (paper is continuous across it). The flap is the connected component of the outermost piece (highest layer for valley, lowest for mountain) containing `pick`. If any non-moving piece on the moving side lies outside the flap (above it for valley, below for mountain) and overlaps it, add that piece's component too and warn `flap-blocked`.
3. Reflect the moving pieces: compose the reflection with `iso`, toggle `flipped`.
4. Restack: moving pieces keep their relative order REVERSED and go above every other piece (valley) or below (mountain). Renumber layers 0..n-1.
5. Record creases in sheet coordinates. For a valley fold a crease on an unflipped piece is `valley`; on a flipped piece it is `mountain` (and the opposite for mountain folds).

`crease` steps record `aux` creases and return a frame with `movingIds` so the UI can animate a fold-and-return.
`flip` mirrors every piece about the centreline, toggles `flipped`, and reverses the stack.

Validation: a fold line must cut the model (`line-misses-paper`), endpoints must differ (`degenerate-line`),
something must move and something must stay (`nothing-moves`). Invalid steps are skipped with an `error` issue; folding never throws on user input.

### 5.2 Opening to 3D (`poseModel`)

The plane is built from the final flat state (which must be mirror-symmetric about the centreline) and a `ShapeSpec`:

1. Cut all pieces along the centreline, the wing line and its mirror, the winglet line and its mirror.
2. Assign each piece a side (table x right or left of the centreline) and a role: `fuselage` (between centreline and wing line), `wing` (beyond the wing line), `winglet` (beyond the winglet line). With `keel: 'none'` and no wing line everything is `center` (side 0) or, beyond a winglet line, `winglet`.
3. Seed body coordinates from the table: `X = y_table`, `Z = s * (x_table - centreX)`, `Y = 0`, with `s = +1` for a valley keel or none, `s = -1` for a mountain keel. So for a valley keel the viewer-facing face becomes the top.
4. Apply hinges per side, inner to outer, as rigid rotations of everything outboard of the hinge line:
   - keel: rotate about the centreline by `angles.keel` so the wall rises (+Y). `pi/2` = walls vertical and touching.
   - wing: rotate about the (already rotated) wing line back toward horizontal by `angles.wing`.
   - winglet: rotate about the (already rotated) winglet line by `angles.winglet` (positive = up).
5. Level the model: pitch it about the lateral axis so the wing root (hinge) line is parallel to +x. On planes whose wing fold is not parallel to the centre crease (the classic dart) the wings define "level", not the keel. Then shift so the tail is at x = 0, the lowest point of the keel line is at y = 0, and the plane of symmetry is z = 0. Issues from `poseModel` carry `step = SHAPE_STEP` (-1).

`finalHingeAngles(shape)`: `keel = (90 - keelSpreadDeg / 2) deg` (0 when keel is none), `wing = keel - dihedralDeg` in radians (for keel none: `wing = -dihedral`, i.e. the wing line is a dihedral break rotating up), `winglet = wingletDeg`.
The same function with intermediate angles drives the "open the wings" animation.

Shape validation (`shape-line-invalid`): the wing line must lie on the right half and cut the model; the winglet line must lie outboard of the wing line.

### 5.3 API

```ts
createSheet(paper): FlatState
applyStep(state, step, index): { state: FlatState; frame: StepFrame; issues: FoldIssue[] }
foldFlat(paper, steps): FoldResult
piecePolygon(piece): Vec2[]                      // table-frame polygon
isSymmetric(state, tol?): boolean
snapPoints(state): Vec2[]                        // outline vertices, edge midpoints, crease ends and intersections (table frame, deduped)
tableBounds(state): { min: Vec2; max: Vec2 }
// construction helpers shared by presets and the editor
foldPointToPoint(from, to): FoldLine             // perpendicular bisector; `from` is on the moving side = 'left' of the returned line
bisectorOfLines(l1, l2): FoldLine[]              // angle bisectors
mirrorLine(line, centreX): FoldLine
mirrorStep(step, centreX): FoldStep              // mirrored fold (swaps left/right as needed)
// animation: 3D polygons (table x, y, height z in metres) of every piece of a step at progress t in [0, 1]
frameAt(frame, t, layerGap): AnimPiece[]         // AnimPiece = { id, verts: Vec3[], sheet: Vec2[], frontUp: boolean, moving: boolean }
// 3D
finalHingeAngles(shape): HingeAngles
poseModel(flat, shape, angles?): { model: PosedModel; issues: FoldIssue[] }
defaultShape(flat): ShapeSpec                    // sensible keel / wing line / dihedral for a custom fold
buildPlane(design): { fold: FoldResult; model: PosedModel; issues: FoldIssue[] }
```

## 6. Physics model

Constants and formulas come from `docs/research/01-aerodynamics.md`, `02-flight-dynamics-validation.md`,
`03-wind-atmosphere.md`. Where this section and a research doc disagree, the research doc wins and the
difference must be reported. Every constant in code carries a comment naming its source tag.

### 6.1 Airframe (`core/airframe`)

`buildAirframe(model, trim, stock = PAPER_STOCK): Airframe`

- Mass: sheet area x grammage (paper is conserved by folding) plus the optional clip.
- CG and inertia tensor: exact integrals over every posed piece as a thin lamina (triangulate each convex polygon), parallel-axis to the CG.
- Aerodynamic elements: per panel, slice along the spanwise direction of the panel plane into strips (8-12 per wing, 2-4 per wall, 2-3 per winglet). In each strip take the 1D union of the chordwise intervals covered by the panel's pieces. No polygon-union library is needed. Each interval becomes one element (leading edge, chord, area, normal). Overlapping layers count once.
- The trailing `elevatorChordFrac` of every wing strip becomes a separate `flap` element whose normal is rotated about the spanwise axis by `elevatorDeg +/- aileronDeg`. The rear of the fuselage walls gets `rudderDeg` the same way.
- Fuselage walls pressed together shield each other: `exposure` goes from 0.5 (spread 0) to 1 (spread >= 60 deg); `wettedFaces` is 1 when spread < 20 deg.
- Lifting surfaces: wings (+ centre panel) form one surface with the projected area and tip-to-tip span; the fuselage is one vertical surface; each winglet is one.

### 6.2 Aerodynamics (`core/aero`)

Quasi-steady thin flat-plate elements. For element `i` at `r_i` from the CG:

```
u_i   = v_cg_rel_air + omega x r_cp_i      (velocity of the control point through the air, body frame)
alpha = angle between -u_i... see research doc for the exact definition and the 3/4-chord control point
F_n   = q_i * S_i * exposure * C_N(alpha_i; AR_surface, Re)   along the element normal
F_t   = q_t * S_i * wettedFaces * C_f(Re_chord)               along the in-plane flow direction
```

- `C_N` blends an attached-flow low-aspect-ratio lift model (finite-wing slope plus vortex lift) into a flat-plate post-stall normal-force curve valid to 90 deg and for reversed flow.
- Sharp thin plates have no leading-edge suction: the pressure force is normal to the plate. Induced drag is therefore `C_N sin(alpha)`.
- The centre of pressure moves from the quarter chord toward mid chord with angle of attack.
- Rotational damping comes from `omega x r` at each element. No separate damping derivatives.
- Added mass: follow the research recommendation (constant apparent mass and inertia if it is significant).

API: `aeroLoads(airframe, vRelBody, omegaBody, air, windAt?): { force: Vec3; moment: Vec3 }` (force and moment about the CG, body frame).
It must be allocation-free in the hot path.

### 6.3 Wind tunnel (`core/tunnel`)

Static evaluations of the same `aeroLoads`:

```ts
tunnelReading(airframe, { speed, alphaDeg, betaDeg }, air): TunnelReading
computePolar(airframe, air, { speed, fromDeg = -10, toDeg = 60, stepDeg = 1 }): PolarPoint[]
analyzeTrim(airframe, air): TrimAnalysis        // root-find Cm = 0 with dCm/dalpha < 0, then equilibrium glide speed from L = W cos(gamma)
```

### 6.4 Wind and air (`core/wind`, `core/env`)

```ts
airFrom(tempC, pressurePa, humidity): Air
resolveWind(env, conditions): WindSpec
createWindField(spec, seed, env): WindField     // mean profile + turbulence + gusts + thermals + ridge lift, deterministic
ENVIRONMENTS: Environment[]; getEnvironment(id): Environment
```

Environments: `classroom` (small, still air), `gym` (medium, still air), `hangar` (very large, still air, where records are set),
`meadow` (open air, adjustable breeze, weak thermals), `cliff` (steady onshore wind with ridge lift).

### 6.5 Flight (`core/sim`)

```ts
simulateFlight(airframe, launch, env, conditions, seed, opts?): FlightResult
THROW_LIMITS: { minSpeed; maxSpeed; typicalSpeed; eliteSpeed; releaseHeight }
defaultLaunch(category?): Launch
```

- Fixed-step integration (step from the research recommendation, about 1/600 s), quaternion attitude, renormalised each step.
- The whole flight is computed up front (a few ms), then the UI plays it back. Output samples at 120 Hz.
- Ends on first ground contact (y of the lowest point <= 0), wall, ceiling, or after 60 s.
- Metrics per `FlightMetrics`. Distance is measured as in competition: release point to first touch, horizontal.
- `diagnosis`: rule-based reading of the trajectory (stall count, pitch oscillation, bank growth, dive angle) producing what / why / fix sentences. This is the Professor's voice: warm, exact, short.
- Validation tests reproduce the table in `02-flight-dynamics-validation.md` within tolerance.

## 7. Designs (`core/designs`)

```ts
interface PlanePreset {
  id: string; name: string; category: PlaneCategory;
  designer?: string; year?: string;
  blurb: string;                 // one line
  story: string;                 // 2-4 sentences: origin, what it is good at, why
  difficulty: 1 | 2 | 3;
  orientation: 'portrait' | 'landscape';
  /** Ideal sheet; the preset still folds on any size. */
  recommendedSizeId: string;
  build(paper: PaperSpec): { steps: FoldStep[]; shape: ShapeSpec; trim: TrimSpec };
  throwHint: { speed: number; pitchDeg: number; note: string };
  sources: string[];             // URLs
}
PRESETS: PlanePreset[]; getPreset(id)
makeDesign(preset, paper, overrides?): PlaneDesign
```

One file per plane in `core/designs/presets/`, registered in `presets/index.ts`. Fold lines are computed from
paper width `W` and height `H` using the fold helpers ("corner to centre crease" = `foldPointToPoint`), never hard-coded for A4.
Every preset has a test: folds with zero errors on A4 and Letter, stays symmetric, trims in the tunnel, and flies a sane distance.

## 8. Similarity and leaderboard

- `fingerprint(model, airframe)`: 24 x 24 top-view occupancy grid normalised to the bounding box, plus scale-free features. `similarity(a, b)` in 0..1.
  `designHash(design)`: canonical hash of the folded geometry (rounded to 0.1 mm), independent of colours and names. Equal hash = same airplane.
  Used to tell a player "your fold is 94 % a Classic Dart", to group identical planes on the leaderboard, and to show look-alikes.
- Leaderboard: arenas with fixed conditions. Categories `distance` and `airtime`. A ranked flight is a `FlightTicket`; `verifyTicket` re-simulates it and compares within tolerance.
  `LocalLeaderboard` (browser storage + house reference flights of the presets, computed by the simulator, labelled as lab benchmarks) and `HttpLeaderboard` (`/api/leaderboard`).
  `worker/` holds a storage-agnostic fetch handler with a repository interface, an in-memory repository for tests, and documented hookup steps for DynamoDB / D1 (docs/DEPLOY.md). No fake players, ever.

## 9. UI

### 9.1 Design language

Warm paper and ink. Tokens in `src/ui/tokens.css`:

| token | value | use |
|---|---|---|
| `--paper` | `#f7f1e5` | page background |
| `--paper-2` | `#efe6d4` | sunken areas |
| `--card` | `#fffaf0` | cards, sheets |
| `--ink` | `#2f2e2b` | text, outlines |
| `--ink-2` | `#6b665c` | secondary text |
| `--line` | `#dccfb8` | hairlines |
| `--accent` | `#d9694c` | primary action (terracotta) |
| `--sage` `--sky` `--mustard` `--plum` `--rose` | `#7fa58a` `#7fb2d9` `#e3b04b` `#8a6fa8` `#e39aa0` | data series, tags |

- Type: `ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif` for UI; `"Iowan Old Style", "Palatino Linotype", Georgia, serif` for display headings. Sizes 13 / 15 / 17 / 22 / 28.
- Shape: radius 16 (cards), 12 (controls), 999 (chips). Outlines 1.5 px ink at low opacity. Soft shadow `0 6px 20px rgb(60 50 30 / 0.10)`.
- Motion: 180-260 ms ease-out. Respect `prefers-reduced-motion`.
- Touch targets >= 44 px. Safe-area insets respected. No horizontal scroll at 360 px.
- Illustration style: flat SVG, slightly wobbly ink strokes (round caps and joins), 2 px strokes, limited palette.
- Numbers use tabular figures. Units follow the user setting (metric default).

### 9.2 Navigation

Bottom tab bar on phones, left rail from 900 px: **Hangar**, **Fold**, **Fly**, **Tunnel**, **Ranks**.
A top-right menu holds **Notebook** (explanations and sources) and **Settings**. Routes (hash):
`/welcome`, `/hangar`, `/plane/:id`, `/fold`, `/fly`, `/tunnel`, `/ranks`, `/notebook/:topic?`.
First visit goes to `/welcome`.

### 9.3 Screens

- **Welcome (onboarding)**: Professor Wren. (1) greeting; (2) he folds the Classic Dart, animated, captioned; (3) he throws it in the classroom; (4) "your turn": guided interactive fold of the same plane; (5) the player throws; (6) results side by side, name entry, then the lab opens. Skippable at every stage.
- **Hangar**: "My planes" and the preset library as cards (SVG top view, category tag, one-line blurb, key stats). Choosing a preset asks for paper size and colours, then opens Fold. The header card holds the Professor's current assignment.
- **Plane detail**: 3/4 view, stats (mass, span, length, wing area, aspect ratio, wing loading, CG, static margin, predicted glide), crease pattern, "Looks like" similar planes with scores, best flights, actions (Fly, Tunnel, Refold, Duplicate, Delete).
- **Fold (workbench)**: SVG paper on a desk.
  - Guided mode (presets): step list with captions; each step can be played (animated) or performed by dragging the highlighted corner to its target. Play-all option.
  - Freeform mode: drag any snap point to another point to fold (perpendicular bisector), live preview, valley / mountain toggle, all layers / top flap toggle, mirror toggle (on by default), crease-only, flip, undo / redo.
  - Shape stage: keel direction, wing line (two handles), dihedral, winglets, live 3D preview and live stability badge.
  - Trim stage: elevator, aileron, rudder, paper clip. Also reachable from Fly.
- **Fly**: full-bleed three.js scene. Environment chip and weather sheet. Throw by swipe or with speed / angle controls. Live HUD (distance, height, speed, time). Result card with the Professor's diagnosis, charts under "Details", replay with scrubber, ghost trails of earlier throws, "Enter ranking" when conditions match an arena.
- **Tunnel**: SVG side view with streamlines and force arrows; airspeed and angle sliders; readouts; polar charts (CL, CD, L/D, Cm versus alpha) with trim and stall markers; stability card (CG and neutral point on a top view).
- **Ranks**: arena and category selector, ranked list with plane thumbnails, identical designs grouped, entry detail with replay and "fold this plane".
- **Notebook**: short illustrated explanations (how the simulation works, lift and drag, stability and trim, Reynolds number, wind, paper, records) and the full source list.

### 9.4 State (`src/app/store.ts`, Zustand + persist, key `ppl-state`)

```ts
interface LabState {
  profile: { name: string; onboarded: boolean };
  planes: Record<string, PlaneDesign>;       // the player's folded planes
  currentPlaneId: string | null;
  flights: FlightSummary[];                   // newest first, capped at 200
  settings: { units: 'metric' | 'imperial'; reducedMotion: boolean; showTrails: boolean };
  assignmentsDone: string[];
  // actions: savePlane, deletePlane, selectPlane, updateTrim, updateShape, logFlight, completeOnboarding, ...
}
```

Derived data (fold result, posed model, airframe, trim analysis) is never stored; it is recomputed and memoised by hooks in `src/app/hooks.ts`
(`usePlaneBuild(design)`), keyed by a stable hash of the design.

## 10. Quality bars

- Core: unit tests for geometry invariants (area conserved by folding, isometries stay orthogonal, symmetry), physics sanity (energy does not grow in still air, trim and glide numbers match the validation table), determinism (same seed, same result).
- UI: every screen checked at 390 x 844 and 1280 x 800 with `node scripts/shot.cjs`. No console errors. No horizontal overflow.
- Performance: a full flight simulates in under 50 ms on a laptop; fold steps apply in under 5 ms; the flight scene holds 60 fps on a mid-range phone (cap pixel ratio at 2, no shadow maps heavier than one 1024 map).
- Accessibility: buttons are buttons, sliders are inputs with labels, colour is never the only signal, text contrast >= 4.5:1.
