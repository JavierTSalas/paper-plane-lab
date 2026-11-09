# 03 - Air, Wind, Turbulence, Gusts, Thermals and Indoor Air

Research note for the Paper Plane Lab physics core. Scope: the air a paper plane flies through, from 0 to about 30 m above the ground, at airspeeds of about 3-12 m/s. Everything is in SI units unless stated otherwise. Tags: `[S#]` is a numbered source at the end of this note. "(unverified - model knowledge)" means I could not confirm it online in this session. "(derived here)" means I calculated it from tagged inputs; the arithmetic was checked with a short script.

> **Research-access caveat.** In this session WebFetch could not reach any host, and the shared web-search budget ran out before the last sections were done. So every `[S#]` was confirmed from **search-result extracts of that URL**, not from reading the full document. Formulas that rest only on model knowledge are marked as such. See "Open questions and limits". A later fact-check pass had no web access either (fetch blocked, search budget spent). It re-derived the formulas and recomputed the tables instead; see "Verification notes" at the end.

## Summary for implementers

1. **Air:** use `rho = (p - 0.378 e) / (287.053 T)` and Sutherland's law `mu = 1.458e-6 T^1.5 / (T + 110.4)`. At ISA sea level this gives 1.225 kg/m^3 and 1.789e-5 Pa s. The brief's 1.81e-5 Pa s is the value at 20 °C. Humidity lowers density by at most about 1.6 % at 30 °C; temperature and altitude matter roughly 10 times more.
2. **Mean wind:** use the neutral log law `U(z) = U10 ln((z-d)/z0) / ln((10-d)/z0)`. Over open grass (z0 = 0.03 m), the wind at 2 m is **0.72 x U10**. Do not use the 1/7 power law below about 10 m: the effective exponent between 2 and 10 m is 0.10-0.36, depending on z0.
3. **Turbulence:** use a Dryden model sampled in the plane's frame. Take the **intensities** from surface-layer similarity (`sigma_u, sigma_v, sigma_w = 2.4, 1.9, 1.25 x u*`), which knows about terrain roughness. Take the **length scales** from the MIL low-altitude formulas (at 2 m: L_u = 15.4 m and L_w = 2 m, in the MIL-F-8785C convention). Step it with the exact discrete recurrences in section 3.4: an AR(1) for u, and a 2-state system for v and w. These keep the variance exact at any `V*dt/L`.
4. **Gusts:** the Dryden noise already contains ordinary gustiness. Optional scripted gust events use the MIL-F-8785C "1-cosine" ramp. The 3 s peak-to-mean ratio at 2 m over grass is about **1.6** within 10 min and **1.7** within an hour.
5. **Thermals:** near the ground they are weak. Using Allen (2006) scaling with w* = 1.5 m/s and z_i = 1000 m gives a peak updraft of about 0.5 m/s at 2 m and 0.8 m/s at 10 m. That is still comparable to a paper plane's 0.5-1 m/s sink rate.
6. **Ridge lift:** use linear potential flow over a row of cosine hills or a single bell-shaped ridge, or the exact potential flow round a half-cylinder for a cliff (section 5.3). These give about 0.9-1 m/s of lift over a 17° grassy slope in a 4.5 m/s breeze. Out from a 25 m cliff along the 45° up-and-upwind diagonal, in a 4 m/s onshore breeze, they give 2.2 m/s at 10 m from the face, falling to 1.4 m/s at 19 m.
7. **Indoors:** occupied rooms have air speeds of about 0.05-0.2 m/s; ASHRAE 55 and ISO 7730 draught limits sit around 0.1-0.2 m/s. That is 1-4 % of the plane's airspeed, which is why records are set indoors.
8. **Gust sensitivity:** a paper plane is roughly **70 times more gust-sensitive** than an airliner. A 0.3 m/s vertical gust changes its load factor by about 0.8 g. Both figures are sharp-edged upper bounds; for a smooth gust the ratio is nearer 25 (section 7).

---

## 1. Air density and viscosity

### 1.1 Constants (ISA / US Standard Atmosphere 1976)

| Quantity | Value | Source |
|---|---|---|
| Sea-level temperature T0 | 288.15 K | [S1] |
| Sea-level pressure p0 | 101 325 Pa | [S1] |
| Sea-level density rho0 | 1.225 kg/m^3 | [S1] |
| Specific gas constant, dry air, R_d | 287.053 J/(kg K) | [S1] (unverified - model knowledge, value) |
| Tropospheric lapse rate | -0.0065 K/m | [S1] (unverified - model knowledge, value) |
| Sutherland beta | 1.458e-6 kg/(m s K^0.5) | [S2] |
| Sutherland S | 110.4 K | [S2][S4] |
| Sea-level mu0 | 1.7894e-5 Pa s (calculator: 1.78938e-5) | [S3] |
| Water-vapour / dry-air molar mass ratio | 0.622 (so 1 - 0.622 = 0.378) | (unverified - model knowledge) |

### 1.2 Formulas for code

```
Tk  = tC + 273.15                                 # K
p   = p0 * (1 - 2.25577e-5 * h_m)^5.25588         # Pa, troposphere h < 11 km; or set directly from the venue
es  = 610.94 * exp(17.625*tC / (tC + 243.04))     # Pa, saturation vapour pressure over water [S7]
e   = RH * es                                     # RH as a fraction 0..1
rho = (p - 0.378*e) / (287.053 * Tk)              # kg/m^3, ideal-gas moist air
mu  = 1.458e-6 * Tk^1.5 / (Tk + 110.4)            # Pa s, Sutherland [S2][S4]
nu  = mu / rho                                    # m^2/s, for Reynolds number Re = V c / nu
```

- **Sutherland, reference form [S4]:** `mu = 1.716e-5 (T/273.15)^1.5 (273.15 + 110.4)/(T + 110.4)`. It gives the same numbers as the form above. NASA Glenn's Wind-US code uses Sutherland's law as its default for ideal gases above 180 °R (100 K) [S5].
- **Magnus coefficients:** 6.1094 hPa, 17.625 and 243.04 °C come from Alduchov and Eskridge (1996) [S7]. They are a fit for water. The paper's fit range of about -40 to +50 °C is (unverified - model knowledge).
- **Moist-air density:** the rho formula is the ideal-gas reduction of the CIPM-2007 equation [S6]. CIPM-2007 adds a compressibility factor Z and a vapour enhancement factor f [S6]. Z is about 0.9996, and f is about 1.004 at 101 kPa and 20 °C; 1.00062 is only the constant term of f (values unverified - model knowledge). Together they change density by less than 0.05 % (derived here) and can be ignored.
- **Pressure-altitude exponent:** 5.25588 equals g0 M/(R* L) for ISA (unverified - model knowledge, but it reproduces 1.225 kg/m^3 at h = 0).

### 1.3 How big each effect is (derived here)

| Condition | rho dry (kg/m^3) | rho saturated | Humidity effect | mu (Pa s) | nu (m^2/s) |
|---|---|---|---|---|---|
| 0 °C, 101 325 Pa | 1.2923 | 1.2893 | -0.23 % | 1.716e-5 | 1.328e-5 |
| 15 °C (ISA) | 1.2250 | 1.2172 | -0.63 % | 1.789e-5 | 1.461e-5 |
| 20 °C | 1.2041 | 1.1936 | -0.87 % | 1.813e-5 | 1.506e-5 |
| 30 °C | 1.1644 | 1.1460 | -1.58 % | 1.861e-5 | 1.598e-5 |
| 35 °C | 1.1455 | 1.1215 | -2.10 % | 1.884e-5 | 1.645e-5 |
| ISA 1609 m (Denver), 4.5 °C, 83 431 Pa | 1.0467 | - | - | - | - |

- Going from 0 °C to 35 °C changes density by 11 %. Going from sea level to 1600 m changes it by 15 %. Humidity changes it by at most 2 %.
- Humidity matters far more through the **paper** (moisture uptake, limpness, curl) than through the air. Takuo Toda's failed record attempt in humid conditions is reported in [S35]. Treat this as a paper-model concern, not an air-model one.
- Humidity changes viscosity by less than about 1 % (unverified - model knowledge), so ignore it.
- Reynolds number check: a 0.10 m chord at 5 m/s at 20 °C gives Re = 3.3e4 (derived here).
- Mach number is below 0.04, so the air is incompressible for this model.

