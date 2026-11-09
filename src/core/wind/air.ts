/**
 * Air density and viscosity from temperature, pressure and humidity.
 * Model: docs/research/03-wind-atmosphere.md section 1.2.
 */
import type { Air } from '../types';

/** Specific gas constant of dry air, J/(kg K) (doc 03 section 1.1). */
const R_DRY = 287.053;
/** 1 - (molar mass of water vapour / dry air) = 1 - 0.622 (doc 03 section 1.1). */
const VAPOUR_DEFICIT = 0.378;
/** Magnus saturation vapour pressure over water: 610.94 Pa, 17.625, 243.04 C (doc 03 section 1.2, [S7]). */
const MAGNUS_PA = 610.94;
const MAGNUS_A = 17.625;
const MAGNUS_B_C = 243.04;
/** Sutherland's law: beta = 1.458e-6 kg/(m s K^0.5), S = 110.4 K (doc 03 section 1.1, [S2]). */
const SUTHERLAND_BETA = 1.458e-6;
const SUTHERLAND_S = 110.4;
/** 0 C in kelvin. */
const KELVIN = 273.15;

/** Standard sea-level pressure, Pa (doc 03 section 1.1). */
export const SEA_LEVEL_PRESSURE = 101_325;

/**
 * Moist air as an ideal gas, with Sutherland viscosity.
 * @param tempC      air temperature, degrees Celsius
 * @param pressurePa static pressure, Pa
 * @param humidity   relative humidity as a fraction, 0 - 1
 */
export function airFrom(tempC: number, pressurePa: number, humidity: number): Air {
  const kelvin = tempC + KELVIN;
  const saturation = MAGNUS_PA * Math.exp((MAGNUS_A * tempC) / (tempC + MAGNUS_B_C));
  const vapour = Math.min(1, Math.max(0, humidity)) * saturation;
  return {
    rho: (pressurePa - VAPOUR_DEFICIT * vapour) / (R_DRY * kelvin),
    mu: (SUTHERLAND_BETA * kelvin ** 1.5) / (kelvin + SUTHERLAND_S),
  };
}
