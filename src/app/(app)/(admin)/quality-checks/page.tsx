"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, PlayCircle, EyeOff, Eye, AlertCircle, RotateCcw, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";

import qualityChecksApi, {
  type QualityCheck,
  type QualityIssue,
} from "@/lib/api/quality-checks";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const CHECKS_KEY = ["quality-checks"];

function severityVariant(sev: string): "destructive" | "secondary" | "outline" {
  const s = sev.toLowerCase();
  if (s === "critical" || s === "high") return "destructive";
  if (s === "medium") return "secondary";
  return "outline";
}

export default function QualityChecksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<QualityCheck | null>(null);
  const [suppressTarget, setSuppressTarget] = useState<QualityIssue | null>(null);
  const [reason, setReason] = useState("");

  const { data: checks, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: CHECKS_KEY,
    queryFn: () => qualityChecksApi.list(),
    enabled: !!user?.is_admin,
  });

  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: ["quality-check-issues", selected?.id],
    queryFn: () => qualityChecksApi.listIssues(selected!.id),
    enabled: !!selected,
  });

  const invalidateIssues = () =>
    queryClient.invalidateQueries({ queryKey: ["quality-check-issues", selected?.id] });

  const triggerMutation = useMutation({
    mutationFn: () => qualityChecksApi.trigger({}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: CHECKS_KEY });
      toast.success(res.message || `已将 ${res.queued} 个制品加入队列`);
    },
    onError: mutationErrorToast("触发检查失败"),
  });

  const suppressMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      qualityChecksApi.suppressIssue(vars.id, vars.reason),
    onSuccess: () => {
      invalidateIssues();
      setSuppressTarget(null);
      setReason("");
      toast.success("问题已屏蔽");
    },
    onError: mutationErrorToast("屏蔽问题失败"),
  });

  const unsuppressMutation = useMutation({
    mutationFn: (id: string) => qualityChecksApi.unsuppressIssue(id),
    onSuccess: () => {
      invalidateIssues();
      toast.success("问题已取消屏蔽");
    },
    onError: mutationErrorToast("取消屏蔽问题失败"),
  });

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <ShieldCheck className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">质量检查需要管理员权限。</p>
      </div>
    );
  }

  const rows = checks ?? [];
  const canSuppress = reason.trim() !== "" && !suppressMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">质量检查</h1>
            <p className="text-sm text-muted-foreground">
              制品质量检查结果及其发现。
            </p>
          </div>
        </div>
        <Button onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending}>
          {triggerMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          运行检查
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
          <p className="text-sm font-medium">无法加载质量检查</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "未知错误")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            重试
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
          <ListChecks className="size-8 mb-2 opacity-50" />
          <p className="text-sm">暂无质量检查结果。</p>
          <p className="text-xs">运行检查以评估你的制品。</p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium capitalize">{c.check_type}</span>
                  {c.passed === true && <Badge variant="secondary">通过</Badge>}
                  {c.passed === false && <Badge variant="destructive">失败</Badge>}
                  {c.score != null && <span className="text-xs text-muted-foreground">分数 {c.score}</span>}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{c.issues_count} 个问题</span>
                  {c.critical_count > 0 && <Badge variant="destructive">{c.critical_count} 严重</Badge>}
                  {c.high_count > 0 && <Badge variant="destructive">{c.high_count} 高</Badge>}
                  {c.medium_count > 0 && <Badge variant="secondary">{c.medium_count} 中</Badge>}
                  {c.error_message && <span className="truncate max-w-[16rem] text-destructive">· {c.error_message}</span>}
                </p>
              </div>
              <Button variant="ghost" size="sm" aria-label={`查看 ${c.check_type} 的问题`} onClick={() => setSelected(c)} disabled={c.issues_count === 0}>
                查看问题
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Issues dialog */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="capitalize">{selected?.check_type} 问题</DialogTitle>
            <DialogDescription>屏蔽已接受或误报的发现。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {issuesLoading && <Skeleton className="h-16 w-full" />}
            {!issuesLoading && (issues?.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">暂无问题。</p>
            )}
            {!issuesLoading &&
              (issues ?? []).map((iss) => (
                <div key={iss.id} className={`rounded-md border p-3 ${iss.is_suppressed ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={severityVariant(iss.severity)} className="capitalize">{iss.severity}</Badge>
                        <span className="truncate text-sm font-medium">{iss.title}</span>
                        {iss.is_suppressed && <Badge variant="outline">已屏蔽</Badge>}
                      </div>
                      {iss.description && <p className="mt-1 text-xs text-muted-foreground">{iss.description}</p>}
                      {iss.location && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{iss.location}</p>}
                    </div>
                    {iss.is_suppressed ? (
                      <Button variant="ghost" size="sm" aria-label={`取消屏蔽 ${iss.title}`} onClick={() => unsuppressMutation.mutate(iss.id)}>
                        <Eye className="size-4" /> 恢复
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" aria-label={`屏蔽 ${iss.title}`} onClick={() => { setSuppressTarget(iss); setReason(""); }}>
                        <EyeOff className="size-4" /> 屏蔽
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Suppress reason dialog */}
      <Dialog open={suppressTarget !== null} onOpenChange={(o) => { if (!o) { setSuppressTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>屏蔽问题</DialogTitle>
            <DialogDescription>原因将记录到审计轨迹中。</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="qc-reason" className="sr-only">原因</Label>
            <Input id="qc-reason" aria-label="原因" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="已接受的风险 / 误报" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSuppressTarget(null); setReason(""); }}>取消</Button>
            <Button disabled={!canSuppress} onClick={() => suppressTarget && suppressMutation.mutate({ id: suppressTarget.id, reason: reason.trim() })}>
              {suppressMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              屏蔽
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
