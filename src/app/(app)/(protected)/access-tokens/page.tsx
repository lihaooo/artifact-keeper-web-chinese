"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key,
  Shield,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { profileApi } from "@/lib/api/profile";
import { mutationErrorToast } from "@/lib/error-utils";
import type {
  ApiKey,
  AccessToken,
  CreateApiKeyRequest,
  CreateAccessTokenRequest,
  CreateApiKeyResponse,
  CreateAccessTokenResponse,
} from "@/lib/api/profile";
import type { RepoSelector } from "@/lib/api/service-accounts";
import { useAuth } from "@/providers/auth-provider";
import { SCOPES } from "@/lib/constants/token";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { TokenCreatedAlert } from "@/components/common/token-created-alert";
import { TokenCreateForm } from "@/components/common/token-create-form";

function DateCell({ value }: { value?: string | null }) {
  if (!value) return <span className="text-sm text-muted-foreground">从未</span>;
  return (
    <span className="text-sm text-muted-foreground">
      {new Date(value).toLocaleDateString("zh-CN")}
    </span>
  );
}

function ScopeBadges({ scopes }: { scopes?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(scopes ?? []).map((s) => (
        <Badge key={s} variant="secondary" className="text-xs">
          {s}
        </Badge>
      ))}
    </div>
  );
}

function TokenPrefix({ prefix }: { prefix: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
      {prefix}...
    </code>
  );
}

export function renderRepoAccess(token: AccessToken) {
  if (token.repo_selector) {
    const parts: string[] = [];
    if (token.repo_selector.match_formats?.length) {
      parts.push(`${token.repo_selector.match_formats.length} 种格式`);
    }
    if (token.repo_selector.match_pattern) {
      parts.push(token.repo_selector.match_pattern);
    }
    const labelCount = Object.keys(token.repo_selector.match_labels ?? {}).length;
    if (labelCount > 0) {
      parts.push(`${labelCount} 个标签`);
    }
    return (
      <Badge variant="secondary" className="text-xs">
        {parts.join("、") || "选择器"}
      </Badge>
    );
  }
  if (token.repository_ids && token.repository_ids.length > 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        {token.repository_ids.length} 个仓库
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">所有仓库</span>
  );
}

