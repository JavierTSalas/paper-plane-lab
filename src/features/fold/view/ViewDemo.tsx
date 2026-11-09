import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useLab } from '../../../app/store';
import { DEFAULT_PRESET_ID, PRESETS, getPreset, makeDesign, presetPaper } from '../../../core/designs';
import { makePaper } from '../../../core/paper';
import type { FoldStep, PlaneDesign, Vec2 } from '../../../core/types';
import { Card } from '../../../ui/Card';
import { formatLength } from '../../../ui/format';
import { InfoDot } from '../../../ui/InfoDot';
import { SectionHeader } from '../../../ui/SectionHeader';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { Slider } from '../../../ui/Slider';
import { CreasePattern } from './CreasePattern';
import { FoldPlayer } from './FoldPlayer';
import { PaperCanvas } from './PaperCanvas';
import { PlaneThumb, cachedPlane } from './PlaneThumb';
import { PlaneView } from './PlaneView';
import { buildTimeline } from './timeline';
import './ViewDemo.css';

/**
 * A blunt-nosed glider with a mountain keel, used when only one preset exists. It exercises what the dart
 * does not: horizontal folds, a flip and a mountain keel.
 */
function bluntGlider(): PlaneDesign {
  const paper = makePaper({ sizeId: 'letter', front: 'sky', back: 'butter', pattern: 'grid' });
  const W = paper.width;
  const H = paper.height;
  const cx = W / 2;
  const across = (y: number): { a: Vec2; b: Vec2 } => ({ a: [0, y], b: [W, y] });
  const steps: FoldStep[] = [
    { kind: 'crease', line: { a: [cx, 0], b: [cx, H] }, label: 'Crease the sheet in half lengthwise and unfold.' },
    { kind: 'fold', line: across(H * 0.82), moving: 'left', dir: 'valley', layers: 'all', label: 'Fold the top edge down a short way.' },
    { kind: 'fold', line: across(H * 0.66), moving: 'left', dir: 'valley', layers: 'all', label: 'Fold the thick edge down again.' },
    { kind: 'flip', label: 'Turn the paper over.' },
  ];
  const top = H * 0.66;
  return {
    v: 1,
    id: 'demo-blunt-glider',
    name: 'Blunt glider (demo)',
    category: 'glider',
    paper,
    steps,
    shape: {
      keel: 'mountain',
      keelSpreadDeg: 16,
      wingLine: { a: [cx + 0.016, 0], b: [cx + 0.016, top] },
      dihedralDeg: 6,
      wingletLine: { a: [W - 0.025, 0], b: [W - 0.025, top] },
      wingletDeg: 70,
    },
    trim: { elevatorDeg: 2, elevatorChordFrac: 0.15, aileronDeg: 0, rudderDeg: 0, clip: null },
  };
}

function demoDesigns(): PlaneDesign[] {
  const dart = getPreset(DEFAULT_PRESET_ID) ?? PRESETS[0]!;
  const other = PRESETS.find((p) => p.id !== dart.id);
  return [
    makeDesign(dart, presetPaper(dart, { front: 'white', back: 'coral' })),
    other ? makeDesign(other, presetPaper(other, { front: 'sky', back: 'butter', pattern: 'grid' })) : bluntGlider(),
  ];
}

function Block({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <section className="ppl-vdemo__block">
      <SectionHeader title={title} subtitle={subtitle} as="h2" />
      {children}
    </section>
  );
}

