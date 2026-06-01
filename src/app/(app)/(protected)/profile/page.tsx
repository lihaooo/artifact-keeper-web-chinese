"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  User,
  Key,
  Shield,
  Lock,
  AlertTriangle,
  Info,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";

import { profileApi } from "@/lib/api/profile";
import { totpApi } from "@/lib/api/totp";
import type { TotpSetupResponse } from "@/lib/api/totp";
import { useAuth } from "@/providers/auth-provider";
import {
  toUserMessage,
  isPasswordReuseError,
  PASSWORD_REUSE_MESSAGE,
  mutationErrorToast,
} from "@/lib/error-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";

import { PageHeader } from "@/components/common/page-header";
import { CopyButton } from "@/components/common/copy-button";
import { PasswordPolicyHint } from "@/components/common/password-policy-hint";

// -- Profile Page --

export default function ProfilePage() {
  const { user, refreshUser, changePassword } = useAuth();

  // -- General tab state --
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  // -- Security tab state --
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // -- TOTP 2FA state --
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<TotpSetupResponse | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[] | null>(null);
  const [totpIsLoading, setTotpIsLoading] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [showTotpDisable, setShowTotpDisable] = useState(false);
  const [totpDisablePassword, setTotpDisablePassword] = useState("");
  const [totpDisableCode, setTotpDisableCode] = useState("");

  // -- Mutations --
  const profileMutation = useMutation({
    mutationFn: (data: { display_name?: string; email?: string }) =>
      profileApi.update(data),
    onSuccess: () => {
      refreshUser();
      toast.success("个人资料更新成功");
    },
    onError: mutationErrorToast("更新个人资料失败"),
  });

  const [passwordError, setPasswordError] = useState<string | null>(null);

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      toast.success("密码修改成功");
    },
    onError: (err: unknown) => {
      if (isPasswordReuseError(err)) {
        setPasswordError(PASSWORD_REUSE_MESSAGE);
        toast.error(PASSWORD_REUSE_MESSAGE);
      } else {
        const msg = toUserMessage(err, "修改密码失败。请检查当前密码是否正确。");
        setPasswordError(null);
        toast.error(msg);
      }
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="个人资料"
        description="管理您的账户设置、API 密钥和安全偏好。"
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <User className="size-4" />
            通用
          </TabsTrigger>
          <TabsTrigger value="api-keys">
            <Key className="size-4" />
            API 密钥
          </TabsTrigger>
          <TabsTrigger value="access-tokens">
            <Shield className="size-4" />
            访问令牌
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="size-4" />
            安全
          </TabsTrigger>
        </TabsList>

        {/* -- General Tab -- */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>个人信息</CardTitle>
              <CardDescription>
                更新您的显示名称和电子邮件地址。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  profileMutation.mutate({
                    display_name: displayName,
                    email,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="username">用户名</Label>
                  <Input
                    id="username"
                    value={user?.username ?? ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    用户名无法更改。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display-name">显示名称</Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="您的显示名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" disabled={profileMutation.isPending}>
                  {profileMutation.isPending ? "保存中..." : "保存更改"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -- API Keys Tab -- */}
        <TabsContent value="api-keys" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="size-5" />
                API 密钥
              </CardTitle>
              <CardDescription>
                API 密钥和访问令牌已移至独立页面以便管理。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/access-tokens">
                  <ExternalLink className="size-4" />
                  管理访问令牌
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -- Access Tokens Tab -- */}
        <TabsContent value="access-tokens" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-5" />
                访问令牌
              </CardTitle>
              <CardDescription>
                个人访问令牌已移至独立页面以便管理。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/access-tokens">
                  <ExternalLink className="size-4" />
                  管理访问令牌
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -- Security Tab -- */}
        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>修改密码</CardTitle>
              <CardDescription>
                更新您的密码。长度至少为 8 个字符。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newPassword !== confirmPassword) {
                    toast.error("两次输入的密码不一致");
                    return;
                  }
                  if (newPassword.length < 8) {
                    toast.error("密码长度至少为 8 个字符");
                    return;
                  }
                  passwordMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="current-password">当前密码</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="输入当前密码"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">新密码</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    placeholder="输入新密码"
                    required
                    minLength={8}
                    aria-invalid={!!passwordError}
                    aria-describedby={passwordError ? "new-password-error" : undefined}
                  />
                  <PasswordPolicyHint password={newPassword} />
                  {passwordError && (
                    <p id="new-password-error" className="text-sm text-destructive" role="alert">
                      {passwordError}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">确认新密码</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="确认新密码"
                    required
                  />
                </div>
                <Button type="submit" disabled={passwordMutation.isPending}>
                  {passwordMutation.isPending
                    ? "修改中..."
                    : "修改密码"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-5" />
                两步验证
              </CardTitle>
              <CardDescription>
                使用 TOTP 验证器应用添加额外的安全层。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user?.totp_enabled ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">已启用</Badge>
                    <span className="text-sm text-muted-foreground">
                      两步验证已激活
                    </span>
                  </div>
                  {!showTotpDisable ? (
                    <Button variant="destructive" size="sm" onClick={() => setShowTotpDisable(true)}>
                      禁用 2FA
                    </Button>
                  ) : (
                    <form
                      className="space-y-3 rounded-lg border p-4"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setTotpIsLoading(true);
                        setTotpError(null);
                        try {
                          await totpApi.disable(totpDisablePassword, totpDisableCode);
                          await refreshUser();
                          setShowTotpDisable(false);
                          setTotpDisablePassword("");
                          setTotpDisableCode("");
                          toast.success("两步验证已禁用");
                        } catch (err) {
                          setTotpError(toUserMessage(err, "禁用 2FA 失败"));
                        } finally {
                          setTotpIsLoading(false);
                        }
                      }}
                    >
                      <p className="text-sm font-medium">确认禁用 2FA</p>
                      {totpError && <p className="text-sm text-destructive">{totpError}</p>}
                      <div className="space-y-2">
                        <Label>密码</Label>
                        <Input
                          type="password"
                          value={totpDisablePassword}
                          onChange={(e) => setTotpDisablePassword(e.target.value)}
                          placeholder="您的密码"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>TOTP 验证码</Label>
                        <Input
                          value={totpDisableCode}
                          onChange={(e) => setTotpDisableCode(e.target.value)}
                          placeholder="6 位数字验证码"
                          maxLength={6}
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" variant="destructive" size="sm" disabled={totpIsLoading}>
                          {totpIsLoading ? "禁用中..." : "确认禁用"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setShowTotpDisable(false);
                          setTotpError(null);
                        }}>
                          取消
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              ) : totpBackupCodes ? (
                <div className="space-y-4">
                  <Alert>
                    <AlertTriangle className="size-4" />
                    <AlertTitle>保存您的备份码</AlertTitle>
                    <AlertDescription>
                      将这些代码保存在安全的地方。如果您无法访问验证器应用，每个备份码可以使用一次。
                    </AlertDescription>
                  </Alert>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted p-4">
                    {totpBackupCodes.map((code, i) => (
                      <code key={i} className="text-sm font-mono">{code}</code>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <CopyButton value={totpBackupCodes.join("\n")} />
                    <Button onClick={() => {
                      setTotpBackupCodes(null);
                      setShowTotpSetup(false);
                      setTotpSetupData(null);
                      setTotpVerifyCode("");
                    }}>
                      我已保存这些备份码
                    </Button>
                  </div>
                </div>
              ) : showTotpSetup && totpSetupData ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    使用您的验证器应用（Google Authenticator、Authy 等）扫描此二维码
                  </p>
                  <div className="flex justify-center rounded-lg border bg-white p-4">
                    <QRCode value={totpSetupData.qr_code_url} size={200} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">手动输入密钥</Label>
                    <div className="flex items-center gap-2 rounded border bg-muted px-3 py-2">
                      <code className="flex-1 break-all text-xs">{totpSetupData.secret}</code>
                      <CopyButton value={totpSetupData.secret} />
                    </div>
                  </div>
                  <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setTotpIsLoading(true);
                      setTotpError(null);
                      try {
                        const result = await totpApi.enable(totpVerifyCode);
                        setTotpBackupCodes(result.backup_codes);
                        await refreshUser();
                        toast.success("两步验证已启用");
                      } catch (err) {
                        setTotpError(toUserMessage(err, "验证码无效"));
                      } finally {
                        setTotpIsLoading(false);
                      }
                    }}
                  >
                    {totpError && <p className="text-sm text-destructive">{totpError}</p>}
                    <div className="space-y-2">
                      <Label>验证码</Label>
                      <Input
                        value={totpVerifyCode}
                        onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="输入 6 位数字验证码"
                        className="w-48 font-mono text-lg tracking-widest"
                        maxLength={6}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={totpIsLoading || totpVerifyCode.length < 6}>
                        {totpIsLoading ? "验证中..." : "启用 2FA"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => {
                        setShowTotpSetup(false);
                        setTotpSetupData(null);
                        setTotpVerifyCode("");
                        setTotpError(null);
                      }}>
                        取消
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <Button
                  onClick={async () => {
                    setTotpIsLoading(true);
                    try {
                      const data = await totpApi.setup();
                      setTotpSetupData(data);
                      setShowTotpSetup(true);
                    } catch (err) {
                      toast.error(toUserMessage(err, "启动 2FA 设置失败"));
                    } finally {
                      setTotpIsLoading(false);
                    }
                  }}
                  disabled={totpIsLoading}
                >
                  {totpIsLoading ? "设置中..." : "启用两步验证"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>会话</CardTitle>
              <CardDescription>
                管理您在各设备上的活跃会话。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="size-4" />
                <AlertTitle>活跃会话</AlertTitle>
                <AlertDescription>
                  您当前正在从此设备登录。会话管理将在未来版本中提供。
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
