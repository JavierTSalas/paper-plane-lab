# Physics notes: calibration, evidence, limits

This note states what the simulator reproduces, what it does not, and how firm the evidence is.
Detailed sources are in `docs/research/`.

## Evidence status

During research this environment's network policy blocked page fetches.
Claims in `docs/research/` rest on search-result text, derivations checked by script, or model knowledge. Each note says which.
A second pass re-derived formulas and recomputed tables. It could not open sources either.

- **Solid:** rigid-body mechanics, ISA air properties, log-law wind profile, thin-plate potential-flow results, fold geometry.
- **Calibrated:** stall angles, vortex-lift constant for rectangular plates, edge-drag term, centre-of-pressure fit.
- **Unverified:** record values after 2022, measured paper-plane data quoted from search extracts, fold details of named designs.

## Checks the code runs

| Check | Result |
|---|---|
| Ballistic flight with aerodynamics off | Exact parabola within 1 mm |
| Torque-free spin | Energy and angular momentum conserved to 1e-6 |
| Still-air flights | Mechanical energy never increases |
| Step-size convergence (1 ms vs 0.25 ms) | Distance and airtime within 0.5 % |
| Single-surface polars | Match the research note's target table |
| Slender-delta roll due to sideslip | Within 1 % of `-(pi/3) alpha` for aspect ratio 0.33 to 2 |
| Classic Dart geometry on A4 | Span 107.1 mm, length 311.8 mm, CG 52.4 % from the nose, as derived in the research note |
| Fold engine | Random fold sequences keep area, isometry, layer order, and crease consistency (180 in the suite; 20,000 in one manual run) |

## Preset calibration (recommended sheet, factory trim, still air)

| Preset | Span mm | Aspect ratio | Static margin % | Trim speed m/s | Glide ratio | Sink m/s |
|---|---|---|---|---|---|---|
| Classic Dart | 111 | 0.63 | 9.3 | 5.4 | 3.0 | 1.7 |
| Wide Dart | 161 | 1.14 | 20.0 | 5.0 | 3.3 | 1.4 |
| Bulldog Dart | 150 | 1.12 | 19.6 | 5.1 | 3.3 | 1.5 |
| Blackburn Dart | 140 | 1.03 | 17.1 | 5.0 | 3.2 | 1.5 |
| Harrier | 120 | 1.24 | 12.1 | 5.0 | 3.2 | 1.5 |
| Nakamura Lock | 167 | 1.62 | 7.5 | 4.2 | 4.3 | 0.95 |
| Stable | 190 | 2.21 | 8.4 | 3.3 | 4.2 | 0.78 |
| Basic Glider | 158 | 1.13 | 7.9 | 3.8 | 4.2 | 0.89 |
| Suzanne-class Glider | 189 | 1.72 | 4.0 | 3.4 | 4.5 | 0.72 |
| Sky King-class Glider | 113 | 1.27 | 6.5 | 3.5 | 3.6 | 0.93 |
| Flying Wing | 265 | 2.48 | 4.1 | 2.3 | 4.4 | 0.52 |

Print the full table, with throws at 6, 10, and 27 m/s: `npx vitest run src/core/designs/calibration --silent=false`.

## Where the model and the evidence differ

1. **Dart glide ratio is low.** A measured dart is reported near 5 at 4.9 m/s. The Wide Dart trims at 5.0 m/s with 3.3 (4.2 to 4.3 untrimmed).
   Causes: no leading-edge suction, low aspect ratio, trim drag from up-elevator. The constants were not tuned to hide this.
2. **Hard throws fall short of records.** At 27 m/s the best preset dart reaches 31 to 41 m and one glider 61 m. Records are reported at 60 to 100 m.
   Real paper flexes at that speed, which flattens the trim. The model is rigid, so a plane trimmed for a slow glide loops when thrown hard.
   Do as real throwers do: reduce the elevator to near zero before a hard throw.
3. **Elevator angles are smaller than folk advice.** Presets use 2.5 to 5.5 degrees on A4 darts. A larger bend puts the dart near 20 degrees of incidence.
4. **Shallow keels do not weathercock.** Wide, Bulldog, and Nakamura hold heading through dihedral effect only. On US Letter they wobble 10 to 17 degrees in long glides.
5. **Sheet size changes trim.** Presets are tuned on A4 and US Letter. On US Legal the Classic Dart and Flying Wing do not trim without re-tuning.

## Additions beyond the research note's element model

The literal formulas gave wrong-signed or unusable results in four places. Each fix is tested.

- A pitch-rate couple, so a long keel damps yaw instead of driving it.
- A slender-wing limit in the trailing-edge bend model, so a rudder bend turns the nose the right way.
- A planform-matched centre of pressure for delta-like wings.
- Slender-wing sideslip loading, so swept darts roll out of a sideslip as real ones do.

## Not modelled

- Paper flex, flutter, and crease relaxation.
- Ground effect and wing-keel interference.
- Collisions with scenery. Only floor, walls, and ceiling stop a flight.
- Gust differences across the span. One wind vector acts on the whole plane.
- Bit-identical results across JavaScript engines. The server check uses a tolerance.
