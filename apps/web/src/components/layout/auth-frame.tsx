import type { ReactNode } from 'react';
import { APP_NAME } from '@libs/shared';

type AuthFrameProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

export function AuthFrame({ title, description, children }: AuthFrameProps) {
  return (
    <div className="fw-login">
      <header className="fw-login__header">
        <span className="fw-login__brand">{APP_NAME}</span>
        <span className="fw-login__meta">连锁门店运营</span>
      </header>
      <main className="fw-login__body">
        <section className="fw-login__intro" aria-labelledby="auth-title">
          <p className="fw-page-eyebrow">商家管理员入口</p>
          <h1 id="auth-title">{title}</h1>
          {description}
        </section>
        <section className="fw-login__sheet" aria-label={title}>
          {children}
        </section>
      </main>
      <footer className="fw-login__footer">
        <span>{APP_NAME}</span>
        <span>门店巡检平台</span>
      </footer>
    </div>
  );
}
