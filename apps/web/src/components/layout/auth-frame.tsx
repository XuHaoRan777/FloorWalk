import type { ReactNode } from 'react';
import { APP_NAME } from '@libs/shared';
import { BrandMark } from '@/components/brand-mark';
import { AuthHero } from './auth-hero';

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
        <AuthHero />
        <section
          className="fw-login__sheet"
          aria-labelledby="fw-auth-form-title"
        >
          <div className="fw-login__form-head">
            <BrandMark size={28} />
            <div className="fw-login__form-copy">
              <h2 id="fw-auth-form-title">{title}</h2>
              {description && (
                <div className="fw-login__form-description">{description}</div>
              )}
            </div>
          </div>
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