---

## 2. Mean wind near the ground (0-30 m)

### 2.1 Logarithmic law (preferred)

The neutral surface-layer profile is [S8][S11]:

```
U(z) = (u*/kappa) * ln((z - d)/z0),   kappa = 0.40
Map from a 10 m reference:  U(z) = U10 * ln((z-d)/z0) / ln((10-d)/z0)
u* = kappa * U10 / ln((10-d)/z0)
```

- z0 is the roughness length and d is the displacement height. The wind is zero at z = d + z0 [S11].
- A rule of thumb is z0 ≈ 1/10 of the height of the roughness elements [S11].
- d ≈ 2/3 of the canopy height (unverified - model knowledge). Use d = 0 for grass, sea and open fields.
- **Validity:** neutral stability, horizontally uniform terrain, `z - d >> z0`, and z above the roughness sublayer, which reaches about 2-3 times the obstacle height (unverified - model knowledge). Over suburbs and forest, a plane at 1-3 m is *inside* the canopy layer and the log law does not apply there. Clamp, or use these environments only above the obstacles.
- Stability: daytime convection flattens the profile and night-time stable air steepens it (unverified - model knowledge). Use the neutral form.
- **Defensive clamp:** set `z_eff = max(z, d + 1.5 z0 + 0.05 m)` so the profile cannot go negative or blow up.

### 2.2 Roughness classes (Davenport, revised by Wieringa) and the 10 m to 1-3 m mapping

U(z)/U10 values are derived here with d = 0.

| Class | z0 (m) | Terrain | U(1 m)/U10 | U(2 m)/U10 | U(3 m)/U10 | U(6.1 m)/U10 | u*/U10 |
|---|---|---|---|---|---|---|---|
| Sea | 0.0002 | open sea or lake, tidal flat, snow-covered plain, paved areas [S8][S10] | 0.787 | 0.851 | 0.889 | 0.954 | 0.0370 |
| Smooth | 0.005 | mud flats, snow, no vegetation [S10] (value unverified) | 0.697 | 0.788 | 0.842 | 0.935 | 0.0526 |
| Open | 0.03 | grass prairie, farm fields, airports, level country with low vegetation [S8][S9] | 0.604 | 0.723 | 0.793 | 0.915 | 0.0689 |
| Roughly open | 0.10 | low crops, occasional obstacles [S8][S9] | 0.500 | 0.651 | 0.739 | 0.893 | 0.0869 |
| Rough | 0.25 | high crops, scattered trees or hedgerows, vineyards [S8] | 0.376* | 0.564* | 0.674 | 0.866 | 0.108 |
| Very rough | 0.5 | farmland with forest clumps, orchards, scattered buildings [S8] | invalid | 0.463* | 0.598* | 0.835 | 0.134 |
| Closed / suburb | 1.0 | regular large obstacles, suburbs, forest (unverified) | invalid | invalid | invalid | - | - |

\* Inside or near the roughness sublayer, so treat these as indicative only.

### 2.3 Power law (UI and legacy use only)

- `U(z) = U10 (z/10)^alpha`, with alpha ≈ 1/7 = 0.143 for neutral air over open flat terrain. Sources warn it fits only under ideal conditions and fails near obstacles [S12].
- Fitting between 2 m and 10 m gives an equivalent alpha (derived here) of:

| z0 (m) | 0.0002 | 0.005 | 0.03 | 0.1 | 0.25 |
|---|---|---|---|---|---|
| alpha | 0.10 | 0.15 | 0.20 | 0.27 | 0.36 |

- Counihan's fit `alpha = 0.096 log10 z0 + 0.016 (log10 z0)^2 + 0.24` gives 0.13 for z0 = 0.03 m (unverified - model knowledge). It describes the profile higher up, not the bottom 2 m.
- **Use the log law in the physics; show alpha only as a label.**

### 2.4 Beaufort scale for UI labels (10 m mean wind)

The m/s bands follow MeteoSwiss [S13]. Bands for force 2 and above are the standard WMO values; sources differ by up to 0.1 m/s at some boundaries [S13]. Wind is measured at 10 m [S13]; the original 1939 table referred to 6 m [S13]. The "at 2 m" column is the upper limit times 0.72 (open terrain, derived here).

| Bft | Name | U10 (m/s) | Knots | Land sign (unverified - model knowledge) | At 2 m, grass |
|---|---|---|---|---|---|
| 0 | Calm | 0-0.2 | <1 | smoke rises vertically | ≤0.15 |
| 1 | Light air | 0.3-1.5 | 1-3 | smoke drifts, vanes still | ≤1.1 |
| 2 | Light breeze | 1.6-3.3 | 4-6 | wind felt on face, leaves rustle | ≤2.4 |
| 3 | Gentle breeze | 3.4-5.4 | 7-10 | leaves and twigs in motion, light flag extended | ≤3.9 |
| 4 | Moderate breeze | 5.5-7.9 | 11-16 | dust and loose paper raised | ≤5.7 |
| 5 | Fresh breeze | 8.0-10.7 | 17-21 | small trees sway | ≤7.7 |
| 6 | Strong breeze | 10.8-13.8 | 22-27 | large branches move | ≤10 |
| 7+ | Near gale and above | ≥13.9 | ≥28 | - | not flyable |

Knot bands for 0-4 are confirmed by SKYbrary [S13]. A paper plane flies at about 4-8 m/s, so Bft 4 and above at 2 m reaches or exceeds its airspeed.

---

## 3. Turbulence models usable in real time

### 3.1 Dryden low-altitude model (MIL-F-8785C / MIL-HDBK-1797), h < 1000 ft

Inputs: h is height in ft, and W20 is the mean wind at 20 ft (6.1 m) [S14][S15][S17].

```
sigma_w = 0.1 * W20
sigma_u / sigma_w = sigma_v / sigma_w = 1 / (0.177 + 0.000823 h)^0.4
MIL-F-8785C:     L_u = L_v = h / (0.177 + 0.000823 h)^1.2 ,  L_w = h          [S15][S36]
MIL-HDBK-1797:   L_u = 2 L_v = h / (0.177 + 0.000823 h)^1.2 , 2 L_w = h       [S16]
SI form (h_m in metres; L comes out in metres):  0.177 + 0.0027 h_m  replaces  0.177 + 0.000823 h
```

- Typical W20: light 15 kt (7.7 m/s), moderate 30 kt (15.4 m/s), severe 45 kt (23.1 m/s) [S14].
- From 1000 to 2000 ft, interpolate linearly to the high-altitude model [S14]. Above that, L = 1750 ft [S14][S18].
- The MathWorks implementation **does not include terrain roughness, lapse rate or wind shear** [S14].
- **Spectra.** Ω is spatial frequency in rad/m and ω = ΩV (unverified - model knowledge, standard forms):
  - MIL-F-8785C: `Phi_u = sigma_u^2 (2L_u/pi) / (1+(L_u Ω)^2)` and `Phi_v,w = sigma^2 (L/pi) (1+3(LΩ)^2)/(1+(LΩ)^2)^2`.
  - MIL-HDBK-1797 writes the v and w spectra as `sigma^2 (2L/pi)(1+12(LΩ)^2)/(1+4(LΩ)^2)^2`.
  - Substituting L_HDBK = L_8785C / 2 gives *identical* spectra (derived here). This matches the free-atmosphere rule `L_u = 2L_v = 2L_w = 1750 ft` in HDBK-1797 [S18].
  - **The two specifications describe the same turbulence. Never mix one document's L with the other's spectrum.**
- Transfer functions (8785C form, driven by unit white noise; unverified - model knowledge):
  - `H_u(s) = sigma_u sqrt(2L_u/(πV)) / (1 + (L_u/V)s)`
  - `H_w(s) = sigma_w sqrt(L_w/(πV)) (1 + √3 (L_w/V)s) / (1 + (L_w/V)s)^2`, and the same form for v.
  - These gains are normalised so that `∫0^∞ |H(iω)|² dω = sigma²` (derived here). That means noise with a one-sided spectral density of 1 per rad/s, not unit variance per time step. Section 3.4 avoids the issue by scaling the states to unit variance.

