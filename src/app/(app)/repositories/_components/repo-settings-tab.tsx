"use client";

import { useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Trash2, Play, Eye } from "lucide-react";
import { toast } from "sonner";

import { repositoriesApi } from "@/lib/api/repositories";
import lifecycleApi from "@/lib/api/lifecycle";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import type { Repository } from "@/types";
import type { LifecyclePolicy, PolicyType } from "@/types/lifecycle";
import { POLICY_TYPE_LABELS } from "@/types/lifecycle";
import { quotaToBytes, bytesToQuota } from "./repo-dialogs";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type QuotaUnit = "MB" | "GB";

export interface UpdateRepositoryFields {
  key?: string;
  name?: string;
  description?: string;
  is_public?: boolean;
  quota_bytes?: number | null;
}

/** Convert UpdateRepositoryFields to the shape repositoriesApi.update expects. */
function toUpdatePayload(
  fields: UpdateRepositoryFields
): Partial<{ key: string; name: string; description: string; is_public: boolean; quota_bytes: number }> {
  const { quota_bytes, ...rest } = fields;
  // The SDK type does not accept null for quota_bytes, so strip it.
  if (quota_bytes != null) {
    return { ...rest, quota_bytes };
  }
  return rest;
}

interface RepoSettingsTabProps {
  repository: Repository;
}

