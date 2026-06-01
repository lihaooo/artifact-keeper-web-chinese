"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Plus,
  Trash2,
  Pencil,
  Key,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { toast } from "sonner";

import { serviceAccountsApi } from "@/lib/api/service-accounts";
import { mutationErrorToast } from "@/lib/error-utils";
import type {
  ServiceAccount,
  ServiceAccountToken,
  CreateServiceAccountRequest,
  CreateTokenRequest,
  CreateTokenResponse,
  RepoSelector,
} from "@/lib/api/service-accounts";
import { useAuth } from "@/providers/auth-provider";
import { SCOPES } from "@/lib/constants/token";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { TokenCreatedAlert } from "@/components/common/token-created-alert";
import { TokenCreateForm } from "@/components/common/token-create-form";

function renderRepoAccess(t: ServiceAccountToken) {
  if (t.repo_selector) {
    const parts: string[] = [];
    if (t.repo_selector.match_formats?.length) {
      parts.push(`${t.repo_selector.match_formats.length} 个格式`);
    }
    if (t.repo_selector.match_pattern) {
      parts.push(t.repo_selector.match_pattern);
    }
    const labelCount = Object.keys(t.repo_selector.match_labels ?? {}).length;
    if (labelCount > 0) {
      parts.push(`${labelCount} 个标签`);
    }
    return (
      <Badge variant="secondary" className="text-xs">
        {parts.join(", ") || "选择器"}
      </Badge>
    );
  }
  if (t.repository_ids?.length > 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        {t.repository_ids.length} repo(s)
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">全部仓库</span>
  );
}

