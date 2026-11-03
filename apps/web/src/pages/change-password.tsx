import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

export function ChangePasswordPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="fw-page-heading">
        <h1>修改密码</h1>
      </div>
      <Button variant="outline" asChild>
        <Link to="/console">返回工作台</Link>
      </Button>
    </main>
  );
}
