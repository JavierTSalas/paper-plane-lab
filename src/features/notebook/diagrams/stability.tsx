import type { ReactElement } from 'react';
import { ArcArrow, Arrow, C, CgMark, Figure, NpMark, pathOf, rot, T } from './kit';

function CgNpRow({ y, cg, np, stable }: { y: number; cg: number; np: number; stable: boolean }): ReactElement {
  const pitch = -6;
  const cx = 180;
  const nose = rot(300, y, cx, y, pitch);
  const tail = rot(60, y, cx, y, pitch);
  const at = (x: number): [number, number] => rot(x, y, cx, y, pitch);
  const [cgx, cgy] = at(cg);
  const [npx, npy] = at(np);
  return (
    <g>
      <path d={`M${tail[0]},${tail[1]} L${nose[0]},${nose[1]}`} stroke={C.ink} strokeWidth={3.5} strokeLinecap="round" />
      <path d={`M${nose[0]},${nose[1]} L${tail[0]},${tail[1]} L${tail[0] + 4},${tail[1] + 14} Z`} fill={C.mustardWash} stroke={C.ink} strokeWidth={1.6} strokeLinejoin="round" />
      <Arrow x1={npx} y1={npy - 4} x2={npx} y2={npy - 50} color={C.sage} width={2.4} />
      <T x={npx + 6} y={npy - 40}>
        extra lift
      </T>
      <NpMark x={npx} y={npy} />
      <CgMark x={cgx} y={cgy} />
      <T x={cgx} y={cgy + 24} textAnchor="middle" muted>
        CG
      </T>
      <T x={npx} y={npy + 24} textAnchor="middle" muted>
        NP
      </T>
      {stable ? <ArcArrow cx={cgx} cy={cgy} r={30} from={-60} to={-10} color={C.ink} /> : <ArcArrow cx={cgx} cy={cgy} r={30} from={-120} to={-170} color={C.accent} />}
      <T x={14} y={y - 46} bold>
        {stable ? 'Stable: nose comes back down' : 'Unstable: nose keeps rising'}
      </T>
      <T x={346} y={y + 2} textAnchor="end" muted>
        nose
      </T>
    </g>
  );
}

/** stability-and-trim: CG ahead of / behind the neutral point. */
export function CgNp(): ReactElement {
  return (
    <Figure width={360} height={236} label="Two side views after a nose-up bump. Top: the centre of gravity is ahead of the neutral point, so the extra lift at the neutral point pitches the nose back down. Bottom: the centre of gravity is behind it, so the extra lift pitches the nose further up.">
      <CgNpRow y={78} cg={214} np={176} stable />
      <line x1={10} x2={350} y1={122} y2={122} stroke={C.line} strokeWidth={1} />
      <CgNpRow y={196} cg={160} np={200} stable={false} />
    </Figure>
  );
}

