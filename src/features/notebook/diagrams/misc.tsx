import type { ReactElement } from 'react';
import { Arrow, C, Figure, T } from './kit';

/** records: a distance throw measured to the first touch. */
export function ArenaDiagram(): ReactElement {
  const floor = 150;
  const lineX = 44;
  const touch = 262;
  return (
    <Figure width={360} height={196} label="Side view of a hall. The thrower stands behind the launch line. The plane arcs up and down; distance is measured from the line to where it first touches the floor, not to where it slides to a stop.">
      <rect x={0} y={floor} width={360} height={46} fill={C.paper2} />
      <line x1={0} x2={360} y1={floor} y2={floor} stroke={C.ink} strokeWidth={1.8} />
      <line x1={0} x2={360} y1={14} y2={14} stroke={C.ink3} strokeWidth={1.4} />
      <T x={352} y={30} textAnchor="end" muted>
        ceiling
      </T>
      {/* thrower */}
      <circle cx={26} cy={98} r={7} fill={C.card} stroke={C.ink} strokeWidth={1.8} />
      <path d="M26,105 L26,128 M26,128 L18,150 M26,128 L34,150 M26,112 L40,98" stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      <line x1={lineX} x2={lineX} y1={floor - 6} y2={floor + 10} stroke={C.accent} strokeWidth={3} strokeLinecap="round" />
      <T x={lineX} y={floor + 24} textAnchor="middle" muted>
        line
      </T>
      <path d={`M42,96 C110,24 200,40 ${touch},${floor}`} fill="none" stroke={C.sky} strokeWidth={2.2} strokeDasharray="6 4" />
      <path d={`M${touch},${floor} L316,${floor - 2}`} stroke={C.ink3} strokeWidth={1.6} strokeDasharray="2 4" />
      <circle cx={touch} cy={floor} r={5} fill={C.accent} />
      <T x={touch} y={floor - 12} textAnchor="middle" bold>
        first touch
      </T>
      <path d="M316,147 l20,-3 l-18,-1 z" fill={C.card} stroke={C.ink} strokeWidth={1.4} strokeLinejoin="round" />
      <T x={354} y={floor + 22} textAnchor="end" muted>
        rest: not counted
      </T>
      <Arrow x1={lineX} y1={floor + 32} x2={touch} y2={floor + 32} color={C.ink} width={1.8} />
      <Arrow x1={touch} y1={floor + 32} x2={lineX} y2={floor + 32} color={C.ink} width={1.8} />
      <T x={(lineX + touch) / 2} y={floor + 26} textAnchor="middle" bold>
        distance
      </T>
    </Figure>
  );
}

/** glossary: parts of a dart, top and front views. */
export function PlaneParts(): ReactElement {
  const nose: [number, number] = [96, 30];
  const tipL: [number, number] = [36, 196];
  const tipR: [number, number] = [156, 196];
  const elev = 14;
  const leader = (x1: number, y1: number, x2: number, y2: number): ReactElement => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.ink3} strokeWidth={1.2} />;
  // front view
  const fx = 282;
  const fy = 104;
  return (
    <Figure width={360} height={232} label="Top view of a dart labelled with nose, leading edge, wing, keel line, elevator and trailing edge. Front view labelled with wing, dihedral, winglet and keel.">
      <path d={`M${nose[0]},${nose[1]} L${tipR[0]},${tipR[1]} L${tipL[0]},${tipL[1]} Z`} fill={C.card} stroke={C.ink} strokeWidth={1.8} strokeLinejoin="round" />
      <path d={`M${tipL[0] + 4},${tipL[1] - elev} L${tipR[0] - 4},${tipR[1] - elev} L${tipR[0]},${tipR[1]} L${tipL[0]},${tipL[1]} Z`} fill={C.mustardWash} stroke={C.mustard} strokeWidth={1.2} />
      <line x1={nose[0]} x2={nose[0]} y1={nose[1]} y2={tipL[1]} stroke={C.ink2} strokeWidth={1.4} />
      <T x={nose[0] + 10} y={nose[1] + 2}>
        Nose
      </T>
      {leader(67, 110, 40, 94)}
      <T x={4} y={88}>
        leading edge
      </T>
      <T x={122} y={150} textAnchor="middle" muted>
        wing
      </T>
      {leader(96, 120, 150, 98)}
      <T x={146} y={92}>
        keel line
      </T>
      {leader(136, 188, 176, 210)}
      <T x={150} y={224}>
        elevator
      </T>
      <T x={30} y={224}>
        trailing edge
      </T>
      {leader(56, 214, 60, 197)}
      {/* front view */}
      <line x1={204} x2={204} y1={20} y2={216} stroke={C.line} strokeWidth={1} />
      <T x={fx} y={24} textAnchor="middle" muted>
        from the front
      </T>
      <path d={`M${fx - 66},${fy - 14} L${fx},${fy} L${fx + 66},${fy - 14}`} fill="none" stroke={C.ink} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${fx - 66},${fy - 14} L${fx - 70},${fy - 38} M${fx + 66},${fy - 14} L${fx + 70},${fy - 38}`} stroke={C.plum} strokeWidth={3} strokeLinecap="round" />
      <path d={`M${fx - 5},${fy} L${fx},${fy + 50} L${fx + 5},${fy}`} fill={C.mustardWash} stroke={C.ink} strokeWidth={2} strokeLinejoin="round" />
      <line x1={fx} x2={fx + 60} y1={fy} y2={fy} stroke={C.ink3} strokeWidth={1.2} strokeDasharray="3 3" />
      <T x={fx + 34} y={fy + 16} muted>
        dihedral
      </T>
      <T x={fx + 72} y={fy - 44} textAnchor="end" fill={C.plum}>
        winglet
      </T>
      {leader(fx + 4, fy + 36, fx + 24, fy + 60)}
      <T x={fx + 26} y={fy + 72}>
        keel
      </T>
      <T x={fx - 60} y={fy - 24}>
        wing
      </T>
    </Figure>
  );
}
