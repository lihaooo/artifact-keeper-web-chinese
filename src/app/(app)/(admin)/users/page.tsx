/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Key,
  ToggleLeft,
  ToggleRight,
  Copy,
  Users,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import "@/lib/sdk-client";
import {
  createUser as sdkCreateUser,
  updateUser as sdkUpdateUser,
  resetPassword as sdkResetPassword,
  deleteUser as sdkDeleteUser,
} from "@artifact-keeper/sdk";
import { adminApi } from "@/lib/api/admin";
import type { ApiKey } from "@/lib/api/profile";
import { mutationErrorToast } from "@/lib/error-utils";
import { invalidateGroup } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";
import type { User, CreateUserResponse } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { AuthSourceBadge, getAuthProviderLabel } from "@/components/common/auth-source-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PasswordPolicyHint } from "@/components/common/password-policy-hint";

// -- helpers --

function generateRandomPassword(length = 16): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (n) => chars[n % chars.length]).join("");
}

// -- types --

interface CreateUserForm {
  username: string;
  email: string;
  display_name: string;
  password: string;
  auto_generate: boolean;
  is_admin: boolean;
}

interface EditUserForm {
  email: string;
  display_name: string;
  is_admin: boolean;
  is_active: boolean;
}

const EMPTY_CREATE: CreateUserForm = {
  username: "",
  email: "",
  display_name: "",
  password: "",
  auto_generate: true,
  is_admin: false,
};

