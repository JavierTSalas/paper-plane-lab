import type { Topic } from './types';

/** The caveat stated once at the top of the source list. */
export const SOURCES_CAVEAT =
  'These are the sources listed in the lab’s eight research notes, reproduced as the notes give them. During the research, most of these pages could not be opened: the research tools were blocked from fetching them, so most claims were checked only against search-result text, re-derived by hand, or rest on model knowledge. A few sources (open-source code and some documentation) were read in full; the notes say which. Listing a source here means our notes cite it, not that we have read every word of it.';

export const sources: Topic = {
  id: 'sources',
  title: 'Sources',
  summary: 'Every source cited in our research notes, grouped by note, with links.',
  icon: 'notebook',
  tone: 'accent',
  sections: [
    {
      id: 'list',
      heading: 'Sources cited in our research notes',
      blocks: [{ kind: 'widget', id: 'source-list' }],
    },
  ],
  sure: {
    solid: ['The list is generated from the research notes and checked by a test, so nothing here is added or reworded beyond removing formatting marks.'],
    calibrated: [],
    unverified: ['Most entries were confirmed only through search-result text. Some links may have moved since.'],
  },
  sources: [],
};
