import type { IconName } from '../../../ui/icons';
import type { TopicId } from '../ids';
import type { DiagramId } from '../diagrams';

/**
 * Inline text with a small markup, rendered by RichText:
 * - `**bold**`
 * - `[[topic]]`, `[[topic|label]]`, `[[topic~anchor|label]]`: link to another topic
 * - `{{length:88.31}}`, `{{length:88.31|1}}`, also `speed`, `mass`, `area`, `wingLoading`: an SI value shown in the user's units (`|digits` optional)
 * - `{{info:Question?|Answer in one or two sentences.}}`: an InfoDot
 * - `C_L`: a letter, an underscore and letters or digits become a subscript. Write powers in Unicode (², ³).
 */
export type Inline = string;

export type CalloutTone = 'tip' | 'note' | 'caveat';

export type WidgetId = 'paper-sizes' | 'records' | 'source-list';

export type Block =
  | { kind: 'p'; text: Inline }
  | { kind: 'list'; items: Inline[] }
  | {
      kind: 'formula';
      /** Each line is set on its own row in the formula font. Plain Unicode; subscripts as in Inline. */
      lines: string[];
      /** "where ..." line under the formula. */
      where?: Inline;
      /** Optional InfoDot beside the formula. */
      info?: { label: string; text: Inline };
    }
  | { kind: 'diagram'; id: DiagramId; caption: Inline }
  | { kind: 'callout'; tone: CalloutTone; title: string; text: Inline }
  | { kind: 'terms'; items: { term: string; def: Inline }[] }
  | { kind: 'widget'; id: WidgetId };

export interface TopicSection {
  /** Anchor id within the topic, kebab-case. */
  id: string;
  heading: string;
  blocks: Block[];
}

/** The visible "How sure are we?" note. */
export interface Certainty {
  /** Textbook physics and exact arithmetic. */
  solid: Inline[];
  /** Engineering choices and calibrations made for the lab. */
  calibrated: Inline[];
  /** Values and claims the research could not check against the original source. */
  unverified: Inline[];
}

export type CardTone = 'accent' | 'sage' | 'sky' | 'mustard' | 'plum' | 'rose';

export interface Topic {
  id: TopicId;
  title: string;
  /** One or two sentences for the index card and the article lede. */
  summary: string;
  icon: IconName;
  tone: CardTone;
  sections: TopicSection[];
  sure: Certainty;
  /** Source ids from sources.json, `<doc>:<tag>`, e.g. `01:S15`. */
  sources: string[];
}
