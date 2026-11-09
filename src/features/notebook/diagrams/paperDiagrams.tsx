import type { ReactElement } from 'react';
import { Arrow, C, Figure, T } from './kit';

/** paper: A-series halving, with US Letter for comparison. */
export function PaperSizes(): ReactElement {
  const s = 0.6;
  const W = 420 * s;
  const H = 297 * s;
  const x = (360 - W) / 2;
  const y = 10;
  const letterW = 215.9 * s;
  const letterH = 279.4 * s;
  return (
    <Figure width={360} height={H + 22} label="An A3 sheet divided into two A4 halves; one A4 divided into two A5; one A5 into two A6. A US Letter outline sits over an A4: a little wider and shorter.">
      <rect x={x} y={y} width={W} height={H} rx={3} fill={C.card} stroke={C.ink} strokeWidth={1.8} />
      <line x1={x + W / 2} x2={x + W / 2} y1={y} y2={y + H} stroke={C.ink} strokeWidth={1.6} />
      <line x1={x + W / 2} x2={x + W} y1={y + H / 2} y2={y + H / 2} stroke={C.ink} strokeWidth={1.4} />
      <line x1={x + (3 * W) / 4} x2={x + (3 * W) / 4} y1={y + H / 2} y2={y + H} stroke={C.ink} strokeWidth={1.2} />
      <rect x={x} y={y + H - letterH} width={letterW} height={letterH} fill="none" stroke={C.sky} strokeWidth={2} strokeDasharray="6 4" />
      <T x={x + W / 4} y={y + H / 2} textAnchor="middle" bold className="ppl-nb-svg__big">
        A4
      </T>
      <T x={x + W / 4} y={y + H / 2 + 18} textAnchor="middle" muted>
        210 × 297
      </T>
      <T x={x + (3 * W) / 4} y={y + H / 4 + 6} textAnchor="middle" bold>
        A5
      </T>
      <T x={x + (5 * W) / 8} y={y + (3 * H) / 4 + 4} textAnchor="middle" bold>
        A6
      </T>
      <T x={x + (7 * W) / 8} y={y + (3 * H) / 4 + 4} textAnchor="middle" bold>
        A6
      </T>
      <T x={x + 6} y={y + H - letterH + 16} fill={C.sky}>
        Letter
      </T>
      <T x={x + W} y={y + H + 16} textAnchor="end" muted>
        whole sheet: A3
      </T>
    </Figure>
  );
}

function Strip({ x, layers, tip, locked, label, factor }: { x: number; layers: number; tip: number; locked: boolean; label: string; factor: string }): ReactElement {
  const y = 50;
  const L = 86;
  const lines = Array.from({ length: layers }, (_, i) => i * 3);
  return (
    <g>
      <rect x={x} y={y - 16} width={12} height={40} rx={3} fill={C.paper2} stroke={C.ink} strokeWidth={1.6} />
      {lines.map((off) => (
        <path key={off} d={`M${x + 12},${y + off} Q${x + 12 + L * 0.55},${y + off} ${x + 12 + L},${y + off + tip}`} fill="none" stroke={C.ink} strokeWidth={1.6} strokeLinecap="round" />
      ))}
      {locked && <path d={`M${x + 12 + L},${y + tip - 2} q6,${(layers - 1) * 1.5 + 2} 0,${(layers - 1) * 3 + 4}`} fill="none" stroke={C.accent} strokeWidth={2.2} strokeLinecap="round" />}
      <T x={x + 54} y={y + 70} textAnchor="middle" bold className="ppl-nb-svg__big">
        {factor}
      </T>
      <T x={x + 54} y={y + 90} textAnchor="middle" muted>
        {label}
      </T>
    </g>
  );
}

/** paper: stiffness of layers. */
export function Layers(): ReactElement {
  return (
    <Figure width={360} height={150} label="Three strips held at one end. One layer sags a lot. Four sliding layers sag about a quarter as much. Four layers locked by a crease barely sag at all, up to 64 times stiffer.">
      <Strip x={6} layers={1} tip={40} locked={false} factor="×1" label="one layer" />
      <Strip x={124} layers={4} tip={11} locked={false} factor="×4" label="4 sliding" />
      <Strip x={242} layers={4} tip={1} locked factor="up to ×64" label="4 locked" />
    </Figure>
  );
}

/** folding: valley and mountain line styles with side profiles. */
export function FoldLines(): ReactElement {
  const rows = [
    { y: 34, label: 'Valley', note: 'comes toward you', dash: '9 6', color: C.sky, profile: 'M262,22 L292,46 L322,22' },
    { y: 98, label: 'Mountain', note: 'goes away', dash: '11 4 2 4', color: C.accent, profile: 'M262,110 L292,86 L322,110' },
    { y: 156, label: 'Crease', note: 'folded and opened', dash: undefined, color: C.ink2, profile: 'M262,156 L322,156' },
  ];
  return (
    <Figure width={360} height={180} label="Line styles: a valley fold is a dashed line and folds toward you into a V. A mountain fold is a dash-dot line and folds away into a ridge. An existing crease is a thin solid line.">
      {rows.map((r) => (
        <g key={r.label}>
          <T x={8} y={r.y - 8} bold>
            {r.label}
          </T>
          <T x={8} y={r.y + 22} muted>
            {r.note}
          </T>
          <line x1={110} x2={232} y1={r.y} y2={r.y} stroke={r.color} strokeWidth={r.dash ? 2.4 : 1.2} strokeDasharray={r.dash} strokeLinecap="butt" />
          <path d={r.profile} fill="none" stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      <T x={292} y={174} textAnchor="middle" muted>
        side view
      </T>
    </Figure>
  );
}

function TopDart({ cx, rightTip }: { cx: number; rightTip: number }): ReactElement {
  return (
    <g>
      <path d={`M${cx},48 L${cx + rightTip},160 L${cx - 50},160 Z`} fill={C.card} stroke={C.ink} strokeWidth={1.8} strokeLinejoin="round" />
      <line x1={cx} x2={cx} y1={48} y2={160} stroke={C.ink2} strokeWidth={1.4} />
    </g>
  );
}

/** folding: symmetric versus lopsided dart. */
export function Symmetry(): ReactElement {
  return (
    <Figure width={360} height={190} label="Top views. A symmetric dart flies straight ahead. A dart with a larger right wing rolls left and curves left.">
      <TopDart cx={90} rightTip={50} />
      <Arrow x1={90} y1={40} x2={90} y2={8} color={C.sage} width={2.4} />
      <T x={90} y={182} textAnchor="middle" bold>
        symmetric: straight
      </T>
      <TopDart cx={262} rightTip={66} />
      <path d="M262,40 C262,22 254,14 236,10" fill="none" stroke={C.accent} strokeWidth={2.4} strokeLinecap="round" />
      <Arrow x1={240} y1={11} x2={226} y2={8} color={C.accent} width={2.4} />
      <T x={262} y={182} textAnchor="middle" bold>
        right wing larger: turns left
      </T>
    </Figure>
  );
}