**Values at paper-plane heights** (derived here, 8785C convention):

| h (m) | 0.5 | 1 | 2 | 3 | 5 | 10 | 20 | 30 |
|---|---|---|---|---|---|---|---|---|
| sigma_u/sigma_w | 1.99 | 1.99 | 1.98 | 1.96 | 1.94 | 1.89 | 1.80 | 1.72 |
| L_u = L_v (m) | 4.0 | 7.8 | 15.4 | 22.7 | 36.6 | 67.4 | 116 | 152 |
| L_w (m) | 0.5 | 1 | 2 | 3 | 5 | 10 | 20 | 30 |

### 3.2 Surface-layer similarity (terrain-aware intensities)

Neutral flow over flat terrain gives [S21] (Panofsky and Dutton 1984, quoted in AMS papers):

```
sigma_u ≈ 2.4 u*,   sigma_v ≈ 1.9 u*,   sigma_w ≈ 1.25 u*
I_u(z) = sigma_u / U(z) ≈ 0.96 / ln(z/z0)      (since 2.4 kappa = 0.96; derived here)
```

- These ratios are roughly constant with height in the surface layer.
- Measured sigma_u/u* scatters between about 2 and 3 [S21].

**Cross-check against Dryden** (derived here):
- Open grass (z0 = 0.03 m), U10 = 1.5 m/s: similarity gives sigma_u = 0.25 m/s at 2 m and Dryden gives 0.27 m/s. They agree within 10 %.
- Over the sea (z0 = 0.0002 m), U10 = 5 m/s: similarity gives 0.44 m/s, while Dryden gives 0.94 m/s. **Dryden overestimates by about 2x over smooth surfaces**, because it ignores roughness [S14].
- **Recommendation:** take the sigmas from similarity (via u*) and the length scales from Dryden.

### 3.3 Near-ground validity and clamps

- **What breaks:** as h goes to 0, L_w goes to 0 while sigma_w stays constant. The w gust then becomes white noise with infinite bandwidth, which is not physical. In reality the ground blocks vertical motion.
- I found **no confirmed minimum height** in the specifications. A commonly used 10 ft floor is (unverified - model knowledge). One paper simply fixes a 10 m reference height [S15].
- **Recommended clamps** (engineering judgement):
  - `h_eff = clamp(h_agl, max(1.0 m, d + 10 z0), 300 m)` for the length scales.
  - Taper sigma_w by `min(1, h_agl / 0.5 m)` so it falls toward zero at the ground.
  - Above 300 m, freeze the values.
- **Axes:** use u along the horizontal mean-wind direction, v horizontal crosswind and w vertical. This matches the low-altitude MIL convention and the similarity data (unverified - model knowledge). If the mean wind is below 0.2 m/s (indoors), pick a random horizontal axis.
- **Sampling speed (Taylor frozen turbulence):** the gust field is advected with the mean wind, so the plane sweeps through it at `V_s = |v_plane - U_mean|`, which is its airspeed. Floor it at `V_s >= max(0.3 m/s, sigma_u)` to stand in for eddy decay when the plane is slow or still in the hand (engineering judgement).
- **Span vs length scale:** the span is 0.1-0.3 m and L_w is at least 1 m, so apply one gust vector to all elements. MIL rotary gusts (p_g, q_g, r_g) are optional and second-order here (unverified - model knowledge).

### 3.4 Exact discrete-time recurrences (any dt, any V_s/L)

The MIL / MathWorks difference equation is the Euler form `u_{k+1} = (1 - V T/L_u) u_k + sqrt(2 V T/L_u) sigma_u eta_k` [S19][S20] (exact form unverified - model knowledge). Its variance is wrong by a factor `1/(1 - x/2)`, where x = V T / L (derived here). That is +5 % at x = 0.1 and +11 % at x = 0.2. Near the ground x reaches 0.1-0.2 at 60 Hz: with L_w = 1 m and V = 6 m/s, x = 0.1. **Use these exact forms instead** (derived here and verified by simulation):

```
# Longitudinal u (first-order Dryden = Ornstein-Uhlenbeck, autocorrelation e^{-xi/L_u})
a      = exp(-V_s*dt / L_u)
s_u    = a*s_u + sqrt(1 - a*a) * N(0,1)          # s_u: unit-variance state
u_g    = sigma_u * s_u

# Transverse v and w (second-order Dryden, 8785C L; autocorrelation (1 - xi/(2L)) e^{-xi/L})
tau    = V_s*dt / L            # L = L_v or L_w (8785C convention)
e      = exp(-tau)
[s1,s2] = e*[[1+tau, tau], [-tau, 1-tau]] · [s1,s2] + C·[N(0,1), N(0,1)]
q11 = 1 - e^2 (1 + 2tau + 2tau^2);  q12 = 2 e^2 tau^2;  q22 = 1 - e^2 (1 - 2tau + 2tau^2)
C   = chol([[q11,q12],[q12,q22]]):  c11 = sqrt(q11), c21 = q12/c11, c22 = sqrt(q22 - c21^2)
w_g = (sigma_w/2) * (s1 + sqrt(3)*s2)
if tau < 1e-3: q11 ≈ (4/3) tau^3, q12 ≈ 2 tau^2, q22 ≈ 4 tau - 8 tau^2     (series; avoids cancellation)
```

- **Why it works:** the states are scaled to unit variance, so their stationary covariance is the identity matrix. The step covariance `Q = I - Φ Φ^T` is then exact.
- **Changing sigma or L every step** (the plane climbs or descends) creates no transient, because sigma multiplies only the output.
- **Verification:** with L = 2 m, V = 6 m/s, dt = 1/60 s and 400 000 steps, the variance came out at 1.01 σ². The autocorrelation at ξ = 0.6, 1.2 and 2.4 m was 0.634, 0.389 and 0.131, against theory values of 0.630, 0.384 and 0.120 (derived here). The differences are sampling noise: the exact lag-m autocorrelation of the recurrence, `c·Φ(mτ)·c` with c = (1/2, √3/2), equals `(1 - ξ/(2L)) e^{-ξ/L}` to 1e-16 (derived here).
- **The series branch is required, not optional.** In double precision the plain q11 formula loses all its digits near τ = 1e-6 and the Cholesky step fails. The slow-plane floor reaches τ = 3e-4 (V_s = 0.3 m/s, L = 15.4 m). With the series as written, the stationary output variance is within 2e-6 of σ² at τ = 1e-3 (derived here).
- **Initial state:** start from s ~ N(0, I) so the series is stationary from t = 0.
- **Determinism:** use a seeded PRNG plus Box-Muller.

### 3.5 Simpler alternatives

- **Ornstein-Uhlenbeck for every axis:** use the AR(1) form above with `T_c = L_OU / V_s`.
  - For u: L_OU = L_u.
  - For v and w: L_OU = L_8785C / 2 = L_HDBK. This matches the Dryden transverse integral scale ∫R dξ/σ² = L/2 and the low-frequency spectral level (derived here).
  - OU has slightly more high-frequency energy in v and w. That is fine for gameplay.
- **Von Kármán spectra** are more faithful (-5/3 inertial range, the 1.339 constant) [S37], but they need approximate rational filters. At these scales the visual difference is negligible, so stay with Dryden.

---

## 4. Discrete gusts and gust factors

**MIL-F-8785C "1-cosine" ramp** (as implemented by MathWorks) [S22]:

```
V_g(x) = 0                              x < 0
       = (V_m/2) (1 - cos(pi x / d_m))   0 <= x <= d_m
       = V_m                            x > d_m
```

- x is the distance travelled into the gust and d_m is the gust length. MathWorks defaults are d_m = [120 120 80] m [S22].
- It can be applied to each axis separately, singly or repeatedly [S22].
- The FAR 25.341 alternative is a full pulse over 0 ≤ s ≤ 2H, with H = 30-350 ft (9-107 m) and `U_ds = U_ref F_g (H/350)^(1/6)` [S23]. The exact `(U_ds/2)(1 - cos(pi s/H))` shape is (unverified - model knowledge). That specification is built for airliners, not for this scale.

