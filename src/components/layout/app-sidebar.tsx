"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Boxes,
  Hammer,
  Globe,
  RefreshCw,
  Puzzle,
  Webhook,
  ArrowRightLeft,
  Bot,
  BookOpen,
  GitPullRequestArrow,
  Key,
  Shield,
  ShieldCheck,
  Search,
  FileCheck,
  Lock,
  Users,
  UsersRound,
  HardDrive,
  KeyRound,
  Settings,
  BarChart3,
  Recycle,
  Radio,
  Activity,
  HeartPulse,
  Scale,
  FolderSearch,
  ClipboardCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { adminApi } from "@/lib/api/admin";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const overviewItems: NavItem[] = [
  { title: "仪表盘", href: "/", icon: LayoutDashboard },
];

const artifactItems: NavItem[] = [
  { title: "仓库", href: "/repositories", icon: Database },
  { title: "包", href: "/packages", icon: Boxes },
  { title: "构建", href: "/builds", icon: Hammer },
  { title: "暂存", href: "/staging", icon: GitPullRequestArrow },
  { title: "安装指南", href: "/setup", icon: BookOpen },
];

const integrationItems: NavItem[] = [
  { title: "对等节点", href: "/peers", icon: Globe },
  { title: "复制", href: "/replication", icon: RefreshCw },
  { title: "插件", href: "/plugins", icon: Puzzle },
  { title: "Webhook", href: "/webhooks", icon: Webhook },
  { title: "访问令牌", href: "/access-tokens", icon: Key },
  { title: "迁移", href: "/migration", icon: ArrowRightLeft },
];

const securityItems: NavItem[] = [
  { title: "仪表盘", href: "/security", icon: Shield },
  { title: "扫描结果", href: "/security/scans", icon: Search },
  { title: "DT 项目", href: "/security/dt-projects", icon: FolderSearch },
  { title: "质量门", href: "/quality-gates", icon: ShieldCheck },
  { title: "策略", href: "/security/policies", icon: FileCheck },
  { title: "许可证策略", href: "/license-policies", icon: Scale },
  { title: "权限", href: "/permissions", icon: Lock },
];

const operationsItems: NavItem[] = [
  { title: "分析", href: "/analytics", icon: BarChart3 },
  { title: "审批", href: "/approvals", icon: ClipboardCheck },
  { title: "健康状态", href: "/system-health", icon: HeartPulse },
  { title: "生命周期", href: "/lifecycle", icon: Recycle },
  { title: "监控", href: "/monitoring", icon: Activity },
  { title: "遥测", href: "/telemetry", icon: Radio },
];

const adminItems: NavItem[] = [
  { title: "用户", href: "/users", icon: Users },
  { title: "用户组", href: "/groups", icon: UsersRound },
  { title: "服务账号", href: "/service-accounts", icon: Bot },
  { title: "备份", href: "/backups", icon: HardDrive },
  { title: "SSO 提供商", href: "/settings/sso", icon: KeyRound },
  { title: "设置", href: "/settings", icon: Settings },
];

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={pathname === item.href}
              tooltip={item.title}
            >
              <Link href={item.href}>
                <item.icon className="size-4" />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.is_admin ?? false;

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => adminApi.getHealth(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // For integration items, non-admin authenticated users don't see Migration
  const visibleIntegrationItems = isAdmin
    ? integrationItems
    : integrationItems.filter((item) => item.href !== "/migration");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <Image
                  src="/logo-48.png"
                  alt="Artifact Keeper"
                  width={32}
                  height={32}
                  className="rounded-md"
                />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Artifact Keeper</span>
                  <span className="text-xs text-muted-foreground">
                    Web {process.env.NEXT_PUBLIC_APP_VERSION}
                    {process.env.NEXT_PUBLIC_APP_VERSION?.includes("-") &&
                    process.env.NEXT_PUBLIC_GIT_SHA &&
                    process.env.NEXT_PUBLIC_GIT_SHA !== "unknown"
                      ? ` (${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)})`
                      : ""}
                    {health?.version ? ` / 服务器 ${health.version}` : ""}
                    {health?.dirty && health?.commit
                      ? ` (${health.commit.slice(0, 7)})`
                      : ""}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="pb-4">
        <NavGroup label="概览" items={overviewItems} pathname={pathname} />
        <NavGroup label="制品" items={artifactItems} pathname={pathname} />
        {isAuthenticated && (
          <NavGroup
            label="集成"
            items={visibleIntegrationItems}
            pathname={pathname}
          />
        )}
        {isAdmin && (
          <>
            <NavGroup
              label="安全"
              items={securityItems}
              pathname={pathname}
            />
            <NavGroup
              label="运维"
              items={operationsItems}
              pathname={pathname}
            />
            <NavGroup
              label="管理"
              items={adminItems}
              pathname={pathname}
            />
          </>
        )}
      </SidebarContent>
      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  );
}
