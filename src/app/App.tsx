import { Suspense, useEffect, useRef, type ReactElement } from 'react';
import { Redirect, Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { setReducedMotionOverride } from '../ui/motion';
import { Spinner } from '../ui/Spinner';
import { ToastHost } from '../ui/Toast';
import { AppShell } from './AppShell';
import { HOME_PATH, ROUTES, WELCOME_PATH, type AppRoute } from './routes';
import { useLab } from './store';

function RouteFallback(): ReactElement {
  return (
    <div className="ppl-route-loading">
      <Spinner size={32} label="Loading screen" />
    </div>
  );
}

/** Title, scroll and focus housekeeping on navigation (not on the first load). */
function useRouteChange(route: AppRoute, location: string): void {
  const first = useRef(true);
  useEffect(() => {
    document.title = route.bare ? 'Paper Plane Lab' : `${route.title} · Paper Plane Lab`;
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById('ppl-main')?.focus({ preventScroll: true });
  }, [route, location]);
}

function RoutePage({ route }: { route: AppRoute }): ReactElement {
  const [location] = useLocation();
  useRouteChange(route, location);
  const Page = route.page;
  const page = (
    <Suspense fallback={<RouteFallback />}>
      <Page />
    </Suspense>
  );
  return route.bare ? page : <AppShell route={route}>{page}</AppShell>;
}

function Routes(): ReactElement {
  const onboarded = useLab((s) => s.profile.onboarded);
  const [location] = useLocation();
  const reducedMotion = useLab((s) => s.settings.reducedMotion);

  useEffect(() => setReducedMotionOverride(reducedMotion), [reducedMotion]);

  const publicPath = ROUTES.some((r) => r.public && location.startsWith(r.path.split('/:')[0]!));
  if (!onboarded && !publicPath) return <Redirect to={WELCOME_PATH} replace />;

  return (
    <Switch>
      {ROUTES.map((r) => (
        <Route key={r.path} path={r.path}>
          <RoutePage route={r} />
        </Route>
      ))}
      <Route>
        <Redirect to={onboarded ? HOME_PATH : WELCOME_PATH} replace />
      </Route>
    </Switch>
  );
}

export function App(): ReactElement {
  return (
    <Router hook={useHashLocation}>
      <Routes />
      <ToastHost />
    </Router>
  );
}
