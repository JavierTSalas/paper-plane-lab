import type { ReactElement } from 'react';
import { useLab } from '../../app/store';
import { PAPER_SIZES, PAPER_STOCK } from '../../core/paper';
import { Tag } from '../../ui/Chip';
import { formatLength, formatMass, formatPaperDims, formatTime } from '../../ui/format';
import { InfoDot } from '../../ui/InfoDot';
import { notebookLink } from './ids';
import { SOURCE_GROUPS, getSource, sourceAnchor } from './sources';
import { RECORDS } from './topics/records';
import { SOURCES_CAVEAT } from './topics/sources';
import type { WidgetId } from './topics/types';

function PaperSizeTable(): ReactElement {
  const units = useLab((s) => s.settings.units);
  return (
    <div className="ppl-nb-table-wrap">
      <table className="ppl-nb-table">
        <caption className="ppl-sr-only">Paper sizes in the lab, with the mass of one sheet of 80 g/m² paper</caption>
        <thead>
          <tr>
            <th scope="col">Size</th>
            <th scope="col">Sheet</th>
            <th scope="col" className="is-num">
              Mass{' '}
              <InfoDot label="How is sheet mass worked out?" title="Sheet mass">
                Area times 80 g/m². Folding never changes it, so this is the mass of any plane folded from that sheet.
              </InfoDot>
            </th>
          </tr>
        </thead>
        <tbody>
          {PAPER_SIZES.map((s) => (
            <tr key={s.id}>
              <th scope="row">{s.name}</th>
              <td className="ppl-num">{formatPaperDims(s.short, s.long, units)}</td>
              <td className="ppl-num is-num">{formatMass((PAPER_STOCK.gsm / 1000) * s.short * s.long, units, { digits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceRefs({ ids }: { ids: string[] }): ReactElement {
  return (
    <span className="ppl-nb-refs">
      {ids.map((id) => {
        const s = getSource(id);
        return (
          <a key={id} href={notebookLink('sources', sourceAnchor(id))} className="ppl-nb-ref" title={s?.entry.text}>
            {id.replace(':', '·')}
          </a>
        );
      })}
    </span>
  );
}

function RecordList(): ReactElement {
  const units = useLab((s) => s.settings.units);
  return (
    <ul className="ppl-nb-records" role="list">
      {RECORDS.map((r) => (
        <li key={`${r.category}-${r.value}`} className={r.status === 'reported' ? 'is-reported' : undefined}>
          <div className="ppl-nb-records__value ppl-num">{r.category === 'distance' ? formatLength(r.value, units, { digits: 2 }) : formatTime(r.value, 1)}</div>
          <div className="ppl-nb-records__body">
            <div className="ppl-nb-records__head">
              <span className="ppl-eyebrow">{r.category === 'distance' ? 'Distance' : 'Time aloft'}</span>
              {r.status === 'reported' ? (
                <Tag tone="warn" icon="warning">
                  Reported, not verified here
                </Tag>
              ) : (
                <Tag tone="good" icon="lock">
                  Established
                </Tag>
              )}
            </div>
            <p className="ppl-small">
              <strong>{r.who}</strong> · {r.when}
            </p>
            {r.note && <p className="ppl-caption">{r.note}</p>}
            <SourceRefs ids={r.sources} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function linkify(text: string, urls: string[]): (string | ReactElement)[] {
  const out: (string | ReactElement)[] = [];
  let rest = text;
  urls.forEach((url, i) => {
    const at = rest.indexOf(url);
    if (at < 0) return;
    out.push(rest.slice(0, at));
    out.push(
      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="ppl-nb-url">
        {url}
      </a>,
    );
    rest = rest.slice(at + url.length);
  });
  out.push(rest);
  return out;
}

function SourceList(): ReactElement {
  const total = SOURCE_GROUPS.reduce((n, g) => n + g.entries.length, 0);
  return (
    <div className="ppl-nb-sources">
      <div className="ppl-nb-callout ppl-nb-callout--caveat" role="note">
        <p className="ppl-nb-callout__title">Read this first</p>
        <p>{SOURCES_CAVEAT}</p>
      </div>
      <p className="ppl-small ppl-muted">
        {total} entries from {SOURCE_GROUPS.length} research notes. Tags like <span className="ppl-nb-ref is-static">01·S15</span> are how topics cite them.
      </p>
      {SOURCE_GROUPS.map((g) => (
        <section key={g.doc} className="ppl-nb-sources__group" aria-labelledby={`srcgrp-${g.doc}`}>
          <h3 id={`srcgrp-${g.doc}`} className="ppl-h3">
            <span className="ppl-nb-sources__num">{g.doc}</span> {g.title}
          </h3>
          {g.notes.map((n, i) => (
            <p key={i} className="ppl-caption ppl-nb-sources__note">
              {n}
            </p>
          ))}
          <ol className="ppl-nb-sources__list" role="list">
            {g.entries.map((e) => (
              <li key={e.id} id={sourceAnchor(e.id)} className="ppl-nb-sources__item">
                <span className="ppl-nb-ref is-static">{e.id.replace(':', '·')}</span>
                <span className="ppl-nb-sources__text">{linkify(e.text, e.urls)}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function Widget({ id }: { id: WidgetId }): ReactElement {
  switch (id) {
    case 'paper-sizes':
      return <PaperSizeTable />;
    case 'records':
      return <RecordList />;
    case 'source-list':
      return <SourceList />;
  }
}

export { SourceRefs };