**Gust factor** G = peak short gust / mean:
- Mean speeds must **not** be converted between averaging periods with gust factors; only gust speeds can be [S24].
- The Durst curve corresponds to a turbulence intensity of 16.5 % [S25]. It applies only to open terrain at 10 m [S27].
- In open terrain at 10 m, a 3 s gust divided by the 10 min mean is about 1.38 (30 / 21.7 m/s [S26]). A hurricane data set with z0 ≈ 0.03 m gave about 1.43 [S27].
- The WMO 2010 guidance tabulates factors by exposure (at-sea, off-sea, off-land, in-land) [S24]. I did not see its exact numbers. From memory, its 3 s / 10 min factors are about 1.23, 1.38, 1.52 and 1.66 in that order (unverified - model knowledge; check Table 1.1 of the report before quoting them).
- A good model is `G ≈ 1 + g I_u`. The peak factor g depends on the reference period: **g ≈ 3.0 for a 3 s gust within 1 h, and g ≈ 2.5 for a 3 s gust within 10 min.** The evidence:
  - With I_u = 0.165, g = 3.0 gives 1.50. That matches Durst's 3 s / 1 h factor of about 1.52. Durst's 10 min / 1 h factor is about 1.07, so his 3 s / 10 min factor is about 1.43, which needs g = 2.6 (Durst values unverified - model knowledge). The 1.43 also agrees with [S27].
  - Running this note's own u recurrence past a fixed mast gives g = 2.45-2.55 within 10 min and 2.95-3.15 within 1 h (derived here: I_u from section 3.2, time scale L_u/U from section 3.1, 3 s moving average, 300 ten-minute and 60 one-hour blocks per case).
- At 2 m, I_u is larger, so G is larger too (derived here with g = 2.5 and g = 3.0):

| Terrain | z0 (m) | G at 10 m, within 10 min / 1 h | G at 2 m, within 10 min / 1 h |
|---|---|---|---|
| Sea | 0.0002 | 1.22 / 1.27 | 1.26 / 1.31 |
| Open grass | 0.03 | 1.41 / 1.50 | 1.57 / 1.69 |
| Low crops | 0.1 | 1.52 / 1.63 | 1.80 / 1.96 |

**App use:** Dryden noise already produces gusts with these statistics, so scripted 1-cos events must not double-count them. Use them as rare, labelled "gust events" (a tutorial or a test button):
- amplitude ΔU = 1.5 σ_u;
- rise distance d_m = L_u/2 (8 m at 2 m height), so the rise time is d_m / U(2 m);
- mean interval 30-90 s.

This is a design choice, not a measured value.

---

## 5. Thermals and slope lift at paper-plane scale

### 5.1 Convective scale

- The Deardorff velocity is `w* = (g/θv · (w'θv')_0 · z_i)^(1/3)` [S30]. It is about 1 m/s in a typical daytime boundary layer and close to the updraft speed of thermals [S30].
- About 2-3 m/s over hot desert is (unverified - model knowledge).
- Near the surface, the friction velocity u* is the relevant scale rather than w* [S30]. Thermals there are young, narrow plumes.

### 5.2 Allen (2006) NASA updraft model

Allen built the model from balloon and surface data at Desert Rock, Nevada; the paper includes code and a check case [S28]. Its key relations:

```
w_bar(z) = w* (z/z_i)^(1/3) (1 - 1.1 z/z_i)                                  [S29]
r2(z)    = max(10 m, 0.102 (z/z_i)^(1/3) (1 - 0.25 z/z_i) z_i)               (attributed to Lenschow in [S28]; coefficients unverified - model knowledge)
r1/r2    = 0.0011 r2 + 0.14  for r2 < 600 m,  else 0.8  (r2 in metres)        (unverified - model knowledge)
w_peak   = 3 w_bar (r2^3 - r2^2 r1) / (r2^3 - r1^3)                           (unverified - model knowledge)
```

- Profile shape: roughly constant updraft inside r1, a smooth fall-off to r2, and a downdraft ring from r2 to 2r2. There is no influence beyond 2r2 [S29].
- In Allen's paper the downdraft ring is switched on only for 0.5 < z/z_i < 0.9. Lower down, the compensating sink is a weak uniform "environment" sink spread between the thermals (unverified - model knowledge). At paper-plane heights (z/z_i < 0.03) the Allen model therefore has **no sink ring**.
- Allen's version uses a bell shape with shape constants k1-k4 that depend on r1/r2 [S28][S29].
- Validity: the fits come from measurements well above the surface. Using them at z/z_i ≈ 0.002 is an extrapolation, and the 10 m floor on r2 is a numerical guard rather than a measurement (unverified - model knowledge).

Values with w* = 1.5 m/s and z_i = 1000 m (derived here; r1/r2 runs from 0.151 to 0.170):

| z (m) | 1 | 2 | 5 | 10 | 20 |
|---|---|---|---|---|---|
| w_bar (m/s) | 0.15 | 0.19 | 0.26 | 0.32 | 0.40 |
| w_peak (m/s) | 0.38 | 0.48 | 0.65 | 0.81 | 1.00 |
| r2 (m) | 10.2 | 12.8 | 17.4 | 21.9 | 27.5 |

A paper plane sinks at about 0.5-1 m/s, so a thermal at 2-10 m can measurably stretch a flight. That is defensible and fun, but it rarely produces sustained climb.

**Simpler shape for the game** (engineering choice):

```
w(r) = w_peak · exp(-(r/R)^2) · (1 - (r/R)^2),   with R = r2
```

- It has zero net mass flux (∫ w 2πr dr = 0, derived here), so it builds in its own sink ring. The ring is a gameplay choice: Allen has none this low (see above).
- **Use R = r2.** The updraft then ends at r2, as in Allen. Its mean over r < r2 is w_peak/e = 0.37 w_peak, 6 % below Allen's w_bar = 0.39 w_peak. The strongest sink is 0.135 w_peak at r = 1.41 r2, inside Allen's r2-2r2 ring (all derived here). A smaller R, such as r2/1.5, cuts the mean updraft over r < r2 to 0.105 w_peak, about a quarter of Allen's.
- The core drifts with U(z). Lifetime of about 5-15 min is (unverified - model knowledge).
- This shape is the Gedeon thermal model (unverified - model knowledge). [S31] confirms only that the Gedeon model includes outer downdrafts.

### 5.3 Ridge and slope lift

Three closed-form fields, derived from standard potential-flow theory. Each conserves mass in its pure form (uniform U):

**(a) Gentle grassy hills: linear potential flow over a row of cosine hills.**

```
Terrain:  z_s(x) = (H/2)(1 + cos kx) for all x  (crest spacing 2π/k),  wind in +x
u' = U a k cos(kx) e^{-k ζ}
w  = -U a k sin(kx) e^{-k ζ}
a = H/2,  ζ = height above local ground
```

- With uniform U and ζ measured from the mean terrain level, the field is exactly divergence-free and irrotational (derived here). At the surface w/U equals the local slope, which is the kinematic boundary condition.
- **It is the solution for an endless row of hills, not for one hill.** If it is switched on only for |x| ≤ π/k, the horizontal wind jumps by a·k·U at each foot of the hill: 0.31 U, about 1 m/s in the example below (derived here). Either keep the terrain periodic, or use the single ridge in (c).
- Replace U with the log-profile U(ζ), with ζ above local ground. This hybrid keeps the flow tangent to the ground but no longer conserves mass exactly. The leftover divergence is second order in the slope; near the ground, where the shear is strong, it reaches about 0.7 of U10 a k² (derived here). That is acceptable for a wind field that is only sampled (engineering judgement).
- Keep the maximum slope a·k ≤ 0.3 (about 17°). Steeper lee slopes separate (unverified - model knowledge).
- Example (derived here): H = 15 m, half-width 75 m, so the maximum slope is 0.31 (17.4°). In U10 = 4.5 m/s over z0 = 0.03 m, w = 0.94 m/s at 2 m and 1.0 m/s at 5 m, with a crest speed-up of 29 %. A plane sinking at 0.8 m/s can just soar there.
- For comparison, the simple estimate `w ≈ U(ζ) sin θ` gives the same value at the surface.

