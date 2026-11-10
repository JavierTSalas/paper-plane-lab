import { it } from 'vitest';
import { buildAirframe } from '../airframe';
import { getEnvironment } from '../env';
import { buildPlane } from '../fold';
import { makePaper } from '../paper';
import { simulateFlight } from '../sim';
import { analyzeTrim } from '../tunnel';
import { airFrom } from '../wind';
import { makeDesign, PRESETS } from './index';

it('scratch', () => {
  const env = getEnvironment('gym');
  const air = airFrom(env.tempC, env.pressurePa, env.humidity);
  for (const preset of PRESETS) {
    for (const dih of [0, 3, 5, 8]) {
      const design = makeDesign(preset, makePaper({ sizeId: 'a4' }), { shape: { dihedralDeg: dih } });
      const { model, issues } = buildPlane(design);
      const af = buildAirframe(model, design.trim);
      const t = analyzeTrim(af, air);
      console.log(preset.id, 'dih', dih, 'issues', issues.length, 'span', (model.span * 1000).toFixed(1), 'len', (model.length * 1000).toFixed(1),
        'AR', af.ref.aspectRatio.toFixed(2), 'cg%', (af.cgFromNose * 100).toFixed(1),
        'trim', t.trimmable, 'a', t.alphaDeg?.toFixed(2), 'V', t.speed?.toFixed(2), 'LD', t.glideRatio?.toFixed(2), 'sink', t.sinkRate?.toFixed(2),
        'SM', t.staticMarginPct.toFixed(1), 'clB', t.clBeta.toFixed(3), 'cnB', t.cnBeta.toFixed(3), 'cnBdyn', t.cnBetaDynamic.toFixed(3), 'bestLD', t.bestLd.toFixed(2));
      for (const [speed, pitch] of [[6, 0], [9, 5], [10, 10]] as const) {
        const r = simulateFlight(af, { speed, pitchDeg: pitch, yawDeg: 0, rollDeg: 0, aoaDeg: 0 }, env, { envId: 'gym' }, 1);
        console.log('   throw', speed, pitch, 'dist', r.metrics.distance.toFixed(1), 'lat', r.metrics.lateral.toFixed(1), 't', r.metrics.airtime.toFixed(2), r.outcome, r.diagnosis.map((d) => d.code).join(','));
      }
    }
  }
});
