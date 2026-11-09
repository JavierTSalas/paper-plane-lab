import type { ReactElement } from 'react';
import { EmptyState } from '../../ui/EmptyState';

/** Placeholder until the wind tunnel screen lands. */
export default function TunnelPage(): ReactElement {
  return (
    <div className="ppl-page">
      <EmptyState icon="tunnel" title="Wind tunnel" body="Watch the air flow past your plane and read lift, drag and stability. This screen is being built." />
    </div>
  );
}