// -- page --

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [passwordUsername, setPasswordUsername] = useState<string | null>(null);

  // forms
  const [createForm, setCreateForm] = useState<CreateUserForm>(EMPTY_CREATE);
  const [editForm, setEditForm] = useState<EditUserForm>({
    email: "",
    display_name: "",
    is_admin: false,
    is_active: true,
  });

  // -- queries --
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers(),
    enabled: !!currentUser?.is_admin,
  });

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: async (form: CreateUserForm) => {
      const payload: Record<string, unknown> = {
        username: form.username,
        email: form.email,
        display_name: form.display_name,
        is_admin: form.is_admin,
      };
      if (!form.auto_generate && form.password) {
        payload.password = form.password;
      }
      const { data, error } = await sdkCreateUser({
        body: payload as any,
      });
      if (error) throw error;
      return data as any as CreateUserResponse;
    },
    onSuccess: (data) => {
      invalidateGroup(queryClient, "users");
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);

      if (data.generated_password) {
        setGeneratedPassword(data.generated_password);
        setPasswordUsername(data.user.username);
        setPasswordOpen(true);
      } else {
        toast.success("用户创建成功");
      }
    },
    onError: mutationErrorToast("创建用户失败"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: formData }: { id: string; data: EditUserForm }) => {
      const { data, error } = await sdkUpdateUser({
        path: { id },
        body: {
          email: formData.email,
          display_name: formData.display_name,
          is_admin: formData.is_admin,
          is_active: formData.is_active,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("用户更新成功");
      invalidateGroup(queryClient, "users");
      setEditOpen(false);
      setSelectedUser(null);
    },
    onError: mutationErrorToast("更新用户失败"),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await sdkUpdateUser({
        path: { id },
        body: { is_active },
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`用户${vars.is_active ? "启用" : "禁用"}成功`);
      invalidateGroup(queryClient, "users");
    },
    onError: mutationErrorToast("更新用户状态失败"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await sdkResetPassword({
        path: { id },
      });
      if (error) throw error;
      return data as any as { temporary_password: string };
    },
    onSuccess: (data, userId) => {
      const u = users?.find((x) => x.id === userId);
      setGeneratedPassword(data.temporary_password);
      setPasswordUsername(u?.username ?? "用户");
      setPasswordOpen(true);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: mutationErrorToast("重置密码失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sdkDeleteUser({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("用户删除成功");
      invalidateGroup(queryClient, "users");
      setDeleteOpen(false);
      setSelectedUser(null);
    },
    onError: mutationErrorToast("删除用户失败"),
  });

  // -- user tokens query (for the selected user) --
  const {
    data: userTokens,
    isLoading: tokensLoading,
  } = useQuery({
    queryKey: ["admin-user-tokens", selectedUser?.id],
    queryFn: () => adminApi.listUserTokens(selectedUser!.id),
    enabled: tokensOpen && !!selectedUser,
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async ({ userId, tokenId }: { userId: string; tokenId: string }) => {
      await adminApi.revokeUserToken(userId, tokenId);
    },
    onSuccess: () => {
      toast.success("令牌已撤销");
      queryClient.invalidateQueries({
        queryKey: ["admin-user-tokens", selectedUser?.id],
      });
      setRevokeTokenId(null);
    },
    onError: mutationErrorToast("撤销令牌失败"),
  });

  // -- handlers --
  const isSelf = useCallback(
    (u: User) => u.id === currentUser?.id,
    [currentUser]
  );

  const handleEdit = useCallback((u: User) => {
    setSelectedUser(u);
    setEditForm({
      email: u.email,
      display_name: u.display_name ?? "",
      is_admin: u.is_admin,
      is_active: u.is_active ?? true,
    });
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback(
    (u: User) => {
      if (isSelf(u)) {
        toast.error("无法删除自己的账号");
        return;
      }
      setSelectedUser(u);
      setDeleteOpen(true);
    },
    [isSelf]
  );

  const handleResetPassword = useCallback(
    (u: User) => {
      if (isSelf(u)) {
        toast.error("无法在此处重置自己的密码");
        return;
      }
      resetPasswordMutation.mutate(u.id);
    },
    [isSelf, resetPasswordMutation]
  );

  const handleViewTokens = useCallback((u: User) => {
    setSelectedUser(u);
    setTokensOpen(true);
  }, []);

  const handleToggleStatus = useCallback(
    (u: User) => {
      if (isSelf(u)) {
        toast.error("无法禁用自己的账号");
        return;
      }
      toggleStatusMutation.mutate({
        id: u.id,
        is_active: !(u.is_active ?? true),
      });
    },
    [isSelf, toggleStatusMutation]
  );

  const copyPassword = useCallback(() => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      toast.success("密码已复制到剪贴板");
    }
  }, [generatedPassword]);

  // -- columns --
  const columns: DataTableColumn<User>[] = [
    {
      id: "username",
      header: "用户名",
      accessor: (u) => u.username,
      sortable: true,
      cell: (u) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{u.username}</span>
          {u.is_admin && (
            <Badge variant="secondary" className="text-xs">
              <ShieldCheck className="size-3 mr-1" />
              管理员
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "email",
      header: "邮箱",
      accessor: (u) => u.email,
      sortable: true,
      cell: (u) => <span className="text-sm text-muted-foreground">{u.email}</span>,
    },
    {
      id: "display_name",
      header: "显示名称",
      accessor: (u) => u.display_name ?? "",
      sortable: true,
      cell: (u) => (
        <span className="text-sm">{u.display_name || "—"}</span>
      ),
    },
    {
      id: "status",
      header: "状态",
      accessor: (u) => (u.is_active !== false ? "活跃" : "已禁用"),
      cell: (u) => (
        <StatusBadge
          status={u.is_active !== false ? "活跃" : "已禁用"}
          color={u.is_active !== false ? "green" : "red"}
        />
      ),
    },
    {
      id: "auth_source",
      header: "认证来源",
      accessor: (u) => getAuthProviderLabel(u.auth_provider),
      sortable: true,
      cell: (u) => <AuthSourceBadge provider={u.auth_provider} />,
    },
    {
      id: "actions",
      header: "",
      cell: (u) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`查看 ${u.username} 的令牌`} onClick={() => handleViewTokens(u)}>
                <Key className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>查看令牌</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`编辑用户 ${u.username}`} onClick={() => handleEdit(u)}>
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`重置 ${u.username} 的密码`}
                onClick={() => handleResetPassword(u)}
                disabled={isSelf(u)}
              >
                <KeyRound className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>重置密码</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${u.is_active !== false ? "禁用" : "启用"}用户 ${u.username}`}
                onClick={() => handleToggleStatus(u)}
                disabled={isSelf(u)}
              >
                {u.is_active !== false ? (
                  <ToggleRight className="size-3.5" />
                ) : (
                  <ToggleLeft className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {u.is_active !== false ? "禁用" : "启用"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`删除用户 ${u.username}`}
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(u)}
                disabled={isSelf(u)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // -- render --
  if (!currentUser?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="用户" />
        <Alert variant="destructive">
          <AlertTitle>访问被拒绝</AlertTitle>
          <AlertDescription>
            您必须是管理员才能查看此页面。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户"
        description="管理用户账号、角色和访问权限。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            创建用户
          </Button>
        }
      />

      {!isLoading && (users?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Users}
          title="暂无用户"
          description="创建您的第一个用户以开始使用。"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              创建用户
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={users ?? []}
          loading={isLoading}
          emptyMessage="未找到用户。"
          rowKey={(u) => u.id}
        />
      )}

      {/* Create User Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setCreateForm(EMPTY_CREATE);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建用户</DialogTitle>
            <DialogDescription>
              添加新用户账号。如果启用自动生成，将生成临时密码。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(createForm);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="create-username">用户名</Label>
              <Input
                id="create-username"
                placeholder="jdoe"
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, username: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">邮箱</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="jdoe@example.com"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-display">显示名称</Label>
              <Input
                id="create-display"
                placeholder="张三"
                value={createForm.display_name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, display_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="create-password">密码</Label>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="auto-generate"
                    className="text-xs text-muted-foreground"
                  >
                    自动生成
                  </Label>
                  <Switch
                    id="auto-generate"
                    checked={createForm.auto_generate}
                    onCheckedChange={(v) =>
                      setCreateForm((f) => ({
                        ...f,
                        auto_generate: v,
                        password: v ? "" : f.password,
                      }))
                    }
                  />
                </div>
              </div>
              {!createForm.auto_generate && (
                <>
                  <div className="flex gap-2">
                    <Input
                      id="create-password"
                      type="text"
                      placeholder="输入密码"
                      value={createForm.password}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, password: e.target.value }))
                      }
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCreateForm((f) => ({
                          ...f,
                          password: generateRandomPassword(),
                        }))
                      }
                    >
                      生成
                    </Button>
                  </div>
                  <PasswordPolicyHint password={createForm.password} />
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="create-admin"
                checked={createForm.is_admin}
                onCheckedChange={(v) =>
                  setCreateForm((f) => ({ ...f, is_admin: v }))
                }
              />
              <Label htmlFor="create-admin">管理员</Label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateForm(EMPTY_CREATE);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "创建中..." : "创建用户"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setSelectedUser(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑用户：{selectedUser?.username}</DialogTitle>
            <DialogDescription>
              更新用户详情和访问级别。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedUser) {
                updateMutation.mutate({ id: selectedUser.id, data: editForm });
              }
            }}
          >
            <div className="space-y-2">
              <Label>认证来源</Label>
              <div data-testid="edit-auth-source">
                <AuthSourceBadge provider={selectedUser?.auth_provider} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">邮箱</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-display">显示名称</Label>
              <Input
                id="edit-display"
                value={editForm.display_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, display_name: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="edit-admin"
                checked={editForm.is_admin}
                onCheckedChange={(v) =>
                  setEditForm((f) => ({ ...f, is_admin: v }))
                }
                disabled={selectedUser ? isSelf(selectedUser) : false}
              />
              <Label htmlFor="edit-admin">管理员</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="edit-active"
                checked={editForm.is_active}
                onCheckedChange={(v) =>
                  setEditForm((f) => ({ ...f, is_active: v }))
                }
                disabled={selectedUser ? isSelf(selectedUser) : false}
              />
              <Label htmlFor="edit-active">活跃</Label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedUser(null);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "保存中..." : "保存更改"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Temporary Password Dialog */}
      <Dialog
        open={passwordOpen}
        onOpenChange={(o) => {
          if (!o) {
            setPasswordOpen(false);
            setGeneratedPassword(null);
            setPasswordUsername(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>临时密码</DialogTitle>
            <DialogDescription>
              此密码仅显示一次。请妥善保存并安全分享。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTitle>请保存此密码！</AlertTitle>
              <AlertDescription>
                用户下次登录时将被要求更改此密码。
              </AlertDescription>
            </Alert>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">用户名</p>
              <code className="block rounded bg-muted px-3 py-2 text-sm font-mono">
                {passwordUsername}
              </code>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">临时密码</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {generatedPassword}
                </code>
                <Button variant="outline" size="sm" onClick={copyPassword}>
                  <Copy className="size-3.5 mr-1" />
                  复制
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setPasswordOpen(false);
                setGeneratedPassword(null);
                setPasswordUsername(null);
              }}
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedUser(null);
        }}
        title="删除用户"
        description={`删除 "${selectedUser?.username}" 将永久移除其账号并撤销所有访问权限。此操作无法撤销。`}
        typeToConfirm={selectedUser?.username}
        confirmText="删除用户"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedUser) deleteMutation.mutate(selectedUser.id);
        }}
      />

      {/* User Tokens Dialog */}
      <Dialog
        open={tokensOpen}
        onOpenChange={(o) => {
          setTokensOpen(o);
          if (!o) {
            setSelectedUser(null);
            setRevokeTokenId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              API 令牌：{selectedUser?.username}
            </DialogTitle>
            <DialogDescription>
              查看和撤销此用户的 API 令牌。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {tokensLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                加载令牌中...
              </p>
            ) : (userTokens ?? []).length === 0 ? (
              <EmptyState
                icon={Key}
                title="暂无令牌"
                description="此用户没有 API 令牌。"
              />
            ) : (
              <div className="divide-y">
                {(userTokens ?? []).map((token: ApiKey) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {token.name}
                        </span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs shrink-0">
                          {token.key_prefix}...
                        </code>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(token.scopes ?? []).map((s) => (
                          <Badge key={s} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>
                          创建于{" "}
                          {token.created_at
                            ? new Date(token.created_at).toLocaleDateString()
                            : "N/A"}
                        </span>
                        {token.expires_at && (
                          <span>
                            过期于{" "}
                            {new Date(token.expires_at).toLocaleDateString()}
                          </span>
                        )}
                        <span>
                          上次使用{" "}
                          {token.last_used_at
                            ? new Date(token.last_used_at).toLocaleDateString()
                            : "从未"}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive shrink-0 ml-2"
                      onClick={() => setRevokeTokenId(token.id)}
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      撤销
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTokensOpen(false);
                setSelectedUser(null);
                setRevokeTokenId(null);
              }}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke User Token Confirm */}
      <ConfirmDialog
        open={!!revokeTokenId}
        onOpenChange={(o) => {
          if (!o) setRevokeTokenId(null);
        }}
        title="撤销令牌"
        description="此操作将永久使此 API 令牌失效。使用此令牌的应用将立即失去访问权限。"
        confirmText="撤销令牌"
        danger
        loading={revokeTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenId && selectedUser) {
            revokeTokenMutation.mutate({
              userId: selectedUser.id,
              tokenId: revokeTokenId,
            });
          }
        }}
      />
    </div>
  );
}
