import { describe, expect, it } from 'vitest';
import type { Vec2, Vec3 } from '../../../core/types';
import {
  cameraBasis, fitPoints, painterOrder, polygonNormal, project, shadeFactor, sheetToScreen, unprojectToPlane,
  type Camera, type DepthFace,
} from './projector';

const close = (a: number, b: number, eps = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('projection', () => {
  it('top-down camera maps x right and y up the screen', () => {
    const cam: Camera = { yaw: 0, pitch: 90, scale: 100, cx: 50, cy: 60 };
    const [x, y, d] = project(cam, [0.1, 0.2, 0.3]);
    close(x, 60);
    close(y, 40);
    close(d, 0.3);
  });

  it('keeps an orthonormal right-handed basis for any yaw and pitch', () => {
    for (const [yaw, pitch] of [[0, 65], [140, 25], [-35, 10], [90, 90]] as const) {
      const { r, u, w } = cameraBasis(yaw, pitch);
      const d = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      close(d(r, r), 1);
      close(d(u, u), 1);
      close(d(w, w), 1);
      close(d(r, u), 0);
      close(d(r, w), 0);
      close(d(u, w), 0);
      // r x u = w: the camera looks along -w.
      close(r[1] * u[2] - r[2] * u[1], w[0]);
      close(r[2] * u[0] - r[0] * u[2], w[1]);
      close(r[0] * u[1] - r[1] * u[0], w[2]);
    }
  });

  it('a tilted camera shows raised points higher on screen and nearer', () => {
    const cam: Camera = { yaw: 0, pitch: 65, scale: 100, cx: 0, cy: 0 };
    const low = project(cam, [0, 0, 0]);
    const high = project(cam, [0, 0, 0.1]);
    expect(high[1]).toBeLessThan(low[1]);
    expect(high[2]).toBeGreaterThan(low[2]);
    // Far points (larger y) are farther away.
    expect(project(cam, [0, 1, 0])[2]).toBeLessThan(low[2]);
  });

  it('unprojects back onto a plane', () => {
    const cam: Camera = { yaw: 20, pitch: 60, scale: 300, cx: 120, cy: 80 };
    const p: Vec3 = [0.12, -0.05, 0.01];
    const s = project(cam, p);
    const q = unprojectToPlane(cam, s[0], s[1], 0.01)!;
    close(q[0], p[0], 1e-12);
    close(q[1], p[1], 1e-12);
  });
});

describe('fit', () => {
  it('centres the points and fills the tighter dimension', () => {
    const pts: Vec3[] = [[0, 0, 0], [0.2, 0, 0], [0.2, 0.3, 0], [0, 0.3, 0]];
    const cam = fitPoints(pts, 0, 90, { width: 400, height: 400, pad: 20 })!;
    close(cam.scale, 360 / 0.3);
    const a = project(cam, [0, 0.3, 0]);
    const b = project(cam, [0.2, 0, 0]);
    close(a[1], 20);
    close(b[1], 380);
    close((a[0] + b[0]) / 2, 200);
  });

  it('returns null for no points', () => {
    expect(fitPoints([], 0, 90, { width: 10, height: 10 })).toBeNull();
  });
});

describe('painter order', () => {
  const square = (x: number, y: number, z: number, s = 1): Vec3[] => [
    [x, y, z], [x + s, y, z], [x + s, y + s, z], [x, y + s, z],
  ];
  const face = (verts: Vec3[], group: number, rank: number, extra: Partial<DepthFace> = {}): DepthFace => ({
    verts, group, rank, stackDir: [0, 0, 1], ...extra,
  });
  const top = { yaw: 0, pitch: 90 };
  const tilted = { yaw: 0, pitch: 65 };

  it('draws coplanar stacked layers bottom to top, from above', () => {
    const faces = [face(square(0, 0, 0), 0, 2), face(square(0.2, 0.2, 0), 0, 0), face(square(0.4, 0, 0), 0, 1)];
    expect(painterOrder(faces, top)).toEqual([1, 2, 0]);
  });

  it('reverses a rigid stack seen from below its stacking direction', () => {
    const faces = [face(square(0, 0, 0), 0, 0, { stackDir: [0, 0, -1] }), face(square(0.2, 0.2, 0), 0, 1, { stackDir: [0, 0, -1] })];
    expect(painterOrder(faces, top)).toEqual([1, 0]);
  });

  it('orders separate groups by plane tests', () => {
    const low = face(square(0, 0, 0), 0, 5);
    const high = face(square(0.5, 0.5, 0.2), 1, 0);
    expect(painterOrder([high, low], tilted)).toEqual([1, 0]);
  });

  it('honours draw levels for a valley flap over the stack', () => {
    // A flap hinged at y = 1 swung up to 60 degrees; its hinge edge dips below the stationary top layer.
    const c = Math.cos(Math.PI / 3);
    const s = Math.sin(Math.PI / 3);
    const flap: Vec3[] = [[0, 1, -0.001], [1, 1, -0.001], [1, 1 - c, s], [0, 1 - c, s]];
    const stack = face(square(0, 0, 0), 0, 0, { level: 0 });
    const moving = face(flap, 1, 0, { level: 1 });
    expect(painterOrder([moving, stack], tilted)).toEqual([1, 0]);
  });

  it('puts a vertical wall in front of the far half of a floor and behind a near one', () => {
    // Floor split into a far and a near half; wall standing at y = 0.5 facing the camera.
    const far = face([[0, 0.5, 0], [1, 0.5, 0], [1, 1, 0], [0, 1, 0]], 0, 0);
    const near = face([[0, 0, 0], [1, 0, 0], [1, 0.5, 0], [0, 0.5, 0]], 1, 0);
    const wall = face([[0, 0.5, 0], [1, 0.5, 0], [1, 0.5, 0.6], [0, 0.5, 0.6]], 2, 0, { stackDir: [0, -1, 0] });
    const order = painterOrder([near, wall, far], tilted);
    expect(order.indexOf(2)).toBeLessThan(order.indexOf(1));
  });

  it('orders non-overlapping faces without constraints', () => {
    const a = face(square(0, 0, 0), 0, 0);
    const b = face(square(0.5, 0, 0), 1, 0);
    expect(painterOrder([a, b], top).sort()).toEqual([0, 1]);
  });
});

describe('helpers', () => {
  it('polygon normal follows the vertex order', () => {
    expect(polygonNormal([[0, 0, 0], [1, 0, 0], [0, 1, 0]])).toEqual([0, 0, 1]);
    expect(polygonNormal([[0, 0, 0], [0, 1, 0], [1, 0, 0]])).toEqual([0, 0, -1]);
  });

  it('sheet-to-screen affine reproduces every vertex', () => {
    const sheet: Vec2[] = [[0, 0], [0.1, 0], [0.1, 0.2], [0, 0.2]];
    const screen: Vec3[] = [[10, 20, 0], [30, 25, 0], [20, 65, 0], [0, 60, 0]];
    const [a, b, c, d, e, f] = sheetToScreen(sheet, screen)!;
    sheet.forEach(([x, y], i) => {
      close(a * x + c * y + e, screen[i]![0], 1e-9);
      close(b * x + d * y + f, screen[i]![1], 1e-9);
    });
  });

  it('shading is brightest facing the light and never below ambient', () => {
    expect(shadeFactor([0, 0, 1], [0, 0, 1], [0, 0, 1])).toBeCloseTo(1);
    expect(shadeFactor([0, 0, -1], [0, 0, 1], [0, 0, 1])).toBeCloseTo(1);
    expect(shadeFactor([1, 0, 0], [1, 0, 0], [0, 0, 1], 0.7)).toBeCloseTo(0.7);
  });
});