export default function ServiceAccountsPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<ServiceAccount | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState<ServiceAccount | null>(
    null
  );

  // Token management dialog
  const [tokenAccount, setTokenAccount] = useState<ServiceAccount | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("90");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read"]);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(
    null
  );
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);
  const [tokenRepoSelector, setTokenRepoSelector] = useState<RepoSelector>({});

  // Queries
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["service-accounts"],
    queryFn: () => serviceAccountsApi.list(),
    enabled: !!currentUser?.is_admin,
  });

  const { data: tokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ["service-account-tokens", tokenAccount?.id],
    queryFn: () =>
      tokenAccount ? serviceAccountsApi.listTokens(tokenAccount.id) : [],
    enabled: !!tokenAccount,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (req: CreateServiceAccountRequest) =>
      serviceAccountsApi.create(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      toast.success("服务账号已创建");
    },
    onError: mutationErrorToast("创建服务账号失败"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      display_name,
      is_active,
    }: {
      id: string;
      display_name?: string;
      is_active?: boolean;
    }) => serviceAccountsApi.update(id, { display_name, is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setEditOpen(false);
      setEditAccount(null);
      toast.success("服务账号已更新");
    },
    onError: mutationErrorToast("更新服务账号失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serviceAccountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setDeleteOpen(false);
      setDeleteAccount(null);
      toast.success("服务账号已删除");
    },
    onError: mutationErrorToast("删除服务账号失败"),
  });

  const createTokenMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: CreateTokenRequest }) =>
      serviceAccountsApi.createToken(id, req),
    onSuccess: (result: CreateTokenResponse) => {
      queryClient.invalidateQueries({
        queryKey: ["service-account-tokens", tokenAccount?.id],
      });
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setNewlyCreatedToken(result.token);
      setTokenName("");
      setTokenScopes(["read"]);
      setTokenExpiry("90");
      setTokenRepoSelector({});
      toast.success("令牌已创建");
    },
    onError: mutationErrorToast("创建令牌失败"),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: ({ accountId, tokenId }: { accountId: string; tokenId: string }) =>
      serviceAccountsApi.revokeToken(accountId, tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-account-tokens", tokenAccount?.id],
      });
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setRevokeTokenId(null);
      toast.success("令牌已撤销");
    },
    onError: mutationErrorToast("撤销令牌失败"),
  });

  // Handlers
  const handleEdit = useCallback((account: ServiceAccount) => {
    setEditAccount(account);
    setEditDisplayName(account.display_name ?? "");
    setEditOpen(true);
  }, []);

  const handleManageTokens = useCallback((account: ServiceAccount) => {
    setTokenAccount(account);
    setTokenDialogOpen(true);
  }, []);

  if (!currentUser?.is_admin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>访问被拒绝</AlertTitle>
        <AlertDescription>
          您需要管理员权限才能管理服务账号。
        </AlertDescription>
      </Alert>
    );
  }

  // Columns
  const columns: DataTableColumn<ServiceAccount>[] = [
    {
      id: "username",
      header: "用户名",
      accessor: (a) => a.username,
      sortable: true,
      cell: (a) => (
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{a.username}</span>
        </div>
      ),
    },
    {
      id: "display_name",
      header: "描述",
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {a.display_name || "-"}
        </span>
      ),
    },
    {
      id: "status",
      header: "状态",
      cell: (a) => (
        <StatusBadge
          status={a.is_active ? "活跃" : "已禁用"}
          color={a.is_active ? "green" : "red"}
        />
      ),
    },
    {
      id: "tokens",
      header: "令牌",
      accessor: (a) => a.token_count,
      cell: (a) => (
        <Badge variant="secondary" className="text-xs">
          {a.token_count}
        </Badge>
      ),
    },
    {
      id: "created",
      header: "创建时间",
      accessor: (a) => a.created_at,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {new Date(a.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (a) => (
        <div className="flex items-center gap-1 justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleManageTokens(a)}
              >
                <Key className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>管理令牌</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleEdit(a)}
              >
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
                onClick={() =>
                  updateMutation.mutate({
                    id: a.id,
                    is_active: !a.is_active,
                  })
                }
              >
                {a.is_active ? (
                  <ToggleRight className="size-3.5" />
                ) : (
                  <ToggleLeft className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {a.is_active ? "停用" : "启用"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setDeleteAccount(a);
                  setDeleteOpen(true);
                }}
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

  // Token columns for the manage dialog
  const tokenColumns: DataTableColumn<ServiceAccountToken>[] = [
    {
      id: "name",
      header: "名称",
      accessor: (t) => t.name,
      cell: (t) => (
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{t.name}</span>
          {t.is_expired && (
            <Badge variant="destructive" className="text-xs">
              已过期
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "prefix",
      header: "前缀",
      cell: (t) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {t.token_prefix}...
        </code>
      ),
    },
    {
      id: "scopes",
      header: "范围",
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.scopes.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "repo_access",
      header: "仓库访问",
      cell: renderRepoAccess,
    },
    {
      id: "last_used",
      header: "上次使用",
      cell: (t) =>
        t.last_used_at ? (
          <span className="text-sm text-muted-foreground">
            {new Date(t.last_used_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">从未</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: (t) => (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevokeTokenId(t.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>撤销</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="服务账号"
        description="用于 CI/CD 流水线和自动化系统的机器身份。每个服务账号可以拥有自己的 API 令牌，独立于任何人类用户。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            创建服务账号
          </Button>
        }
      />

      {accounts.length === 0 && !isLoading ? (
        <EmptyState
          icon={Bot}
          title="暂无服务账号"
          description="创建服务账号以为 CI/CD 流水线和自动化系统提供独立的身份和 API 令牌。"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              创建服务账号
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={accounts}
          loading={isLoading}
          rowKey={(a) => a.id}
          emptyMessage="未找到服务账号。"
        />
      )}

      {/* 创建服务账号 Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setCreateName("");
            setCreateDescription("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建服务账号</DialogTitle>
            <DialogDescription>
              服务账号是机器身份。用户名将自动添加 &quot;svc-&quot; 前缀。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name: createName,
                description: createDescription || undefined,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="svc-name">Name</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">svc-</span>
                <Input
                  id="svc-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="deploy-pipeline"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                仅允许字母数字字符和连字符。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-description">Description</Label>
              <Input
                id="svc-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="生产部署流水线"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !createName}
              >
                {createMutation.isPending ? "创建中..." : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑服务账号对话框 */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditAccount(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              编辑：{editAccount?.username}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (editAccount) {
                updateMutation.mutate({
                  id: editAccount.id,
                  display_name: editDisplayName || undefined,
                });
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-display-name">Description</Label>
              <Input
                id="edit-display-name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="此服务账号的描述"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "保存中..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Tokens Dialog */}
      <Dialog
        open={tokenDialogOpen}
        onOpenChange={(o) => {
          setTokenDialogOpen(o);
          if (!o) {
            setTokenAccount(null);
            setCreateTokenOpen(false);
            setNewlyCreatedToken(null);
            setTokenRepoSelector({});
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              令牌：{tokenAccount?.username}
            </DialogTitle>
            <DialogDescription>
              管理此服务账号的 API 令牌。
            </DialogDescription>
          </DialogHeader>

          {newlyCreatedToken ? (
            <TokenCreatedAlert
              title="令牌已创建"
              description="请立即复制此令牌。您将无法再次查看它。"
              token={newlyCreatedToken}
              onDone={() => setNewlyCreatedToken(null)}
            />
          ) : createTokenOpen ? (
            <TokenCreateForm
              title="创建令牌"
              description="为此服务账号生成新的 API 令牌。"
              name={tokenName}
              onNameChange={setTokenName}
              namePlaceholder="e.g., production-deploy"
              expiry={tokenExpiry}
              onExpiryChange={setTokenExpiry}
              scopes={tokenScopes}
              onScopesChange={setTokenScopes}
              availableScopes={SCOPES}
              isPending={createTokenMutation.isPending}
              onSubmit={() => {
                if (tokenAccount) {
                  const hasSelector =
                    (tokenRepoSelector.match_formats?.length ?? 0) > 0 ||
                    Object.keys(tokenRepoSelector.match_labels ?? {}).length > 0 ||
                    !!tokenRepoSelector.match_pattern;
                  createTokenMutation.mutate({
                    id: tokenAccount.id,
                    req: {
                      name: tokenName,
                      scopes: tokenScopes,
                      expires_in_days:
                        tokenExpiry === "0" ? undefined : Number(tokenExpiry),
                      repo_selector: hasSelector ? tokenRepoSelector : undefined,
                    },
                  });
                }
              }}
              onCancel={() => setCreateTokenOpen(false)}
              submitLabel="创建令牌"
              showRepoSelector
              repoSelector={tokenRepoSelector}
              onRepoSelectorChange={setTokenRepoSelector}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setCreateTokenOpen(true)}
                >
                  <Plus className="size-4" />
                  创建令牌
                </Button>
              </div>

              {tokens.length === 0 && !tokensLoading ? (
                <EmptyState
                  icon={Key}
                  title="暂无令牌"
                  description="为此服务账号创建令牌。"
                  action={
                    <Button
                      size="sm"
                      onClick={() => setCreateTokenOpen(true)}
                    >
                      <Plus className="size-4" />
                      创建令牌
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  columns={tokenColumns}
                  data={tokens}
                  loading={tokensLoading}
                  rowKey={(t) => t.id}
                  emptyMessage="未找到令牌。"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Service Account Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteOpen(false);
            setDeleteAccount(null);
          }
        }}
        title="删除服务账号"
        description={`此操作将永久删除 "${deleteAccount?.username}" 并撤销其所有令牌。使用这些令牌的流水线将立即失去访问权限。`}
        confirmText="删除"
        typeToConfirm={deleteAccount?.username}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteAccount) deleteMutation.mutate(deleteAccount.id);
        }}
      />

      {/* Revoke Token Confirm */}
      <ConfirmDialog
        open={!!revokeTokenId}
        onOpenChange={(o) => {
          if (!o) setRevokeTokenId(null);
        }}
        title="撤销令牌"
        description="此操作将永久使此令牌失效。使用此令牌的系统将立即失去访问权限。"
        confirmText="撤销"
        danger
        loading={revokeTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenId && tokenAccount) {
            revokeTokenMutation.mutate({
              accountId: tokenAccount.id,
              tokenId: revokeTokenId,
            });
          }
        }}
      />
    </div>
  );
}
