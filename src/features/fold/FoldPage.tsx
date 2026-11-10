import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactElement } from 'react';
import { useLocation, useSearch } from 'wouter';
import { usePlaneBuild, useTrimAnalysis } from '../../app/hooks';
import { useCurrentPlane, useLab } from '../../app/store';
import { DEFAULT_PRESET_ID, DEFAULT_TRIM, getPreset, makeDesign, presetPaper } from '../../core/designs';
import { createSheet, defaultShape, foldFlat, isSymmetric } from '../../core/fold';
import { makePaper, PAPER_PATTERNS } from '../../core/paper';
import type { FoldStep, PaperSpec, PlaneDesign, ShapeSpec, TrimSpec } from '../../core/types';
import { Button, IconButton } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/icons';
import { ProfessorSays } from '../../ui/Professor';
import { Sheet } from '../../ui/Sheet';
import { ChooseStage, paperForPreset } from './ChooseStage';
import { isDesign, loadDraft, newPlaneId, nextDesignName, reduceDraft, STAGES, storeDraft, type FoldMode, type Stage } from './draft';
import { FreeformFold } from './FreeformFold';
import { GuidedFold } from './GuidedFold';
import { ShapeStage } from './ShapeStage';
import { StabilityStrip } from './Stability';
import { TrimPanel } from './TrimPanel';
import { PlaneView } from './view';
import './fold.css';

const STAGE_NAMES: Record<Stage, string> = { choose: 'Choose', fold: 'Fold', shape: 'Shape', trim: 'Trim' };

/** A flat sheet ready for freeform folding. */
export function blankDesign(paper: PaperSpec): PlaneDesign {
  return { v: 1, id: 'draft', name: '', category: 'custom', paper, steps: [], shape: defaultShape(createSheet(paper)), trim: { ...DEFAULT_TRIM } };
}

/** The shape a design should start from: the preset's while its folds are untouched, else a default for the fold. */
export function recommendedShape(design: PlaneDesign): ShapeSpec {
  const preset = design.presetId ? getPreset(design.presetId) : undefined;
  if (preset) {
    const built = preset.build(design.paper);
    if (JSON.stringify(built.steps) === JSON.stringify(design.steps)) return built.shape;
  }
  return defaultShape(foldFlat(design.paper, design.steps).final);
}

const sameSheet = (a: PaperSpec, b: PaperSpec): boolean => a.sizeId === b.sizeId && a.width === b.width && a.height === b.height;

function modeOf(design: PlaneDesign): FoldMode {
  const preset = design.presetId ? getPreset(design.presetId) : undefined;
  return preset && JSON.stringify(preset.build(design.paper).steps) === JSON.stringify(design.steps) ? 'guided' : 'freeform';
}

/** Paper from query parameters (size, front, back, pattern), on top of a base sheet. */
function paperFromQuery(q: URLSearchParams, base: PaperSpec, orientation: 'portrait' | 'landscape'): PaperSpec {
  const pattern = PAPER_PATTERNS.find((p) => p.id === (q.get('pattern') ?? base.pattern))?.id;
  return makePaper({
    sizeId: q.get('size') ?? base.sizeId,
    orientation,
    front: q.get('front') ?? base.front,
    back: q.get('back') ?? base.back,
    pattern,
  });
}

