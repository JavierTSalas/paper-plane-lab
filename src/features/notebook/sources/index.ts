import type { SourceEntry, SourceGroup } from './parse';
import data from './sources.json';

export type { SourceEntry, SourceGroup } from './parse';

export const SOURCE_GROUPS: readonly SourceGroup[] = data;

const BY_ID = new Map<string, { entry: SourceEntry; group: SourceGroup }>();
for (const group of SOURCE_GROUPS) for (const entry of group.entries) BY_ID.set(entry.id, { entry, group });

export function getSource(id: string): { entry: SourceEntry; group: SourceGroup } | undefined {
  return BY_ID.get(id);
}

/** DOM id of a source in the Sources topic, e.g. `src-01-S15`. */
export function sourceAnchor(id: string): string {
  return `src-${id.replace(':', '-')}`;
}
