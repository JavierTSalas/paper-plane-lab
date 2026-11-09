// Development-only entry: open /src/features/fold/view/dev.html on the Vite dev server. Not part of the build.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../ui/tokens.css';
import '../../../ui/base.css';
import ViewDemo from './ViewDemo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ViewDemo />
  </StrictMode>,
);
