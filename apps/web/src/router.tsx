import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { HomePage } from './pages/home';
import { ConsolePage } from './pages/console';

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-balance text-2xl font-semibold">页面不存在</h1>
      <Link to="/" className="underline">
        返回首页
      </Link>
    </main>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

const consoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/console',
  component: ConsolePage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, consoleRoute]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
