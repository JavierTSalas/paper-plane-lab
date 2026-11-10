import { useMemo, useRef, useState, type ReactElement } from 'react';
import { usePlaneBuild, useTrimAnalysis } from '../../app/hooks';
import { useLab } from '../../app/store';
import { defaultShape, SHAPE_STEP } from '../../core/fold';
import type { FlatState, PlaneDesign, ShapeSpec, Vec2 } from '../../core/types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { formatLength, signedDeg, formatDeg } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { issueText } from './FreeformFold';
import { halfReach, wingletLineFrom, wingletSize, wingLineFrom, wingOffsets, type WingOffsets } from './geometry';
import { StabilityStrip } from './Stability';
import { PaperCanvas, PlaneView } from './view';
import './fold.css';

export interface ShapeStageProps {
  design: PlaneDesign;
  /** The shape the plane is meant to have (the preset's, or a sensible default for a custom fold). */
  recommended: ShapeSpec;
  onShape: (shape: ShapeSpec, key: string) => void;
}

type Keel = ShapeSpec['keel'];

const KEEL_WORDS: Record<Keel, string> = {
  valley: 'Folded faces inside: the side you folded on becomes the top of the wings.',
  mountain: 'Folded faces outside: the flaps end up under the wings, as on many gliders.',
  none: 'No keel: a flat wing, bent up only at the wing line.',
};

