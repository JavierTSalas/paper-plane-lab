import { useId, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';
import { useReducedMotion } from './motion';
import './Professor.css';

/*
 * Professor Wren: an original character. Round head, side tufts of white hair swept back like a wren's wings,
 * a single top curl, a fluffy upturned moustache, small round spectacles, tweed jacket, terracotta polka-dot
 * bow tie, and a spare paper dart in his breast pocket.
 *
 * Arms are two-bone chains solved with a tiny IK from a hand target per pose, then drawn as rotations so a
 * pose change animates smoothly through CSS transitions.
 */

export type ProfessorPose = 'idle' | 'talk' | 'point' | 'think' | 'cheer' | 'throw' | 'fold';

export const PROFESSOR_POSES: readonly ProfessorPose[] = ['idle', 'talk', 'point', 'think', 'cheer', 'throw', 'fold'];

export interface ProfessorProps {
  pose?: ProfessorPose;
  /** Rendered width in px; height follows (5:6). Default 160. */
  size?: number;
  /** Blink and a slow breathing bob (off under reduced motion). Default true. */
  animate?: boolean;
  /** Accessible name. Pass null when the surrounding text already introduces him. */
  title?: string | null;
  className?: string;
}

type Vec = readonly [number, number];
type HandShape = 'open' | 'point' | 'fist' | 'plane';
type Mouth = 'smile' | 'talk' | 'grin' | 'o' | 'hmm';
type Brows = 'calm' | 'up' | 'quizzical' | 'focus';

interface ArmSpec {
  hand: Vec;
  /** +1 or -1: which side of the shoulder-hand line the elbow goes. */
  bend: 1 | -1;
  shape: HandShape;
}

interface PoseSpec {
  left: ArmSpec;
  right: ArmSpec;
  mouth: Mouth;
  brows: Brows;
  /** Pupil offset, px. */
  look: Vec;
  happyEyes?: boolean;
  paper?: boolean;
  tilt?: number;
}

const SHOULDER_L: Vec = [62, 154];
const SHOULDER_R: Vec = [138, 154];
const UPPER = 38;
const FORE = 34;

const POSES: Record<ProfessorPose, PoseSpec> = {
  idle: {
    left: { hand: [90, 212], bend: 1, shape: 'open' },
    right: { hand: [110, 212], bend: -1, shape: 'open' },
    mouth: 'smile',
    brows: 'calm',
    look: [0, 0],
  },
  talk: {
    left: { hand: [88, 214], bend: 1, shape: 'open' },
    right: { hand: [170, 160], bend: 1, shape: 'open' },
    mouth: 'talk',
    brows: 'up',
    look: [1, 0],
  },
  point: {
    left: { hand: [88, 214], bend: 1, shape: 'open' },
    right: { hand: [184, 116], bend: 1, shape: 'point' },
    mouth: 'smile',
    brows: 'up',
    look: [2.5, -1],
    tilt: 3,
  },
  think: {
    left: { hand: [96, 132], bend: 1, shape: 'fist' },
    right: { hand: [90, 196], bend: -1, shape: 'open' },
    mouth: 'hmm',
    brows: 'quizzical',
    look: [2, -2.5],
    tilt: -4,
  },
  cheer: {
    left: { hand: [30, 82], bend: -1, shape: 'open' },
    right: { hand: [170, 82], bend: 1, shape: 'open' },
    mouth: 'grin',
    brows: 'up',
    look: [0, 0],
    happyEyes: true,
  },
  throw: {
    left: { hand: [26, 170], bend: -1, shape: 'open' },
    right: { hand: [172, 96], bend: 1, shape: 'plane' },
    mouth: 'o',
    brows: 'focus',
    look: [-2.5, 0],
    tilt: -3,
  },
  fold: {
    left: { hand: [80, 190], bend: 1, shape: 'fist' },
    right: { hand: [120, 190], bend: -1, shape: 'fist' },
    mouth: 'smile',
    brows: 'focus',
    look: [0, 2.6],
    paper: true,
  },
};

const DEG = 180 / Math.PI;
/** Direction convention: angle 0 points down (+y); positive turns toward -x (SVG clockwise). */
const angleOf = (dx: number, dy: number): number => Math.atan2(-dx, dy);

/** Two-bone IK: shoulder and elbow rotations (degrees) that put the hand at `target`. */
export function solveArm(shoulder: Vec, target: Vec, bend: 1 | -1): { shoulder: number; elbow: number } {
  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  const d = Math.min(UPPER + FORE - 0.5, Math.max(Math.abs(UPPER - FORE) + 1, Math.hypot(dx, dy)));
  const base = angleOf(dx, dy);
  const phi = Math.acos((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d));
  const a1 = base + bend * phi;
  const ex = shoulder[0] - Math.sin(a1) * UPPER;
  const ey = shoulder[1] + Math.cos(a1) * UPPER;
  let a2 = angleOf(target[0] - ex, target[1] - ey) - a1;
  a2 = Math.atan2(Math.sin(a2), Math.cos(a2));
  return { shoulder: a1 * DEG, elbow: a2 * DEG };
}

const INK = '#2f2e2b';
const SKIN = '#f3cba8';
const SKIN_SHADE = '#e6b08c';
const HAIR = '#f6f1e7';
const TWEED = '#9c7b58';
const TWEED_DARK = '#7f6246';
const SHIRT = '#fbf4e4';
const TIE = '#d9694c';

function rot(angle: number, origin: Vec): CSSProperties {
  return { transform: `rotate(${angle.toFixed(2)}deg)`, transformOrigin: `${origin[0]}px ${origin[1]}px` };
}

function Hand({ at, shape }: { at: Vec; shape: HandShape }): ReactElement {
  const [x, y] = at;
  return (
    <g>
      {shape === 'point' && (
        <>
          <path d={`M${x} ${y} L${x} ${y + 17}`} stroke={INK} strokeWidth={9} strokeLinecap="round" />
          <path d={`M${x} ${y} L${x} ${y + 17}`} stroke={SKIN} strokeWidth={4.6} strokeLinecap="round" />
        </>
      )}
      {shape === 'plane' && (
        <g className="ppl-prof__held" strokeLinejoin="round">
          <path d={`M${x - 3} ${y + 2} L${x + 1} ${y + 40} L${x + 9} ${y + 4} Z`} fill="#fffdf8" stroke={INK} strokeWidth={2.2} />
          <path d={`M${x + 1} ${y + 40} L${x + 3} ${y + 4}`} stroke={INK} strokeWidth={1.6} />
        </g>
      )}
      <circle cx={x} cy={y} r={9.5} fill={SKIN} stroke={INK} strokeWidth={2.4} />
      {shape === 'open' && <path d={`M${x - 8} ${y - 2} q-5 2 -3 7`} stroke={INK} strokeWidth={2.2} fill={SKIN} strokeLinecap="round" />}
      {shape === 'fist' && <path d={`M${x - 4} ${y + 3} h8 M${x - 4} ${y - 1} h8`} stroke={SKIN_SHADE} strokeWidth={1.8} strokeLinecap="round" />}
    </g>
  );
}

function Arm({ shoulder, spec, cuff }: { shoulder: Vec; spec: ArmSpec; cuff: string }): ReactElement {
  const a = solveArm(shoulder, spec.hand, spec.bend);
  const [sx, sy] = shoulder;
  const elbow: Vec = [sx, sy + UPPER];
  const wrist: Vec = [sx, sy + UPPER + FORE];
  return (
    <g className="ppl-prof__limb" style={rot(a.shoulder, shoulder)}>
      <path d={`M${sx} ${sy} L${sx} ${elbow[1]}`} stroke={INK} strokeWidth={23} strokeLinecap="round" />
      <path d={`M${sx} ${sy} L${sx} ${elbow[1]}`} stroke={TWEED} strokeWidth={18} strokeLinecap="round" />
      <g className="ppl-prof__limb" style={rot(a.elbow, elbow)}>
        <path d={`M${sx} ${elbow[1]} L${sx} ${wrist[1] - 6}`} stroke={INK} strokeWidth={21} strokeLinecap="round" />
        <path d={`M${sx} ${elbow[1]} L${sx} ${wrist[1] - 6}`} stroke={TWEED} strokeWidth={16.5} strokeLinecap="round" />
        <path d={`M${sx - 8} ${wrist[1] - 9} L${sx + 8} ${wrist[1] - 9}`} stroke={cuff} strokeWidth={4} strokeLinecap="round" />
        <Hand at={wrist} shape={spec.shape} />
      </g>
      {/* Elbow cap keeps the sleeve continuous at the joint. */}
      <circle cx={sx} cy={elbow[1]} r={8.6} fill={TWEED} />
    </g>
  );
}

function Mouth({ kind }: { kind: Mouth }): ReactElement {
  switch (kind) {
    case 'talk':
      return (
        <g className="ppl-prof__talk">
          <path d="M93 114.5 Q100 113 107 114.5 Q106 123 100 123 Q94 123 93 114.5 Z" fill="#7a3a2e" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <path d="M96 120.4 Q100 118.4 104 120.4" stroke="#e98f86" strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </g>
      );
    case 'grin':
      return (
        <g>
          <path d="M90 113.5 Q100 112 110 113.5 Q109 126 100 126 Q91 126 90 113.5 Z" fill="#7a3a2e" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
          <path d="M94.5 122 Q100 118.6 105.5 122" stroke="#e98f86" strokeWidth={3} strokeLinecap="round" fill="none" />
        </g>
      );
    case 'o':
      return <ellipse cx={100} cy={118} rx={3.6} ry={4.2} fill="#7a3a2e" stroke={INK} strokeWidth={2} />;
    case 'hmm':
      return <path d="M94 118 q3 -2 6 0 t6 0" stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />;
    default:
      return <path d="M93.5 115.5 Q100 121 106.5 115.5" stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />;
  }
}

function Brows({ kind }: { kind: Brows }): ReactElement {
  const left = { calm: 'M71 63 Q80 57 92 61', up: 'M70 60 Q80 52 92 57', quizzical: 'M71 64 Q81 60 92 63', focus: 'M71 61 Q81 59 92 64' }[kind];
  const right = { calm: 'M108 61 Q120 57 129 63', up: 'M108 57 Q120 52 130 60', quizzical: 'M108 57 Q119 50 130 57', focus: 'M108 64 Q119 59 129 61' }[kind];
  return (
    <g className="ppl-prof__brows" stroke={INK} strokeLinecap="round" fill="none">
      <path d={left} strokeWidth={7.5} />
      <path d={left} stroke={HAIR} strokeWidth={4.2} />
      <path d={right} strokeWidth={7.5} />
      <path d={right} stroke={HAIR} strokeWidth={4.2} />
    </g>
  );
}

function Eyes({ look, happy }: { look: Vec; happy: boolean }): ReactElement {
  if (happy) {
    return (
      <g stroke={INK} strokeWidth={2.6} strokeLinecap="round" fill="none">
        <path d="M79 83 Q84 77 89 83" />
        <path d="M111 83 Q116 77 121 83" />
      </g>
    );
  }
  const [lx, ly] = look;
  return (
    <g className="ppl-prof__eyes">
      <ellipse cx={84 + lx} cy={81 + ly} rx={3.4} ry={4.2} fill={INK} />
      <ellipse cx={116 + lx} cy={81 + ly} rx={3.4} ry={4.2} fill={INK} />
      <circle cx={85.2 + lx} cy={79.4 + ly} r={1.1} fill="#fff" />
      <circle cx={117.2 + lx} cy={79.4 + ly} r={1.1} fill="#fff" />
    </g>
  );
}

export function Professor({ pose = 'idle', size = 160, animate = true, title = 'Professor Wren', className }: ProfessorProps): ReactElement {
  const p = POSES[pose];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const tweedId = `ppl-tweed-${uid}`;
  const dotsId = `ppl-dots-${uid}`;
  const reduced = useReducedMotion();
  const moving = animate && !reduced;

  return (
    <svg
      className={cx('ppl-prof', moving && 'is-animated', `is-${pose}`, className)}
      width={size}
      height={(size * 6) / 5}
      viewBox="0 0 200 240"
      role={title ? 'img' : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <pattern id={tweedId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <path d="M0 2 h3 M3.5 5.5 h3" stroke={TWEED_DARK} strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
          <path d="M5 1.5 h1.5" stroke="#c9a77f" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        </pattern>
        <pattern id={dotsId} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.2" fill="#fffaf0" />
        </pattern>
      </defs>

      <ellipse cx="100" cy="236" rx="70" ry="6" fill="rgb(60 50 30 / 0.10)" />

      <g className="ppl-prof__bob" strokeLinejoin="round">
        {/* Torso */}
        <path
          d="M36 240 C36 196 44 164 68 150 C80 143 90 141 100 141 C110 141 120 143 132 150 C156 164 164 196 164 240 Z"
          fill={TWEED}
          stroke={INK}
          strokeWidth={2.6}
        />
        <path d="M36 240 C36 196 44 164 68 150 C80 143 90 141 100 141 C110 141 120 143 132 150 C156 164 164 196 164 240 Z" fill={`url(#${tweedId})`} />
        <path d="M86 140 L100 196 L114 140 Z" fill={SHIRT} stroke={INK} strokeWidth={2.2} />
        <path d="M84 141 C80 156 79 168 82 180 L76 186 L100 222 L100 196 L86 141" fill={TWEED_DARK} stroke={INK} strokeWidth={2.2} />
        <path d="M116 141 C120 156 121 168 118 180 L124 186 L100 222 L100 196 L114 141" fill={TWEED_DARK} stroke={INK} strokeWidth={2.2} />
        <circle cx="106" cy="214" r="2.6" fill={TWEED_DARK} stroke={INK} strokeWidth={1.6} />
        <circle cx="106" cy="230" r="2.6" fill={TWEED_DARK} stroke={INK} strokeWidth={1.6} />

        {/* Breast pocket with a spare dart */}
        <path d="M126.5 179 L136.5 153 L141.5 179 Z" fill="#fffdf8" stroke={INK} strokeWidth={2} />
        <path d="M136.5 153 L133 179" stroke={INK} strokeWidth={1.5} />
        <path d="M121 179.5 Q134 177 147 179.5" stroke={INK} strokeWidth={2.4} strokeLinecap="round" fill="none" />

        {/* Neck, collar, bow tie */}
        <path d="M89 118 L89 140 L111 140 L111 118 Z" fill={SKIN_SHADE} />
        <path d="M87 134 L100 144 L92 152 Z" fill={SHIRT} stroke={INK} strokeWidth={2} />
        <path d="M113 134 L100 144 L108 152 Z" fill={SHIRT} stroke={INK} strokeWidth={2} />
        <g stroke={INK} strokeWidth={2.2}>
          <path d="M100 143 L84 134.5 Q81.5 143 84 151.5 Z" fill={TIE} />
          <path d="M100 143 L116 134.5 Q118.5 143 116 151.5 Z" fill={TIE} />
          <path d="M100 143 L84 134.5 Q81.5 143 84 151.5 Z" fill={`url(#${dotsId})`} stroke="none" />
          <path d="M100 143 L116 134.5 Q118.5 143 116 151.5 Z" fill={`url(#${dotsId})`} stroke="none" />
          <rect x="95.5" y="138.5" width="9" height="9" rx="2.6" fill="#c45a3f" />
        </g>

        {/* Folding sheet (fold pose) sits behind the hands. */}
        <g className={cx('ppl-prof__paper', p.paper && 'is-shown')}>
          <path d="M77 166 L123 166 L123 206 L77 206 Z" fill="#fffdf8" stroke={INK} strokeWidth={2.2} />
          <path d="M100 166 L100 206" stroke={INK} strokeWidth={1.2} strokeDasharray="3 3" />
          <path d="M77 166 L100 166 L77 189 Z" fill="#f1e6cf" stroke={INK} strokeWidth={1.8} />
        </g>

        <Arm shoulder={SHOULDER_L} spec={p.left} cuff={SHIRT} />
        <Arm shoulder={SHOULDER_R} spec={p.right} cuff={SHIRT} />

        {/* Head */}
        <g className="ppl-prof__head" style={rot(p.tilt ?? 0, [100, 128])}>
          <circle cx="62" cy="90" r="8.5" fill={SKIN} stroke={INK} strokeWidth={2.4} />
          <circle cx="138" cy="90" r="8.5" fill={SKIN} stroke={INK} strokeWidth={2.4} />
          <path d="M60 87 q3 3 0 6 M140 87 q-3 3 0 6" stroke={SKIN_SHADE} strokeWidth={2} fill="none" strokeLinecap="round" />
          <path
            d="M100 40 C124 40 139 57 139 82 C139 109 123 127 100 127 C77 127 61 109 61 82 C61 57 76 40 100 40 Z"
            fill={SKIN}
            stroke={INK}
            strokeWidth={2.6}
          />
          <path d="M90 52 Q100 49 110 52" stroke={SKIN_SHADE} strokeWidth={1.8} fill="none" strokeLinecap="round" />

          {/* Hair: swept-back side tufts and one top curl */}
          <path
            d="M66 62 C58 56 48 58 47 66 C40 68 40 77 45 80 C40 85 43 93 50 93 C50 99 57 102 62 98 C63 93 63 80 66 62 Z"
            fill={HAIR}
            stroke={INK}
            strokeWidth={2.4}
          />
          <path
            d="M134 62 C142 56 152 58 153 66 C160 68 160 77 155 80 C160 85 157 93 150 93 C150 99 143 102 138 98 C137 93 137 80 134 62 Z"
            fill={HAIR}
            stroke={INK}
            strokeWidth={2.4}
          />
          <path d="M51 72 q5 1 9 -1 M51 86 q5 0 9 -3 M149 72 q-5 1 -9 -1 M149 86 q-5 0 -9 -3" stroke="#d9d0bf" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <path d="M99 41 C95 31 103 25 109 30 C112 33 109 38 105 36" stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />

          <circle cx="72" cy="99" r="6.5" fill="#ec9b8f" opacity="0.45" />
          <circle cx="128" cy="99" r="6.5" fill="#ec9b8f" opacity="0.45" />

          <Brows kind={p.brows} />
          <Eyes look={p.look} happy={p.happyEyes ?? false} />

          {/* Spectacles */}
          <g stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round">
            <circle cx="84" cy="81" r="12" fill="rgb(255 255 255 / 0.22)" />
            <circle cx="116" cy="81" r="12" fill="rgb(255 255 255 / 0.22)" />
            <path d="M96 80 Q100 76.5 104 80" />
            <path d="M72 79 L63 82 M128 79 L137 82" />
            <path d="M77 74 q3 -3 7 -3.2 M109 74 q3 -3 7 -3.2" stroke="#fff" strokeWidth={1.8} opacity="0.9" />
          </g>

          {/* Nose, moustache, mouth */}
          <ellipse cx="100" cy="95" rx="7" ry="6" fill={SKIN_SHADE} stroke={INK} strokeWidth={2.3} />
          <Mouth kind={p.mouth} />
          <path
            d="M100 103 C95 99 86 99 80 104 C75 108 70 107 67 102 C66 111 74 116 84 114 C92 113 97 110 100 108 C103 110 108 113 116 114 C126 116 134 111 133 102 C130 107 125 108 120 104 C114 99 105 99 100 103 Z"
            fill={HAIR}
            stroke={INK}
            strokeWidth={2.4}
          />
          <path d="M86 106 q4 -1.6 8 0 M106 106 q4 -1.6 8 0" stroke="#d9d0bf" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ speech */

export interface ProfessorSaysProps {
  pose?: ProfessorPose;
  title?: ReactNode;
  children: ReactNode;
  /** Buttons under the text. */
  actions?: ReactNode;
  /** Avatar width in px. Default 112 (phones) — the layout scales it up on wide screens. */
  size?: number;
  /** Announce text changes politely (for step-by-step dialogue). */
  live?: boolean;
  /** Stack the avatar above the bubble instead of beside it. */
  layout?: 'row' | 'stack';
  className?: string;
}

/** Professor Wren with a speech bubble. */
export function ProfessorSays({ pose = 'talk', title, children, actions, size = 112, live = false, layout = 'row', className }: ProfessorSaysProps): ReactElement {
  return (
    <figure className={cx('ppl-says', `ppl-says--${layout}`, className)}>
      <div className="ppl-says__avatar">
        <Professor pose={pose} size={size} title={null} />
      </div>
      <figcaption className="ppl-says__bubble" aria-live={live ? 'polite' : undefined}>
        <span className="ppl-says__name">Professor Wren</span>
        {title && <p className="ppl-says__title">{title}</p>}
        <div className="ppl-says__text">{children}</div>
        {actions && <div className="ppl-says__actions">{actions}</div>}
      </figcaption>
    </figure>
  );
}
