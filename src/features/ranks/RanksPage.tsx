import type { ReactElement } from 'react';
import { EmptyState } from '../../ui/EmptyState';

/** Placeholder until the ranks screen lands. */
export default function RanksPage(): ReactElement {
  return (
    <div className="ppl-page">
      <EmptyState icon="ranks" title="Ranks" body="Arenas with fixed conditions, and the best verified flights. This screen is being built." />
    </div>
  );
}
