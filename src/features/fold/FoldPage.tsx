import type { ReactElement } from 'react';
import { EmptyState } from '../../ui/EmptyState';

/** Placeholder until the fold workbench screen lands. */
export default function FoldPage(): ReactElement {
  return (
    <div className="ppl-page">
      <EmptyState icon="fold" title="Fold workbench" body="Fold paper step by step, shape the wings and trim the plane. This screen is being built." />
    </div>
  );
}
