"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitPullRequestArrow, Plus, Trash2, Pencil, FlaskConical, AlertCircle, RotateCcw, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import promotionRulesApi, {
  type PromotionRule,
  type CreatePromotionRuleRequest,
} from "@/lib/api/promotion-rules";
import { repositoriesApi } from "@/lib/api/repositories";
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

const QUERY_KEY = ["promotion-rules"];
const SEVERITIES = ["any", "low", "medium", "high", "critical"] as const;

interface FormState {
  name: string;
  source_repo_id: string;
  target_repo_id: string;
  auto_promote: boolean;
  require_signature: boolean;
  is_enabled: boolean;
  max_cve_severity: string; // "any" => null
  min_health_score: number | undefined;
  min_staging_hours: number | undefined;
  max_artifact_age_days: number | undefined;
  /** Comma-separated license identifiers; parsed to string[] on submit. */
  allowed_licenses: string;
}

const emptyForm: FormState = {
  name: "",
  source_repo_id: "",
  target_repo_id: "",
  auto_promote: false,
  require_signature: false,
  is_enabled: true,
  max_cve_severity: "any",
  min_health_score: undefined,
  min_staging_hours: undefined,
  max_artifact_age_days: undefined,
  allowed_licenses: "",
};

function parseLicenses(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function toRequest(f: FormState): CreatePromotionRuleRequest {
  return {
    name: f.name.trim(),
    source_repo_id: f.source_repo_id,
    target_repo_id: f.target_repo_id,
    auto_promote: f.auto_promote,
    require_signature: f.require_signature,
    is_enabled: f.is_enabled,
    max_cve_severity: f.max_cve_severity === "any" ? null : f.max_cve_severity,
    min_health_score: f.min_health_score,
    min_staging_hours: f.min_staging_hours,
    max_artifact_age_days: f.max_artifact_age_days,
    allowed_licenses: parseLicenses(f.allowed_licenses),
  };
}

export default function PromotionRulesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionRule | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<PromotionRule | null>(null);

  const { data: rules, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => promotionRulesApi.list(),
    enabled: !!user?.is_admin,
  });

  const { data: repos } = useQuery({
    queryKey: ["repositories-all"],
    queryFn: () => repositoriesApi.list({ per_page: 1000 }),
    enabled: !!user?.is_admin,
  });
  const repoKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of repos?.items ?? []) map.set(r.id, r.key);
    return (id: string) => map.get(id) ?? id;
  }, [repos?.items]);
  const repoOptions = repos?.items ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: (vars: { id: string | null; form: FormState }) => {
      const req = toRequest(vars.form);
      if (vars.id) {
        // source/target are immutable; the SDK update body omits them.
        return promotionRulesApi.update(vars.id, {
          name: req.name,
          auto_promote: req.auto_promote,
          require_signature: req.require_signature,
          is_enabled: req.is_enabled,
          max_cve_severity: req.max_cve_severity,
          min_health_score: req.min_health_score,
          min_staging_hours: req.min_staging_hours,
          max_artifact_age_days: req.max_artifact_age_days,
          allowed_licenses: req.allowed_licenses,
        });
      }
      return promotionRulesApi.create(req);
    },
    onSuccess: (_p, vars) => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success(vars.id ? "晋升规则已更新" : "晋升规则已创建");
    },
    onError: mutationErrorToast("保存晋升规则失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => promotionRulesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success("晋升规则已删除");
    },
    onError: mutationErrorToast("删除晋升规则失败"),
  });

  const evaluateMutation = useMutation({
    mutationFn: (id: string) => promotionRulesApi.evaluate(id),
    onSuccess: (res) => {
      toast.success(`${res.rule_name}：${res.passed}/${res.total} 通过，${res.failed} 失败`);
    },
    onError: mutationErrorToast("评估失败"),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <GitPullRequestArrow className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">晋升规则管理需要管理员权限。</p>
      </div>
    );
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }
  function openEdit(r: PromotionRule) {
    setEditing(r);
    setForm({
      name: r.name,
      source_repo_id: r.source_repo_id,
      target_repo_id: r.target_repo_id,
      auto_promote: r.auto_promote,
      require_signature: r.require_signature,
      is_enabled: r.is_enabled,
      max_cve_severity: r.max_cve_severity ?? "any",
      min_health_score: r.min_health_score ?? undefined,
      min_staging_hours: r.min_staging_hours ?? undefined,
      max_artifact_age_days: r.max_artifact_age_days ?? undefined,
      allowed_licenses: r.allowed_licenses.join(", "),
    });
    setDialogOpen(true);
  }

  const canSave =
    form.name.trim() !== "" &&
    form.source_repo_id !== "" &&
    form.target_repo_id !== "" &&
    !saveMutation.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    saveMutation.mutate({ id: editing?.id ?? null, form });
  }

  const numField = (v: string): number | undefined => {
    const n = Number.parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  };

  const rows = rules ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitPullRequestArrow className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">晋升规则</h1>
            <p className="text-sm text-muted-foreground">
              将制品从暂存仓库晋升到发布仓库的门控条件。
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          新建规则
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
          <AlertCircle className="size-8 mb-2 text-destructive opacity-80" />
          <p className="text-sm font-medium">无法加载晋升规则</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "未知错误")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            重试
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          <GitPullRequestArrow className="size-8 mb-2 opacity-50" />
          <p className="text-sm">暂无晋升规则。</p>
          <p className="text-xs">创建一个以控制从暂存到发布的晋升。</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  {r.auto_promote && <Badge variant="secondary">自动晋升</Badge>}
                  {!r.is_enabled && <Badge variant="outline">已禁用</Badge>}
                  {r.require_signature && <Badge variant="outline">已签名</Badge>}
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-mono">{repoKey(r.source_repo_id)}</span>
                  <ArrowRight className="size-3" />
                  <span className="font-mono">{repoKey(r.target_repo_id)}</span>
                  {r.max_cve_severity && <span>· 最大 CVE {r.max_cve_severity}</span>}
                  {r.min_health_score != null && <span>· 健康度 ≥ {r.min_health_score}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`评估 ${r.name}`} disabled={evaluateMutation.isPending} onClick={() => evaluateMutation.mutate(r.id)}>
                  <FlaskConical className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`编辑 ${r.name}`} onClick={() => openEdit(r)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`删除 ${r.name}`} onClick={() => setDeleteTarget(r)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? "编辑晋升规则" : "新建晋升规则"}</DialogTitle>
              <DialogDescription>
                当源仓库中的制品满足以下所有门控条件时，将被晋升到目标仓库。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="pr-name">名称</Label>
                <Input id="pr-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="promote-stable" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-source">源（暂存）</Label>
                  {editing ? (
                    <Input id="pr-source" value={repoKey(form.source_repo_id)} disabled />
                  ) : (
                    <Select value={form.source_repo_id} onValueChange={(v) => setForm((f) => ({ ...f, source_repo_id: v }))}>
                      <SelectTrigger id="pr-source" aria-label="源仓库"><SelectValue placeholder="选择源" /></SelectTrigger>
                      <SelectContent>
                        {repoOptions.map((r) => <SelectItem key={r.id} value={r.id}>{r.key}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-target">目标（发布）</Label>
                  {editing ? (
                    <Input id="pr-target" value={repoKey(form.target_repo_id)} disabled />
                  ) : (
                    <Select value={form.target_repo_id} onValueChange={(v) => setForm((f) => ({ ...f, target_repo_id: v }))}>
                      <SelectTrigger id="pr-target" aria-label="目标仓库"><SelectValue placeholder="选择目标" /></SelectTrigger>
                      <SelectContent>
                        {repoOptions.map((r) => <SelectItem key={r.id} value={r.id}>{r.key}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-cve">最大 CVE 严重程度</Label>
                  <Select value={form.max_cve_severity} onValueChange={(v) => setForm((f) => ({ ...f, max_cve_severity: v }))}>
                    <SelectTrigger id="pr-cve" aria-label="最大 CVE 严重程度"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-health">最低健康度</Label>
                  <Input id="pr-health" type="number" min={0} value={form.min_health_score ?? ""} onChange={(e) => setForm((f) => ({ ...f, min_health_score: numField(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-staging">最短暂存时长（小时）</Label>
                  <Input id="pr-staging" type="number" min={0} value={form.min_staging_hours ?? ""} onChange={(e) => setForm((f) => ({ ...f, min_staging_hours: numField(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-age">制品最大年龄（天）</Label>
                  <Input id="pr-age" type="number" min={0} value={form.max_artifact_age_days ?? ""} onChange={(e) => setForm((f) => ({ ...f, max_artifact_age_days: numField(e.target.value) }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-licenses">允许的许可证（逗号分隔，留空 = 任意）</Label>
                <Input id="pr-licenses" value={form.allowed_licenses} onChange={(e) => setForm((f) => ({ ...f, allowed_licenses: e.target.value }))} placeholder="MIT, Apache-2.0, BSD-3-Clause" />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="pr-auto">门控通过时自动晋升</Label>
                <Switch id="pr-auto" checked={form.auto_promote} onCheckedChange={(v) => setForm((f) => ({ ...f, auto_promote: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="pr-sig">要求签名</Label>
                <Switch id="pr-sig" checked={form.require_signature} onCheckedChange={(v) => setForm((f) => ({ ...f, require_signature: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="pr-enabled">已启用</Label>
                <Switch id="pr-enabled" checked={form.is_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))} />
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
        title="删除晋升规则？"
        description={`"${deleteTarget?.name ?? ""}"将被永久删除。晋升将不再遵循此规则。`}
        confirmText="删除"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
