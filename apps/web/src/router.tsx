import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { HomePage } from './pages/home';
import { ConsolePage } from './pages/console';
import { DesignSamplesPage } from './pages/design-samples';
import { RegisterPage } from './pages/register';
import { ChangePasswordPage } from './pages/change-password';
import { ForgotPasswordPage } from './pages/forgot-password';
import { Button } from './components/ui/button';
import { ArrowRight, FileQuestion } from 'lucide-react';

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="fw-not-found">
      <section className="fw-not-found__content">
        <p className="fw-not-found__code">404</p>
        <FileQuestion className="fw-not-found__icon" aria-hidden="true" />
        <h1>页面不存在</h1>
        <p>检查地址，或返回工作台继续管理门店巡检。</p>
        <Button asChild>
          <Link to="/">
            返回首页
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
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

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

const changePasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/change-password',
  component: ChangePasswordPage,
});

const designSamplesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/_design-samples',
  component: DesignSamplesPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    consoleRoute,
    registerRoute,
    forgotPasswordRoute,
    changePasswordRoute,
    designSamplesRoute,
  ]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
