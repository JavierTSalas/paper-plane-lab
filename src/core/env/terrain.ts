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
    case 'cliff': {
      const out = x - terrain.edgeX;
      if (out <= 0) return 0;
      if (out >= terrain.height) return -terrain.height;
      // Quarter circle of radius `height` about the foot of the cliff-top edge.
      return Math.sqrt(terrain.height * terrain.height - out * out) - terrain.height;
    }
  }
}

/** Ground height (world y) under the point (x, z) in an environment, metres. */
export const groundHeight = (env: Environment, x: number, z: number): number => terrainHeight(env.terrain, x, z);

/** Highest ground anywhere in the terrain, metres. */
export function terrainTop(terrain: Terrain): number {
  switch (terrain.kind) {
    case 'flat':
    case 'cliff':
      return 0;
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
