import type { Mat3, PosedPiece, Vec3 } from '../types';

export interface PointMass {
  mass: number;
  pos: Vec3;
}

export interface MassProps {
  /** kg */
  mass: number;
  /** Centre of gravity, same frame as the input vertices. */
  cg: Vec3;
  /** Inertia tensor about the CG, kg m². */
  inertia: Mat3;
  /** Total lamina area (every layer counted), m². */
  area: number;
}

/**
 * Mass, centre of gravity and inertia tensor of a set of thin laminae plus point masses.
 *
 * Every piece is a planar convex polygon of uniform areal density, split into a triangle fan. The second
 * moment of a triangle with corners a, b, c and mass m about the origin is exact:
 *   integral of r r^T dm = (m / 12) (a a^T + b b^T + c c^T + s s^T),  s = a + b + c.
 * The sum is then moved to the CG with the parallel-axis theorem. Overlapping layers are separate pieces,
 * so their mass adds up without any special handling.
 */
export function laminaMassProps(
  pieces: readonly PosedPiece[],
  arealDensity: number,
  points: readonly PointMass[] = [],
): MassProps {
  let mass = 0;
  let area = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  // Second-moment matrix about the origin (symmetric): xx, yy, zz, xy, xz, yz.
  let cxx = 0;
  let cyy = 0;
  let czz = 0;
  let cxy = 0;
  let cxz = 0;
  let cyz = 0;

  for (const piece of pieces) {
    const v = piece.verts;
    const a = v[0];
    for (let i = 1; i + 1 < v.length; i++) {
      const b = v[i];
      const c = v[i + 1];
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const wx = c[0] - a[0];
      const wy = c[1] - a[1];
      const wz = c[2] - a[2];
      const triArea = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
      if (triArea === 0) continue;
      const m = triArea * arealDensity;
      const sx = a[0] + b[0] + c[0];
      const sy = a[1] + b[1] + c[1];
      const sz = a[2] + b[2] + c[2];
      area += triArea;
      mass += m;
      mx += (m * sx) / 3;
      my += (m * sy) / 3;
      mz += (m * sz) / 3;
      const k = m / 12;
      cxx += k * (a[0] * a[0] + b[0] * b[0] + c[0] * c[0] + sx * sx);
      cyy += k * (a[1] * a[1] + b[1] * b[1] + c[1] * c[1] + sy * sy);
      czz += k * (a[2] * a[2] + b[2] * b[2] + c[2] * c[2] + sz * sz);
      cxy += k * (a[0] * a[1] + b[0] * b[1] + c[0] * c[1] + sx * sy);
      cxz += k * (a[0] * a[2] + b[0] * b[2] + c[0] * c[2] + sx * sz);
      cyz += k * (a[1] * a[2] + b[1] * b[2] + c[1] * c[2] + sy * sz);
    }
  }

  for (const p of points) {
    if (!(p.mass > 0)) continue;
    const [x, y, z] = p.pos;
    mass += p.mass;
    mx += p.mass * x;
    my += p.mass * y;
    mz += p.mass * z;
    cxx += p.mass * x * x;
    cyy += p.mass * y * y;
    czz += p.mass * z * z;
    cxy += p.mass * x * y;
    cxz += p.mass * x * z;
    cyz += p.mass * y * z;
  }

  if (!(mass > 0)) {
    return { mass: 0, cg: [0, 0, 0], inertia: [0, 0, 0, 0, 0, 0, 0, 0, 0], area };
  }

  const gx = mx / mass;
  const gy = my / mass;
  const gz = mz / mass;
  // Parallel axis: second moments about the CG.
  cxx -= mass * gx * gx;
  cyy -= mass * gy * gy;
  czz -= mass * gz * gz;
  cxy -= mass * gx * gy;
  cxz -= mass * gx * gz;
  cyz -= mass * gy * gz;

  return {
    mass,
    cg: [gx, gy, gz],
    // I = trace(C) 1 - C
    inertia: [cyy + czz, -cxy, -cxz, -cxy, cxx + czz, -cyz, -cxz, -cyz, cxx + cyy],
    area,
  };
}
