"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  ToggleLeft,
  ToggleRight,
  Globe,
  Server,
  FileKey,
  Loader2,
  CheckCircle,
  Plug,
} from "lucide-react";

import { useAuth } from "@/providers/auth-provider";
import { ssoApi } from "@/lib/api/sso";
import { toUserMessage, mutationErrorToast } from "@/lib/error-utils";
import type {
  OidcConfig,
  LdapConfig,
  SamlConfig,
  UpdateOidcConfigRequest,
  UpdateLdapConfigRequest,
  UpdateSamlConfigRequest,
} from "@/types/sso";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// OIDC Tab
// ---------------------------------------------------------------------------

function OidcTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OidcConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OidcConfig | null>(null);

  const [name, setName] = useState("");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, set范围] = useState("openid profile email");
  const [autoCreateUsers, setAutoCreateUsers] = useState(true);
  const [usernameClaim, setUsernameClaim] = useState("preferred_username");
  const [emailClaim, setEmailClaim] = useState("email");
  const [displayNameClaim, setDisplayNameClaim] = useState("name");
  const [groupsClaim, setGroupsClaim] = useState("groups");
  const [adminGroup, setAdminGroup] = useState("");

  const { data: configs, isLoading } = useQuery({
    queryKey: ["sso", "oidc"],
    queryFn: ssoApi.listOidc,
  });

  const createMutation = useMutation({
    mutationFn: ssoApi.createOidc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("OIDC 提供商创建成功");
      closeDialog();
    },
    onError: mutationErrorToast("创建 OIDC 提供商失败"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOidcConfigRequest }) =>
      ssoApi.updateOidc(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("OIDC 提供商更新成功");
      closeDialog();
    },
    onError: mutationErrorToast("更新 OIDC 提供商失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: ssoApi.deleteOidc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("OIDC 提供商已删除");
      setDeleteTarget(null);
    },
    onError: mutationErrorToast("删除 OIDC 提供商失败"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableOidc(id) : ssoApi.enableOidc(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("OIDC 提供商状态已更新");
    },
    onError: mutationErrorToast("切换 OIDC 提供商失败"),
  });

  function resetForm() {
    setName("");
    setIssuerUrl("");
    setClientId("");
    setClientSecret("");
    set范围("openid profile email");
    setAutoCreateUsers(true);
    setUsernameClaim("preferred_username");
    setEmailClaim("email");
    setDisplayNameClaim("name");
    setGroupsClaim("groups");
    setAdminGroup("");
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(config: OidcConfig) {
    setEditTarget(config);
    setName(config.name);
    setIssuerUrl(config.issuer_url);
    setClientId(config.client_id);
    setClientSecret("");
    set范围(config.scopes.join(" "));
    setAutoCreateUsers(config.auto_create_users);
    setUsernameClaim(config.attribute_mapping?.username || "preferred_username");
    setEmailClaim(config.attribute_mapping?.email || "email");
    setDisplayNameClaim(config.attribute_mapping?.display_name || "name");
    setGroupsClaim(config.attribute_mapping?.groups || "groups");
    setAdminGroup(config.attribute_mapping?.admin_group || "");
    setDialogOpen(true);
  }

  function handleSubmit() {
    // #406: When editing an existing provider, preserve attribute_mapping
    // entries the form doesn't render (e.g. backend-managed keys set via
    // env vars such as the OIDC redirect_uri claim). The form only knows
    // about five fields, but the column is a JSONB blob — without the
    // spread, the PUT wipes everything else server-side.
    //
    // On create there's nothing to preserve, so start fresh.
    const attributeMapping: Record<string, string> = {
      ...(editTarget?.attribute_mapping ?? {}),
      username: usernameClaim,
      email: emailClaim,
      display_name: displayNameClaim,
      groups: groupsClaim,
    };
    if (adminGroup) {
      attributeMapping.admin_group = adminGroup;
    } else {
      // Empty admin_group means the operator deliberately cleared it —
      // drop the key so it isn't carried over from the previous state.
      delete attributeMapping.admin_group;
    }

    const scopeList = scopes
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (editTarget) {
      const data: UpdateOidcConfigRequest = {
        name,
        issuer_url: issuerUrl,
        client_id: clientId,
        scopes: scopeList,
        attribute_mapping: attributeMapping,
        auto_create_users: autoCreateUsers,
      };
      if (clientSecret) {
        data.client_secret = clientSecret;
      }
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate({
        name,
        issuer_url: issuerUrl,
        client_id: clientId,
        client_secret: clientSecret,
        scopes: scopeList,
        attribute_mapping: attributeMapping,
        auto_create_users: autoCreateUsers,
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">OIDC 提供商</CardTitle>
            <CardDescription>
              用于联合认证的 OpenID Connect 提供商。
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            添加提供商
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>Issuer URL</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {config.issuer_url}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground font-mono text-xs">
                      {config.client_id}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={config.is_enabled ? "活跃" : "已禁用"}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`${config.is_enabled ? "禁用" : "启用"} OIDC 提供商 ${config.name}`}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: config.id,
                              enabled: config.is_enabled,
                            })
                          }
                        >
                          {config.is_enabled ? (
                            <ToggleRight className="size-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`编辑 OIDC 提供商 ${config.name}`}
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={`删除 OIDC 提供商 ${config.name}`}
                          onClick={() => setDeleteTarget(config)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Globe className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                尚未配置 OIDC 提供商。
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                添加 OIDC 提供商
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "编辑 OIDC 提供商" : "添加 OIDC 提供商"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "更新 OpenID Connect 提供商配置。"
                : "配置新的 OpenID Connect 提供商用于 SSO。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="oidc-name">名称</Label>
              <Input
                id="oidc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Google Workspace"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-issuer">Issuer URL</Label>
              <Input
                id="oidc-issuer"
                value={issuerUrl}
                onChange={(e) => setIssuerUrl(e.target.value)}
                placeholder="https://accounts.google.com"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-client-id">Client ID</Label>
              <Input
                id="oidc-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="your-client-id"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-client-secret">客户端密钥</Label>
              <Input
                id="oidc-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  editTarget ? "留空以保留现有值" : "your-client-secret"
                }
                aria-required={!editTarget}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-scopes">范围</Label>
              <Input
                id="oidc-scopes"
                value={scopes}
                onChange={(e) => set范围(e.target.value)}
                placeholder="openid profile email"
              />
              <p className="text-xs text-muted-foreground">
                以空格分隔的 OAuth 范围列表。
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="oidc-auto-create-users">自动创建用户</Label>
                <p className="text-xs text-muted-foreground">
                  首次登录时自动创建用户账号。
                </p>
              </div>
              <Switch
                id="oidc-auto-create-users"
                checked={autoCreateUsers}
                onCheckedChange={setAutoCreateUsers}
              />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">属性映射</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-username">用户名声明</Label>
                  <Input
                    id="oidc-claim-username"
                    value={usernameClaim}
                    onChange={(e) => setUsernameClaim(e.target.value)}
                    placeholder="preferred_username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-email">邮箱声明</Label>
                  <Input
                    id="oidc-claim-email"
                    value={emailClaim}
                    onChange={(e) => setEmailClaim(e.target.value)}
                    placeholder="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-display">显示名称声明</Label>
                  <Input
                    id="oidc-claim-display"
                    value={displayNameClaim}
                    onChange={(e) => setDisplayNameClaim(e.target.value)}
                    placeholder="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-groups">组声明</Label>
                  <Input
                    id="oidc-claim-groups"
                    value={groupsClaim}
                    onChange={(e) => setGroupsClaim(e.target.value)}
                    placeholder="groups"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-admin-group">管理员组</Label>
                  <Input
                    id="oidc-admin-group"
                    value={adminGroup}
                    onChange={(e) => setAdminGroup(e.target.value)}
                    placeholder="artifact-keeper-admins"
                  />
                  <p className="text-xs text-muted-foreground">
                    此组中的用户将被授予管理员权限。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name || !issuerUrl || !clientId || (!editTarget && !clientSecret) || isSaving}
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {editTarget ? "保存更改" : "创建提供商"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除 OIDC 提供商"
        description={`确定要删除 "${deleteTarget?.name}"? 用户将无法再使用此提供商登录。`}
        confirmText="删除"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// LDAP Tab
// ---------------------------------------------------------------------------

function LdapTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LdapConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LdapConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [bindDn, setBindDn] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [userBaseDn, setUserBaseDn] = useState("");
  const [userFilter, setUserFilter] = useState("(uid={0})");
  const [useStarttls, setUseStarttls] = useState(false);
  const [usernameAttribute, setUsernameAttribute] = useState("uid");
  const [emailAttribute, setEmailAttribute] = useState("mail");
  const [displayNameAttribute, setDisplayNameAttribute] = useState("cn");
  const [groupsAttribute, setGroupsAttribute] = useState("memberOf");
  const [groupBaseDn, setGroupBaseDn] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [adminGroupDn, setAdminGroupDn] = useState("");
  const [priority, setPriority] = useState("0");

  const { data: configs, isLoading } = useQuery({
    queryKey: ["sso", "ldap"],
    queryFn: ssoApi.listLdap,
  });

  const createMutation = useMutation({
    mutationFn: ssoApi.createLdap,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("LDAP 提供商创建成功");
      closeDialog();
    },
    onError: mutationErrorToast("创建 LDAP 提供商失败"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLdapConfigRequest }) =>
      ssoApi.updateLdap(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("LDAP 提供商更新成功");
      closeDialog();
    },
    onError: mutationErrorToast("更新 LDAP 提供商失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: ssoApi.deleteLdap,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("LDAP 提供商已删除");
      setDeleteTarget(null);
    },
    onError: mutationErrorToast("删除 LDAP 提供商失败"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableLdap(id) : ssoApi.enableLdap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("LDAP 提供商状态已更新");
    },
    onError: mutationErrorToast("切换 LDAP 提供商失败"),
  });

  const testMutation = useMutation({
    mutationFn: ssoApi.testLdap,
    onMutate: (id) => setTestingId(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          `连接成功${result.response_time_ms ? ` (${result.response_time_ms}ms)` : ""}`
        );
      } else {
        toast.error(`连接失败：${result.message}`);
      }
      setTestingId(null);
    },
    onError: (err: unknown) => {
      toast.error(toUserMessage(err, "测试 LDAP 连接失败"));
      setTestingId(null);
    },
  });

  function resetForm() {
    setName("");
    setServerUrl("");
    setBindDn("");
    setBindPassword("");
    setUserBaseDn("");
    setUserFilter("(uid={0})");
    setUseStarttls(false);
    setUsernameAttribute("uid");
    setEmailAttribute("mail");
    setDisplayNameAttribute("cn");
    setGroupsAttribute("memberOf");
    setGroupBaseDn("");
    setGroupFilter("");
    setAdminGroupDn("");
    setPriority("0");
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(config: LdapConfig) {
    setEditTarget(config);
    setName(config.name);
    setServerUrl(config.server_url);
    setBindDn(config.bind_dn || "");
    setBindPassword("");
    setUserBaseDn(config.user_base_dn);
    setUserFilter(config.user_filter);
    setUseStarttls(config.use_starttls);
    setUsernameAttribute(config.username_attribute);
    setEmailAttribute(config.email_attribute);
    setDisplayNameAttribute(config.display_name_attribute);
    setGroupsAttribute(config.groups_attribute);
    setGroupBaseDn(config.group_base_dn || "");
    setGroupFilter(config.group_filter || "");
    setAdminGroupDn(config.admin_group_dn || "");
    setPriority(String(config.priority));
    setDialogOpen(true);
  }

  function handleSubmit() {
    const priorityNum = parseInt(priority, 10) || 0;

    if (editTarget) {
      const data: UpdateLdapConfigRequest = {
        name,
        server_url: serverUrl,
        bind_dn: bindDn || undefined,
        user_base_dn: userBaseDn,
        user_filter: userFilter,
        username_attribute: usernameAttribute,
        email_attribute: emailAttribute,
        display_name_attribute: displayNameAttribute,
        groups_attribute: groupsAttribute,
        group_base_dn: groupBaseDn || undefined,
        group_filter: groupFilter || undefined,
        admin_group_dn: adminGroupDn || undefined,
        use_starttls: useStarttls,
        priority: priorityNum,
      };
      if (bindPassword) {
        data.bind_password = bindPassword;
      }
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate({
        name,
        server_url: serverUrl,
        bind_dn: bindDn || undefined,
        bind_password: bindPassword || undefined,
        user_base_dn: userBaseDn,
        user_filter: userFilter,
        username_attribute: usernameAttribute,
        email_attribute: emailAttribute,
        display_name_attribute: displayNameAttribute,
        groups_attribute: groupsAttribute,
        group_base_dn: groupBaseDn || undefined,
        group_filter: groupFilter || undefined,
        admin_group_dn: adminGroupDn || undefined,
        use_starttls: useStarttls,
        priority: priorityNum,
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">LDAP 提供商</CardTitle>
            <CardDescription>
              用于基于目录认证的 LDAP / Active Directory 服务器。
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            添加提供商
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>Server URL</TableHead>
                  <TableHead>用户基础 DN</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground font-mono text-xs">
                      {config.server_url}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground text-xs">
                      {config.user_base_dn}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={config.is_enabled ? "活跃" : "已禁用"}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`测试 LDAP 连接 ${config.name}`}
                          disabled={testingId === config.id}
                          onClick={() => testMutation.mutate(config.id)}
                        >
                          {testingId === config.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Plug className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`${config.is_enabled ? "禁用" : "启用"} LDAP 提供商 ${config.name}`}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: config.id,
                              enabled: config.is_enabled,
                            })
                          }
                        >
                          {config.is_enabled ? (
                            <ToggleRight className="size-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`编辑 LDAP 提供商 ${config.name}`}
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={`删除 LDAP 提供商 ${config.name}`}
                          onClick={() => setDeleteTarget(config)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Server className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                尚未配置 LDAP 提供商。
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                添加 LDAP 提供商
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "编辑 LDAP 提供商" : "添加 LDAP 提供商"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "更新 LDAP 目录服务器配置。"
                : "配置新的 LDAP 目录服务器用于 SSO。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ldap-name">名称</Label>
              <Input
                id="ldap-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Corporate LDAP"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-server">Server URL</Label>
              <Input
                id="ldap-server"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="ldap://ldap.example.com:389"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-bind-dn">绑定 DN</Label>
              <Input
                id="ldap-bind-dn"
                value={bindDn}
                onChange={(e) => setBindDn(e.target.value)}
                placeholder="cn=admin,dc=example,dc=com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-bind-password">绑定密码</Label>
              <Input
                id="ldap-bind-password"
                type="password"
                value={bindPassword}
                onChange={(e) => setBindPassword(e.target.value)}
                placeholder={
                  editTarget ? "留空以保留现有值" : "绑定密码"
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-user-base-dn">用户基础 DN</Label>
              <Input
                id="ldap-user-base-dn"
                value={userBaseDn}
                onChange={(e) => setUserBaseDn(e.target.value)}
                placeholder="ou=users,dc=example,dc=com"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-user-filter">用户过滤器</Label>
              <Input
                id="ldap-user-filter"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder="(uid={0})"
              />
              <p className="text-xs text-muted-foreground">
                使用 {"{0}"} 作为用户名的占位符。
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="ldap-use-starttls">使用 STARTTLS</Label>
                <p className="text-xs text-muted-foreground">
                  连接后升级到 TLS。
                </p>
              </div>
              <Switch id="ldap-use-starttls" checked={useStarttls} onCheckedChange={setUseStarttls} />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">属性映射</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-username">用户名属性</Label>
                  <Input
                    id="ldap-attr-username"
                    value={usernameAttribute}
                    onChange={(e) => setUsernameAttribute(e.target.value)}
                    placeholder="uid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-email">邮箱属性</Label>
                  <Input
                    id="ldap-attr-email"
                    value={emailAttribute}
                    onChange={(e) => setEmailAttribute(e.target.value)}
                    placeholder="mail"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-display">显示名称属性</Label>
                  <Input
                    id="ldap-attr-display"
                    value={displayNameAttribute}
                    onChange={(e) => setDisplayNameAttribute(e.target.value)}
                    placeholder="cn"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-groups">组属性</Label>
                  <Input
                    id="ldap-attr-groups"
                    value={groupsAttribute}
                    onChange={(e) => setGroupsAttribute(e.target.value)}
                    placeholder="memberOf"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">组设置</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ldap-group-base-dn">组基础 DN</Label>
                  <Input
                    id="ldap-group-base-dn"
                    value={groupBaseDn}
                    onChange={(e) => setGroupBaseDn(e.target.value)}
                    placeholder="ou=groups,dc=example,dc=com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-group-filter">组过滤器</Label>
                  <Input
                    id="ldap-group-filter"
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    placeholder="(objectClass=groupOfNames)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-admin-group-dn">管理员组 DN</Label>
                  <Input
                    id="ldap-admin-group-dn"
                    value={adminGroupDn}
                    onChange={(e) => setAdminGroupDn(e.target.value)}
                    placeholder="cn=admins,ou=groups,dc=example,dc=com"
                  />
                  <p className="text-xs text-muted-foreground">
                    此组中的用户将被授予管理员权限。
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="ldap-priority">优先级</Label>
              <Input
                id="ldap-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                当配置多个 LDAP 服务器时，优先尝试较低的值。
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name || !serverUrl || !userBaseDn || isSaving}
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {editTarget ? "保存更改" : "创建提供商"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除 LDAP 提供商"
        description={`确定要删除 "${deleteTarget?.name}"? 用户将无法再使用此提供商登录。`}
        confirmText="删除"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// SAML Tab
// ---------------------------------------------------------------------------

function SamlTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SamlConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SamlConfig | null>(null);

  const [name, setName] = useState("");
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [sloUrl, setSloUrl] = useState("");
  const [certificate, set证书] = useState("");
  const [spEntityId, setSpEntityId] = useState("artifact-keeper");
  const [nameIdFormat, setNameIdFormat] = useState("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
  const [signRequests, setSignRequests] = useState(false);
  const [requireSignedAssertions, setRequireSignedAssertions] = useState(true);
  const [usernameClaim, setUsernameClaim] = useState("username");
  const [emailClaim, setEmailClaim] = useState("email");
  const [displayNameClaim, setDisplayNameClaim] = useState("displayName");
  const [groupsClaim, setGroupsClaim] = useState("groups");
  const [adminGroup, setAdminGroup] = useState("");

  const { data: configs, isLoading } = useQuery({
    queryKey: ["sso", "saml"],
    queryFn: ssoApi.listSaml,
  });

  const createMutation = useMutation({
    mutationFn: ssoApi.createSaml,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SAML 提供商创建成功");
      closeDialog();
    },
    onError: mutationErrorToast("创建 SAML 提供商失败"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSamlConfigRequest }) =>
      ssoApi.updateSaml(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SAML 提供商更新成功");
      closeDialog();
    },
    onError: mutationErrorToast("更新 SAML 提供商失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: ssoApi.deleteSaml,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SAML 提供商已删除");
      setDeleteTarget(null);
    },
    onError: mutationErrorToast("删除 SAML 提供商失败"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableSaml(id) : ssoApi.enableSaml(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SAML 提供商状态已更新");
    },
    onError: mutationErrorToast("切换 SAML 提供商失败"),
  });

  function resetForm() {
    setName("");
    setEntityId("");
    setSsoUrl("");
    setSloUrl("");
    set证书("");
    setSpEntityId("artifact-keeper");
    setNameIdFormat("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
    setSignRequests(false);
    setRequireSignedAssertions(true);
    setUsernameClaim("username");
    setEmailClaim("email");
    setDisplayNameClaim("displayName");
    setGroupsClaim("groups");
    setAdminGroup("");
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(config: SamlConfig) {
    setEditTarget(config);
    setName(config.name);
    setEntityId(config.entity_id);
    setSsoUrl(config.sso_url);
    setSloUrl(config.slo_url || "");
    set证书("");
    setSpEntityId(config.sp_entity_id);
    setNameIdFormat(config.name_id_format);
    setSignRequests(config.sign_requests);
    setRequireSignedAssertions(config.require_signed_assertions);
    setUsernameClaim(config.attribute_mapping?.username || "username");
    setEmailClaim(config.attribute_mapping?.email || "email");
    setDisplayNameClaim(config.attribute_mapping?.display_name || "displayName");
    setGroupsClaim(config.attribute_mapping?.groups || "groups");
    setAdminGroup(config.admin_group || "");
    setDialogOpen(true);
  }

  function handleSubmit() {
    // #406: Same wholesale-overwrite hazard as the OIDC tab — the SAML
    // attribute_mapping column is a JSONB blob, so rebuilding it from only
    // the four form-rendered claim inputs (username/email/display_name/
    // groups) would wipe any extra keys the backend may have written. Spread
    // editTarget.attribute_mapping first so unknown keys round-trip.
    // On create there's nothing to preserve, so the spread is a no-op.
    const attributeMapping: Record<string, string> = {
      ...(editTarget?.attribute_mapping ?? {}),
      username: usernameClaim,
      email: emailClaim,
      display_name: displayNameClaim,
      groups: groupsClaim,
    };

    if (editTarget) {
      const data: UpdateSamlConfigRequest = {
        name,
        entity_id: entityId,
        sso_url: ssoUrl,
        slo_url: sloUrl || undefined,
        sp_entity_id: spEntityId,
        name_id_format: nameIdFormat,
        attribute_mapping: attributeMapping,
        sign_requests: signRequests,
        require_signed_assertions: requireSignedAssertions,
        admin_group: adminGroup || undefined,
      };
      if (certificate) {
        data.certificate = certificate;
      }
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate({
        name,
        entity_id: entityId,
        sso_url: ssoUrl,
        slo_url: sloUrl || undefined,
        certificate,
        sp_entity_id: spEntityId,
        name_id_format: nameIdFormat,
        attribute_mapping: attributeMapping,
        sign_requests: signRequests,
        require_signed_assertions: requireSignedAssertions,
        admin_group: adminGroup || undefined,
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">SAML 提供商</CardTitle>
            <CardDescription>
              用于企业单点登录的 SAML 2.0 身份提供商。
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            添加提供商
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>实体 ID</TableHead>
                  <TableHead>SSO URL</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground text-xs">
                      {config.entity_id}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground text-xs">
                      {config.sso_url}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={config.is_enabled ? "活跃" : "已禁用"}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`${config.is_enabled ? "禁用" : "启用"} SAML 提供商 ${config.name}`}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: config.id,
                              enabled: config.is_enabled,
                            })
                          }
                        >
                          {config.is_enabled ? (
                            <ToggleRight className="size-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`编辑 SAML 提供商 ${config.name}`}
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={`删除 SAML 提供商 ${config.name}`}
                          onClick={() => setDeleteTarget(config)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileKey className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                尚未配置 SAML 提供商。
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                添加 SAML 提供商
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "编辑 SAML 提供商" : "添加 SAML 提供商"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "更新 SAML 2.0 身份提供商配置。"
                : "配置新的 SAML 2.0 身份提供商用于 SSO。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="saml-name">名称</Label>
              <Input
                id="saml-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Okta"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-entity-id">实体 ID</Label>
              <Input
                id="saml-entity-id"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="https://idp.example.com/metadata"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-sso-url">SSO URL</Label>
              <Input
                id="saml-sso-url"
                value={ssoUrl}
                onChange={(e) => setSsoUrl(e.target.value)}
                placeholder="https://idp.example.com/sso/saml"
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-slo-url">SLO URL（可选）</Label>
              <Input
                id="saml-slo-url"
                value={sloUrl}
                onChange={(e) => setSloUrl(e.target.value)}
                placeholder="https://idp.example.com/slo/saml"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-certificate">证书</Label>
              <Textarea
                id="saml-certificate"
                value={certificate}
                onChange={(e) => set证书(e.target.value)}
                placeholder={
                  editTarget
                    ? "留空以保留现有值 certificate"
                    : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
                }
                rows={5}
                className="font-mono text-xs"
                aria-required={!editTarget}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-sp-entity-id">SP 实体 ID</Label>
              <Input
                id="saml-sp-entity-id"
                value={spEntityId}
                onChange={(e) => setSpEntityId(e.target.value)}
                placeholder="artifact-keeper"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-name-id-format">NameID 格式</Label>
              <Select value={nameIdFormat} onValueChange={setNameIdFormat}>
                <SelectTrigger id="saml-name-id-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
                    Email Address
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">
                    Unspecified
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">
                    Persistent
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">
                    Transient
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="saml-sign-requests">签名请求</Label>
                <p className="text-xs text-muted-foreground">
                  对发送到 IdP 的认证请求进行签名。
                </p>
              </div>
              <Switch id="saml-sign-requests" checked={signRequests} onCheckedChange={setSignRequests} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="saml-require-signed-assertions">要求签名断言</Label>
                <p className="text-xs text-muted-foreground">
                  要求 IdP 签名 SAML 断言。
                </p>
              </div>
              <Switch
                id="saml-require-signed-assertions"
                checked={requireSignedAssertions}
                onCheckedChange={setRequireSignedAssertions}
              />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">属性映射</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-username">用户名属性</Label>
                  <Input
                    id="saml-attr-username"
                    value={usernameClaim}
                    onChange={(e) => setUsernameClaim(e.target.value)}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-email">邮箱属性</Label>
                  <Input
                    id="saml-attr-email"
                    value={emailClaim}
                    onChange={(e) => setEmailClaim(e.target.value)}
                    placeholder="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-display">显示名称属性</Label>
                  <Input
                    id="saml-attr-display"
                    value={displayNameClaim}
                    onChange={(e) => setDisplayNameClaim(e.target.value)}
                    placeholder="displayName"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-groups">组属性</Label>
                  <Input
                    id="saml-attr-groups"
                    value={groupsClaim}
                    onChange={(e) => setGroupsClaim(e.target.value)}
                    placeholder="groups"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="saml-admin-group">管理员组</Label>
              <Input
                id="saml-admin-group"
                value={adminGroup}
                onChange={(e) => setAdminGroup(e.target.value)}
                placeholder="artifact-keeper-admins"
              />
              <p className="text-xs text-muted-foreground">
                此组中的用户将被授予管理员权限。
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !name ||
                !entityId ||
                !ssoUrl ||
                (!editTarget && !certificate) ||
                isSaving
              }
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {editTarget ? "保存更改" : "创建提供商"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除 SAML 提供商"
        description={`确定要删除 "${deleteTarget?.name}"? 用户将无法再使用此提供商登录。`}
        confirmText="删除"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SsoSettingsPage() {
  const { user } = useAuth();

  const { data: oidcConfigs } = useQuery({
    queryKey: ["sso", "oidc"],
    queryFn: ssoApi.listOidc,
  });

  const { data: ldapConfigs } = useQuery({
    queryKey: ["sso", "ldap"],
    queryFn: ssoApi.listLdap,
  });

  const { data: samlConfigs } = useQuery({
    queryKey: ["sso", "saml"],
    queryFn: ssoApi.listSaml,
  });

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="SSO 提供商" />
        <Alert variant="destructive">
          <AlertTitle>访问被拒绝</AlertTitle>
          <AlertDescription>
            您必须是管理员才能管理 SSO 提供商。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const oidcCount = oidcConfigs?.length ?? 0;
  const ldapCount = ldapConfigs?.length ?? 0;
  const samlCount = samlConfigs?.length ?? 0;
  const totalCount = oidcCount + ldapCount + samlCount;

  const enabledCount =
    (oidcConfigs?.filter((c) => c.is_enabled).length ?? 0) +
    (ldapConfigs?.filter((c) => c.is_enabled).length ?? 0) +
    (samlConfigs?.filter((c) => c.is_enabled).length ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SSO 提供商"
        description="配置单点登录认证提供商。"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Shield}
          label="提供商总数"
          value={totalCount}
          color="blue"
        />
        <StatCard
          icon={CheckCircle}
          label="已启用"
          value={enabledCount}
          color="green"
        />
        <StatCard
          icon={Globe}
          label="OIDC"
          value={oidcCount}
          color="purple"
        />
        <StatCard
          icon={Server}
          label="LDAP"
          value={ldapCount}
          color="yellow"
        />
        <StatCard
          icon={FileKey}
          label="SAML"
          value={samlCount}
          color="red"
        />
      </div>

      <Tabs defaultValue="oidc">
        <TabsList>
          <TabsTrigger value="oidc">
            <Globe className="size-4 mr-1.5" />
            OIDC
          </TabsTrigger>
          <TabsTrigger value="ldap">
            <Server className="size-4 mr-1.5" />
            LDAP
          </TabsTrigger>
          <TabsTrigger value="saml">
            <FileKey className="size-4 mr-1.5" />
            SAML
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oidc" className="mt-4">
          <OidcTab />
        </TabsContent>

        <TabsContent value="ldap" className="mt-4">
          <LdapTab />
        </TabsContent>

        <TabsContent value="saml" className="mt-4">
          <SamlTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