export default function AccessTokensPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const availableScopes = SCOPES.filter(
    (s) => s.value !== "admin" || user?.is_admin
  );

  // API Key state
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyExpiry, setKeyExpiry] = useState("90");
  const [keyScopes, setKeyScopes] = useState<string[]>(["read"]);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);

  // Access Token state
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("90");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read"]);
  const [tokenRepoSelector, setTokenRepoSelector] = useState<RepoSelector>({});
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(
    null
  );
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);

  // Queries
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["profile", "api-keys"],
    queryFn: () => profileApi.listApiKeys(),
  });

  const { data: accessTokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ["profile", "access-tokens"],
    queryFn: () => profileApi.listAccessTokens(),
  });

  // Mutations
  const createKeyMutation = useMutation({
    mutationFn: (data: CreateApiKeyRequest) => profileApi.createApiKey(data),
    onSuccess: (result: CreateApiKeyResponse) => {
      queryClient.invalidateQueries({ queryKey: ["profile", "api-keys"] });
      setNewlyCreatedKey(result.token);
      setKeyName("");
      setKeyScopes(["read"]);
      setKeyExpiry("90");
      toast.success("API 密钥已创建");
    },
    onError: mutationErrorToast("创建 API 密钥失败"),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => profileApi.deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "api-keys"] });
      setRevokeKeyId(null);
      toast.success("API 密钥已撤销");
    },
    onError: mutationErrorToast("撤销 API 密钥失败"),
  });

  const createTokenMutation = useMutation({
    mutationFn: (data: CreateAccessTokenRequest) =>
      profileApi.createAccessToken(data),
    onSuccess: (result: CreateAccessTokenResponse) => {
      queryClient.invalidateQueries({
        queryKey: ["profile", "access-tokens"],
      });
      setNewlyCreatedToken(result.token);
      setTokenName("");
      setTokenScopes(["read"]);
      setTokenExpiry("90");
      setTokenRepoSelector({});
      toast.success("访问令牌已创建");
    },
    onError: mutationErrorToast("创建访问令牌失败"),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (id: string) => profileApi.deleteAccessToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["profile", "access-tokens"],
      });
      setRevokeTokenId(null);
      toast.success("访问令牌已撤销");
    },
    onError: mutationErrorToast("撤销访问令牌失败"),
  });

  // Column definitions
  const keyColumns: DataTableColumn<ApiKey>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (k) => k.name,
      sortable: true,
      cell: (k) => (
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{k.name}</span>
        </div>
      ),
    },
    { id: "prefix", header: "密钥前缀", cell: (k) => <TokenPrefix prefix={k.key_prefix} /> },
    { id: "scopes", header: "权限范围", cell: (k) => <ScopeBadges scopes={k.scopes} /> },
    { id: "expires", header: "过期时间", accessor: (k) => k.expires_at ?? "", cell: (k) => <DateCell value={k.expires_at} /> },
    { id: "last_used", header: "最后使用", accessor: (k) => k.last_used_at ?? "", cell: (k) => <DateCell value={k.last_used_at} /> },
    { id: "created", header: "创建时间", accessor: (k) => k.created_at, sortable: true, cell: (k) => <DateCell value={k.created_at} /> },
    {
      id: "actions",
      header: "",
      cell: (k) => (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevokeKeyId(k.id)}
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

  const tokenColumns: DataTableColumn<AccessToken>[] = [
    {
      id: "name",
      header: "名称",
      accessor: (t) => t.name,
      sortable: true,
      cell: (t) => (
        <div className="flex items-center gap-2">
          <Shield className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{t.name}</span>
        </div>
      ),
    },
    { id: "prefix", header: "令牌前缀", cell: (t) => <TokenPrefix prefix={t.token_prefix} /> },
    { id: "scopes", header: "权限范围", cell: (t) => <ScopeBadges scopes={t.scopes} /> },
    { id: "repo_access", header: "仓库访问", cell: renderRepoAccess },
    { id: "expires", header: "过期时间", accessor: (t) => t.expires_at ?? "", cell: (t) => <DateCell value={t.expires_at} /> },
    { id: "last_used", header: "最后使用", accessor: (t) => t.last_used_at ?? "", cell: (t) => <DateCell value={t.last_used_at} /> },
    { id: "created", header: "创建时间", accessor: (t) => t.created_at, sortable: true, cell: (t) => <DateCell value={t.created_at} /> },
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
        title="访问令牌"
        description="管理用于通过编程方式访问仓库的 API 密钥和个人访问令牌。"
      />

      <Tabs defaultValue="api-keys">
        <TabsList>
          <TabsTrigger value="api-keys">
            <Key className="size-4" />
            API 密钥
          </TabsTrigger>
          <TabsTrigger value="access-tokens">
            <Shield className="size-4" />
            访问令牌
          </TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">API 密钥</h2>
              <p className="text-sm text-muted-foreground">
                使用 API 密钥通过编程方式访问仓库 API。
              </p>
            </div>
            <Button onClick={() => setCreateKeyOpen(true)}>
              <Plus className="size-4" />
              创建 API 密钥
            </Button>
          </div>

          {apiKeys.length === 0 && !keysLoading ? (
            <EmptyState
              icon={Key}
              title="暂无 API 密钥"
              description="创建一个 API 密钥用于通过编程方式访问仓库。"
            />
          ) : (
            <DataTable
              columns={keyColumns}
              data={apiKeys}
              loading={keysLoading}
              rowKey={(k) => k.id}
              emptyMessage="未找到 API 密钥。"
            />
          )}
        </TabsContent>

        {/* Access Tokens Tab */}
        <TabsContent value="access-tokens" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">访问令牌</h2>
              <p className="text-sm text-muted-foreground">
                用于 CLI 和 CI/CD 身份验证的个人访问令牌。令牌可以限定到特定仓库。
              </p>
            </div>
            <Button onClick={() => setCreateTokenOpen(true)}>
              <Plus className="size-4" />
              创建令牌
            </Button>
          </div>

          {accessTokens.length === 0 && !tokensLoading ? (
            <EmptyState
              icon={Shield}
              title="暂无访问令牌"
              description="创建一个个人访问令牌用于 CLI 或 CI/CD 身份验证。"
            />
          ) : (
            <DataTable
              columns={tokenColumns}
              data={accessTokens}
              loading={tokensLoading}
              rowKey={(t) => t.id}
              emptyMessage="未找到访问令牌。"
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Create API Key Dialog */}
      <Dialog
        open={createKeyOpen}
        onOpenChange={(o) => {
          setCreateKeyOpen(o);
          if (!o) {
            setKeyName("");
            setKeyScopes(["read"]);
            setKeyExpiry("90");
            setNewlyCreatedKey(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {newlyCreatedKey ? (
            <TokenCreatedAlert
              title="API 密钥已创建"
              description="请立即复制您的 API 密钥。您将无法再次查看它。"
              token={newlyCreatedKey}
              onDone={() => {
                setCreateKeyOpen(false);
                setNewlyCreatedKey(null);
              }}
            />
          ) : (
            <TokenCreateForm
              title="创建 API 密钥"
              description="生成新的 API 密钥用于通过编程方式访问。"
              name={keyName}
              onNameChange={setKeyName}
              namePlaceholder="例如：CI/CD 流水线"
              expiry={keyExpiry}
              onExpiryChange={setKeyExpiry}
              scopes={keyScopes}
              onScopesChange={setKeyScopes}
              availableScopes={availableScopes}
              isPending={createKeyMutation.isPending}
              onSubmit={() =>
                createKeyMutation.mutate({
                  name: keyName,
                  expires_in_days:
                    keyExpiry === "0" ? undefined : Number(keyExpiry),
                  scopes: keyScopes,
                })
              }
              onCancel={() => setCreateKeyOpen(false)}
              submitLabel="创建密钥"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create Access Token Dialog */}
      <Dialog
        open={createTokenOpen}
        onOpenChange={(o) => {
          setCreateTokenOpen(o);
          if (!o) {
            setTokenName("");
            setTokenScopes(["read"]);
            setTokenExpiry("90");
            setTokenRepoSelector({});
            setNewlyCreatedToken(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {newlyCreatedToken ? (
            <TokenCreatedAlert
              title="访问令牌已创建"
              description="请立即复制您的访问令牌。您将无法再次查看它。"
              token={newlyCreatedToken}
              onDone={() => {
                setCreateTokenOpen(false);
                setNewlyCreatedToken(null);
              }}
            />
          ) : (
            <TokenCreateForm
              title="创建访问令牌"
              description="生成用于 CLI 或 CI/CD 身份验证的个人访问令牌。"
              name={tokenName}
              onNameChange={setTokenName}
              namePlaceholder="例如：本地开发"
              expiry={tokenExpiry}
              onExpiryChange={setTokenExpiry}
              scopes={tokenScopes}
              onScopesChange={setTokenScopes}
              availableScopes={availableScopes}
              isPending={createTokenMutation.isPending}
              onSubmit={() => {
                const hasSelector =
                  (tokenRepoSelector.match_formats?.length ?? 0) > 0 ||
                  Object.keys(tokenRepoSelector.match_labels ?? {}).length > 0 ||
                  !!tokenRepoSelector.match_pattern;
                createTokenMutation.mutate({
                  name: tokenName,
                  expires_in_days:
                    tokenExpiry === "0" ? undefined : Number(tokenExpiry),
                  scopes: tokenScopes,
                  repo_selector: hasSelector ? tokenRepoSelector : undefined,
                });
              }}
              onCancel={() => setCreateTokenOpen(false)}
              submitLabel="创建令牌"
              showRepoSelector
              repoSelector={tokenRepoSelector}
              onRepoSelectorChange={setTokenRepoSelector}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke API Key Confirm */}
      <ConfirmDialog
        open={!!revokeKeyId}
        onOpenChange={(o) => {
          if (!o) setRevokeKeyId(null);
        }}
        title="撤销 API 密钥"
        description="这将永久使此 API 密钥失效。使用它的所有应用程序将立即失去访问权限。"
        confirmText="撤销密钥"
        danger
        loading={revokeKeyMutation.isPending}
        onConfirm={() => {
          if (revokeKeyId) revokeKeyMutation.mutate(revokeKeyId);
        }}
      />

      {/* Revoke Access Token Confirm */}
      <ConfirmDialog
        open={!!revokeTokenId}
        onOpenChange={(o) => {
          if (!o) setRevokeTokenId(null);
        }}
        title="撤销访问令牌"
        description="这将永久使此访问令牌失效。使用它的所有会话将被终止。"
        confirmText="撤销令牌"
        danger
        loading={revokeTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenId) revokeTokenMutation.mutate(revokeTokenId);
        }}
      />
    </div>
  );
}
