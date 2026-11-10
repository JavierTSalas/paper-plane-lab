import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { useLocation, useParams } from 'wouter';
import { getPaperSize } from '../../core/paper';
import type { PaperSpec, PlaneDesign } from '../../core/types';
import { usePlaneBuild, useTrimAnalysis } from '../../app/hooks';
import { useLab } from '../../app/store';
import { Button, IconButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Tag } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import {
  areaParts,
  DASH,
  fixed,
  formatLength,
  formatPercent,
  formatSpeed,
  formatTime,
  lengthParts,
  massParts,
  speedParts,
  timeParts,
  wingLoadingParts,
} from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { SectionHeader } from '../../ui/SectionHeader';
import { Sheet } from '../../ui/Sheet';
import { Stat, StatGrid } from '../../ui/Stat';
import { toast } from '../../ui/Toast';
import { CreasePattern, FoldPlayer, PlaneThumb, PlaneView } from '../fold/view';
import { CATEGORY_LABEL, CATEGORY_TONE, copyName, DIAGNOSIS_LABEL, diagnosisTone, envName, MATCH_WORD, newPlaneId, presetDesign, presetLookAlikes, presetOf } from './catalog';
import { RecolourSheet } from './RecolourSheet';
import './hangar.css';

const RECENT_FLIGHTS = 6;

function RenameTitle({ plane }: { plane: PlaneDesign }): ReactElement {
  const rename = useLab((s) => s.renamePlane);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(plane.name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const submit = (e?: FormEvent): void => {
    e?.preventDefault();
    if (text.trim()) rename(plane.id, text);
    setEditing(false);
  };

  if (editing) {
    return (
      <form className="ppl-rename" onSubmit={submit}>
        <label className="ppl-sr-only" htmlFor="ppl-rename-input">
          Plane name
        </label>
        <input
          id="ppl-rename-input"
          ref={input}
          className="ppl-rename__input"
          value={text}
          maxLength={40}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => submit()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setText(plane.name);
              setEditing(false);
            }
          }}
        />
        <IconButton icon="check" label="Save name" type="submit" variant="secondary" />
      </form>
    );
  }
  return (
    <div className="ppl-rename">
      <h1 className="ppl-h1 ppl-rename__title">{plane.name}</h1>
      <IconButton
        icon="edit"
        label="Rename"
        onClick={() => {
          setText(plane.name);
          setEditing(true);
        }}
      />
    </div>
  );
}

