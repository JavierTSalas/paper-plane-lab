import type { ReactElement } from 'react';
import { useRoute } from 'wouter';
import { buttonClass } from '../../ui/Button';
import { CardLink } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/icons';
import { Professor } from '../../ui/Professor';
import { Article } from './Article';
import { notebookLink, parseTopicParam } from './ids';
import { plainText } from './markup';
import { TOPICS } from './topics';
import type { Topic } from './topics/types';
import './Notebook.css';

/** Reading time at about 200 words a minute. */
function readMinutes(topic: Topic): number {
  let words = 0;
  const count = (s: string): void => {
    words += plainText(s).split(/\s+/).filter(Boolean).length;
  };
  for (const s of topic.sections)
    for (const b of s.blocks) {
      if (b.kind === 'p') count(b.text);
      else if (b.kind === 'list') b.items.forEach(count);
      else if (b.kind === 'callout') count(b.text);
      else if (b.kind === 'terms') b.items.forEach((t) => count(t.def));
    }
  return Math.max(1, Math.round(words / 200));
}

function TopicIndex(): ReactElement {
  const main = TOPICS.filter((t) => t.id !== 'glossary' && t.id !== 'sources');
  const reference = TOPICS.filter((t) => t.id === 'glossary' || t.id === 'sources');
  return (
    <div className="ppl-page ppl-nb-index">
      <header className="ppl-nb-hero">
        <Professor pose="talk" size={112} title="Professor Wren" className="ppl-nb-hero__prof" />
        <div>
          <p className="ppl-eyebrow">The Notebook</p>
          <h1 className="ppl-display ppl-nb-hero__title">How paper planes fly, and how the lab knows</h1>
          <p className="ppl-nb-hero__lede">
            Short notes in plain words, with pictures. Each one ends with what we are sure of, what we calibrated, and what we could not check.
          </p>
        </div>
      </header>

      <ul className="ppl-nb-grid" role="list">
        {main.map((t, i) => (
          <li key={t.id}>
            <CardLink href={notebookLink(t.id)} padding="md" className="ppl-nb-card">
              <span className={`ppl-nb-icon ppl-nb-icon--${t.tone}`} aria-hidden="true">
                <Icon name={t.icon} size={24} />
              </span>
              <span className="ppl-nb-card__body">
                <span className="ppl-nb-card__meta ppl-caption">
                  {String(i + 1).padStart(2, '0')} · {readMinutes(t)} min read
                </span>
                <span className="ppl-nb-card__title">{t.title}</span>
                <span className="ppl-nb-card__summary">{t.summary}</span>
              </span>
            </CardLink>
          </li>
        ))}
      </ul>

      <h2 className="ppl-eyebrow ppl-nb-index__sub">Reference</h2>
      <ul className="ppl-nb-grid ppl-nb-grid--ref" role="list">
        {reference.map((t) => (
          <li key={t.id}>
            <CardLink href={notebookLink(t.id)} padding="md" tone="sunken" className="ppl-nb-card">
              <span className={`ppl-nb-icon ppl-nb-icon--${t.tone}`} aria-hidden="true">
                <Icon name={t.icon} size={24} />
              </span>
              <span className="ppl-nb-card__body">
                <span className="ppl-nb-card__title">{t.title}</span>
                <span className="ppl-nb-card__summary">{t.summary}</span>
              </span>
            </CardLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Notebook: topic index at /notebook, an article at /notebook/:topic (optionally `topic~section`). */
export default function NotebookPage(): ReactElement {
  const [, params] = useRoute<{ topic?: string }>('/notebook/:topic?');
  const raw = params?.topic;
  if (!raw) return <TopicIndex />;
  const parsed = parseTopicParam(raw);
  if (!parsed) {
    return (
      <div className="ppl-page">
        <EmptyState
          icon="notebook"
          title="No such page in the Notebook"
          body="That topic may have moved. Every topic is listed on the Notebook's first page."
          actions={
            <a className={buttonClass({ variant: 'primary' })} href={notebookLink()}>
              See all topics
            </a>
          }
        />
      </div>
    );
  }
  const topic = TOPICS.find((t) => t.id === parsed.topic);
  if (!topic) return <TopicIndex />;
  return <Article key={topic.id} topic={topic} anchor={parsed.anchor} />;
}
