import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

export function RegisterPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="fw-page-heading">
        <h1>注册商家</h1>
      </div>
      <Button variant="outline" asChild>
        <Link to="/">返回登录</Link>
      </Button>
    </main>
  );
}
