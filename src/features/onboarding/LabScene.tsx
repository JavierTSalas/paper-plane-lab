import { useId, type ReactElement } from 'react';

const INK = '#2f2e2b';

/** A paper dart seen from the side, nose to the right, for the shelves. */
function ShelfDart({ x, y, scale = 1, fill, tilt = 0 }: { x: number; y: number; scale?: number; fill: string; tilt?: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`} strokeLinejoin="round" strokeLinecap="round">
      <path d="M0 0 L34 -3 L4 -12 Z" fill={fill} stroke={INK} strokeWidth={1.6} />
      <path d="M0 0 L34 -3 L6 4 Z" fill={fill} stroke={INK} strokeWidth={1.6} opacity={0.85} />
      <path d="M2 -1 L34 -3" stroke={INK} strokeWidth={1} opacity={0.6} />
    </g>
  );
}

/** A dart from above, for the desk and the air. */
function TopDart({
  x,
  y,
  scale = 1,
  fill,
  tilt = 0,
  className,
}: {
  x: number;
  y: number;
  scale?: number;
  fill: string;
  tilt?: number;
  className?: string;
}): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`} className={className} strokeLinejoin="round" strokeLinecap="round">
      <path d="M0 0 L-30 -11 L-26 0 L-30 11 Z" fill={fill} stroke={INK} strokeWidth={1.6} />
      <path d="M0 0 L-26 0" stroke={INK} strokeWidth={1.1} />
    </g>
  );
}

/**
 * The lab at golden hour: a tall window with the low sun, shelves of paper planes, a desk with a fresh
 * sheet and a pencil. Decorative; the page around it carries the words.
 */