function LooksLike({ plane }: { plane: PlaneDesign }): ReactElement {
  const matches = useMemo(() => presetLookAlikes(plane, 3), [plane]);
  const top = matches[0];
  const same = top && (top.label === 'identical' || top.label === 'near-identical');
  return (
    <Card as="section" className="ppl-stack" aria-labelledby="ppl-looks">
      <SectionHeader
        as="h2"
        id="ppl-looks"
        title={
          <>
            Looks like{' '}
            <InfoDot label="How is this measured?" title="Looks like">
              The lab lays the folded plane flat from above and compares its outline and proportions with every plane in the library. 100 % means the same fold.
            </InfoDot>
          </>
        }
        subtitle={
          same
            ? `This is a ${top.name}${top.label === 'near-identical' ? ', with a small change of your own' : ''}.`
            : top && top.label !== 'different'
              ? `Closest to the ${top.name}.`
              : 'Nothing in the library folds quite like this.'
        }
      />
      <ul role="list" className="ppl-looks">
        {matches.map((m) => {
          const d = presetDesign(m.id);
          return (
            <li key={m.id} className="ppl-looks__item">
              <span className="ppl-looks__pair" aria-hidden="true">
                <PlaneThumb design={plane} view="top" size={64} />
                {d && <PlaneThumb design={d} view="top" size={64} />}
              </span>
              <span className="ppl-looks__text">
                <span className="ppl-looks__name">{m.name}</span>
                <span className="ppl-caption">{MATCH_WORD[m.label]}</span>
              </span>
              <span className="ppl-looks__score ppl-num">{formatPercent(m.score)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function FlightHistory({ planeId }: { planeId: string }): ReactElement {
  const all = useLab((s) => s.flights);
  const units = useLab((s) => s.settings.units);
  const selectPlane = useLab((s) => s.selectPlane);
  const [, navigate] = useLocation();
  const flights = useMemo(() => all.filter((f) => f.planeId === planeId), [all, planeId]);
  if (flights.length === 0) {
    return (
      <Card as="section" tone="sunken" aria-label="Flights">
        <EmptyState compact icon="fly" title="Not flown yet" body="Take it to the flight lab. Every throw is logged here with the Professor's diagnosis." actions={<Button variant="primary" icon="fly" onClick={() => { selectPlane(planeId); navigate('/fly'); }}>Fly it</Button>} />
      </Card>
    );
  }
  const bestD = flights.reduce((a, b) => (b.metrics.distance > a.metrics.distance ? b : a));
  const bestT = flights.reduce((a, b) => (b.metrics.airtime > a.metrics.airtime ? b : a));
  const d = lengthParts(bestD.metrics.distance, units, { digits: 1 });
  const t = timeParts(bestT.metrics.airtime);
  return (
    <Card as="section" className="ppl-stack" aria-labelledby="ppl-flights">
      <SectionHeader as="h2" id="ppl-flights" title="Flights" subtitle={`${flights.length} logged`} />
      <StatGrid minWidth={130}>
        <Stat label="Best distance" icon="distance" value={d.value} unit={d.unit} hint={envName(bestD.envId)} />
        <Stat label="Best airtime" icon="timer" value={t.value} unit={t.unit} hint={envName(bestT.envId)} />
      </StatGrid>
      <ul role="list" className="ppl-flog">
        {flights.slice(0, RECENT_FLIGHTS).map((f) => {
          const code = f.diagnosisCodes[0];
          return (
            <li key={f.id} className="ppl-flog__row">
              <span className="ppl-flog__env">
                <span className="ppl-small">{envName(f.envId)}</span>
                <span className="ppl-caption">
                  {new Date(f.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {f.conditions.windSpeed ? ` · wind ${formatSpeed(f.conditions.windSpeed, units)}` : ''}
                </span>
              </span>
              <span className="ppl-flog__num ppl-flog__dist ppl-num">{formatLength(f.metrics.distance, units, { digits: 1 })}</span>
              <span className="ppl-flog__num ppl-flog__time ppl-num">{formatTime(f.metrics.airtime)}</span>
              <span className="ppl-flog__tag">{code ? <Tag tone={diagnosisTone(code)}>{DIAGNOSIS_LABEL[code]}</Tag> : null}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** One of the player's planes: 3D view, numbers, look-alikes, creases, flights and actions. */
export default function PlaneDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? '');
  const plane = useLab((s) => s.planes[id] ?? null);
  const planes = useLab((s) => s.planes);
  const units = useLab((s) => s.settings.units);
  const selectPlane = useLab((s) => s.selectPlane);
  const savePlane = useLab((s) => s.savePlane);
  const deletePlane = useLab((s) => s.deletePlane);
  const updatePaper = useLab((s) => s.updatePaper);
  const markAssignment = useLab((s) => s.markAssignment);
  const [, navigate] = useLocation();
  const build = usePlaneBuild(plane);
  const trim = useTrimAnalysis(build);
  const [foldOpen, setFoldOpen] = useState(false);
  const [recolour, setRecolour] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!plane || !build) {
    return (
      <div className="ppl-page">
        <EmptyState
          icon="hangar"
          title="This plane is not in your hangar"
          body="It may have been deleted, or the link came from another device."
          actions={
            <Button variant="primary" onClick={() => navigate('/hangar')}>
              Back to the hangar
            </Button>
          }
        />
      </div>
    );
  }

  const { airframe, model } = build;
  const ref = airframe.ref;
  const preset = presetOf(plane);
  const errors = build.issues.filter((i) => i.severity === 'error');
  const mass = massParts(airframe.mass, units);
  const span = lengthParts(ref.span, units);
  const length = lengthParts(ref.length, units);
  const area = areaParts(ref.area, units);
  const load = wingLoadingParts(ref.wingLoading, units);
  const glideSpeed = trim?.speed != null ? speedParts(trim.speed, units) : null;
  const markers = trim ? [{ x: airframe.cg[0], kind: 'cg' as const }, { x: trim.neutralPointX, kind: 'np' as const }] : [{ x: airframe.cg[0], kind: 'cg' as const }];

  const go = (path: string): void => {
    selectPlane(plane.id);
    navigate(path);
  };

  const duplicate = (): void => {
    const copy: PlaneDesign = { ...plane, id: newPlaneId(), name: copyName(plane.name, Object.values(planes).map((p) => p.name)) };
    savePlane(copy);
    toast({ title: 'Plane duplicated', body: `${copy.name} is in your hangar.`, tone: 'success', icon: 'copy' });
    navigate(`/plane/${encodeURIComponent(copy.id)}`);
  };

  return (
    <div className="ppl-page ppl-detail">
      <div className="ppl-detail__top">
        <div className="ppl-detail__hero">
          <div className="ppl-detail__view">
            <PlaneView model={model} paper={plane.paper} interactive backdrop markers={markers} label={`${plane.name}, drag to turn it`} />
          </div>
          <p className="ppl-caption ppl-detail__hint">Drag to turn it. CG is the centre of gravity, NP the neutral point.</p>
        </div>

        <div className="ppl-detail__side">
          <RenameTitle plane={plane} />
          <div className="ppl-row">
            <Tag tone={CATEGORY_TONE[plane.category]}>{CATEGORY_LABEL[plane.category]}</Tag>
            {preset && <span className="ppl-caption">Folded from the {preset.name}</span>}
            <span className="ppl-caption">{getPaperSize(plane.paper.sizeId).name} sheet</span>
          </div>
          {errors.length > 0 && (
            <Tag tone="bad" icon="warning">
              {errors[0]!.message}
            </Tag>
          )}

          <div className="ppl-detail__actions">
            <Button variant="primary" icon="fly" className="ppl-detail__fly" onClick={() => go('/fly')}>
              Fly
            </Button>
            <Button
              variant="secondary"
              icon="tunnel"
              onClick={() => {
                markAssignment('try-tunnel');
                go('/tunnel');
              }}
            >
              Tunnel
            </Button>
            <Button variant="secondary" icon="fold" onClick={() => go(`/fold?plane=${encodeURIComponent(plane.id)}`)}>
              Refold
            </Button>
          </div>
          <div className="ppl-detail__actions ppl-detail__actions--minor">
            <Button variant="ghost" size="sm" icon="copy" onClick={duplicate}>
              Duplicate
            </Button>
            <Button variant="ghost" size="sm" icon="sparkle" onClick={() => setRecolour(true)}>
              Recolour
            </Button>
            <Button variant="ghost" size="sm" icon="trash" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>

          <StatGrid minWidth={128} className="ppl-detail__stats">
            <Stat label="Mass" icon="scale" value={mass.value} unit={mass.unit} info={<InfoDot label="About the mass" title="Mass">The whole sheet: folding moves paper around but never adds or removes any.</InfoDot>} />
            <Stat label="Wingspan" icon="ruler" value={span.value} unit={span.unit} />
            <Stat label="Length" icon="ruler" value={length.value} unit={length.unit} />
            <Stat label="Wing area" value={area.value} unit={area.unit} info={<InfoDot label="About wing area" title="Wing area" topic="lift-and-drag">The area of the wings seen from above. More area carries the same weight at a lower speed.</InfoDot>} />
            <Stat label="Aspect ratio" value={fixed(ref.aspectRatio, 1)} info={<InfoDot label="About aspect ratio" title="Aspect ratio" topic="lift-and-drag">Span squared divided by wing area. Long, slender wings (high numbers) waste less energy on wingtip vortices and glide flatter.</InfoDot>} />
            <Stat label="Wing loading" value={load.value} unit={load.unit} info={<InfoDot label="About wing loading" title="Wing loading" topic="lift-and-drag">Weight per wing area. Lower means a slower, floatier flight; higher means fast and dart-like.</InfoDot>} />
            <Stat label="Layers at the nose" value={String(airframe.maxLayers)} info={<InfoDot label="About layers" title="Paper layers">The most sheets stacked in one place, usually the nose. Stacked paper puts weight up front, which keeps the plane pointing where it flies.</InfoDot>} />
            <Stat label="Centre of gravity" value={formatPercent(airframe.cgFromNose)} hint="of length, from the nose" info={<InfoDot label="About the centre of gravity" title="Centre of gravity" topic="stability-and-trim~static-margin">The balance point. Paper planes fly best when it sits ahead of the middle of the wing.</InfoDot>} />
            <Stat
              label="Static margin"
              value={trim ? `${fixed(trim.staticMarginPct, 0)}` : DASH}
              unit={trim ? '%' : undefined}
              hint={trim ? (trim.pitchStable ? 'stable' : 'unstable in pitch') : undefined}
              info={<InfoDot label="About the static margin" title="Static margin" topic="stability-and-trim~static-margin">How far the centre of gravity sits ahead of the neutral point, as a share of the wing chord. Positive means the plane noses back to its glide after a bump; about 5 to 20 % feels right.</InfoDot>}
            />
            <Stat
              label="Glide ratio"
              value={trim?.glideRatio != null ? fixed(trim.glideRatio, 1) : DASH}
              unit={trim?.glideRatio != null ? ': 1' : undefined}
              hint="predicted"
              info={<InfoDot label="About the glide ratio" title="Predicted glide ratio" topic="lift-and-drag">Metres forward for every metre of height lost, in still air, once the plane settles into its trimmed glide. Worked out in the virtual wind tunnel.</InfoDot>}
            />
            <Stat
              label="Glide speed"
              value={glideSpeed ? glideSpeed.value : DASH}
              unit={glideSpeed?.unit}
              hint={trim?.trimmable ? 'predicted' : 'no steady glide'}
              info={<InfoDot label="About the glide speed" title="Predicted glide speed" topic="stability-and-trim~trimming">The speed at which lift balances weight with this trim. Throw near this speed for the smoothest flight.</InfoDot>}
            />
          </StatGrid>
        </div>
      </div>

      <div className="ppl-detail__grid">
        <LooksLike plane={plane} />

        <Card as="section" className="ppl-stack ppl-detail__crease-card" aria-labelledby="ppl-creases">
          <SectionHeader
            as="h2"
            id="ppl-creases"
            title="Crease pattern"
            subtitle="The sheet unfolded: every fold you made."
          />
          <div className="ppl-detail__creases">
            <CreasePattern design={plane} />
          </div>
          <Button variant="secondary" icon="play" block onClick={() => setFoldOpen(true)}>
            Watch the folding
          </Button>
        </Card>

        <FlightHistory planeId={plane.id} />
      </div>

      <Sheet open={foldOpen} onClose={() => setFoldOpen(false)} size="lg" title={`Folding the ${plane.name}`}>
        {foldOpen && <FoldPlayer design={plane} />}
      </Sheet>

      <RecolourSheet
        open={recolour}
        paper={plane.paper}
        onClose={() => setRecolour(false)}
        onSave={(paper: PaperSpec) => {
          updatePaper(plane.id, paper);
          setRecolour(false);
        }}
      />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title={`Delete ${plane.name}?`}
        description="The plane leaves your hangar. Its flights stay in the log under its name."
        footer={
          <div className="ppl-detail__confirm">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                deletePlane(plane.id);
                toast({ title: 'Plane deleted', tone: 'info' });
                navigate('/hangar');
              }}
            >
              Delete
            </Button>
          </div>
        }
      >
        <div className="ppl-detail__confirm-art">
          <PlaneThumb design={plane} size={140} />
        </div>
      </Sheet>
    </div>
  );
}
