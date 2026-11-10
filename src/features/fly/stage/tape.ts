/**
 * A measuring tape on the ground along the throw line (+x from the release point), in the player's units.
 */
import * as THREE from 'three';
import { terrainHeight } from '../../../core/env';
import type { Environment } from '../../../core/types';
import type { UnitSystem } from '../../../ui/format';
import { M_PER_FT } from '../../../ui/format';
import { box, merge, numeral, onGround } from './geo';
import { PALETTE } from './scenery';

/** Tape offset to the thrower's left, so the plane's shadow runs beside it, metres. */
export const TAPE_Z = -0.9;

interface TapePlan {
  unit: number;
  tick: number;
  label: number;
  length: number;
  digit: number;
  width: number;
}

function plan(env: Environment, units: UnitSystem): TapePlan {
  const unit = units === 'imperial' ? M_PER_FT : 1;
  let lengthM: number;
  if (env.bounds) lengthM = env.bounds.xMax - 0.3;
  else if (env.terrain.kind === 'cliff') lengthM = Math.max(1, env.terrain.edgeX + env.terrain.height * 0.35);
  else lengthM = 100;
  const length = Math.floor(lengthM / unit);
  const big = lengthM > 30;
  const huge = lengthM > 80;
  if (units === 'imperial') {
    return { unit, length, tick: big ? 5 : 1, label: huge ? 50 : big ? 10 : 5, digit: huge ? 1.2 : big ? 0.6 : 0.22, width: huge ? 0.25 : big ? 0.14 : 0.06 };
  }
  return { unit, length, tick: huge ? 1 : big ? 1 : 0.5, label: huge ? 10 : big ? 5 : 1, digit: huge ? 1.2 : big ? 0.5 : 0.2, width: huge ? 0.25 : big ? 0.14 : 0.06 };
}

export function buildTape(env: Environment, units: UnitSystem, mat: THREE.Material): THREE.Mesh | null {
  const p = plan(env, units);
  if (p.length < 1) return null;
  const parts: THREE.BufferGeometry[] = [];
  const g = (x: number): number => terrainHeight(env.terrain, x) + 0.006;
  const step = Math.max(0.25, p.tick * p.unit);
  // The tape follows the ground in short straight pieces.
  for (let x = 0; x < p.length * p.unit - 1e-6; x += step) {
    const x1 = Math.min(p.length * p.unit, x + step);
    const y0 = g(x);
    const y1 = g(x1);
    const len = Math.hypot(x1 - x, y1 - y0);
    const piece = box(len, 0.003, p.width, PALETTE.mustard);
    piece.rotateZ(Math.atan2(y1 - y0, x1 - x));
    piece.translate((x + x1) / 2, (y0 + y1) / 2, TAPE_Z);
    parts.push(piece);
  }
  const n = Math.round(p.length / p.tick);
  for (let i = 0; i <= n; i++) {
    const v = i * p.tick;
    const x = v * p.unit;
    const isLabel = Math.abs(v / p.label - Math.round(v / p.label)) < 1e-6;
    const tickLen = isLabel ? p.width : p.width * 0.5;
    parts.push(box(p.width * 0.08, 0.004, tickLen, PALETTE.ink, x, g(x) + 0.001, TAPE_Z - p.width / 2 + tickLen / 2));
    if (isLabel && v > 0) {
      const text = String(Math.round(v));
      const half = (text.length * 0.85 - 0.25) * p.digit * 0.5;
      parts.push(numeral(text, p.digit, PALETTE.ink, onGround(x, g(x) + 0.002, TAPE_Z - p.width / 2 - p.digit * 0.25 - half)));
    }
  }
  // The throw line at the release point.
  parts.push(box(0.04, 0.004, 1.6, PALETTE.accent, 0, g(0), 0));
  const m = new THREE.Mesh(merge(parts), mat);
  m.matrixAutoUpdate = false;
  return m;
}