/** stability-and-trim: trailing-edge up-bend makes a nose-up moment. */
export function Elevator(): ReactElement {
  const y = 86;
  const bendX = 268;
  const bendLen = 46;
  const b = rot(bendX + bendLen, y, bendX, y, -14);
  return (
    <Figure width={360} height={150} label="Side view of a wing with its rear edge bent up. Air striking the bent part pushes the tail down, which pitches the nose up.">
      {[40, 132].map((yy) => (
        <Arrow key={yy} x1={8} y1={yy} x2={60} y2={yy} color={C.sky} width={1.6} head={6} />
      ))}
      <path d={`M60,${y} L${bendX},${y} L${b[0]},${b[1]}`} fill="none" stroke={C.ink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <T x={60} y={y + 22} muted>
        nose
      </T>
      <T x={b[0] + 4} y={b[1] - 6} textAnchor="end" muted>
        up-bend
      </T>
      <Arrow x1={bendX + 24} y1={y - 26} x2={bendX + 22} y2={y + 30} color={C.plum} width={2.4} />
      <T x={bendX + 30} y={y + 32}>
        tail pushed down
      </T>
      <CgMark x={140} y={y} />
      <ArcArrow cx={140} cy={y} r={30} from={-140} to={-40} color={C.accent} />
      <T x={140} y={y - 40} textAnchor="middle" bold>
        nose up
      </T>
    </Figure>
  );
}

/** stability-and-trim: dihedral restores a roll. */
export function Dihedral(): ReactElement {
  const cx = 180;
  const cy = 104;
  const roll = 16;
  const dih = 10;
  const span = 126;
  const tipR0: [number, number] = [cx + span, cy - span * Math.tan((dih * Math.PI) / 180)];
  const tipL0: [number, number] = [cx - span, tipR0[1]];
  const tipR = rot(tipR0[0], tipR0[1], cx, cy, roll);
  const tipL = rot(tipL0[0], tipL0[1], cx, cy, roll);
  const keel = rot(cx, cy + 34, cx, cy, roll);
  const mid = (a: [number, number], f: number): [number, number] => [cx + (a[0] - cx) * f, cy + (a[1] - cy) * f];
  const normalUp = (tip: [number, number]): [number, number] => {
    const dx = tip[0] - cx;
    const dy = tip[1] - cy;
    const len = Math.hypot(dx, dy);
    const sgn = dx > 0 ? 1 : -1;
    return [(sgn * dy) / len, (-sgn * dx) / len];
  };
  const mR = mid(tipR, 0.6);
  const mL = mid(tipL, 0.6);
  const nR = normalUp(tipR);
  const nL = normalUp(tipL);
  return (
    <Figure width={360} height={214} label="Front view of a plane with dihedral, rolled right wing down. It slips toward the low wing; the low wing meets the air at a steeper angle, lifts more and rolls the plane level.">
      <line x1={20} x2={340} y1={cy} y2={cy} stroke={C.ink3} strokeWidth={1} strokeDasharray="4 5" />
      <path d={`M${tipL[0]},${tipL[1]} L${cx},${cy} L${tipR[0]},${tipR[1]}`} fill="none" stroke={C.ink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${cx},${cy} L${keel[0]},${keel[1]}`} stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
      <Arrow x1={mR[0]} y1={mR[1]} x2={mR[0] + nR[0] * 70} y2={mR[1] + nR[1] * 70} color={C.sage} width={2.6} />
      <Arrow x1={mL[0]} y1={mL[1]} x2={mL[0] + nL[0] * 40} y2={mL[1] + nL[1] * 40} color={C.sage} width={2} />
      <T x={mR[0] + nR[0] * 70 + 6} y={mR[1] + nR[1] * 70 - 4}>
        low wing lifts more
      </T>
      <Arrow x1={346} y1={190} x2={262} y2={190} color={C.sky} width={2} />
      <T x={346} y={178} textAnchor="end" muted>
        sideslip air
      </T>
      <ArcArrow cx={cx} cy={cy} r={58} from={-118} to={-150} color={C.accent} />
      <T x={92} y={40} textAnchor="middle" bold>
        rolls back level
      </T>
    </Figure>
  );
}

/** stability-and-trim: the phugoid. */
export function Phugoid(): ReactElement {
  const pts: [number, number][] = [];
  for (let x = 0; x <= 320; x += 2) {
    const base = 52 + 0.2 * x;
    const amp = 30 * Math.exp(-x / 150);
    pts.push([20 + x, base - amp * Math.sin((2 * Math.PI * x) / 120)]);
  }
  return (
    <Figure width={360} height={160} label="A flight path that swoops up and down a few times, each swoop smaller, before settling into a straight glide.">
      <line x1={10} x2={350} y1={146} y2={146} stroke={C.ink3} strokeWidth={1.4} />
      <path d={pathOf([[20, 52], [340, 116]])} stroke={C.ink3} strokeWidth={1.2} strokeDasharray="5 5" fill="none" />
      <path d={pathOf(pts)} fill="none" stroke={C.accent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <T x={30} y={36}>
        climbs
      </T>
      <T x={78} y={104}>
        speeds up
      </T>
      <T x={340} y={136} textAnchor="end" muted>
        settles into the glide
      </T>
    </Figure>
  );
}