/** The Fold workbench: choose, fold, shape, trim, save. */
export default function FoldPage(): ReactElement {
  const [draft, dispatch] = useReducer(reduceDraft, null, loadDraft);
  const planes = useLab((s) => s.planes);
  const savePlane = useLab((s) => s.savePlane);
  const selectPlane = useLab((s) => s.selectPlane);
  const current = useCurrentPlane();
  const search = useSearch();
  const [, navigate] = useLocation();

  useEffect(() => storeDraft(draft), [draft]);

  // Choose-stage selection: kept apart from the draft until the player starts.
  const defaultPreset = getPreset(DEFAULT_PRESET_ID);
  const [presetId, setPresetId] = useState<string | null>(() => (draft ? (draft.design.presetId ?? null) : DEFAULT_PRESET_ID));
  const [paper, setPaper] = useState<PaperSpec>(() => draft?.design.paper ?? (defaultPreset ? presetPaper(defaultPreset) : makePaper()));

  // Links into the workbench: ?preset=<id>, ?plane=<id>, ?new=1, or a design in the history state.
  useEffect(() => {
    const q = new URLSearchParams(search);
    const state: unknown = typeof history !== 'undefined' ? history.state : null;
    const stateDraft = state && typeof state === 'object' && 'draft' in state ? (state as { draft: unknown }).draft : null;
    let handled = false;
    const presetQ = q.get('preset');
    const planeQ = q.get('plane');
    if (planeQ && planes[planeQ]) {
      const plane = planes[planeQ]!;
      dispatch({ type: 'start', design: plane, mode: modeOf(plane), stage: 'shape', editingId: plane.id, guidedDone: plane.steps.length });
      handled = true;
    } else if (presetQ && getPreset(presetQ)) {
      const preset = getPreset(presetQ)!;
      const p = paperFromQuery(q, presetPaper(preset), preset.orientation);
      setPresetId(preset.id);
      setPaper(p);
      dispatch({ type: 'start', design: makeDesign(preset, p, { id: 'draft' }), mode: 'guided', stage: 'fold' });
      handled = true;
    } else if (q.get('new')) {
      const p = paperFromQuery(q, makePaper(), q.get('orientation') === 'landscape' ? 'landscape' : 'portrait');
      setPresetId(null);
      setPaper(p);
      dispatch({ type: 'start', design: blankDesign(p), mode: 'freeform', stage: 'fold' });
      handled = true;
    } else if (isDesign(stateDraft)) {
      dispatch({ type: 'start', design: stateDraft, mode: modeOf(stateDraft), stage: 'fold', guidedDone: 0 });
      handled = true;
    }
    if (handled) navigate('/fold?', { replace: true });
    // Only links change this; planes are read at the moment the link is followed.
  }, [search]);

  const design = draft?.design ?? null;
  const build = usePlaneBuild(design);
  const analysis = useTrimAnalysis(draft && (draft.stage === 'trim' || draft.stage === 'shape') ? build : null);
  const stage: Stage = draft?.stage ?? 'choose';
  const folded = useMemo(() => {
    if (!draft || !build) return false;
    return draft.mode === 'guided' ? draft.guidedDone >= draft.design.steps.length : isSymmetric(build.fold.final);
  }, [draft, build]);
  const recommended = useMemo(() => (design ? recommendedShape(design) : null), [design]);

  const go = (s: Stage): void => {
    if (s === 'choose' || draft) dispatch({ type: 'stage', stage: s });
    if (s === 'choose' && draft) {
      setPresetId(draft.design.presetId ?? null);
      setPaper(draft.design.paper);
    }
  };
  const stageIndex = STAGES.indexOf(stage);
  const reachable = (s: Stage): boolean => {
    const i = STAGES.indexOf(s);
    if (i <= stageIndex) return true;
    if (!draft) return false;
    return i === 1 || folded;
  };

  const start = (): void => {
    const preset = presetId ? getPreset(presetId) : undefined;
    const p = paperForPreset(preset, paper);
    // Same plane and sheet: keep the work, take the new colours.
    if (draft && (draft.design.presetId ?? null) === (preset?.id ?? null) && sameSheet(draft.design.paper, p) && (preset || draft.mode === 'freeform')) {
      if (draft.design.paper !== p) dispatch({ type: 'edit', design: { ...draft.design, paper: p } });
      dispatch({ type: 'stage', stage: 'fold' });
      return;
    }
    if (preset) dispatch({ type: 'start', design: makeDesign(preset, p, { id: 'draft' }), mode: 'guided', stage: 'fold' });
    else dispatch({ type: 'start', design: blankDesign(p), mode: 'freeform', stage: 'fold' });
  };

  const resume = (): void => {
    if (!current) return;
    dispatch({ type: 'start', design: current, mode: modeOf(current), stage: 'shape', editingId: current.id, guidedDone: current.steps.length });
  };

  const edit = useCallback((d: PlaneDesign, key?: string) => dispatch({ type: 'edit', design: d, key }), []);
  const onSteps = useCallback(
    (steps: FoldStep[]) => {
      if (!draft) return;
      const final = foldFlat(draft.design.paper, steps).final;
      edit({ ...draft.design, steps, shape: defaultShape(final) });
    },
    [draft, edit],
  );
  const onDoneChange = useCallback((n: number) => dispatch({ type: 'guided', done: n }), []);

  const editCopy = (): void => {
    if (!draft) return;
    const preset = draft.design.presetId ? getPreset(draft.design.presetId) : undefined;
    dispatch({ type: 'edit', design: { ...draft.design, name: preset ? `My ${preset.name}` : draft.design.name } });
    dispatch({ type: 'mode', mode: 'freeform' });
  };

  /* ------------------------------------------------------------------ save */
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const defaultName = (): string => {
    if (!design) return '';
    if (draft?.editingId && planes[draft.editingId]) return planes[draft.editingId]!.name;
    if (design.name && design.presetId) return design.name;
    return nextDesignName(Object.values(planes).map((p) => p.name));
  };
  const openSave = (): void => {
    setName(defaultName());
    setSavedId(null);
    setSaveOpen(true);
  };
  const save = (): void => {
    if (!draft) return;
    const base = draft.design.presetId ?? 'custom';
    const id = draft.editingId ?? newPlaneId(base);
    const plane: PlaneDesign = { ...draft.design, id, name: name.trim().replace(/\s+/g, ' ').slice(0, 40) || defaultName() };
    savePlane(plane);
    selectPlane(id);
    dispatch({ type: 'saved', id });
    dispatch({ type: 'edit', design: plane });
    setSavedId(id);
  };
  const foldAnother = (): void => {
    setSaveOpen(false);
    dispatch({ type: 'clear' });
    setPresetId(DEFAULT_PRESET_ID);
  };

  const units = useLab((s) => s.settings.units);
  const showHistory = draft !== null && stage !== 'choose' && !(stage === 'fold' && draft.mode === 'freeform');

  return (
    <div className="ppl-page ppl-fold">
      <div className="ppl-fold__bar">
        <nav aria-label="Fold progress" className="ppl-progress">
          <ol>
            {STAGES.map((s, i) => {
              const can = reachable(s) && s !== stage;
              return (
                <li key={s} className={cx('ppl-progress__item', s === stage && 'is-current', i < stageIndex && 'is-done')}>
                  <button type="button" className="ppl-progress__btn" aria-current={s === stage ? 'step' : undefined} disabled={!can && s !== stage} onClick={() => can && go(s)}>
                    <span className="ppl-progress__num ppl-num" aria-hidden="true">
                      {i < stageIndex ? <Icon name="check" size={14} /> : i + 1}
                    </span>
                    <span className="ppl-progress__name">{STAGE_NAMES[s]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {draft && stage !== 'choose' && (
        <div className="ppl-fold__titlerow">
          <h1 className="ppl-fold__title">{draft.design.name || 'Your own design'}</h1>
          <div className="ppl-fold__history">
            {stage === 'fold' && draft.mode === 'guided' && (
              <Button size="sm" variant="ghost" icon="edit" onClick={editCopy}>
                Edit a copy
              </Button>
            )}
            {showHistory && (
              <>
                <IconButton icon="undo" label="Undo" size="sm" onClick={() => dispatch({ type: 'undo' })} disabled={!draft.past.length} />
                <IconButton icon="redo" label="Redo" size="sm" onClick={() => dispatch({ type: 'redo' })} disabled={!draft.future.length} />
              </>
            )}
          </div>
        </div>
      )}

      {stage === 'choose' && (
        <ChooseStage
          presetId={presetId}
          paper={paper}
          onSelect={(id) => {
            setPresetId(id);
            const preset = id ? getPreset(id) : undefined;
            setPaper(preset ? paperForPreset(preset, paper) : paper);
          }}
          onPaper={setPaper}
          onStart={start}
          startLabel={draft ? 'Back to folding' : presetId ? 'Start folding' : 'Start with a blank sheet'}
          resume={draft ? null : current}
          onResume={resume}
        />
      )}

      {draft && stage === 'fold' && draft.mode === 'guided' && (
        <div className="ppl-fold__stage">
          <GuidedFold design={draft.design} done={draft.guidedDone} onDoneChange={onDoneChange} onComplete={() => dispatch({ type: 'stage', stage: 'shape' })} finishLabel="Shape it" />
        </div>
      )}

      {draft && stage === 'fold' && draft.mode === 'freeform' && (
        <div className="ppl-fold__stage">
          <FreeformFold
            design={draft.design}
            onSteps={onSteps}
            canUndo={draft.past.length > 0}
            canRedo={draft.future.length > 0}
            onUndo={() => dispatch({ type: 'undo' })}
            onRedo={() => dispatch({ type: 'redo' })}
            onContinue={() => dispatch({ type: 'stage', stage: 'shape' })}
          />
        </div>
      )}

      {draft && stage === 'shape' && recommended && (
        <div className="ppl-fold__stage">
          <ShapeStage design={draft.design} recommended={recommended} onShape={(shape, key) => edit({ ...draft.design, shape }, key)} />
          <div className="ppl-fold__next">
            <Button variant="primary" size="lg" icon="next" onClick={() => dispatch({ type: 'stage', stage: 'trim' })}>
              Trim it
            </Button>
          </div>
        </div>
      )}

      {draft && build && stage === 'trim' && (
        <div className="ppl-fold__stage ppl-trimstage">
          <div className="ppl-trimstage__view">
            <PlaneView
              model={build.model}
              paper={draft.design.paper}
              interactive
              backdrop
              aspect={1.5}
              markers={analysis ? [{ x: build.airframe.cg[0], kind: 'cg' }, { x: analysis.neutralPointX, kind: 'np' }] : undefined}
            />
            <StabilityStrip analysis={analysis} units={units} />
          </div>
          <Card padding="md" className="ppl-trimstage__controls">
            <TrimPanel design={draft.design} onChange={(trim: TrimSpec, key) => edit({ ...draft.design, trim }, key)} />
            <Button variant="primary" size="lg" block icon="check" onClick={openSave}>
              {draft.editingId ? 'Save changes' : 'Save to the hangar'}
            </Button>
          </Card>
        </div>
      )}

      <Sheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={savedId ? 'Saved to your hangar' : 'Name your plane'}
        size="sm"
        initialFocus={savedId ? undefined : nameRef}
        footer={
          savedId ? (
            <div className="ppl-save__actions">
              <Button variant="primary" icon="fly" onClick={() => navigate('/fly')}>
                Fly it
              </Button>
              <Button icon="tunnel" onClick={() => navigate('/tunnel')}>
                Wind tunnel
              </Button>
              <Button variant="ghost" icon="plus" onClick={foldAnother}>
                Fold another
              </Button>
            </div>
          ) : (
            <div className="ppl-save__actions">
              <Button variant="ghost" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" icon="check" onClick={save}>
                Save
              </Button>
            </div>
          )
        }
      >
        {savedId ? (
          <ProfessorSays pose="cheer" size={72}>
            {planes[savedId]?.name ?? 'Your plane'} is in the hangar and ready to fly. Take it outside, or put it in the wind tunnel first.
          </ProfessorSays>
        ) : (
          <form
            className="ppl-save"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {design && <PlaneView model={build!.model} paper={design.paper} size={220} aspect={16 / 9} groundShadow={false} />}
            <label className="ppl-save__label" htmlFor="ppl-plane-name">
              Name
            </label>
            <input
              ref={nameRef}
              id="ppl-plane-name"
              className="ppl-save__input"
              value={name}
              maxLength={40}
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setName(e.target.value)}
            />
          </form>
        )}
      </Sheet>
    </div>
  );
}
