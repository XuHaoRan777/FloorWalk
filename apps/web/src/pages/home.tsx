import { APP_NAME } from '@libs/shared';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

export function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <span className="text-lg font-semibold">{APP_NAME}</span>
          <span className="text-sm text-muted-foreground">工程演示</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-20">
        <p className="mb-4 text-pretty text-sm text-muted-foreground">
          连锁门店巡检
        </p>
        <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-tight sm:text-5xl">
          让每一次巡检都有据可循。
        </h1>
        <p className="mt-6 max-w-xl text-pretty leading-7 text-muted-foreground">
          店员现场记录，主管审核，总部了解门店情况。当前为工程骨架，业务功能尚未开放。
        </p>
        <Button asChild className="mt-8">
          <Link to="/console">查看控制台演示</Link>
        </Button>
      </main>
    </div>
  );
}
