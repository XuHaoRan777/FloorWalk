import { APP_NAME } from '@libs/shared';
import { Link } from '@tanstack/react-router';
import { House, LayoutDashboard } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';

export function ConsolePage() {
  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4"
      >
        跳到主要内容
      </a>
      <Sidebar variant="inset">
        <SidebarHeader>
          <Link to="/" className="px-2 py-3 text-lg font-semibold">
            {APP_NAME}
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="控制台导航" className="p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive>
                  <Link to="/console">
                    <LayoutDashboard aria-hidden="true" />
                    <span>控制台演示</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/">
                    <House aria-hidden="true" />
                    <span>公开首页</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="@container/content">
        <Header>
          <span className="text-sm text-muted-foreground">控制台演示</span>
        </Header>
        <Main id="main">
          <p className="mb-6 rounded-md border bg-muted px-4 py-3 text-pretty text-sm">
            演示骨架，尚未接入登录
          </p>
          <h1 className="text-balance text-3xl font-semibold">
            {APP_NAME} 控制台
          </h1>
          <p className="mt-3 max-w-xl text-pretty leading-7 text-muted-foreground">
            这里只展示控制台布局。门店、巡检和审核功能尚未开放，暂无业务数据。
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/">返回公开首页</Link>
          </Button>
        </Main>
      </SidebarInset>
    </SidebarProvider>
  );
}
