import { Suspense, useEffect, useRef, type ReactElement } from 'react';
import { Redirect, Route, Router, Switch, matchRoute, useLocation, useRouter } from 'wouter';
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

/** Scroll to top and move focus to the page when the location changes (not on the first load). */
function useNavigationFocus(location: string): void {
  const previous = useRef(location);
  useEffect(() => {
    if (previous.current === location) return;
    previous.current = location;
    window.scrollTo(0, 0);
    document.getElementById('ppl-main')?.focus({ preventScroll: true });
  }, [location]);
}

function RoutePage({ route }: { route: AppRoute }): ReactElement {
  const Page = route.page;
  return (
    <Suspense fallback={<RouteFallback />}>
      <Page />
    </Suspense>
  );
}

function Routes(): ReactElement {
  const onboarded = useLab((s) => s.profile.onboarded);
  const reducedMotion = useLab((s) => s.settings.reducedMotion);
  const [location] = useLocation();
  const { parser } = useRouter();
  const route = ROUTES.find((r) => matchRoute(parser, r.path, location)[0]);
  useNavigationFocus(location);

  useEffect(() => setReducedMotionOverride(reducedMotion), [reducedMotion]);
  useEffect(() => {
    if (route) document.title = route.bare ? 'Paper Plane Lab' : `${route.title} · Paper Plane Lab`;
  }, [route]);

  if (!route) return <Redirect to={onboarded ? HOME_PATH : WELCOME_PATH} replace />;
  if (!onboarded && !route.public) return <Redirect to={WELCOME_PATH} replace />;

  const pages = (
    <Switch>
      {ROUTES.map((r) => (
        <Route key={r.path} path={r.path}>
          <RoutePage route={r} />
        </Route>
      ))}
    </Switch>
  );
  // One persistent shell around every chromed route, so the nav and open sheets survive navigation.
  return route.bare ? pages : <AppShell route={route}>{pages}</AppShell>;
}

export function App(): ReactElement {
  return (
    <Router hook={useHashLocation}>
      <Routes />
      <ToastHost />
    </Router>
  );
}
