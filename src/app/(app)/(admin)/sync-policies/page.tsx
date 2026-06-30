"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Workflow, Plus, Trash2, Pencil, AlertCircle, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";

import syncPoliciesApi, {
  filterToArtifactFilter,
  type SyncPolicy,
  type CreateSyncPolicyRequest,
} from "@/lib/api/sync-policies";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
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
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const QUERY_KEY = ["sync-policies"];
const MODES = ["push", "pull", "mirror"] as const;

const emptyForm: CreateSyncPolicyRequest = {
  name: "",
  description: "",
  filter: "",
  replication_mode: "push",
  priority: 100,
};

export default function SyncPoliciesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SyncPolicy | null>(null);
  const [form, setForm] = useState<CreateSyncPolicyRequest>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<SyncPolicy | null>(null);

  const { data: policies, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => syncPoliciesApi.list(),
    enabled: !!user?.is_admin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: string | null; form: CreateSyncPolicyRequest }) => {
      if (vars.id) {
        // UpdateSyncPolicyPayload has no `filter` shorthand — translate the glob
        // into the structured artifact_filter the update endpoint accepts.
        return syncPoliciesApi.update(vars.id, {
          name: vars.form.name,
          description: vars.form.description,
          replication_mode: vars.form.replication_mode,
          priority: vars.form.priority,
          artifact_filter: filterToArtifactFilter(vars.form.filter ?? ""),
        });
      }
      return syncPoliciesApi.create(vars.form);
    },
    onSuccess: (_p, vars) => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success(vars.id ? "同步策略已更新" : "同步策略已创建");
    },
    onError: mutationErrorToast("保存同步策略失败"),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      syncPoliciesApi.toggle(vars.id, vars.enabled),
    onSuccess: () => invalidate(),
    onError: mutationErrorToast("切换同步策略失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => syncPoliciesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success("同步策略已删除");
    },
    onError: mutationErrorToast("删除同步策略失败"),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <Workflow className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">同步策略管理需要管理员权限。</p>
      </div>
    );
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }
  function openEdit(p: SyncPolicy) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description,
      filter: p.filter,
      replication_mode: p.replication_mode,
      priority: p.priority,
    });
    setDialogOpen(true);
  }

  const canSave = form.name.trim() !== "" && !saveMutation.isPending;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    saveMutation.mutate({ id: editing?.id ?? null, form: { ...form, name: form.name.trim() } });
  }

  const rows = policies ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">同步策略</h1>
            <p className="text-sm text-muted-foreground">
              决定哪些制品复制到哪些对等节点、以及如何复制的规则。
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新建策略
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">无法加载同步策略</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "未知错误")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            重试
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          <Workflow className="size-8 mb-2 opacity-50" />
          <p className="text-sm">暂无同步策略。</p>
          <p className="text-xs">创建一个以控制复制的内容和目标。</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={p.enabled}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: p.id, enabled: v })}
                  aria-label={`启用 ${p.name}`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    <Badge variant="outline" className="capitalize">{p.replication_mode}</Badge>
                    <span className="text-xs text-muted-foreground">优先级 {p.priority}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.filter ? `过滤器：${p.filter}` : p.description || "所有制品"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`编辑 ${p.name}`} onClick={() => openEdit(p)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`删除 ${p.name}`} onClick={() => setDeleteTarget(p)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑同步策略" : "新建同步策略"}</DialogTitle>
              <DialogDescription>
                当多个策略匹配同一制品时，优先级高的生效。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="sp-name">名称</Label>
                <Input id="sp-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="mirror-releases" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-desc">描述</Label>
                <Input id="sp-desc" value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sp-mode">模式</Label>
                  <Select value={form.replication_mode} onValueChange={(v) => setForm((f) => ({ ...f, replication_mode: v }))}>
                    <SelectTrigger id="sp-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODES.map((mode) => (
                        <SelectItem key={mode} value={mode} className="capitalize">{mode}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp-priority">优先级</Label>
                  <Input
                    id="sp-priority"
                    type="number"
                    min={0}
                    value={form.priority ?? ""}
                    onChange={(e) => {
                      // Empty/invalid input -> undefined (omitted, backend default)
                      // rather than 0 (Number("") === 0) or NaN (serializes to null).
                      const n = e.target.valueAsNumber;
                      setForm((f) => ({ ...f, priority: Number.isNaN(n) ? undefined : n }));
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-filter">过滤器 glob（可选）</Label>
                <Input id="sp-filter" value={form.filter ?? ""} onChange={(e) => setForm((f) => ({ ...f, filter: e.target.value }))} placeholder="*.tar.gz" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={!canSave}>
                {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除同步策略？"
        description={`"${deleteTarget?.name ?? ""}"将被永久删除。复制将不再遵循此规则。`}
        confirmText="删除"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
