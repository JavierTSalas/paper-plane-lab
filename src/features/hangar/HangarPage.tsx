import type { ReactElement } from 'react';
import { EmptyState } from '../../ui/EmptyState';

/** Placeholder until the hangar screen lands. */
export default function HangarPage(): ReactElement {
  return (
    <div className="ppl-page">
      <EmptyState icon="hangar" title="Hangar" body="Your folded planes and the preset library will live here. This screen is being built." />
    </div>
  );
}
