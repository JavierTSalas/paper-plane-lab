import { describe, expect, it } from 'vitest';
import {
  cross3, createRng, DEG, hash32, mat3Inverse, mat3Mul, mat3MulVec, quatFromAxisAngle, quatMul,
  quatRotate, quatRotateInv, quatToMat3, rotateAboutAxis,
} from './index';

const close = (a: readonly number[], b: readonly number[], eps = 1e-12) =>
  a.forEach((x, i) => expect(Math.abs(x - b[i]!)).toBeLessThan(eps));

describe('math', () => {
  it('frame is right-handed: x (nose) cross y (up) = z (right)', () => {
    close(cross3([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  });
  it('positive rotation about +z pitches the nose up', () => {
    const q = quatFromAxisAngle([0, 0, 1], 30 * DEG);
    const nose = quatRotate(q, [1, 0, 0]);
    expect(nose[1]).toBeGreaterThan(0);
    close(quatRotateInv(q, nose), [1, 0, 0]);
  });
  it('quaternion and matrix rotations agree and compose', () => {
    const a = quatFromAxisAngle([0, 1, 0], 0.7);
    const b = quatFromAxisAngle([1, 0, 0], -0.3);
    const v = [0.2, -1.1, 0.5] as const;
    close(quatRotate(quatMul(a, b), v), quatRotate(a, quatRotate(b, v)));
    close(mat3MulVec(quatToMat3(a), v), quatRotate(a, v));
    close(mat3Mul(quatToMat3(a), mat3Inverse(quatToMat3(a))), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
  it('rotateAboutAxis follows the right-hand rule about an offset axis', () => {
    close(rotateAboutAxis([2, 0, 0], [1, 0, 0], [0, 0, 1], Math.PI / 2), [1, 1, 0]);
  });
  it('rng is deterministic and roughly standard normal', () => {
    const r1 = createRng(42), r2 = createRng(42);
    for (let i = 0; i < 10; i++) expect(r1.next()).toBe(r2.next());
    const r = createRng(7);
    let s = 0, s2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) { const g = r.gauss(); s += g; s2 += g * g; }
    expect(Math.abs(s / n)).toBeLessThan(0.03);
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.05);
    expect(hash32('dart')).toBe(hash32('dart'));
  });
});