**(b) Cliff: potential flow past a half-cylinder of radius R ≈ cliff height H_c** (unverified as a cliff model):

```
u = U (1 - (R/r)^2 cos 2φ),   w = -U (R/r)^2 sin 2φ
```

- φ is measured from the downwind horizontal, so the windward face spans 90-180°.
- At the surface w is largest at φ = 135°, where w = U. Away from the surface it decays as (R/r)².
- Example (derived here): H_c = 25 m. Along the φ = 135° diagonal, w/U = (R/r)² is 0.51, 0.39 and 0.32 at 10, 15 and 19 m from the surface. With U = 4.34 m/s at cliff-top height (the Coastal cliff preset) that is 2.2, 1.7 and 1.4 m/s; with U = 5.4 m/s it is 2.8, 2.1 and 1.7 m/s.
- Real sharp-edged cliffs form a separation bubble on top. Inside it, within about 2 H_c downstream and H_c/2 high, double the sigmas and cut U by half (unverified - model knowledge).

**(c) Single hill: linear potential flow over a bell-shaped ("Witch of Agnesi") ridge** (derived here from the same theory as (a); checked numerically to be divergence-free and irrotational, with w = U dz_s/dx at the surface).

```
Ridge:  z_s(x) = H b^2 / (x^2 + b^2)        b = half-width at half-height,  wind in +x
D  = x^2 + (ζ + b)^2
u' = U H b ((ζ + b)^2 - x^2) / D^2
w  = -2 U H b (ζ + b) x / D^2
```

- The maximum slope is 0.650 H/b, at x = ±b/√3. The speed-up at the crest surface is H/b.
- The field is smooth everywhere and fades with distance, so there is no edge to truncate.
- The same U(ζ) substitution and slope limit apply as in (a).
- Example (derived here): H = 15 m and b = 31 m give a maximum slope of 0.31 (17.4°). In U10 = 4.5 m/s over z0 = 0.03 m, at the steepest point w = 0.90 m/s at 2 m and 0.91 m/s at 5 m. The crest speed-up at 2 m is 43 %.

---

## 6. Indoor air

- **ASHRAE 55:**
  - Elevated-air-speed provisions start above 0.20 m/s (39 fpm) [S32]. An older edition used 0.15 m/s [S32].
  - To limit draught below 22.5 °C, HVAC air speed must be ≤ 0.15 m/s [S32].
  - Without local occupant control, the upper limit is 0.8 m/s, and only for operative temperatures above 25.5 °C (ASHRAE 55-2013, via [S32]).
  - The head-to-ankle temperature difference must be ≤ 3 °C seated and ≤ 4 °C standing [S32].
- **ISO 7730 draught rating** (formula unverified - model knowledge; DR and categories A/B/C confirmed to exist [S33]):

  ```
  DR = (34 - t_a)(v - 0.05)^0.62 (0.37 v Tu + 3.14)  [%],  v < 0.05 -> 0.05
  Category A / B / C: DR < 10 / 20 / 30 %
  ```

  At 20 °C with Tu = 40 %, that allows mean speeds of **0.10 / 0.16 / 0.22 m/s** (derived here). The model is known to underestimate draught at about 0.3 m/s [S33].
- **Typical values** (unverified - model knowledge):
  - Occupied zone: 0.05-0.2 m/s, with turbulence intensity 20-60 %.
  - Supply-diffuser "throw" is quoted to a terminal velocity of 0.25-0.75 m/s; jets near diffusers run at 1-3 m/s.
  - Thermal plumes above people or radiators: 0.1-0.3 m/s.
  - Tall halls stratify by about 0.3-1 K/m when heated. That is a density change of about 0.3 %/K, which is negligible for flight.
  - Open doors and destratification fans produce 0.3-1 m/s local drafts.
- **Why records are indoors** (derived reasoning plus record facts):
  - A 0.1 m/s room drift is about 2 % of a 6 m/s glide speed.
  - Outdoors at 2 m in Bft 2, σ_u is already 0.3-0.5 m/s and the gusts are about 1.6-1.7 times the mean.
  - Records confirmed in this note's sources:
    - **Distance:** 88.31 m, 2 Dec 2022, Crown Point, Indiana, USA; A4 paper up to 100 gsm. The previous record was 77 m in April 2022 [S34].
    - **Time aloft:** 29.2 s, Takuo Toda, 19 Dec 2010, Japan. His earlier 27.9 s flight in 2009 used a taped plane [S35].
  - **These are no longer the current records** according to `02-flight-dynamics-validation.md` and `04-paper-and-competition-rules.md`. Those notes report 98.43 m (Shanghai, 28 Dec 2025) and 31.2 s (Kunshan, 11 Feb 2026), with their own sources. Take record values from those notes, not from this one.
  - I could not confirm the venue type for these flights or that Guinness *requires* indoor attempts. Note 04 reports that Guinness and Red Bull Paper Wings attempts are held indoors in still air (its sources, not re-checked here).

---

## 7. How wind affects a glider

1. **Only air-relative velocity creates force.** `v_rel = v_plane - (U_mean(z) + gust)`, evaluated per element. In uniform steady wind, the glide angle *through the air* does not change. Ground distance from height h is about `h (L/D)(1 + U_tail/V_air)`, and time aloft is about `h / (sink - w_up)` (derived here).
2. **Launching into versus with the wind.** The throw speed is set relative to the *ground*.
   - An 8 m/s throw into a 2 m/s headwind gives 10 m/s airspeed: dynamic pressure x1.56. More lift, so it may loop.
   - The same throw with a tailwind gives 6 m/s: dynamic pressure x0.56, so it may stall.
   - The plane then settles to its trim airspeed. Into wind it covers less ground but can stay aloft longer when lift is present.
3. **Wind gradient.** The shear is `dU/dz = u*/(κ z)`. Over grass with U10 = 4 m/s, that is 0.69 s⁻¹ at 1 m and 0.34 s⁻¹ at 2 m (derived here).
   - A plane flying *into* wind and descending at 1 m/s through 1 m loses about 0.7 m/s of airspeed per second, roughly 12 % of its speed. That is the glider-handbook "wind gradient" hazard on final approach.
   - Climbing into wind, or descending downwind, *gains* airspeed instead.
4. **Why light, slow aircraft are sensitive.**
   - The gust angle-of-attack change is `Δα ≈ w_g / V`. A 0.3 m/s gust gives 2.9° at 6 m/s but 0.25° at 70 m/s.
   - The sharp-edged-gust load factor is `Δn = ρ V a w_g / (2 W/S)` (formula unverified - model knowledge).
   - An A4 80 gsm sheet weighs 0.049 N (derived here). On roughly 0.014 m² of wing that is W/S ≈ 3.5 N/m². With a ≈ 2.5 /rad (low aspect ratio), Δn ≈ 0.77. An airliner (W/S ≈ 6000 N/m², V = 70 m/s, a = 5) gets 0.010. **The paper plane is about 70 times more sensitive.**
   - That is the sharp-edged upper bound. A light plane also heaves with the gust: its heave time constant `2 (W/S) / (ρ V a g)` is 0.04 s, which is 0.24 m of travel (derived here). The usual alleviation factor is `K_g = 0.88 μ / (5.3 + μ)` with mass ratio `μ = 2 (W/S) / (ρ c a g)` (unverified - model knowledge). With c = 0.10 m the paper plane has μ = 2.4 and K_g = 0.27; the airliner (c = 5 m) has μ = 41 and K_g = 0.78. For a smooth gust the ratio is then about 25 (derived here). The 6-DOF simulation produces this effect by itself; the numbers are for explanation only.
5. **Resonance.** The Lanchester phugoid period, `T ≈ π√2 V/g`, is 2.7 s at 6 m/s (formula unverified - model knowledge). The gust timescale L_u/V at 2 m is 15.4/6 = 2.6 s (derived here). Outdoor turbulence therefore drives the phugoid directly, which explains the porpoising seen in real outdoor flights.

---

## 8. RECOMMENDED WIND MODEL (constants for the app)

