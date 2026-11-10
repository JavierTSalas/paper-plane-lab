import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { makePaper } from '../core/paper';
import type { PaperSpec } from '../core/types';
import { useLab } from '../app/store';
import { Button, IconButton } from './Button';
import { Card } from './Card';
import { BarMeter } from './charts/BarMeter';
import { LineChart, type ChartPoint, type LineSeries } from './charts/LineChart';
import { Sparkline } from './charts/Sparkline';
import { Chip, Tag } from './Chip';
import { EmptyState } from './EmptyState';
import { formatSpeed, lengthParts, timeParts, wingLoadingParts } from './format';
import { ICON_NAMES, Icon } from './icons';
import { InfoDot } from './InfoDot';
import { Menu } from './Menu';
import { PaperPicker } from './paper';
import { PROFESSOR_POSES, Professor, ProfessorSays } from './Professor';
import { SectionHeader } from './SectionHeader';
import { SegmentedControl } from './SegmentedControl';
import { Sheet } from './Sheet';
import { Slider } from './Slider';
import { Spinner } from './Spinner';
import { Stat, StatGrid } from './Stat';
import { Stepper } from './Stepper';
import { Tabs } from './Tabs';
import { toast } from './Toast';
import { Toggle } from './Toggle';
import './KitPage.css';

