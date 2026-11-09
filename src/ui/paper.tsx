import { useId, type KeyboardEvent, type ReactElement } from 'react';
import { PAPER_COLORS, PAPER_PATTERNS, PAPER_SIZES, getPaperColor, getPaperSize, makePaper, type PaperPatternId } from '../core/paper';
import type { PaperSpec } from '../core/types';
import { Chip } from './Chip';
import { cx } from './cx';
import { formatPaperDims, type UnitSystem } from './format';
import { Icon } from './icons';
import { SegmentedControl } from './SegmentedControl';
import './paper.css';

/* ------------------------------------------------------------------ patterns */

/** Printed-pattern ids that draw something (everything but "plain"). */
export type PrintedPattern = Exclude<PaperPatternId, 'plain'>;
type PatternInk = 'dark' | 'light';

const PRINTED: readonly PrintedPattern[] = ['grid', 'lined', 'dots', 'stripes'];

function isPrinted(id: string | undefined): id is PrintedPattern {
  return id !== undefined && (PRINTED as readonly string[]).includes(id);
}

export function patternId(prefix: string, pattern: PrintedPattern, ink: PatternInk): string {
  return `${prefix}-${pattern}-${ink}`;
}

export interface PaperPatternDefsProps {
  /** Unique per SVG document, e.g. from useId(). */
  idPrefix: string;
  /**
   * User units per metre of paper. 1 when the sheet is drawn in metres (core frames),
   * 1000 when drawn in millimetres, or px-per-metre for a screen-scaled preview.
   */
  unitsPerMetre: number;
}

/** <defs> with every printed pattern in a dark and a light ink, sized in real paper millimetres. */
export function PaperPatternDefs({ idPrefix, unitsPerMetre }: PaperPatternDefsProps): ReactElement {
  const mm = unitsPerMetre / 1000;
  const inks: readonly PatternInk[] = ['dark', 'light'];
  return (
    <defs>
      {inks.map((ink) => {
        const stroke = ink === 'dark' ? 'rgb(47 46 43 / 0.2)' : 'rgb(253 252 248 / 0.3)';
        const strong = ink === 'dark' ? 'rgb(47 46 43 / 0.13)' : 'rgb(253 252 248 / 0.18)';
        const w = 0.3 * mm;
        return (
          <g key={ink}>
            <pattern id={patternId(idPrefix, 'grid', ink)} patternUnits="userSpaceOnUse" width={5 * mm} height={5 * mm}>
              <path d={`M${5 * mm} 0H0V${5 * mm}`} fill="none" stroke={stroke} strokeWidth={w} />
            </pattern>
            <pattern id={patternId(idPrefix, 'lined', ink)} patternUnits="userSpaceOnUse" width={8 * mm} height={8 * mm}>
              <path d={`M0 ${7.5 * mm}H${8 * mm}`} fill="none" stroke={stroke} strokeWidth={w} />
            </pattern>
            <pattern id={patternId(idPrefix, 'dots', ink)} patternUnits="userSpaceOnUse" width={5 * mm} height={5 * mm}>
              <circle cx={2.5 * mm} cy={2.5 * mm} r={0.45 * mm} fill={stroke} />
            </pattern>
            <pattern id={patternId(idPrefix, 'stripes', ink)} patternUnits="userSpaceOnUse" width={12 * mm} height={12 * mm} patternTransform="rotate(45)">
              <rect width={5 * mm} height={12 * mm} fill={strong} />
            </pattern>
          </g>
        );
      })}
    </defs>
  );
}

export interface PaperFaceFill {
  /** Solid colour of the face. */
  base: string;
  /** `url(#…)` of the printed pattern to layer on top, or null. Only the front face is printed. */
  overlay: string | null;
}

/** Fill for one face of a sheet. Draw `base` first, then a second shape with `overlay` if present. */
export function paperFaceFill(paper: PaperSpec, face: 'front' | 'back', idPrefix: string): PaperFaceFill {
  const base = face === 'front' ? paper.front : paper.back;
  if (face === 'back' || !isPrinted(paper.pattern)) return { base, overlay: null };
  const ink: PatternInk = getPaperColor(base).ink === '#2f2e2b' ? 'dark' : 'light';
  return { base, overlay: `url(#${patternId(idPrefix, paper.pattern, ink)})` };
}

