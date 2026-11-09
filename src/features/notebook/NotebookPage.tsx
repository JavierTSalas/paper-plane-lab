import type { ReactElement } from 'react';
import { EmptyState } from '../../ui/EmptyState';

/** Placeholder until the notebook screen lands. */
export default function NotebookPage(): ReactElement {
  return (
    <div className="ppl-page">
      <EmptyState icon="notebook" title="Notebook" body="Short explanations of how the lab works, and every source. This screen is being built." />
    </div>
  );
}