How every environment works:
- The mean wind is a horizontal vector from the log law with the listed z0 and d = 0. Indoors the mean wind is spatially uniform.
- Turbulence uses section 3.4. The sigmas come from section 3.2 (u* from U10 and z0) and the length scales from section 3.1. L is given in the 8785C convention; use L/2 for the HDBK convention or for OU v and w.
- Air comes from section 1.2 at p = 101 325 Pa.

Table values are derived here from the listed sources.

| Environment | Air (T, RH) → ρ, μ | Mean wind | Turbulence at 2 m (σ_u / σ_v / σ_w; L_u / L_v / L_w) | Gusts | Thermals / lift | Basis |
|---|---|---|---|---|---|---|
| **Classroom** (9×7×3 m) | 21 °C, 40 % → 1.1956 kg/m³, 1.818e-5 Pa s | 0.05 m/s, random horizontal direction, slowly wandering (OU, L = 3 m) | 0.04 / 0.04 / 0.03 m/s; OU with L = 1 m on all axes (V_s floor 0.3 m/s) | none | none. Optional radiator plume 0.15 m/s, R = 0.5 m; optional ceiling-diffuser jet 0.25-0.5 m/s in the top 0.5 m | ASHRAE 55 ≤ 0.15-0.20 m/s [S32]; ISO 7730 cat. A ≈ 0.10 m/s [S33] |
| **Gymnasium** (40×25×8 m) | 18 °C, 45 % → 1.2082, 1.804e-5 | 0.10 m/s | 0.05 / 0.05 / 0.04 m/s; OU L = 3 m | optional "door opens" event: 1-cos to 0.5 m/s over 3 s, hold 5-10 s | none. Optional stratification +0.5 K/m (cosmetic) | ASHRAE 55 [S32]; draft and door values (unverified - model knowledge) |
| **Calm meadow** | 24 °C, 50 % → 1.1813, 1.833e-5 | U10 = 1.5 m/s (Bft 1-2), z0 = 0.03 m → U(2 m) = 1.08 m/s, u* = 0.103 m/s | 0.25 / 0.20 / 0.13 m/s; 15.4 / 15.4 / 2.0 m | G(2 m) ≈ 1.6 within 10 min (1.7 within 1 h); event ΔU = 0.37 m/s, d_m = 8 m, every 30-90 s | Allen: w* = 1.5 m/s, z_i = 1000 m → w_peak 0.48 m/s at 2 m, 0.81 m/s at 10 m, r2 = 13-22 m; shape of section 5.2 with R = r2; one thermal drifting with U(z) | [S8][S21][S14][S15][S28][S29][S30] |
| **Breezy hill** | 15 °C, 60 % → 1.2203, 1.789e-5 | U10 = 4.5 m/s (Bft 3), z0 = 0.03 m → U(2 m) = 3.25 m/s, u* = 0.31 m/s | 0.74 / 0.59 / 0.39 m/s; 15.4 / 15.4 / 2.0 m (heights above local ground) | G ≈ 1.6 within 10 min (1.7 within 1 h); event ΔU = 1.1 m/s, d_m = 8 m | Row of cosine hills, H = 15 m, half-width 75 m (17°): ridge lift w ≈ 0.94 m/s at 2 m, 1.0 m/s at 5 m; crest speed-up 29 %. For one hill, use the bell ridge with b = 31 m: 0.90 m/s at 2 m, 0.91 m/s at 5 m, crest speed-up 43 %. Thermals off, or w* = 1 m/s | [S8][S21] + section 5.3(a) and (c) |
| **Coastal cliff** | 16 °C, 80 % → 1.2142, 1.794e-5 | onshore U10 = 4 m/s over sea, z0 = 0.0002 m → U(H_c = 25 m) = 4.34 m/s | upstream 0.36 / 0.28 / 0.19 m/s (u* = 0.148 m/s), L as above; ×2 sigma and ×0.5 U in the cliff-top separation zone | G ≈ 1.3 upstream, ≈ 1.7 on top | Half-cylinder R = 25 m: w = U (R/r)² · abs(sin 2φ) → 2.2 / 1.7 / 1.4 m/s at 10 / 15 / 19 m from the face along the 45° diagonal; plane can hover. No thermals (marine air) | [S8][S10][S21] + section 5.3(b); separation factors (unverified) |
| *Wind tunnel* | user T; default 20 °C | uniform 0-15 m/s | optional Tu 0-5 % (OU, L = 0.2 m); a clean tunnel is < 0.5 % (unverified) | none | none | - |

**Constants block:**

```
kappa = 0.40; Rd = 287.053; beta_S = 1.458e-6; S = 110.4; p0 = 101325; T0 = 288.15
eps = 0.622 (factor 0.378); Magnus 610.94 Pa, 17.625, 243.04 °C
z_ref = 10 m; W20 height = 6.096 m
Dryden: 0.177, 0.000823/ft (0.0027/m), exponents 0.4 and 1.2; sigma_w = 0.1 W20
Similarity: 2.4, 1.9, 1.25 x u*
Gust peak factor g (3 s gust): 2.5 within 10 min, 3.0 within 1 h
Thermal: r1/r2 = 0.0011 r2 + 0.14; game shape radius R = r2
Clamps: h_eff >= max(1 m, d + 10 z0); sigma_w taper below 0.5 m; V_s >= max(0.3 m/s, sigma_u)
```

---

## Open questions and limits

- **Evidence quality:** no source document was opened in full, because the fetch tool was blocked, and the fact-check pass could not open any either. These items rest on model knowledge or partial snippets and should get a human check against the primary documents before release:
  - exact MIL spectra and transfer functions;
  - Allen's r2, r1/r2 and w_peak relations, plus the k1-k4 constants;
  - the ISO 7730 DR equation;
  - the exact WMO 2010 gust factors;
  - Beaufort boundaries for force 2 and above (±0.1 m/s);
  - roughness classes at 0.005 m and at 1.0 m and above.
- **No validated near-ground cutoff** was found for Dryden. The clamps in section 3.3 are engineering judgement.
- **Mixed sigma sources:** taking similarity sigmas with Dryden length scales is a pragmatic hybrid. Near-neutral sigma_u/u* varies from 2 to 3 [S21]. Stability (sunny versus overcast) is not modelled.
- **Ridge and cliff fields are inviscid idealisations.** The log-profile substitution for U does not conserve mass exactly (section 5.3), and real separation is unsteady.
- **Thermal lifetimes, spacing and near-surface inflow** (radial convergence `u_r = -(r/2) ∂w/∂z`) are not modelled. They are cheap to add if wanted.
- **Indoor flows** (diffuser jets, door drafts) depend strongly on the room. The values given are typical, not measured for a specific room.
- **Records, venues and rules:** this note's record values are out of date and its sources did not confirm the indoor requirement. `04-paper-and-competition-rules.md` is the reference for both.
- **Paper humidity effects** (mass and stiffness) are likely larger than the air-density effect, but they belong to the paper model.

## Sources

