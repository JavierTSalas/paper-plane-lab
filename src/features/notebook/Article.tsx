import { useEffect, type ReactElement } from 'react';
import { Link } from 'wouter';
import { Card } from '../../ui/Card';
import { Icon, type IconName } from '../../ui/icons';
import { InfoDot } from '../../ui/InfoDot';
import { prefersReducedMotion } from '../../ui/motion';
import { DIAGRAMS } from './diagrams/registry';
import { notebookLink } from './ids';
import { RichText } from './RichText';
import { getSource, sourceAnchor } from './sources';
import { TOPICS } from './topics';
import type { Block, CalloutTone, Certainty, Topic } from './topics/types';
import { Widget } from './Widgets';

const CALLOUT_ICON: Record<CalloutTone, IconName> = { tip: 'sparkle', note: 'info', caveat: 'warning' };

function BlockView({ block }: { block: Block }): ReactElement {
  switch (block.kind) {
    case 'p':
      return (
        <p className="ppl-nb-p">
          <RichText text={block.text} />
        </p>
      );
    case 'list':
      return (
        <ul className="ppl-nb-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );
    case 'formula':
      return (
        <figure className="ppl-nb-formula">
          <div className="ppl-nb-formula__box">
            <div className="ppl-nb-formula__lines">
              {block.lines.map((l) => (
                <div key={l} className="ppl-nb-formula__line">
                  <RichText text={l} />
                </div>
              ))}
            </div>
            {block.info && (
              <InfoDot label={block.info.label} title={block.info.label}>
                <RichText text={block.info.text} />
              </InfoDot>
            )}
          </div>
          {block.where && (
            <figcaption className="ppl-caption">
              <RichText text={block.where} />
            </figcaption>
          )}
        </figure>
      );
    case 'diagram': {
      const D = DIAGRAMS[block.id];
      return (
        <figure className="ppl-nb-figure">
          <div className="ppl-nb-figure__art">
            <D />
          </div>
          <figcaption className="ppl-caption">
            <RichText text={block.caption} />
          </figcaption>
        </figure>
      );
    }
    case 'callout':
      return (
        <aside className={`ppl-nb-callout ppl-nb-callout--${block.tone}`}>
          <p className="ppl-nb-callout__title">
            <Icon name={CALLOUT_ICON[block.tone]} size={18} />
            {block.title}
          </p>
          <p>
            <RichText text={block.text} />
          </p>
        </aside>
      );
    case 'terms':
      return (
        <dl className="ppl-nb-terms">
          {block.items.map((t) => (
            <div key={t.term} className="ppl-nb-terms__row">
              <dt>{t.term}</dt>
              <dd>
                <RichText text={t.def} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'widget':
      return <Widget id={block.id} />;
  }
}

const SURE_GROUPS: { key: keyof Certainty; title: string; icon: IconName; tone: string }[] = [
  { key: 'solid', title: 'Solid physics', icon: 'lock', tone: 'good' },
  { key: 'calibrated', title: 'Our calibration', icon: 'ruler', tone: 'cal' },
  { key: 'unverified', title: 'Not verified', icon: 'warning', tone: 'warn' },
];

function HowSure({ sure }: { sure: Certainty }): ReactElement {
  return (
    <Card as="section" padding="lg" tone="sunken" className="ppl-nb-sure" aria-labelledby="ppl-nb-sure-title">
      <h2 id="ppl-nb-sure-title" className="ppl-h2">
        How sure are we?
      </h2>
      <div className="ppl-nb-sure__groups">
        {SURE_GROUPS.filter((g) => sure[g.key].length > 0).map((g) => (
          <div key={g.key} className={`ppl-nb-sure__group is-${g.tone}`}>
            <h3 className="ppl-nb-sure__title">
              <Icon name={g.icon} size={18} />
              {g.title}
            </h3>
            <ul>
              {sure[g.key].map((s, i) => (
                <li key={i}>
                  <RichText text={s} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TopicSources({ ids }: { ids: string[] }): ReactElement | null {
  if (ids.length === 0) return null;
  return (
    <section className="ppl-nb-topic-sources" aria-labelledby="ppl-nb-ts-title">
      <h2 id="ppl-nb-ts-title" className="ppl-h3">
        Sources for this topic
      </h2>
      <p className="ppl-caption">As cited in our research notes; most could only be checked through search-result text.</p>
      <ol role="list">
        {ids.map((id) => {
          const s = getSource(id);
          if (!s) return null;
          const url = s.entry.urls[0];
          return (
            <li key={id}>
              <a className="ppl-nb-ref" href={notebookLink('sources', sourceAnchor(id))}>
                {id.replace(':', '·')}
              </a>
              <span>
                {s.entry.text.replace(/\s*(https?:\/\/\S+\s*;?\s*)+/g, ' ').replace(/\s+[-–]\s*$/, '').trim()}{' '}
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="ppl-nb-url">
                    link
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PrevNext({ topic }: { topic: Topic }): ReactElement {
  const i = TOPICS.findIndex((t) => t.id === topic.id);
  const prev = i > 0 ? TOPICS[i - 1] : undefined;
  const next = i < TOPICS.length - 1 ? TOPICS[i + 1] : undefined;
  return (
    <nav className="ppl-nb-prevnext" aria-label="More topics">
      {prev ? (
        <Link href={`/notebook/${prev.id}`} className="ppl-nb-prevnext__link is-prev">
          <span className="ppl-caption">Previous</span>
          <span className="ppl-nb-prevnext__title">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={`/notebook/${next.id}`} className="ppl-nb-prevnext__link is-next">
          <span className="ppl-caption">Next</span>
          <span className="ppl-nb-prevnext__title">{next.title}</span>
        </Link>
      ) : (
        <Link href="/notebook" className="ppl-nb-prevnext__link is-next">
          <span className="ppl-caption">Back to</span>
          <span className="ppl-nb-prevnext__title">All topics</span>
        </Link>
      )}
    </nav>
  );
}

export function Article({ topic, anchor }: { topic: Topic; anchor?: string }): ReactElement {

  // After the shell has scrolled to the top for the new route, move to the requested section.
  useEffect(() => {
    if (!anchor) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      el.classList.add('is-target');
      window.setTimeout(() => el.classList.remove('is-target'), 1600);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [topic.id, anchor]);

  const showToc = topic.sections.length > 1;
  return (
    <div className="ppl-nb-article-wrap">
      <div className="ppl-nb-bar">
        <Link href="/notebook" className="ppl-nb-bar__back">
          <Icon name="back" size={20} />
          <span>Notebook</span>
        </Link>
        <span className="ppl-nb-bar__title" aria-hidden="true">
          {topic.title}
        </span>
      </div>

      <div className="ppl-nb-layout">
        <article className="ppl-nb-article" aria-labelledby="ppl-nb-title">
          <header className="ppl-nb-article__head">
            <span className={`ppl-nb-icon ppl-nb-icon--${topic.tone}`} aria-hidden="true">
              <Icon name={topic.icon} size={26} />
            </span>
            <h1 id="ppl-nb-title" className="ppl-display ppl-nb-article__title">
              {topic.title}
            </h1>
            <p className="ppl-nb-lede">{topic.summary}</p>
          </header>

          {topic.sections.map((s) => (
            <section key={s.id} id={s.id} className="ppl-nb-section" aria-labelledby={`h-${s.id}`}>
              <h2 id={`h-${s.id}`} className="ppl-h2 ppl-nb-section__title">
                <a href={notebookLink(topic.id, s.id)} className="ppl-nb-section__anchor">
                  {s.heading}
                </a>
              </h2>
              {s.blocks.map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </section>
          ))}

          <HowSure sure={topic.sure} />
          <TopicSources ids={topic.sources} />
          <PrevNext topic={topic} />
        </article>

        {showToc && (
          <aside className="ppl-nb-toc" aria-label="On this page">
            <p className="ppl-eyebrow">On this page</p>
            <ul role="list">
              {topic.sections.map((s) => (
                <li key={s.id}>
                  <a href={notebookLink(topic.id, s.id)}>{s.heading}</a>
                </li>
              ))}
              <li>
                <a href="#ppl-nb-sure-title" onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('ppl-nb-sure-title')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
                }}>
                  How sure are we?
                </a>
              </li>
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