/** Keel, wing line, dihedral and winglets, with a live 3D preview and stability readout. */
export function ShapeStage({ design, recommended, onShape }: ShapeStageProps): ReactElement {
  const units = useLab((s) => s.settings.units);
  const build = usePlaneBuild(design)!;
  const analysis = useTrimAnalysis(build);
  const flat = build.fold.final;
  const shape = design.shape;
  const reach = useMemo(() => halfReach(flat), [flat]);
  const set = (patch: Partial<ShapeSpec>, key: string): void => onShape({ ...shape, ...patch }, key);
  const mm = (v: number): string => formatLength(v, units, { unit: units === 'metric' ? 'mm' : 'in', digits: units === 'metric' ? 0 : 2 });

  const offsets: WingOffsets | null = shape.wingLine ? wingOffsets(flat, shape.wingLine) : null;
  const setOffsets = (o: WingOffsets, key: string): void => {
    const clamp = (v: number): number => Math.max(0, Math.min(reach - 0.002, v));
    let next: WingOffsets = { nose: clamp(o.nose), tail: clamp(o.tail) };
    if (next.nose < 0.001 && next.tail < 0.001) next = { ...next, tail: 0.001 };
    const wingLine = wingLineFrom(flat, next);
    // Keep the winglet outboard of the wing line.
    let wingletLine = shape.wingletLine;
    if (wingletLine) {
      const maxSize = reach - Math.max(next.nose, next.tail) - 0.003;
      const size = Math.min(wingletSize(flat, wingletLine), maxSize);
      wingletLine = size > 0.002 ? wingletLineFrom(flat, size) : null;
    }
    set({ wingLine, wingletLine }, key);
  };

  const setKeel = (keel: Keel): void => {
    if (keel !== 'none' && !shape.wingLine) {
      const d = defaultShape(flat);
      set({ keel, wingLine: d.wingLine, keelSpreadDeg: shape.keelSpreadDeg || d.keelSpreadDeg }, 'shape.keel');
    } else set({ keel }, 'shape.keel');
  };

  const maxWinglet = Math.max(0.004, reach - (offsets ? Math.max(offsets.nose, offsets.tail) : 0) - 0.003);
  const winglet = shape.wingletLine ? wingletSize(flat, shape.wingletLine) : 0;
  const shapeIssues = build.issues.filter((i) => i.step === SHAPE_STEP && i.severity === 'error');

  return (
    <div className="ppl-shape">
      <div className="ppl-shape__view">
        <PlaneView
          model={build.model}
          paper={design.paper}
          interactive
          backdrop
          aspect={1.5}
          markers={analysis ? [{ x: build.airframe.cg[0], kind: 'cg' }, { x: analysis.neutralPointX, kind: 'np' }] : undefined}
          label="Your plane in 3D. Drag to turn it."
        />
        <div className="ppl-shape__caption">
          Drag to turn it. CG is the balance point, NP the neutral point.
          <InfoDot label="What are CG and NP?" title="Balance and neutral point" topic="stability-and-trim">
            The plane balances on its CG. The lift acts as if it pivots about the NP. The CG must sit ahead of the NP, toward the nose, for a
            steady glide.
          </InfoDot>
        </div>
        <StabilityStrip analysis={analysis} units={units} />
      </div>

      <Card padding="md" className="ppl-shape__controls">
        <div className="ppl-ffield">
          <div className="ppl-ffield__label">
            Keel
            <InfoDot label="What is the keel?" title="The keel">
              The centre fold that makes the body you hold. Valley keeps your folded flaps inside, mountain turns them to the outside.
            </InfoDot>
          </div>
          <SegmentedControl<Keel>
            label="Keel direction"
            block
            value={shape.keel}
            onChange={setKeel}
            options={[
              { value: 'valley', label: 'Inside' },
              { value: 'mountain', label: 'Outside' },
              { value: 'none', label: 'Flat wing' },
            ]}
          />
          <p className="ppl-ffield__hint">{KEEL_WORDS[shape.keel]}</p>
        </div>

        {shape.keel !== 'none' && (
          <Slider
            label="Keel spread"
            info={
              <InfoDot label="What is keel spread?" title="Keel spread">
                The angle between the two body walls. Pressed together (0°) makes a thin blade; a wider V lowers the wings and adds some
                sideways stability.
              </InfoDot>
            }
            min={0}
            max={90}
            step={1}
            value={shape.keelSpreadDeg}
            onChange={(v) => set({ keelSpreadDeg: v }, 'shape.spread')}
            format={(v) => formatDeg(v)}
          />
        )}

        {shape.keel === 'none' && (
          <Toggle
            label="Wing fold"
            description="A bend line that tips the outer wing up."
            checked={shape.wingLine !== null}
            onChange={(on) => (on ? setOffsets({ nose: reach * 0.4, tail: reach * 0.4 }, 'shape.wingtoggle') : set({ wingLine: null, wingletLine: null }, 'shape.wingtoggle'))}
          />
        )}

        {offsets && (
          <div className="ppl-ffield">
            <div className="ppl-ffield__label">
              Wing line
              <InfoDot label="What is the wing line?" title="Wing line">
                Where the wings fold down from the body. Further out makes a deeper body and narrower wings; a slanted line makes a dart's
                swept wings. Drag the two handles or use the sliders.
              </InfoDot>
            </div>
            <WingLineEditor design={design} flat={flat} offsets={offsets} reach={reach} onChange={setOffsets} />
            <Slider label="From the centre at the nose" min={0} max={reach} step={0.0005} value={offsets.nose} onChange={(v) => setOffsets({ ...offsets, nose: v }, 'shape.nose')} format={mm} />
            <Slider label="From the centre at the tail" min={0} max={reach} step={0.0005} value={offsets.tail} onChange={(v) => setOffsets({ ...offsets, tail: v }, 'shape.tail')} format={mm} />
          </div>
        )}

        {shape.wingLine && (
          <Slider
            label="Dihedral"
            info={
              <InfoDot label="What is dihedral?" title="Dihedral" topic="stability-and-trim">
                How far the wing tips are raised above flat. A few degrees up makes the plane level itself after a bump; too much makes it
                wobble from side to side.
              </InfoDot>
            }
            min={-10}
            max={25}
            step={1}
            origin={0}
            value={shape.dihedralDeg}
            onChange={(v) => set({ dihedralDeg: v }, 'shape.dihedral')}
            format={(v) => `${signedDeg(v)} ${v > 0 ? 'tips up' : v < 0 ? 'tips down' : 'flat'}`}
          />
        )}

        {shape.wingLine && (
          <div className="ppl-ffield">
            <Toggle
              label="Winglets"
              description="Fold the wing tips up or down."
              checked={shape.wingletLine !== null}
              onChange={(on) =>
                set({ wingletLine: on ? wingletLineFrom(flat, Math.min(maxWinglet, Math.max(0.006, reach * 0.18))) : null, wingletDeg: on ? shape.wingletDeg || 80 : 0 }, 'shape.winglets')
              }
            />
            {shape.wingletLine && (
              <>
                <Slider
                  label="Winglet size"
                  min={0.003}
                  max={maxWinglet}
                  step={0.0005}
                  value={Math.min(maxWinglet, winglet)}
                  onChange={(v) => set({ wingletLine: wingletLineFrom(flat, v) }, 'shape.wingletsize')}
                  format={mm}
                />
                <Slider
                  label="Winglet angle"
                  info={
                    <InfoDot label="What do winglets do?" title="Winglets">
                      Tips turned up act like small fins at the back and keep the plane pointing into the wind. Turned down they add stability
                      on wide, flat wings.
                    </InfoDot>
                  }
                  min={-90}
                  max={90}
                  step={5}
                  origin={0}
                  value={shape.wingletDeg}
                  onChange={(v) => set({ wingletDeg: v }, 'shape.wingletdeg')}
                  format={(v) => `${signedDeg(v)} ${v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}`}
                />
              </>
            )}
          </div>
        )}

        {shapeIssues.length > 0 && (
          <p className="ppl-ffield__warn" role="status">
            {issueText(shapeIssues[0]!)}
          </p>
        )}
        <Button variant="ghost" icon="replay" onClick={() => onShape(recommended, 'shape.reset')} disabled={JSON.stringify(recommended) === JSON.stringify(shape)}>
          Reset to recommended
        </Button>
      </Card>
    </div>
  );
}

