"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/admin";
import { settingsApi } from "@/lib/api/settings";
import { ADMIN_SETTINGS_QUERY_KEY, useAdminSettings } from "@/hooks/use-admin-settings";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import { Server, HardDrive, Lock, Info, Mail, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PageHeader } from "@/components/common/page-header";
import type { PasswordPolicy, SmtpConfig, SmtpTlsMode, StorageSettings } from "@/lib/api/settings";

// -- helpers --

function SettingRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Input value={value} disabled className="bg-muted/50" />
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function formatPasswordPolicy(policy: PasswordPolicy | undefined): string {
  if (!policy) return "加载中...";
  const parts = [`最少 ${policy.min_length} 个字符`];
  const complexity: string[] = [];
  if (policy.require_uppercase) complexity.push("uppercase");
  if (policy.require_lowercase) complexity.push("lowercase");
  if (policy.require_digit) complexity.push("number");
  if (policy.require_special) complexity.push("special character");
  if (complexity.length > 0) {
    parts.push(`requires ${complexity.join(", ")}`);
  }
  if (policy.history_count > 0) {
    parts.push(`${policy.history_count} password history`);
  }
  return parts.join("; ");
}

const STORAGE_BACKEND_LABELS: Record<string, string> = {
  filesystem: "本地文件系统",
  s3: "S3",
  gcs: "Google Cloud Storage",
  azure: "Azure Blob Storage",
};

function formatStorageBackend(backend: string): string {
  return STORAGE_BACKEND_LABELS[backend] ?? backend;
}

// -- SMTP settings tab --

function SmtpSettingsTab() {
  // Shares one in-flight request and cache entry with SettingsPage's
  // top-level call (#349). The shared hook is the dedup invariant.
  const { data: settings, isLoading, isError, error, dataUpdatedAt } =
    useAdminSettings();
  const smtpConfig = settings?.smtpConfig;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !smtpConfig) {
    // `!smtpConfig` is logically dead once isLoading and isError are
    // handled (the success path always returns an object), but stating
    // it makes the invariant load-bearing for the type narrowing below
    // and for any future maintainer reading the render flow (R3, #347).
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="destructive">
            <AlertTitle>SMTP 配置不可用</AlertTitle>
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "无法从服务器加载 SMTP 配置。"}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Remount the form when query data changes so initial state resets
  // without needing setState inside an effect.
  return <SmtpSettingsForm key={dataUpdatedAt} initialConfig={smtpConfig} />;
}