/* ------------------------------------------------------------------ swatch */

export interface PaperSwatchProps {
  /** Colour id from PAPER_COLORS or a CSS colour. */
  color: string;
  selected?: boolean;
  onSelect?: () => void;
  size?: 'sm' | 'md';
  /** In the tab order (roving tabindex). Default: when selected. */
  focusable?: boolean;
  className?: string;
}

/** Round colour chip. With onSelect it is a radio in a radiogroup; without, a static, labelled swatch. */
export function PaperSwatch({ color, selected = false, onSelect, size = 'md', focusable = selected, className }: PaperSwatchProps): ReactElement {
  const c = getPaperColor(color);
  const classes = cx('ppl-swatch', `ppl-swatch--${size}`, selected && 'is-selected', className);
  const dot = (
    <span className="ppl-swatch__dot" style={{ background: c.hex, color: c.ink }}>
      {selected && <Icon name="check" size={size === 'sm' ? 14 : 18} strokeWidth={2.6} />}
    </span>
  );
  if (!onSelect) {
    return (
      <span className={classes} role="img" aria-label={c.name}>
        {dot}
      </span>
    );
  }
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={c.name} title={c.name} className={classes} onClick={onSelect} tabIndex={focusable ? 0 : -1}>
      {dot}
    </button>
  );
}

interface SwatchRowProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

