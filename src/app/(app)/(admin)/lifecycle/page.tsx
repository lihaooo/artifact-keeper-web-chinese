"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Recycle,
  Plus,
  Play,
  Eye,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import lifecycleApi from "@/lib/api/lifecycle";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import type {
  LifecyclePolicy,
  CreateLifecyclePolicyRequest,
  PolicyExecutionResult,
} from "@/types/lifecycle";
import { POLICY_TYPE_LABELS, type PolicyType } from "@/types/lifecycle";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const POLICY_CONFIG_HINTS: Record<string, string> = {
  max_age_days: '{ "days": 90 }',
  max_versions: '{ "keep": 5 }',
  no_downloads_days: '{ "days": 180 }',
  tag_pattern_keep: '{ "pattern": "^release-" }',
  tag_pattern_delete: '{ "pattern": "^snapshot-" }',
  size_quota_bytes: '{ "max_bytes": 10737418240 }',
};

export default function LifecyclePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [previewResult, setPreviewResult] =
    useState<PolicyExecutionResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LifecyclePolicy | null>(
    null
  );

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<string>("max_age_days");
  const [formConfig, setFormConfig] = useState('{ "days": 90 }');

  const { data: policies, isLoading } = useQuery({
    queryKey: ["lifecycle-policies"],
    queryFn: () => lifecycleApi.list(),
    enabled: !!user?.is_admin,
  });

  const createMutation = useMutation({
    mutationFn: (req: CreateLifecyclePolicyRequest) => lifecycleApi.create(req),
    onSuccess: () => {
      toast.success("策略已创建");
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
      setCreateOpen(false);
      resetForm();
    },
    onError: mutationErrorToast("创建策略失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.delete(id),
    onSuccess: () => {
      toast.success("策略已删除");
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
      setDeleteTarget(null);
    },
    onError: mutationErrorToast("删除策略失败"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      lifecycleApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast("更新策略失败"),
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.execute(id),
    onSuccess: (result) => {
      toast.success(
        `已移除 ${result.artifacts_removed} 个制品（释放 ${formatBytes(result.bytes_freed)}）`
      );
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast("执行失败"),
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.preview(id),
    onSuccess: (result) => setPreviewResult(result),
    onError: mutationErrorToast("预览失败"),
  });

  const executeAllMutation = useMutation({
    mutationFn: () => lifecycleApi.executeAll(),
    onSuccess: (results) => {
      const totalRemoved = results.reduce(
        (sum, r) => sum + r.artifacts_removed,
        0
      );
      const totalFreed = results.reduce((sum, r) => sum + r.bytes_freed, 0);
      toast.success(
        `已执行 ${results.length} 个策略：移除 ${totalRemoved} 个制品，释放 ${formatBytes(totalFreed)}`
      );
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast("全部执行失败"),
  });

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormType("max_age_days");
    setFormConfig('{ "days": 90 }');
  }

  function handleCreate() {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(formConfig);
    } catch {
      toast.error("配置字段 JSON 格式无效");
      return;
    }
    createMutation.mutate({
      name: formName,
      description: formDescription || undefined,
      policy_type: formType,
      config,
    });
  }

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="生命周期策略" />
        <Alert variant="destructive">
          <AlertTitle>访问被拒绝</AlertTitle>
        </Alert>
      </div>
    );
  }

  const enabledCount = policies?.filter((p) => p.enabled).length ?? 0;
  const lastRunPolicy = policies
    ?.filter((p) => p.last_run_at)
    .sort(
      (a, b) =>
        new Date(b.last_run_at!).getTime() - new Date(a.last_run_at!).getTime()
    )[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="生命周期策略"
        description="管理制品保留和清理策略。"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => executeAllMutation.mutate()}
              disabled={executeAllMutation.isPending || !enabledCount}
            >
              {executeAllMutation.isPending ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Play className="size-4 mr-1.5" />
              )}
              全部执行
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1.5" />
              新建策略
            </Button>
          </div>
        }
      />

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            icon={Recycle}
            label="策略总数"
            value={policies?.length ?? 0}
            color="blue"
          />
          <StatCard
            icon={CheckCircle2}
            label="已启用"
            value={enabledCount}
            color="green"
          />
          <StatCard
            icon={RefreshCw}
            label="上次执行"
            value={
              lastRunPolicy?.last_run_at
                ? formatDateTime(lastRunPolicy.last_run_at)
                : "从未"
            }
            color="purple"
          />
        </div>
      )}

      {/* Policy Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">策略</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !policies?.length ? (
            <div className="px-6 pb-4">
              <EmptyState
                icon={Recycle}
                title="暂无生命周期策略"
                description="创建策略以自动管理制品保留。"
                action={
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4 mr-1.5" />
                    创建策略
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">上次执行</TableHead>
                  <TableHead className="text-right">已移除</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{policy.name}</div>
                        {policy.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {policy.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {POLICY_TYPE_LABELS[
                          policy.policy_type as PolicyType
                        ] ?? policy.policy_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={policy.enabled ? "enabled" : "disabled"}
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {policy.last_run_at
                        ? formatDateTime(policy.last_run_at)
                        : "从未"}
                    </TableCell>
                    <TableCell className="text-right">
                      {policy.last_run_items_removed ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            toggleMutation.mutate({
                              id: policy.id,
                              enabled: !policy.enabled,
                            })
                          }
                          aria-label={`${policy.enabled ? "禁用" : "启用"} policy ${policy.name}`}
                        >
                          {policy.enabled ? (
                            <XCircle className="size-4" />
                          ) : (
                            <CheckCircle2 className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => previewMutation.mutate(policy.id)}
                          disabled={previewMutation.isPending}
                          aria-label={`Preview policy ${policy.name} (dry run)`}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => executeMutation.mutate(policy.id)}
                          disabled={executeMutation.isPending}
                          aria-label={`Execute policy ${policy.name}`}
                        >
                          <Play className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(policy)}
                          aria-label={`Delete policy ${policy.name}`}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Preview Result */}
      {previewResult && (
        <Alert>
          <Eye className="size-4" />
          <AlertTitle>
            预览：{previewResult.policy_name}
          </AlertTitle>
          <AlertDescription>
            将匹配 {previewResult.artifacts_matched} 个制品，移除{" "}
            {previewResult.artifacts_removed} 个，释放{" "}
            {formatBytes(previewResult.bytes_freed)}。
            {previewResult.errors.length > 0 && (
              <span className="text-destructive">
                {" "}
                {previewResult.errors.length} 个错误。
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建生命周期策略</DialogTitle>
            <DialogDescription>
              定义策略以自动清理制品。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="lifecycle-name">名称</Label>
              <Input
                id="lifecycle-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如，清理旧快照"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-description">描述</Label>
              <Input
                id="lifecycle-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="可选描述"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-type">策略类型</Label>
              <Select
                value={formType}
                onValueChange={(v) => {
                  setFormType(v);
                  setFormConfig(POLICY_CONFIG_HINTS[v] ?? "{}");
                }}
              >
                <SelectTrigger id="lifecycle-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-config">配置 (JSON)</Label>
              <Textarea
                id="lifecycle-config"
                value={formConfig}
                onChange={(e) => setFormConfig(e.target.value)}
                className="font-mono text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formName || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              )}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除策略"
        description={`删除"${deleteTarget?.name}"？此操作无法撤销。`}
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
