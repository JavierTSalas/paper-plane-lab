import { it } from 'vitest';
import { PRESETS, makeDesign, presetPaper } from '../designs';
import { buildPlane } from '../fold';
import { buildAirframe } from '../airframe';
import { simulateFlight } from '../sim';
import { getEnvironment } from '../env';
it('bench', () => {
  const p = PRESETS[0]!;
  const d = makeDesign(p, presetPaper(p));
  const { model } = buildPlane(d);
  const af = buildAirframe(model, d.trim);
  const env = getEnvironment('hangar');
  for (const [s, a] of [[8, 5], [27, 40], [10, 20], [27, 10]] as const) {
    const t0 = performance.now();
    const r = simulateFlight(af, { speed: s, pitchDeg: a, yawDeg: 0, rollDeg: 0, aoaDeg: 0 }, env, { envId: 'hangar' }, 1);
    console.log(s, a, (performance.now() - t0).toFixed(1), 'ms', r.metrics.distance.toFixed(2), r.metrics.airtime.toFixed(2), r.outcome, r.samples.length, JSON.stringify(r.events.map(e=>[e.kind,e.t.toFixed(2),e.pos.map(v=>v.toFixed(1))])));
  }
});