1. [S1] U.S. Standard Atmosphere, 1976 (NOAA/NASA/USAF), DTIC copy - https://apps.dtic.mil/sti/pdfs/ADA035728.pdf
2. [S2] COESA76 implementation docs (β = 1.458e-6 kg/(m s K^0.5), S = 110.4 K) - https://hapsira.readthedocs.io/en/latest/autoapi/hapsira/earth/atmosphere/coesa76/index.html ; PDAS atmos76 listing - https://www.pdas.com/programs/atmos76.f90
3. [S3] US 1976 atmosphere calculator (μ0 = 1.78938e-5 kg/(m s)) - https://www.luizmonteiro.com/StdAtm.aspx
4. [S4] CFD-Wiki, Sutherland's law (μ0 = 1.716e-5 at 273.15 K, S = 110.4 K, C1 = 1.458e-6) - https://mail.cfd-online.com/Wiki/Sutherland_law
5. [S5] NASA Glenn Wind-US, VISCOSITY keyword (Sutherland default, T > 180 °R) - https://www.grc.nasa.gov/www/winddocs/user/keywords/viscosity.html
6. [S6] Picard, Davis, Gläser, Fujii, "Revised formula for the density of moist air (CIPM-2007)", Metrologia 45 (2008) 149-155 - https://www.nist.gov/sites/default/files/documents/calibrations/CIPM-2007.pdf
7. [S7] Alduchov & Eskridge, "Improved Magnus form approximation of saturation vapor pressure", J. Appl. Meteor. 35 (1996) 601-609 - https://www.osti.gov/biblio/548871 ; coefficient documentation - https://rdrr.io/github/laubblatt/phaselag/man/Magnus_Alduchov1996Improved.html
8. [S8] Stull, Practical Meteorology, ch. 18 "Atmospheric Boundary Layer" (LibreTexts; roughness table) - https://geo.libretexts.org/Bookshelves/Meteorology_and_Climate_Science/Practical_Meteorology_(Stull)/18:_Atmospheric_Boundary_Layer/18.03:_Section_4-
9. [S9] Hammond et al. (2012), "Roughness length estimation along road transects using airborne LIDAR data", Meteorol. Appl. (reproduces the Wieringa et al. 2001 table) - https://rmets.onlinelibrary.wiley.com/doi/10.1002/met.273
10. [S10] Wieringa, revised Davenport roughness classification (AMS) - https://ams.confex.com/ams/AugDavis/webprogram/Paper15611.html ; WMO code register, Davenport classes - https://codes.wmo.int/wmdr/SurfaceRoughnessDavenport
11. [S11] Boundary-layer meteorology lecture ch. 9 (log profile, d and z0) - https://www.meteo.physik.uni-muenchen.de/~roger/Lectures/Boundary_layer_meteorology/BLMet_Ch09_SS2006.pdf
12. [S12] "The Wind Shear Exponent: Comparing Measured Against..." - https://lru.praxis.dk/Lru/microsites/virksomhederiundervisningen/Vestas/vestas_ekstramateriale/4-b%20The_Wind_Shear_Exponent_Comparing_Measured_Against.pdf ; OSTI report on power law vs similarity - https://www.osti.gov/servlets/purl/6176146
13. [S13] MeteoSwiss Beaufort table - https://www.meteoswiss.admin.ch/dam/jcr:c1064242-4a6e-4df2-8d21-96e68d1def7a/Beaufort_Tabelle_en.pdf ; Met Office - https://weather.metoffice.gov.uk/guides/coast-and-sea/beaufort-scale ; SKYbrary - https://skybrary.aero/articles/beaufort-wind-force-scale ; RMetS - https://www.rmets.org/metmatters/beaufort-scale
14. [S14] MathWorks Aerospace Blockset, Dryden Wind Turbulence Model (Continuous) - https://www.mathworks.com/help/aeroblks/drydenwindturbulencemodelcontinuous.html ; (Discrete) - https://www.mathworks.com/help/aeroblks/drydenwindturbulencemodeldiscrete.html
15. [S15] arXiv 2403.12378 (low-altitude Dryden σ and L formulas) - https://arxiv.org/pdf/2403.12378
16. [S16] arXiv 1908.00372, "Assessment of low-altitude atmospheric turbulence models for aircraft aeroelasticity" (MIL-HDBK-1797: 2L_w = h, L_u = 2L_v) - https://arxiv.org/pdf/1908.00372
17. [S17] arXiv 1901.07951, "Modeling and Simulation of UAV Carrier Landings" (σ_w = 0.1 W20) - https://arxiv.org/pdf/1901.07951 ; Modelica Dryden example - https://doc.modelica.org/Modelica%204.0.0/Resources/helpWSM/Modelica/Modelica.Blocks.Examples.Noise.DrydenContinuousTurbulence.html
18. [S18] Madden (NASA LaRC), "Verifying Implementation of the Dryden Turbulence Model and MIL-F-8785 Gust Gradient", AIAA Aviation 2018 - https://ntrs.nasa.gov/citations/20190000875
19. [S19] Yeager, "Implementation and Testing of Turbulence Models for the F18-HARV Simulation", NASA/CR-1998-206937 - https://ntrs.nasa.gov/citations/19980028448
20. [S20] MathWorks Answers, discrete Dryden u_g difference equation from MIL-F-8785C - https://www.mathworks.com/matlabcentral/answers/304578-how-is-the-equation-for-u_g-given-in-matlab-s-discrete-dryden-wind-turbulence-model-a-difference-equ
21. [S21] AMS conference papers quoting Panofsky & Dutton (1984) / Tillman (1972) σ_u,v,w/u* = 2.4, 1.9, 1.25 and the 2-3 scatter - https://ams.confex.com/ams/pdfpapers/101146.pdf ; https://ams.confex.com/ams/pdfpapers/43325.pdf
22. [S22] MathWorks Aerospace Blockset, Discrete Wind Gust Model (MIL-F-8785C 1-cosine) - https://www.mathworks.com/help/aeroblks/discretewindgustmodel.html
23. [S23] 14 CFR 25.341 Gust and turbulence loads - https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-25/subpart-C/subject-group-ECFR3e855ea22ea15d0/section-25.341 ; 2013 edition - https://www.gpo.gov/fdsys/pkg/CFR-2013-title14-vol1/pdf/CFR-2013-title14-vol1-sec25-341.pdf
24. [S24] Harper, Kepert & Ginger (2010), Guidelines for converting between various wind averaging periods in tropical cyclone conditions, WMO/TD-No. 1555 - https://community.wmo.int/node/37087 ; 2008 progress paper - https://ams.confex.com/ams/pdfpapers/138064.pdf
25. [S25] Holmes et al., "Gust durations, gust factors and gust response factors in wind codes and standards" (Durst ↔ I_u = 16.5 %) - https://portfolio.jcu.edu.au/publications/JCU150674
26. [S26] Seoul National University lecture notes, "Part I Wind Properties" (3 s gust vs 10 min and hourly means, open terrain) - https://ocw.snu.ac.kr/sites/default/files/NOTE/1~2%EC%A3%BC%EC%B0%A8_Part%20I%20Wind%20Properties_v14.pdf
27. [S27] Gust factor study vs Durst (GF ≈ 1.43 at z0 ≈ 0.03 m) - https://ams.confex.com/ams/pdfpapers/36949.pdf ; Frontiers in Built Environment (2025), Durst limited to open terrain at 10 m - https://www.frontiersin.org/journals/built-environment/articles/10.3389/fbuil.2025.1498984/pdf
28. [S28] Allen, M. J., "Updraft Model for Development of Autonomous Soaring Uninhabited Air Vehicles", AIAA 2006-1510, NASA DFRC - https://ntrs.nasa.gov/citations/20060004052
29. [S29] arXiv 1707.05668 (summary of the Allen model: w ∝ w*(z/z_i)^(1/3)(1 - 1.1 z/z_i), radial structure) - https://arxiv.org/pdf/1707.05668 ; ISAE survey of thermal updraft models - https://websites.isae-supaero.fr/IMG/pdf/report.pdf
30. [S30] AMS Glossary, "Deardorff velocity" - https://glossary.ametsoc.org/wiki/Deardorff_velocity ; CBL lecture - https://boundary-layer-meteo.github.io/lectures/11_cbl.html
31. [S31] Walton, Kaminer, Dobrokhodov, Jones, "Alternate Strategies for Optimal UAV Thermaling" (Gedeon model) - https://calhoun.nps.edu/entities/publication/cb6411ea-a93d-4c79-8306-82de3daccd2c
32. [S32] ASHRAE 55 summary (air-speed and vertical-gradient limits) - https://en.wikipedia.org/wiki/ASHRAE_55
33. [S33] ISO 7730 (1994 sample) - https://cdn.standards.iteh.ai/samples/14567/8b424422c77b49239f1c385829105f0c/ISO-7730-1994.pdf ; Utrecht study on the draught-rating model - https://research-portal.uu.nl/en/publications/the-significance-of-air-velocity-and-turbulence-intensity-for-res/
34. [S34] Guinness World Records, Farthest flight by a paper aircraft - https://www.guinnessworldrecords.com/world-records/farthest-flight-by-a-paper-aircraft ; (JP) - https://www.guinnessworldrecords.jp/world-records/farthest-flight-by-a-paper-aircraft ; Business Insider (A4, ≤ 100 gsm) - https://businessinsider.in/tech/news/boeing-engineers-designed-a-paper-airplane-that-flew-almost-the-entire-length-of-a-football-field-smashing-the-world-record/amp_articleshow/99521282.cms
35. [S35] Guinness World Records (JP), Longest time flying a paper aircraft - https://www.guinnessworldrecords.jp/world-records/longest-time-flying-a-paper-aircraft ; Japan Times (2009) - https://www.japantimes.co.jp/news/2009/05/17/national/new-flight-record-for-paper-plane-set/ ; The Register (2009) - https://www.theregister.com/2009/12/29/paper_plane_record/ ; humid-conditions attempt - https://reuters.screenocean.com/record/467151 , https://www.dailymotion.com/video/xc8t51
36. [S36] ScienceDirect Topics, "Continuous Turbulence" (low-altitude Dryden L forms) - https://www.sciencedirect.com/topics/engineering/continuous-turbulence
37. [S37] arXiv 1905.09954, "Spatio-Temporal Wind Modeling for UAV Simulations" (von Kármán forms) - https://arxiv.org/pdf/1905.09954