interface WingLineEditorProps {
  design: PlaneDesign;
  flat: FlatState;
  offsets: WingOffsets;
  reach: number;
  onChange: (o: WingOffsets, key: string) => void;
}

/** Top view of the flat model with the wing line; its two ends drag sideways. */
function WingLineEditor({ design, flat, offsets, reach, onChange }: WingLineEditorProps): ReactElement {
  const cx = design.paper.width / 2;
  const line = wingLineFrom(flat, offsets);
  const [grab, setGrab] = useState<'nose' | 'tail' | null>(null);
  const px = useRef(1500);
  const winglet = design.shape.wingletLine;
  const top = line.a[1];
  const bottom = line.b[1];
  const fit = useMemo(() => {
    const m = 0.06 * (top - bottom);
    return { min: [cx - reach * 0.15 - m, bottom - m] as Vec2, max: [cx + reach + m, top + m] as Vec2 };
  }, [cx, reach, top, bottom]);
  const aspect = Math.max(0.35, Math.min(1.6, (fit.max[0] - fit.min[0]) / (fit.max[1] - fit.min[1])));

  const pick = (p: Vec2): 'nose' | 'tail' | null => {
    const r = 36 / px.current;
    const dn = Math.hypot(p[0] - line.a[0], p[1] - line.a[1]);
    const dt = Math.hypot(p[0] - line.b[0], p[1] - line.b[1]);
    if (Math.min(dn, dt) > r) return null;
    return dn <= dt ? 'nose' : 'tail';
  };

  return (
    <div className="ppl-wingedit" style={{ width: `min(100%, ${Math.round(260 * aspect)}px)` }}>
      <PaperCanvas
        paper={design.paper}
        state={flat}
        tilt={0}
        shadows={false}
        fitTo={fit}
        aspect={aspect}
        highlight={{ line, dir: 'mountain' }}
        label="Top view of the right half with the wing line. Drag its ends."
        className="ppl-desk"
        onTablePointerDown={(p, e) => {
          const g = pick(p);
          if (!g) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setGrab(g);
        }}
        onTablePointerMove={(p) => {
          if (!grab) return;
          onChange({ ...offsets, [grab]: p[0] - cx }, `shape.${grab}`);
        }}
        onTablePointerUp={() => setGrab(null)}
      >
        {({ pxPerMetre }) => {
          px.current = pxPerMetre;
          const r = 11 / pxPerMetre;
          return (
            <g>
              <line x1={cx} y1={bottom} x2={cx} y2={top} className="ppl-wingedit__centre" vectorEffect="non-scaling-stroke" />
              {winglet && <line x1={winglet.a[0]} y1={winglet.a[1]} x2={winglet.b[0]} y2={winglet.b[1]} className="ppl-wingedit__winglet" vectorEffect="non-scaling-stroke" />}
              {[line.a, line.b].map((q, i) => (
                <circle key={i} cx={q[0]} cy={q[1]} r={r} className={`ppl-wingedit__handle${grab === (i === 0 ? 'nose' : 'tail') ? ' is-active' : ''}`} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          );
        }}
      </PaperCanvas>
    </div>
  );
}
