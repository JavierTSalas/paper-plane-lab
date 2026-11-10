import { describe, expect, it } from 'vitest';
import { getPlaneBuild } from '../../../app/hooks';
import { defaultDesign } from '../../../core/designs';
import { buildPlaneGeometry } from './planeMesh';

describe('plane mesh', () => {
  const build = getPlaneBuild(defaultDesign());
  const geo = buildPlaneGeometry(build.model, build.design.paper);
  const pos = geo.getAttribute('position');

  it('has two faces per triangle of every piece, coloured', () => {
    expect(pos.count % 6).toBe(0);
    expect(geo.getAttribute('color').count).toBe(pos.count);
  });

  it('lies in the body frame: tail at x = 0, nose at the model length, CG in between', () => {
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
    }
    expect(minX).toBeGreaterThan(-0.002);
    expect(maxX).toBeCloseTo(build.model.length, 2);
    expect(build.airframe.cg[0]).toBeGreaterThan(minX);
    expect(build.airframe.cg[0]).toBeLessThan(maxX);
  });
});
