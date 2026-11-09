/** Notebook topic ids in reading order. Kept free of content so any screen can import it cheaply. */
export const TOPIC_IDS = [
  'how-it-works',
  'lift-and-drag',
  'stability-and-trim',
  'reynolds',
  'wind',
  'paper',
  'folding',
  'records',
  'glossary',
  'sources',
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export function isTopicId(value: string): value is TopicId {
  return (TOPIC_IDS as readonly string[]).includes(value);
}

/** Separator between topic and section anchor in the route param. `~` survives encodeURIComponent. */
export const ANCHOR_SEP = '~';

/**
 * The route param for a topic, optionally pointing at a section: `wind` or `wind~gusts`.
 * Pass this as InfoDot's `topic` prop.
 */
export function notebookTopicParam(topic: TopicId, anchor?: string): string {
  return anchor ? `${topic}${ANCHOR_SEP}${anchor}` : topic;
}

/** Hash href to a Notebook topic (and section): `#/notebook/wind~gusts`. Without a topic: the index. */
export function notebookLink(topic?: TopicId, anchor?: string): string {
  return topic ? `#/notebook/${notebookTopicParam(topic, anchor)}` : '#/notebook';
}

/** Splits a route param back into topic and anchor. Unknown topics give null. */
export function parseTopicParam(param: string | undefined): { topic: TopicId; anchor?: string } | null {
  if (!param) return null;
  let raw = param;
  try {
    raw = decodeURIComponent(param);
  } catch {
    // keep the raw param
  }
  const [topic, anchor] = raw.split(/[~#?]/, 2);
  if (!isTopicId(topic)) return null;
  return anchor ? { topic, anchor } : { topic };
}