/* Deterministic sample flight: a launch climb, a glide and a gentle phugoid. */
function sampleFlight(): { height: ChartPoint[]; speed: ChartPoint[] } {
  const height: ChartPoint[] = [];
  const speed: ChartPoint[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i * 0.05;
    const h = 1.6 + 1.1 * Math.sin(Math.min(t, 1.2) * 1.3) - 0.38 * Math.max(0, t - 1.2) + 0.08 * Math.sin(t * 5);
    height.push([t, Math.max(0, h)]);
    speed.push([t, 3.8 + 5 * Math.exp(-t * 1.8) + 0.25 * Math.cos(t * 5)]);
  }
  return { height, speed };
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }): ReactElement {
  return (
    <section className="ppl-kit__section">
      <SectionHeader title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}

/** Hidden route `/_kit`: every component in every state, for design review. */
export default function KitPage(): ReactElement {
  const units = useLab((s) => s.settings.units);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'valley' | 'mountain'>('valley');
  const [speed, setSpeed] = useState(7.5);
  const [elevator, setElevator] = useState(2);
  const [mirror, setMirror] = useState(true);
  const [trails, setTrails] = useState(false);
  const [step, setStep] = useState(2);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paper, setPaper] = useState<PaperSpec>(() => makePaper({ front: 'sky', back: 'cream', pattern: 'grid' }));
  const [chip, setChip] = useState('dart');
  const [cursor, setCursor] = useState<number | null>(null);

  const flight = useMemo(sampleFlight, []);
  const series: LineSeries[] = useMemo(
    () => [
      { id: 'h', label: 'Height', points: flight.height },
      { id: 'v', label: 'Airspeed', points: flight.speed, dashed: true },
    ],
    [flight],
  );
  const dist = lengthParts(9.24, units, { digits: 1 });
  const air = timeParts(2.8);
  const load = wingLoadingParts(2.1, units);
  const apex = flight.height.reduce((a, b) => (b[1] > a[1] ? b : a));

  return (
    <div className="ppl-page ppl-kit">
      <header className="ppl-kit__intro">
        <p className="ppl-eyebrow">Design system</p>
        <h2 className="ppl-h1">Paper Plane Lab kit</h2>
        <p className="ppl-body ppl-muted">Every component, icon and Professor pose, for review at 390 px and 1280 px.</p>
      </header>

      <Section title="Professor Wren" subtitle="Seven poses, with a gentle idle blink and bob.">
        <div className="ppl-kit__poses">
          {PROFESSOR_POSES.map((p) => (
            <figure key={p} className="ppl-kit__pose">
              <Professor pose={p} size={120} title={`Professor Wren, ${p}`} />
              <figcaption className="ppl-caption">{p}</figcaption>
            </figure>
          ))}
        </div>
        <ProfessorSays
          pose="point"
          title="A heavier nose flies straighter"
          actions={
            <>
              <Button variant="primary" size="sm" iconRight="next">
                Show me
              </Button>
              <Button variant="ghost" size="sm">
                Later
              </Button>
            </>
          }
        >
          Move the centre of gravity forward and the plane weathervanes into the wind. Too far, and it dives.
        </ProfessorSays>
      </Section>

      <Section title="Buttons">
        <div className="ppl-row">
          <Button variant="primary" icon="fly">
            Throw
          </Button>
          <Button variant="secondary" icon="fold">
            Refold
          </Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger" icon="trash">
            Delete
          </Button>
        </div>
        <div className="ppl-row">
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="lg" iconRight="next">
            Large
          </Button>
          <Button
            variant="primary"
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1500);
            }}
          >
            Simulate
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
        <div className="ppl-row">
          <IconButton icon="undo" label="Undo" />
          <IconButton icon="redo" label="Redo" />
          <IconButton icon="mirror" label="Mirror" pressed={mirror} onClick={() => setMirror(!mirror)} />
          <IconButton icon="layers" label="Layers" variant="secondary" />
          <IconButton icon="notebook" label="Notebook" variant="secondary" badge={3} />
          <Menu
            label="Plane actions"
            items={[
              { id: 'dup', label: 'Duplicate', icon: 'copy' },
              { id: 'rename', label: 'Rename', icon: 'edit', hint: 'Give it a call sign' },
              'separator',
              { id: 'del', label: 'Delete', icon: 'trash', danger: true },
            ]}
          />
          <Spinner />
        </div>
      </Section>

      <Section title="Chips and tags">
        <div className="ppl-row" role="group" aria-label="Category">
          {(['dart', 'glider', 'hybrid', 'wing'] as const).map((c, i) => (
            <Chip key={c} selected={chip === c} tone={(['accent', 'sky', 'sage', 'plum'] as const)[i]} onClick={() => setChip(c)}>
              {c[0]!.toUpperCase() + c.slice(1)}
            </Chip>
          ))}
          <Chip icon="plus">New</Chip>
        </div>
        <div className="ppl-row">
          <Tag tone="accent">Dart</Tag>
          <Tag tone="sky">Glider</Tag>
          <Tag tone="good" icon="check">
            Stable
          </Tag>
          <Tag tone="warn" icon="warning">
            Nose heavy
          </Tag>
          <Tag tone="bad" icon="warning">
            Tumbles
          </Tag>
        </div>
      </Section>

      <Section title="Controls">
        <Card className="ppl-stack">
          <SegmentedControl
            label="Fold direction"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'valley', label: 'Valley', icon: 'valley' },
              { value: 'mountain', label: 'Mountain', icon: 'mountain' },
            ]}
          />
          <Slider label="Throw speed" min={2} max={14} step={0.1} value={speed} onChange={setSpeed} format={(v) => formatSpeed(v, units)} ticks={7} />
          <Slider
            label="Elevator"
            info={
              <InfoDot label="What is the elevator?" title="Elevator" topic="trim">
                Bending the trailing edges up pushes the tail down, so the nose rises.
              </InfoDot>
            }
            min={-10}
            max={10}
            step={0.5}
            origin={0}
            value={elevator}
            onChange={setElevator}
            format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`}
            ticks={[-10, -5, 0, 5, 10]}
            tickLabels
          />
          <Toggle label="Show flight trails" description="Ghosts of earlier throws." checked={trails} onChange={setTrails} />
        </Card>
        <Card>
          <Stepper
            label="Folding steps"
            count={7}
            index={step}
            onIndexChange={setStep}
            controls
            onFinish={() => toast({ title: 'All folded!', tone: 'success' })}
            stepLabels={['Centre crease', 'Corners in', 'Fold again', 'Fold in half', 'Wings', 'Winglets', 'Trim']}
          />
        </Card>
      </Section>

      <Section title="Tabs">
        <Card>
          <Tabs
            label="Plane views"
            items={[
              { id: 'stats', label: 'Stats', icon: 'scale', content: <p className="ppl-small">Mass, span and wing loading.</p> },
              { id: 'creases', label: 'Creases', icon: 'crease', content: <p className="ppl-small">The crease pattern, unfolded.</p> },
              { id: 'flights', label: 'Flights', icon: 'timer', badge: 12, content: <p className="ppl-small">Best throws.</p> },
            ]}
          />
        </Card>
      </Section>

      <Section title="Stats">
        <StatGrid>
          <Stat label="Distance" icon="distance" value={dist.value} unit={dist.unit} delta={{ value: '+1.2', direction: 'up', sentiment: 'good', label: 'vs last' }} />
          <Stat label="Airtime" icon="timer" value={air.value} unit={air.unit} />
          <Stat
            label="Wing loading"
            icon="scale"
            value={load.value}
            unit={load.unit}
            info={
              <InfoDot label="What is wing loading?" title="Wing loading" topic="lift">
                Weight per wing area. Lower means slower, floatier flight.
              </InfoDot>
            }
          />
          <Stat label="Glide ratio" icon="angle" value="5.6" hint="Best this week" delta={{ value: '−0.3', direction: 'down', sentiment: 'bad' }} />
        </StatGrid>
      </Section>

      <Section title="Charts" subtitle="Hover or use arrow keys to scrub.">
        <Card>
          <LineChart
            title="Height and airspeed"
            description="Height peaks early, then the plane settles into a steady glide while airspeed falls to about 4 metres per second."
            series={series}
            xLabel="Time (s)"
            yLabel="m and m/s"
            markers={[
              { x: apex[0], y: apex[1], label: 'Apex', seriesId: 'h' },
              { x: 2.2, label: 'Stall' },
            ]}
            cursorX={cursor}
            onCursorChange={setCursor}
          />
        </Card>
        <div className="ppl-kit__grid2">
          <Card className="ppl-stack">
            <div className="ppl-row ppl-kit__spark">
              <span className="ppl-small">Last 8 throws</span>
              <Sparkline values={[4.2, 5.1, 4.8, 6.3, 5.9, 7.2, 6.8, 8.1]} label="Distance over the last 8 throws, rising to 8.1 m" />
            </div>
            <div className="ppl-row ppl-kit__spark">
              <span className="ppl-small">Airtime</span>
              <Sparkline values={[1.2, 1.4, 1.1, 1.9, 2.2, 2.0, 2.6, 2.4]} slot={2} area label="Airtime over the last 8 throws" />
            </div>
          </Card>
          <Card className="ppl-stack">
            <BarMeter label="Static margin" value={9} min={-10} max={40} good={[5, 20]} valueText="9 %" hint="Good: 5 – 20 % of chord" />
            <BarMeter label="Wing loading" value={3.4} min={0} max={5} good={[1, 2.5]} valueText="3.4 N/m²" words={{ low: 'Very light', good: 'Floaty', high: 'Heavy' }} />
          </Card>
        </div>
      </Section>

      <Section title="Paper">
        <Card>
          <PaperPicker value={paper} onChange={setPaper} units={units} />
        </Card>
      </Section>

      <Section title="Feedback">
        <div className="ppl-row">
          <Button onClick={() => toast({ title: 'Plane saved', body: 'Find it in your hangar.', tone: 'success' })}>Success toast</Button>
          <Button onClick={() => toast({ title: 'Too windy', body: 'Gusts above 3 m/s.', tone: 'warning', action: { label: 'Calm it', onClick: () => undefined } })}>
            Warning toast
          </Button>
          <Button variant="primary" onClick={() => setSheetOpen(true)}>
            Open sheet
          </Button>
        </div>
        <Card tone="sunken">
          <EmptyState compact icon="hangar" title="No planes yet" body="Fold your first plane and it will wait for you here." actions={<Button variant="primary" icon="fold">Fold a plane</Button>} />
        </Card>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Weather"
          description="Conditions for the next throw."
          footer={
            <Button variant="primary" block onClick={() => setSheetOpen(false)}>
              Done
            </Button>
          }
        >
          <div className="ppl-stack">
            <Slider label="Wind" min={0} max={6} step={0.1} value={speed / 2} onChange={(v) => setSpeed(v * 2)} format={(v) => formatSpeed(v, units)} />
            <Toggle label="Gusts" checked={trails} onChange={setTrails} />
          </div>
        </Sheet>
      </Section>

      <Section title="Icons" subtitle={`${ICON_NAMES.length} icons on a 24 px grid.`}>
        <ul role="list" className="ppl-kit__icons">
          {ICON_NAMES.map((n) => (
            <li key={n}>
              <Icon name={n} size={28} />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