export function RepoSettingsTab({ repository }: RepoSettingsTabProps) {
  const queryClient = useQueryClient();

  // -- General settings form state (override-based, like the edit dialog) --
  const defaults = useMemo(
    () => ({
      key: repository.key,
      name: repository.name,
      description: repository.description ?? "",
      is_public: repository.is_public,
    }),
    [repository]
  );

  const [overrides, setOverrides] = useState<Partial<typeof defaults>>({});
  const form = useMemo(
    () => ({ ...defaults, ...overrides }),
    [defaults, overrides]
  );
  const keyChanged = form.key !== repository.key;

  // Quota state
  const quotaDefaults = useMemo(
    () => bytesToQuota(repository.quota_bytes),
    [repository.quota_bytes]
  );
  const [quotaOverrides, setQuotaOverrides] = useState<{
    value?: string;
    unit?: QuotaUnit;
  }>({});
  const quotaValue = quotaOverrides.value ?? quotaDefaults.value;
  const quotaUnit = quotaOverrides.unit ?? quotaDefaults.unit;

  // Detect whether the form has unsaved changes
  const hasChanges = useMemo(() => {
    if (form.key !== repository.key) return true;
    if (form.name !== repository.name) return true;
    if (form.description !== (repository.description ?? "")) return true;
    if (form.is_public !== repository.is_public) return true;
    const currentQuotaBytes = quotaToBytes(quotaValue, quotaUnit);
    const originalQuotaBytes = repository.quota_bytes ?? null;
    if (currentQuotaBytes !== originalQuotaBytes) return true;
    return false;
  }, [form, quotaValue, quotaUnit, repository]);

  // -- Save mutation --
  const saveMutation = useMutation({
    mutationFn: (fields: UpdateRepositoryFields) =>
      repositoriesApi.update(repository.key, toUpdatePayload(fields)),
    onSuccess: (updatedRepo) => {
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      // If the key changed, also invalidate the new key
      if (updatedRepo.key !== repository.key) {
        queryClient.invalidateQueries({ queryKey: ["repository", updatedRepo.key] });
      }
      setOverrides({});
      setQuotaOverrides({});
      toast.success("仓库设置已保存");
    },
    onError: mutationErrorToast("保存仓库设置失败"),
  });

  const handleSave = useCallback(() => {
    const fields: UpdateRepositoryFields = {};
    if (form.name !== repository.name) fields.name = form.name;
    if (form.description !== (repository.description ?? ""))
      fields.description = form.description;
    if (form.is_public !== repository.is_public)
      fields.is_public = form.is_public;
    if (keyChanged) fields.key = form.key;

    const newQuota = quotaToBytes(quotaValue, quotaUnit);
    const originalQuota = repository.quota_bytes ?? null;
    if (newQuota !== originalQuota) {
      fields.quota_bytes = newQuota;
    }

    saveMutation.mutate(fields);
  }, [form, quotaValue, quotaUnit, repository, keyChanged, saveMutation]);

  const handleDiscard = useCallback(() => {
    setOverrides({});
    setQuotaOverrides({});
  }, []);

  // -- Lifecycle policies --
  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: ["lifecycle-policies", repository.id],
    queryFn: () => lifecycleApi.list({ repository_id: repository.id }),
    enabled: !!repository.id,
  });

  const deletePolicyMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["lifecycle-policies", repository.id],
      });
      toast.success("清理策略已删除");
    },
    onError: mutationErrorToast("删除清理策略失败"),
  });

  const executePolicyMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.execute(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["lifecycle-policies", repository.id],
      });
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      toast.success(
        `策略已执行：移除 ${result.artifacts_removed} 个制品，释放 ${formatBytes(result.bytes_freed)}`
      );
    },
    onError: mutationErrorToast("执行清理策略失败"),
  });

  const previewPolicyMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.preview(id),
    onSuccess: (result) => {
      toast.info(
        `预览：${result.artifacts_matched} 个制品将被移除（${formatBytes(result.bytes_freed)}）`
      );
    },
    onError: mutationErrorToast("预览清理策略失败"),
  });

  return (
    <div className="max-w-2xl space-y-8">
      {/* -- General Settings Section -- */}
      <section aria-labelledby="settings-general-heading">
        <h3 id="settings-general-heading" className="text-base font-semibold mb-4">
          General
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-key">仓库键</Label>
            <Input
              id="settings-key"
              value={form.key}
              onChange={(e) =>
                setOverrides((o) => ({
                  ...o,
                  key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                }))
              }
              required
            />
            {keyChanged && (
              <p className="text-sm text-yellow-600 dark:text-yellow-500">
                Changing the key will update all URLs for this repository. Existing
                client configurations will need to be updated.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-name">名称</Label>
            <Input
              id="settings-name"
              value={form.name}
              onChange={(e) =>
                setOverrides((o) => ({ ...o, name: e.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-description">描述</Label>
            <Textarea
              id="settings-description"
              value={form.description}
              onChange={(e) =>
                setOverrides((o) => ({ ...o, description: e.target.value }))
              }
              placeholder="描述此仓库的用途..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="settings-visibility">公开访问</Label>
              <p className="text-xs text-muted-foreground">
                公开仓库允许未经身份验证的读取访问。
              </p>
            </div>
            <Switch
              id="settings-visibility"
              checked={form.is_public}
              onCheckedChange={(v) =>
                setOverrides((o) => ({ ...o, is_public: v }))
              }
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* -- Storage Section -- */}
      <section aria-labelledby="settings-storage-heading">
        <h3 id="settings-storage-heading" className="text-base font-semibold mb-4">
          Storage
        </h3>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Currently using{" "}
            <span className="font-medium text-foreground">
              {formatBytes(repository.storage_used_bytes)}
            </span>
            {repository.quota_bytes ? (
              <>
                {" "}of{" "}
                <span className="font-medium text-foreground">
                  {formatBytes(repository.quota_bytes)}
                </span>
                {" "}quota
                {" "}
                <span className="text-xs">
                  ({Math.round(
                    (repository.storage_used_bytes / repository.quota_bytes) * 100
                  )}% 已使用）
                </span>
              </>
            ) : (
              <>（未设置配额）</>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-quota">存储配额</Label>
            <div className="flex gap-2">
              <Input
                id="settings-quota"
                type="number"
                min="0"
                step="any"
                placeholder="无限制"
                value={quotaValue}
                onChange={(e) =>
                  setQuotaOverrides((o) => ({ ...o, value: e.target.value }))
                }
                className="flex-1"
              />
              <Select
                value={quotaUnit}
                onValueChange={(v) =>
                  setQuotaOverrides((o) => ({ ...o, unit: v as QuotaUnit }))
                }
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MB">MB</SelectItem>
                  <SelectItem value="GB">GB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              此仓库的最大存储空间。留空表示无限制。
            </p>
          </div>
        </div>
      </section>

      <Separator />

      {/* -- Cleanup Policies Section -- */}
      <section aria-labelledby="settings-cleanup-heading">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 id="settings-cleanup-heading" className="text-base font-semibold">
              Cleanup Policies
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              生命周期策略，自动移除旧的或未使用的制品。
            </p>
          </div>
        </div>

        {policiesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !policies || policies.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              此仓库未配置清理策略。
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cleanup policies can be created from the Lifecycle section in
              the administration panel.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {policies.map((policy) => (
              <CleanupPolicyRow
                key={policy.id}
                policy={policy}
                onPreview={() => previewPolicyMutation.mutate(policy.id)}
                onExecute={() => executePolicyMutation.mutate(policy.id)}
                onDelete={() => deletePolicyMutation.mutate(policy.id)}
                previewPending={previewPolicyMutation.isPending}
                executePending={executePolicyMutation.isPending}
                deletePending={deletePolicyMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* -- Read-only Info Section -- */}
      <section aria-labelledby="settings-info-heading">
        <h3 id="settings-info-heading" className="text-base font-semibold mb-4">
          Repository Info
        </h3>
        <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">格式</dt>
          <dd>
            <Badge variant="secondary" className="text-xs">
              {repository.format.toUpperCase()}
            </Badge>
          </dd>
          <dt className="text-muted-foreground">类型</dt>
          <dd className="capitalize">{repository.repo_type}</dd>
          <dt className="text-muted-foreground">创建时间</dt>
          <dd>{new Date(repository.created_at).toLocaleDateString("zh-CN")}</dd>
          <dt className="text-muted-foreground">最后更新</dt>
          <dd>{new Date(repository.updated_at).toLocaleDateString("zh-CN")}</dd>
          {repository.upstream_url && (
            <>
              <dt className="text-muted-foreground">上游 URL</dt>
              <dd className="font-mono text-xs break-all">
                {repository.upstream_url}
              </dd>
            </>
          )}
        </dl>
      </section>

      {/* -- Save / Discard bar -- */}
      {hasChanges && (
        <div className="sticky bottom-0 bg-background border-t pt-4 pb-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 text-yellow-500" />
            <span>您有未保存的更改</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleDiscard}>
              Discard
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !form.name.trim() || !form.key.trim()}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Cleanup policy row sub-component --

interface CleanupPolicyRowProps {
  policy: LifecyclePolicy;
  onPreview: () => void;
  onExecute: () => void;
  onDelete: () => void;
  previewPending: boolean;
  executePending: boolean;
  deletePending: boolean;
}

function CleanupPolicyRow({
  policy,
  onPreview,
  onExecute,
  onDelete,
  previewPending,
  executePending,
  deletePending,
}: CleanupPolicyRowProps) {
  const typeLabel =
    POLICY_TYPE_LABELS[policy.policy_type as PolicyType] ?? policy.policy_type;

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{policy.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-xs font-normal">
              {typeLabel}
            </Badge>
            <Badge
              variant={policy.enabled ? "default" : "secondary"}
              className="text-xs font-normal"
            >
              {policy.enabled ? "活跃" : "已禁用"}
            </Badge>
            {policy.last_run_at && (
              <span className="text-xs text-muted-foreground">
                上次运行：{new Date(policy.last_run_at).toLocaleDateString("zh-CN")}
                {policy.last_run_items_removed != null &&
                  ` (${policy.last_run_items_removed} 已移除）`}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onPreview}
              disabled={previewPending}
              aria-label={`预览策略 ${policy.name}`}
            >
              <Eye className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>预览（试运行）</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onExecute}
              disabled={executePending}
              aria-label={`执行策略 ${policy.name}`}
            >
              <Play className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>立即执行</TooltipContent>
        </Tooltip>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  disabled={deletePending}
                  aria-label={`删除策略 ${policy.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除策略</TooltipContent>
            </Tooltip>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除清理策略</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除 &quot;{policy.name}&quot; 策略吗？
                此操作不会影响之前已清理的制品。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