export function LabScene({ className }: { className?: string }): ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const sky = `ppl-sky-${uid}`;
  const wall = `ppl-wall-${uid}`;
  const beam = `ppl-beam-${uid}`;
  const pane = `ppl-pane-${uid}`;
  return (
    <svg className={className} viewBox="0 0 360 260" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={wall} gradientUnits="userSpaceOnUse" x1="0" y1="-300" x2="0" y2="176">
          <stop offset="0" stopColor="#f3e2c4" />
          <stop offset="1" stopColor="#ecd3ad" />
        </linearGradient>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6c48a" />
          <stop offset="0.55" stopColor="#f3a77a" />
          <stop offset="1" stopColor="#e98f7a" />
        </linearGradient>
        <clipPath id={pane}>
          <rect x="196" y="22" width="132" height="132" rx="10" />
        </clipPath>
        <linearGradient id={beam} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2cf" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff2cf" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The wall, wainscot and desk run past the frame: wide screens see more room, tall phones see the wall above. */}
      <rect x="-600" y="-600" width="1560" height="860" fill={`url(#${wall})`} />
      {/* Upper wall, only visible on tall screens: a framed dart diagram and a clock. */}
      <g strokeLinejoin="round" strokeLinecap="round">
        <rect x="34" y="-128" width="112" height="78" rx="4" fill="#fffaf0" stroke={INK} strokeWidth={2} />
        <rect x="41" y="-121" width="98" height="64" fill="none" stroke="#b88a61" strokeWidth={2} />
        <path d="M58 -89 L124 -89 M58 -89 L118 -104 M58 -89 L118 -74 M118 -104 L124 -89 L118 -74" stroke="#3a86c4" strokeWidth={1.6} fill="none" />
        <path d="M66 -112 h30 M66 -67 h44" stroke={INK} strokeWidth={1.4} opacity={0.4} />
        <circle cx="262" cy="-92" r="22" fill="#fffaf0" stroke={INK} strokeWidth={2} />
        <path d="M262 -92 V-106 M262 -92 L272 -86" stroke={INK} strokeWidth={2} />
      </g>
      {/* Wainscot */}
      <rect x="-600" y="176" width="1560" height="200" fill="#e3c69b" />
      <path d="M-600 176 H960" stroke={INK} strokeWidth={1.5} opacity={0.35} />

      {/* Window */}
      <g strokeLinejoin="round">
        <g clipPath={`url(#${pane})`}>
          <rect x="196" y="22" width="132" height="132" fill={`url(#${sky})`} />
          <circle cx="270" cy="118" r="20" fill="#fde6a6" />
          <circle cx="270" cy="118" r="30" fill="#fde6a6" opacity="0.3" />
          <path d="M197 128 Q230 108 262 124 T327 116 V152 H197 Z" fill="#c98a73" />
          <path d="M197 140 Q240 124 290 138 T327 134 V152 H197 Z" fill="#a8786a" />
          <path d="M222 54 q6 -4 12 0 q6 -4 12 0" stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.55} />
          <path d="M262 44 q4 -3 8 0 q4 -3 8 0" stroke={INK} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.45} />
        </g>
        <path d="M262 22 V154 M196 88 H328" stroke="#8a6448" strokeWidth={5} />
        <rect x="196" y="22" width="132" height="132" rx="10" fill="none" stroke={INK} strokeWidth={2} />
        <rect x="188" y="152" width="148" height="9" rx="3" fill="#b88a61" stroke={INK} strokeWidth={1.8} />
      </g>
      {/* Low sunlight across the room */}
      <path d="M196 60 L60 260 H190 L328 150 Z" fill={`url(#${beam})`} />

      {/* Shelves */}
      <g strokeLinejoin="round" strokeLinecap="round">
        <rect x="20" y="62" width="136" height="7" rx="2" fill="#b88a61" stroke={INK} strokeWidth={1.8} />
        <rect x="20" y="118" width="136" height="7" rx="2" fill="#b88a61" stroke={INK} strokeWidth={1.8} />
        <path d="M34 69 v8 M142 69 v8 M34 125 v8 M142 125 v8" stroke={INK} strokeWidth={2} />
        <ShelfDart x={28} y={58} fill="#fdfcf8" />
        <ShelfDart x={70} y={58} fill="#8fc1e3" scale={0.9} tilt={-6} />
        <ShelfDart x={110} y={58} fill="#f4d77a" scale={1.05} />
        {/* Books */}
        <rect x="104" y="88" width="9" height="30" fill="#7fa58a" stroke={INK} strokeWidth={1.6} />
        <rect x="114" y="92" width="8" height="26" fill="#d9694c" stroke={INK} strokeWidth={1.6} />
        <rect x="123" y="86" width="10" height="32" fill="#8a6fa8" stroke={INK} strokeWidth={1.6} />
        <path d="M135 118 L146 92 L154 95 L143 118 Z" fill="#e3b04b" stroke={INK} strokeWidth={1.6} />
        <ShelfDart x={30} y={114} fill="#e7a3ad" scale={1.1} tilt={4} />
        <ShelfDart x={68} y={114} fill="#b5dcc0" scale={0.85} />
      </g>

      {/* A dart gliding across the room */}
      <TopDart x={170} y={44} fill="#fdfcf8" tilt={-14} scale={0.9} className="ppl-scene__glider" />

      {/* Desk */}
      <g strokeLinejoin="round" strokeLinecap="round">
        <rect x="-600" y="196" width="1560" height="16" fill="#c58f5e" stroke={INK} strokeWidth={2} />
        <rect x="14" y="212" width="14" height="52" fill="#a8744a" stroke={INK} strokeWidth={2} />
        <rect x="332" y="212" width="14" height="52" fill="#a8744a" stroke={INK} strokeWidth={2} />
        {/* Fresh sheet */}
        <path d="M120 194 L196 188 L206 196 L128 202 Z" fill="#fffdf8" stroke={INK} strokeWidth={1.8} />
        <path d="M163 191 L167 199" stroke={INK} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
        {/* Pencil */}
        <path d="M222 195 L270 189" stroke="#e3b04b" strokeWidth={5} />
        <path d="M222 195 L270 189" stroke={INK} strokeWidth={7} opacity={0.18} />
        <path d="M270 189 L278 188.5" stroke={INK} strokeWidth={3} />
        {/* Desk lamp */}
        <path d="M60 196 h28" stroke={INK} strokeWidth={3} />
        <path d="M74 196 L66 160 L92 140" stroke={INK} strokeWidth={3} fill="none" />
        <path d="M84 134 L104 128 L106 150 Z" fill="#d9694c" stroke={INK} strokeWidth={2} />
        {/* Mug of pencils */}
        <rect x="292" y="172" width="20" height="24" rx="4" fill="#7fb2d9" stroke={INK} strokeWidth={2} />
        <path d="M297 172 l-3 -14 M303 172 l1 -16 M308 172 l5 -12" stroke={INK} strokeWidth={2} />
      </g>
    </svg>
  );
}