## Verification notes

Fact-check pass, 9 Nov 2026.

**How it was checked.** No source could be opened in this pass. WebFetch failed for every host tried (mathworks.com, ntrs.nasa.gov; the proxy refused wikipedia.org and arxiv.org), and the shared web-search budget was already spent, so no search ran. Every `[S#]` therefore still rests on the original author's search-result extracts. The checks below are hand re-derivations, throwaway numerical scripts, and comparison with the sibling research notes. Where I add a fact from memory, it carries "(unverified - model knowledge)".

**Checked and found correct.** There are 22 numbered items in all: 15 confirmed here and 7 changed below.

| # | Claim | How checked | Result |
|---|---|---|---|
| 1 | Moist-air density, Sutherland and Magnus formulas; table in 1.3; the five preset air values in section 8 | Recomputed every cell | All reproduce. R_d = 8314.32/28.9644 = 287.053; exponent g0 M/(R* L) = 5.25588; L/T0 = 2.25577e-5 |
| 2 | Log-law table in 2.2, u*/U10, equivalent alpha in 2.3, Counihan 0.13, "at 2 m" Beaufort column | Recomputed | All reproduce |
| 3 | Dryden low-altitude table in 3.1; SI form with 0.0027 per metre | Recomputed in feet and in metres | Identical to 4 figures |
| 4 | MIL-F-8785C and MIL-HDBK-1797 transverse spectra are the same once L_HDBK = L_8785C/2 | Algebra, then numerically | Identical; each integrates to sigma² |
| 5 | Transfer functions H_u and H_w | Integrated \|H\|² over ω | Equal sigma²; normalisation note added |
| 6 | Euler difference equation overstates variance by 1/(1 - x/2) | Stationary variance of the AR(1) | Confirmed: +5.3 % at x = 0.1, +11.1 % at x = 0.2 |
| 7 | Exact 2-state recurrence for v and w | Re-derived: A = [[0,1],[-1,-2]], noise on state 2 with intensity 2, stationary covariance I, output (s1 + √3 s2)/2. Checked Q = I - ΦΦᵀ and the discrete Lyapunov solution | Exact. Autocorrelation matches (1 - ξ/2L)e^(-ξ/L) to 1e-16 |
| 8 | Small-τ series for Q | Stationary variance with the series at τ = 1e-3 to 1e-6 | Error below 2e-6. The plain formula fails near τ = 1e-6 |
| 9 | OU substitute with L/2 for v and w | Integral of the transverse correlation; spectral level at zero frequency | Both give L_OU = L/2 |
| 10 | Similarity versus Dryden cross-check in 3.2 | Recomputed | 0.25 vs 0.27 m/s and 0.44 vs 0.94 m/s reproduce. Extra check: over grass 1.25 u* = 0.094 W20, against the MIL 0.1 W20 |
| 11 | ISO 7730 limits 0.10 / 0.16 / 0.22 m/s | Solved the DR equation | 0.099 / 0.162 / 0.221 m/s |
| 12 | Cosine-hill example (0.94 and 1.0 m/s, 29 %, 17.4°) | Recomputed | Reproduces |
| 13 | Half-cylinder field | Re-derived from the polar form of the cylinder solution | Correct |
| 14 | Wind-gradient, launch, load-factor and phugoid numbers in section 7 | Recomputed | All reproduce (ratio 73.6) |
| 15 | Zero net flux of the game thermal shape | Integrated | Zero |

**Changed.**

| # | Was | Now | Why |
|---|---|---|---|
| 16 | Peak factor g ≈ 3 "for a 3 s gust in 10 min"; one G table | g ≈ 3.0 within 1 h, g ≈ 2.5 within 10 min; table gives both; "about 1.7" statements now say 1.6 (10 min) / 1.7 (1 h) | The note's own cited 3 s / 10 min values (1.38-1.43) need g = 2.3-2.6. Simulating the section 3.4 recurrence at a fixed mast gave g = 2.45-2.55 (10 min) and 2.95-3.15 (1 h). The old value mixed the two reference periods |
| 17 | Game thermal radius R ≈ r2/1.5 | R = r2 | With r2/1.5 the updraft ends at 0.67 r2 and carries about a quarter of Allen's mean updraft. R = r2 matches Allen's outer radius and mean updraft to 6 % |
| 18 | "r1/r2 ≈ 0.15 here"; w_peak 0.82 and 1.02 m/s at 10 and 20 m | r1/r2 formula written out; 0.81 and 1.00 m/s | The formula was missing from the code block. With it, r1/r2 is 0.164 and 0.170 at those heights |
| 19 | Allen profile described as always having a sink ring | Ring exists only for 0.5 < z/z_i < 0.9 in Allen; none at paper-plane heights | From memory of the paper (unverified - model knowledge). The game shape's ring is now labelled a gameplay choice |
| 20 | Cosine hill presented as one hill, "divergence-free" | Stated as a row of hills; truncation and mass-conservation limits spelled out; single bell ridge added as 5.3(c) | Truncating the periodic solution to one hill leaves a wind step of 0.31 U at each foot. With U(ζ) above local ground the computed divergence reaches about 0.7 of U10 a k² near the ground. The bell-ridge field was derived and checked numerically |
| 21 | Cliff lift "1.7-2.7 m/s (or 1.4-2.2 m/s) 10-15 m" from the face | 2.2 / 1.7 / 1.4 m/s at 10 / 15 / 19 m along the 45° diagonal for the preset | The old range matched 10-19 m, not 10-15 m, and the example used a different U from the preset |
| 22 | "Current records" 88.31 m and 29.2 s | Marked as superseded, pointing to notes 02 and 04 | Those notes report 98.43 m (28 Dec 2025) and 31.2 s (11 Feb 2026) with sources. I could not check either set online |

Smaller fixes: the CIPM-2007 enhancement factor is about 1.004, not 1.0006 (1.00062 is its constant term; from memory). ISA temperature at 1609 m is 4.5 °C, not 4.7 °C. The "70 times more gust-sensitive" figure is now labelled a sharp-edged upper bound, with about 25 once gust alleviation is counted.

**Still uncertain.**

- **No citation was re-opened.** Nothing was found to be fabricated, but nothing could be confirmed either. The [S8] address ends in "18.03:_Section_4-", which looks like a truncated or auto-generated page name; check that it resolves.
- These constants match my own recollection but have no opened source in either pass: the Dryden coefficients (0.177, 0.000823, exponents 0.4 and 1.2, sigma_w = 0.1 W20) and the spectra; Allen's 0.102, 0.25, 10 m, 0.0011, 0.14 and the w_peak relation; the ISO 7730 DR equation; Davenport classes at 0.005 m and 1.0 m; Sutherland and Magnus coefficients; Beaufort bands. Agreement between two recollections is weak evidence.
- New items added from memory in this pass: the Durst factors 1.52 and 1.07, the WMO gust factors, Allen's height range for the sink ring, the Gedeon attribution, the K_g alleviation formula, and the CIPM Z and f values.
- The gust peak factors come from an Ornstein-Uhlenbeck process, which is what the app will run. Real wind has a different spectrum, so the real g may differ by a few tenths.
- The 5.3 fields ignore the boundary layer, stratification and separation. The near-ground clamps in 3.3 and all indoor "typical" values remain engineering judgement.