function SwatchRow({ label, value, onChange }: SwatchRowProps): ReactElement {
  const selectedIndex = Math.max(
    0,
    PAPER_COLORS.findIndex((c) => c.hex === value),
  );
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = PAPER_COLORS[(selectedIndex + delta + PAPER_COLORS.length) % PAPER_COLORS.length]!;
    onChange(next.hex);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
    buttons[(selectedIndex + delta + buttons.length) % buttons.length]?.focus();
  };
  const name = getPaperColor(value).name;
  return (
    <div className="ppl-picker__field">
      <div className="ppl-picker__label">
        {label} <span className="ppl-picker__value">{name}</span>
      </div>
      <div role="radiogroup" aria-label={`${label} colour`} className="ppl-picker__swatches" onKeyDown={onKey}>
        {PAPER_COLORS.map((c, i) => (
          <PaperSwatch key={c.id} color={c.hex} selected={c.hex === value} focusable={i === selectedIndex} onSelect={() => onChange(c.hex)} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ preview */

export interface PaperPreviewProps {
  paper: PaperSpec;
  /** Longest side of the drawing, px. */
  size?: number;
  className?: string;
}

/** The sheet with a dog-eared top-right corner that shows the back face. */
export function PaperPreview({ paper, size = 160, className }: PaperPreviewProps): ReactElement {
  const prefix = useId().replace(/:/g, '');
  const pxPerM = size / Math.max(paper.width, paper.height);
  const w = paper.width * pxPerM;
  const h = paper.height * pxPerM;
  const ear = Math.min(w, h) * 0.28;
  const pad = 10;
  // Sheet outline with the top-right corner folded down along the diagonal.
  const sheet = `M0 0H${w - ear}L${w} ${ear}V${h}H0Z`;
  const flap = `M${w - ear} 0L${w} ${ear}L${w - ear} ${ear}Z`;
  const front = paperFaceFill(paper, 'front', prefix);
  const back = paperFaceFill(paper, 'back', prefix);
  const sizeName = getPaperSize(paper.sizeId).name;
  return (
    <svg
      className={cx('ppl-paper-preview', className)}
      width={w + pad * 2}
      height={h + pad * 2}
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      role="img"
      aria-label={`${sizeName} sheet, ${paper.width > paper.height ? 'landscape' : 'portrait'}, front ${getPaperColor(paper.front).name}${paper.pattern ? ` with ${paper.pattern}` : ''}, back ${getPaperColor(paper.back).name}`}
    >
      <PaperPatternDefs idPrefix={prefix} unitsPerMetre={pxPerM} />
      <path d={sheet} transform="translate(2 4)" fill="rgb(60 50 30 / 0.12)" />
      <path d={sheet} fill={front.base} />
      {front.overlay && <path d={sheet} fill={front.overlay} />}
      <path d={sheet} fill="none" stroke="rgb(47 46 43 / 0.28)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={`M${w - ear} ${ear}L${w} ${ear}`} transform="translate(-1 2)" stroke="rgb(60 50 30 / 0.12)" strokeWidth="3" strokeLinecap="round" />
      <path d={flap} fill={back.base} stroke="rgb(47 46 43 / 0.32)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ picker */

type Orientation = 'portrait' | 'landscape';

export interface PaperPickerProps {
  value: PaperSpec;
  onChange: (paper: PaperSpec) => void;
  units: UnitSystem;
  /** Offer landscape sheets (some designs need portrait). Default true. */
  allowLandscape?: boolean;
  /** Restrict the size list, e.g. to sizes a design supports. Default: every size. */
  sizeIds?: readonly string[];
  className?: string;
}

function orientationOf(p: PaperSpec): Orientation {
  return p.width > p.height ? 'landscape' : 'portrait';
}

/** Paper size, orientation, front and back colours and print, with a live preview of the sheet. */
export function PaperPicker({ value, onChange, units, allowLandscape = true, sizeIds, className }: PaperPickerProps): ReactElement {
  const selectId = useId();
  const sizes = sizeIds ? PAPER_SIZES.filter((s) => sizeIds.includes(s.id)) : PAPER_SIZES;
  const size = getPaperSize(value.sizeId);
  const square = size.short === size.long;
  const orientation = allowLandscape ? orientationOf(value) : 'portrait';
  const pattern: PaperPatternId = isPrinted(value.pattern) ? value.pattern : 'plain';

  const update = (patch: { sizeId?: string; orientation?: Orientation; front?: string; back?: string; pattern?: PaperPatternId }): void => {
    onChange(
      makePaper({
        sizeId: patch.sizeId ?? value.sizeId,
        orientation: patch.orientation ?? orientation,
        front: patch.front ?? value.front,
        back: patch.back ?? value.back,
        pattern: patch.pattern ?? pattern,
      }),
    );
  };

  return (
    <div className={cx('ppl-picker', className)}>
      <div className="ppl-picker__preview">
        <PaperPreview paper={value} size={150} />
        <div className="ppl-picker__faces">
          <span>
            <PaperSwatch color={value.front} size="sm" /> Front
          </span>
          <span>
            <PaperSwatch color={value.back} size="sm" /> Back
          </span>
        </div>
      </div>

      <div className="ppl-picker__controls">
        <div className="ppl-picker__field">
          <label className="ppl-picker__label" htmlFor={selectId}>
            Size
          </label>
          <div className="ppl-select">
            <select id={selectId} value={value.sizeId} onChange={(e) => update({ sizeId: e.target.value })}>
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatPaperDims(s.short, s.long, units)}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={20} className="ppl-select__chevron" />
          </div>
        </div>

        {allowLandscape && !square && (
          <SegmentedControl<Orientation>
            label="Orientation"
            block
            value={orientation}
            onChange={(o) => update({ orientation: o })}
            options={[
              { value: 'portrait', label: 'Portrait' },
              { value: 'landscape', label: 'Landscape' },
            ]}
          />
        )}

        <SwatchRow label="Front" value={value.front} onChange={(hex) => update({ front: hex })} />
        <SwatchRow label="Back" value={value.back} onChange={(hex) => update({ back: hex })} />

        <div className="ppl-picker__field">
          <div className="ppl-picker__label" id={`${selectId}-pat`}>
            Print on the front
          </div>
          <div className="ppl-row" role="group" aria-labelledby={`${selectId}-pat`}>
            {PAPER_PATTERNS.map((p) => (
              <Chip key={p.id} size="sm" selected={p.id === pattern} onClick={() => update({ pattern: p.id })}>
                {p.name}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