/** Every paper renderer at work, for design review and for the lead to wire as a hidden route. */
export default function ViewDemo(): ReactElement {
  const units = useLab((s) => s.settings.units);
  const designs = useMemo(demoDesigns, []);
  const [which, setWhich] = useState<'0' | '1'>('0');
  const design = designs[Number(which)]!;
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [t, setT] = useState(0.55);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [step, setStep] = useState(0);
  const { model, flat } = cachedPlane(design);
  const tl = useMemo(() => buildTimeline(design), [design]);
  const frames = tl.fold.frames;
  const fold = frames.find((f) => f.step.kind === 'fold') ?? frames[0]!;

  return (
    <div className="ppl-page ppl-vdemo">
      <SectionHeader as="h1" title="Paper views" subtitle="Everything that draws paper, folds and finished planes." />
      <SegmentedControl<'0' | '1'>
        label="Design"
        block
        value={which}
        onChange={(v) => {
          setWhich(v);
          setStep(0);
        }}
        options={designs.map((d, i) => ({ value: String(i) as '0' | '1', label: d.name }))}
      />

      <div className="ppl-vdemo__grid">
        <Block title="Fold player" subtitle="Every step, then the plane is folded in half, the wings folded down and opened.">
          <Card padding="md">
            <SegmentedControl<'auto' | 'manual'>
              label="Play mode"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'auto', label: 'Play all' },
                { value: 'manual', label: 'Step by step' },
              ]}
            />
            <FoldPlayer key={`${design.id}-${mode}`} design={design} mode={mode} step={step} onStepChange={setStep} className="ppl-vdemo__player" />
          </Card>
        </Block>

        <Block title="Finished plane" subtitle="Drag to turn it.">
          <Card padding="md">
            <PlaneView
              model={model}
              paper={design.paper}
              interactive
              backdrop
              markers={[
                { x: model.length * 0.62, kind: 'cg' },
                { x: model.length * 0.5, kind: 'np' },
              ]}
            />
            <div className="ppl-vdemo__note">
              {formatLength(model.length, units)} long, {formatLength(model.span, units)} span
              <InfoDot label="What are CG and NP?" title="Balance and neutral point">
                CG is where the plane balances. NP is the point the lift pivots about; the CG must sit ahead of it for a steady glide. The demo
                places both at fixed fractions of the length.
              </InfoDot>
            </div>
          </Card>
        </Block>

        <Block title="Paper on the desk" subtitle="A fold in progress, with the result as a ghost.">
          <Card padding="md">
            <PaperCanvas paper={design.paper} frame={fold} t={t} ghost={fold.after} highlight={fold.axis ? { line: fold.axis, dir: fold.sense === 1 ? 'valley' : 'mountain' } : null} className="ppl-desk" />
            <Slider label="Fold progress" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => `${Math.round(v * 100)} %`} />
          </Card>
        </Block>

        <Block title="Editor view" subtitle="Straight down; the pointer reports table coordinates.">
          <Card padding="md">
            <PaperCanvas
              paper={design.paper}
              state={flat}
              tilt={0}
              shadows={false}
              highlight={design.shape.wingLine ? { line: design.shape.wingLine, dir: 'mountain' } : null}
              onTablePointerMove={(p) => setCursor(p)}
              className="ppl-desk"
            >
              {({ pxPerMetre }) =>
                cursor && <circle cx={cursor[0]} cy={cursor[1]} r={9 / pxPerMetre} className="ppl-vdemo__cursor" vectorEffect="non-scaling-stroke" />
              }
            </PaperCanvas>
            <div className="ppl-vdemo__note ppl-num">
              {cursor ? `x ${formatLength(cursor[0], units)} · y ${formatLength(cursor[1], units)}` : 'Move the pointer over the paper.'}
            </div>
          </Card>
        </Block>

        <Block title="Thumbnails" subtitle="Top, three-quarter and side.">
          <Card padding="md">
            <div className="ppl-vdemo__thumbs">
              {designs.map((d) => (
                <div key={d.id} className="ppl-vdemo__thumbrow">
                  <PlaneThumb design={d} view="top" size={72} />
                  <PlaneThumb design={d} view="three-quarter" size={100} />
                  <PlaneThumb design={d} view="side" size={100} />
                </div>
              ))}
            </div>
          </Card>
        </Block>

        <Block title="Crease pattern" subtitle="Seen from the front of the sheet.">
          <Card padding="md">
            <CreasePattern design={design} size={320} />
          </Card>
        </Block>
      </div>
    </div>
  );
}