function SmtpSettingsForm({
  initialConfig,
}: {
  initialConfig: SmtpConfig | undefined;
}) {
  const queryClient = useQueryClient();

  const [host, setHost] = useState(initialConfig?.host ?? "");
  const [port, setPort] = useState(String(initialConfig?.port ?? 587));
  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState("");
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [fromAddress, setFromAddress] = useState(
    initialConfig?.from_address ?? ""
  );
  const [tlsMode, setTlsMode] = useState<SmtpTlsMode>(
    initialConfig?.tls_mode ?? "starttls"
  );
  const [test收件人, setTest收件人] = useState("");
  const [formDirty, setFormDirty] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (config: SmtpConfig) => settingsApi.updateSmtpConfig(config),
    onSuccess: () => {
      toast.success("SMTP 配置已保存");
      queryClient.invalidateQueries({ queryKey: ADMIN_SETTINGS_QUERY_KEY });
      setFormDirty(false);
    },
    onError: mutationErrorToast("保存 SMTP 配置失败"),
  });

  const testMutation = useMutation({
    mutationFn: (recipient: string) => settingsApi.sendTestEmail(recipient),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message || "测试邮件发送成功");
      } else {
        toast.error(result.message || "测试邮件发送失败");
      }
    },
    onError: mutationErrorToast("发送测试邮件失败"),
  });

  function handleFieldChange<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setFormDirty(true);
    };
  }

  function handleSave() {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast.error("端口必须是 1 到 65535 之间的数字");
      return;
    }
    if (!host.trim()) {
      toast.error("SMTP 主机为必填项");
      return;
    }
    if (!fromAddress.trim()) {
      toast.error("发件人地址为必填项");
      return;
    }
    const payload: Record<string, unknown> = {
      host: host.trim(),
      port: portNum,
      username: username.trim(),
      from_address: fromAddress.trim(),
      tls_mode: tlsMode,
    };
    if (passwordDirty) {
      payload.password = password;
    }
    saveMutation.mutate(payload as unknown as SmtpConfig);
  }

  function handleSendTest() {
    if (!test收件人.trim()) {
      toast.error("请输入收件人邮箱地址");
      return;
    }
    testMutation.mutate(test收件人.trim());
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMTP 配置</CardTitle>
          <CardDescription>
            配置用于通知、密码重置和其他系统邮件的出站邮件服务器。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-host">主机</Label>
              <Input
                id="smtp-host"
                placeholder="smtp.example.com"
                value={host}
                onChange={(e) => handleFieldChange(setHost)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                SMTP 服务器的主机名或 IP 地址。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">端口</Label>
              <Input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                placeholder="587"
                value={port}
                onChange={(e) => handleFieldChange(setPort)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                常用端口：25 (SMTP)、465 (SMTPS)、587 (提交)。
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-username">用户名</Label>
              <Input
                id="smtp-username"
                placeholder="user@example.com"
                autoComplete="off"
                value={username}
                onChange={(e) => handleFieldChange(setUsername)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                如果服务器不需要认证，请留空。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-password">密码</Label>
              <Input
                id="smtp-password"
                type="password"
                placeholder="********"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordDirty(true);
                  setFormDirty(true);
                }}
              />
              <p className="text-xs text-muted-foreground">
                在服务器上加密存储。留空以保留现有值。
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-from">发件人地址</Label>
              <Input
                id="smtp-from"
                type="email"
                placeholder="noreply@example.com"
                value={fromAddress}
                onChange={(e) => handleFieldChange(setFromAddress)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                外发邮件中使用的发件人地址。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-tls">TLS 模式</Label>
              <Select
                value={tlsMode}
                onValueChange={(v) => handleFieldChange(setTlsMode)(v as SmtpTlsMode)}
              >
                <SelectTrigger id="smtp-tls">
                  <SelectValue placeholder="Select TLS mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无</SelectItem>
                  <SelectItem value="starttls">STARTTLS</SelectItem>
                  <SelectItem value="tls">TLS</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                STARTTLS 升级未加密的连接。TLS 从一开始就使用加密连接。
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !formDirty}
            >
              {saveMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              保存 SMTP 设置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">发送测试邮件</CardTitle>
          <CardDescription>
            通过发送测试邮件验证 SMTP 配置。测试前请先保存待处理的更改。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="test-recipient">收件人</Label>
              <Input
                id="test-recipient"
                type="email"
                placeholder="admin@example.com"
                value={test收件人}
                onChange={(e) => setTest收件人(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleSendTest}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              发送测试邮件
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// -- page --

export default function SettingsPage() {
  const { user } = useAuth();
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => adminApi.getHealth(),
  });

  // One bundled fetch for /api/v1/admin/settings instead of three separate
  // queries (one per slice). The SmtpSettingsTab below shares this same
  // query via the same hook. See #349.
  const {
    data: adminSettings,
    isError: settingsError,
    isLoading: settingsLoading,
  } = useAdminSettings();

  const passwordPolicy = adminSettings?.passwordPolicy;
  const storageSettings = adminSettings?.storageSettings;

  // Render the storage row value, distinguishing loading from error so an
  // API failure doesn't silently fall back to placeholder strings (#334).
  const storageValue = (format: (s: StorageSettings) => string): string => {
    if (settingsLoading) return "加载中...";
    if (settingsError || !storageSettings) return "不可用";
    return format(storageSettings);
  };

  // Same loading/error/value gating as storageValue, applied to the
  // password-policy row so a backend outage shows "不可用" instead
  // of plausible-looking default policy text (#347).
  function passwordPolicyValue(): string {
    if (settingsLoading) return "加载中...";
    if (settingsError || !passwordPolicy) return "不可用";
    return formatPasswordPolicy(passwordPolicy);
  }

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="设置" />
        <Alert variant="destructive">
          <AlertTitle>访问被拒绝</AlertTitle>
          <AlertDescription>
            您必须是管理员才能查看设置。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="设置"
        description="系统配置概览。设置通过环境变量配置并以只读方式显示。"
      />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>只读配置</AlertTitle>
        <AlertDescription>
          Server settings are configured via environment variables. The values
          以下显示的值反映当前运行时配置。
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Server className="size-4 mr-1.5" />
            常规
          </TabsTrigger>
          <TabsTrigger value="storage">
            <HardDrive className="size-4 mr-1.5" />
            存储
          </TabsTrigger>
          <TabsTrigger value="auth">
            <Lock className="size-4 mr-1.5" />
            认证
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="size-4 mr-1.5" />
            邮件
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">常规设置</CardTitle>
              <CardDescription>
                核心服务器配置和版本信息。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="API URL"
                value={
                  typeof window !== "undefined"
                    ? process.env.NEXT_PUBLIC_API_URL || window.location.origin
                    : "加载中..."
                }
                description="前端用于访问 API 服务器的基础 URL。"
              />
              <Separator />
              <SettingRow
                label="服务器版本"
                value={
                  health?.version
                    ? health.dirty && health.commit
                      ? `${health.version} (${health.commit.slice(0, 7)})`
                      : health.version
                    : "..."
                }
                description="当前 Artifact Keeper 服务器版本。"
              />
              <Separator />
              <SettingRow
                label="Web 版本"
                value={
                  process.env.NEXT_PUBLIC_APP_VERSION?.includes("-") &&
                  process.env.NEXT_PUBLIC_GIT_SHA &&
                  process.env.NEXT_PUBLIC_GIT_SHA !== "unknown"
                    ? `${process.env.NEXT_PUBLIC_APP_VERSION} (${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)})`
                    : process.env.NEXT_PUBLIC_APP_VERSION ?? "..."
                }
                description="当前 Web 前端版本。"
              />
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm">环境</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">生产环境</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">存储设置</CardTitle>
              <CardDescription>
                制品存储后端和路径配置。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="存储后端"
                value={storageValue((s) => formatStorageBackend(s.storage_backend))}
                description="用于制品数据的存储后端类型。"
              />
              <Separator />
              <SettingRow
                label="存储路径"
                value={storageValue((s) => s.storage_path)}
                description="制品文件存储的文件系统路径（当存储后端为本地时）。"
              />
              <Separator />
              <SettingRow
                label="最大上传大小"
                value={storageValue((s) => formatBytes(s.max_upload_size_bytes))}
                description="单个制品上传的最大允许大小。"
              />
              <Separator />
              {/* TODO(#334): swap for storageSettings.deduplication once the backend
                  exposes it on /api/v1/admin/settings. Until then this row is a
                  build-time invariant (always SHA-256 content addressing). */}
              <SettingRow
                label="去重"
                value="Enabled (SHA-256)"
                description="内容寻址存储，避免存储重复制品。"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">认证设置</CardTitle>
              <CardDescription>
                用于用户认证的令牌和会话配置。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="认证方式"
                value="JWT (JSON Web Token)"
                description="用于认证 API 请求的方式。"
              />
              <Separator />
              <SettingRow
                label="访问令牌有效期"
                value="1 小时"
                description="访问令牌在需要刷新前保持有效的时间。"
              />
              <Separator />
              <SettingRow
                label="刷新令牌有效期"
                value="7 天"
                description="刷新令牌保持有效的时间。"
              />
              <Separator />
              <SettingRow
                label="密码策略"
                value={passwordPolicyValue()}
                description="用户账号的最低密码要求。"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <SmtpSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
