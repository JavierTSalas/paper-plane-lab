/**
 * Ground shapes (the `Terrain` union of src/core/types.ts). The renderer, the contact test of the flight
 * simulation and the wind field all read the ground from here, so they cannot disagree.
 */
import type { Environment, Terrain } from '../types';

/** Ground height (world y) under the point (x, z), metres. Every terrain is uniform along z. */
export function terrainHeight(terrain: Terrain, x: number, _z = 0): number {
  switch (terrain.kind) {
    case 'flat':
      return 0;
    case 'hill': {
      // Row of cosine ridges, shifted down so that the ground under the thrower (x = 0) is y = 0.
      const k = Math.PI / terrain.halfWidth;
      return 0.5 * terrain.height * (Math.cos(k * (x - terrain.crestX)) - Math.cos(k * terrain.crestX));
    }
    case 'cliff':
      return cliffProfile(terrain.height, x - terrain.edgeX) + cliffTopHeight(terrain);
  }
}

/** Cliff shape below its own top: 0 on the top, a quarter circle of radius `height` down the face, then the sea. */
function cliffProfile(height: number, out: number): number {
  if (out <= 0) return 0;
  if (out >= height) return -height;
  return Math.sqrt(height * height - out * out) - height;
}

/**
 * World y of a cliff's flat top. 0 when the thrower stands on the top (edgeX >= 0); positive when the thrower
 * stands out on the rounded shoulder (edgeX < 0), because the ground under the thrower is y = 0 by convention.
 */
export function cliffTopHeight(terrain: Extract<Terrain, { kind: 'cliff' }>): number {
  return 0 - cliffProfile(terrain.height, -terrain.edgeX);
}

/** Ground height (world y) under the point (x, z) in an environment, metres. */
export const groundHeight = (env: Environment, x: number, z: number): number => terrainHeight(env.terrain, x, z);

/** Highest ground anywhere in the terrain, metres. */
export function terrainTop(terrain: Terrain): number {
  switch (terrain.kind) {
    case 'flat':
      return 0;
    case 'cliff':
      return cliffTopHeight(terrain);
    case 'hill':
      return 0.5 * terrain.height * (1 - Math.cos((Math.PI / terrain.halfWidth) * terrain.crestX));
  }
}

/** Steepest ground slope (rise over run). Infinity where the ground has a vertical face. */
export function terrainMaxSlope(terrain: Terrain): number {
  switch (terrain.kind) {
    case 'flat':
      return 0;
    case 'hill':
      return (0.5 * terrain.height * Math.PI) / terrain.halfWidth;
    case 'cliff':
      return Infinity;
  }
}
