# Paper Plane Lab

A cozy lab for folding paper airplanes and testing how they really fly.
Fold a sheet step by step, throw it in a simulated room or meadow, read the forces in a wind tunnel, and rank your design.

## Run it

```sh
npm install
npm run dev          # dev server on http://localhost:5173
npm test             # unit and physics validation tests (about 10 s)
npm run typecheck
npm run build        # production build in dist/
```

Deploy: `npm run build && npx wrangler deploy` (Cloudflare Workers static assets). See `docs/DEPLOY.md`.

## What is in it

| Screen | What it does |
|---|---|
| Welcome | Professor Wren folds a Classic Dart, throws it, then you do both. Skippable. |
| Hangar | Your planes, the preset library, and the Professor's assignments. |
| Fold | Guided folding of presets (drag the corner or tap "Fold it for me"), a freeform editor, 3D shaping, and trim. |
| Fly | A three.js flight range. Six places, indoor and outdoor, adjustable wind. Each flight gets a diagnosis in plain words. |
| Tunnel | Lift, drag, moment, polars, and stability for the current plane. |
| Ranks | Leaderboards for distance and airtime under fixed indoor conditions. Identical designs are grouped. |
| Notebook | How the simulation works, with sources and a "How sure are we?" note per topic. |

## How the simulation works

1. **Fold.** `src/core/fold` applies real simple folds to convex paper pieces with a layer order. Area is conserved exactly.
2. **Pose.** The flat model opens into a 3D plane: keel, wings with dihedral, optional winglets.
3. **Airframe.** Mass, centre of gravity, and inertia come from the folded layers. Wings and keel become thin flat-plate strips.
4. **Aerodynamics.** Each strip gets a normal force and skin friction from its local airflow. Low aspect ratio, vortex lift, stall, and centre-of-pressure travel are modelled. No leading-edge suction.
5. **Flight.** A 6-DOF rigid body, quaternion attitude, RK4 at 1 ms, added air mass, seeded wind and turbulence.

Read `docs/PHYSICS-NOTES.md` for calibration results and limits. Read `docs/research/` for the evidence notes.

## Code map

```
src/core/      pure TypeScript, deterministic, shared with the API worker
  fold/ designs/ airframe/ aero/ tunnel/ wind/ env/ sim/ similarity/ leaderboard/ paper/ math/
src/app/       app shell, routes, persisted store, cached plane builds
src/ui/        design system: tokens, components, icons, Professor Wren, charts
src/features/  onboarding, hangar, fold, fly, tunnel, ranks, notebook
worker/        leaderboard API handler (storage-agnostic; not wired into wrangler.jsonc yet)
docs/          ARCHITECTURE.md, DEPLOY.md, PHYSICS-NOTES.md, research/
```

## Add an airplane

1. Copy `src/core/designs/presets/classic-dart.ts` to a new file.
2. Write the fold steps as formulas in sheet width `W` and height `H`. Use `foldAlong(a, b, pointOnMovingSide, label)`.
3. Set the shape (keel, wing line, dihedral, winglets) and the factory trim.
4. Add the preset to the list in `src/core/designs/presets/index.ts`.
5. Run `npx vitest run src/core/designs`. The tests fold it on several sheet sizes and fly it.

## Global rankings

The app runs without a backend. Ranks then show lab benchmarks (the presets flown by the simulator) and flights from the device.
The API worker in `worker/` verifies a submitted flight by simulating it again. It needs a database. `docs/DEPLOY.md` lists the steps for DynamoDB or D1.

## Known limits

- Paper is rigid in the model. Real paper flexes, most of all in hard throws.
- Most research sources could not be opened during development. See `docs/PHYSICS-NOTES.md`.
- Ten of the eleven presets are approximations of the named designs and are labelled so in the app.
