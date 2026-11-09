import { Fragment, type ReactElement, type ReactNode } from 'react';
import { useLab } from '../../app/store';
import { formatArea, formatLength, formatMass, formatSpeed, formatWingLoading, type UnitSystem } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { notebookLink, parseTopicParam } from './ids';
import { TOKEN, isKind, type QuantityKind } from './markup';
import { getTopic } from './topics';

export function formatQuantity(kind: QuantityKind, value: number, units: UnitSystem, digits?: number): string {
  const opts = digits === undefined ? undefined : { digits };
  switch (kind) {
    case 'length':
      return formatLength(value, units, opts);
    case 'speed':
      return formatSpeed(value, units, opts);
    case 'mass':
      return formatMass(value, units, opts);
    case 'area':
      return formatArea(value, units, opts);
    case 'wingLoading':
      return formatWingLoading(value, units, opts);
  }
}

function renderLink(body: string, key: number): ReactNode {
  const [target, label] = body.split('|');
  const parsed = parseTopicParam(target);
  if (!parsed) return label ?? target;
  return (
    <a key={key} className="ppl-nb-link" href={notebookLink(parsed.topic, parsed.anchor)}>
      {label ?? getTopic(parsed.topic).title}
    </a>
  );
}

function renderBrace(body: string, key: number, units: UnitSystem): ReactNode {
  const colon = body.indexOf(':');
  const head = body.slice(0, colon);
  const rest = body.slice(colon + 1);
  if (head === 'info') {
    const [label, ...text] = rest.split('|');
    return (
      <InfoDot key={key} label={label} title={label}>
        {text.join('|')}
      </InfoDot>
    );
  }
  if (isKind(head)) {
    const [v, d] = rest.split('|');
    const digits = d === undefined ? undefined : Number(d);
    return (
      <span key={key} className="ppl-num ppl-nb-qty">
        {formatQuantity(head, Number(v), units, digits)}
      </span>
    );
  }
  return body;
}

/** Renders the Notebook's inline markup (see topics/types.ts). */
export function RichText({ text }: { text: string }): ReactElement {
  const units = useLab((s) => s.settings.units);
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    if (m[1] !== undefined) parts.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) parts.push(renderLink(m[2], key++));
    else if (m[3] !== undefined) parts.push(renderBrace(m[3], key++, units));
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
