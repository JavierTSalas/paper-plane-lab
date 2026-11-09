import { TOPIC_IDS, type TopicId } from '../ids';
import { folding } from './folding';
import { glossary } from './glossary';
import { howItWorks } from './how-it-works';
import { liftAndDrag } from './lift-and-drag';
import { paper } from './paper';
import { records } from './records';
import { reynolds } from './reynolds';
import { sources } from './sources';
import { stabilityAndTrim } from './stability-and-trim';
import type { Topic } from './types';
import { wind } from './wind';

const BY_ID: Record<TopicId, Topic> = {
  'how-it-works': howItWorks,
  'lift-and-drag': liftAndDrag,
  'stability-and-trim': stabilityAndTrim,
  reynolds,
  wind,
  paper,
  folding,
  records,
  glossary,
  sources,
};

/** Topics in reading order. */
export const TOPICS: readonly Topic[] = TOPIC_IDS.map((id) => BY_ID[id]);

export function getTopic(id: TopicId): Topic {
  return BY_ID[id];
}
