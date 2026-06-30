"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Blocks, Search, FlaskConical, AlertCircle, RotateCcw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import formatHandlersApi, {
  type FormatHandler,
  type FormatTestResult,
} from "@/lib/api/format-handlers";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const QUERY_KEY = ["format-handlers"];

export default function FormatHandlersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [testTarget, setTestTarget] = useState<FormatHandler | null>(null);
  const [testPath, setTestPath] = useState("");
  const [testContent, setTestContent] = useState("");
  const [testResult, setTestResult] = useState<FormatTestResult | null>(null);

  const { data: handlers, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => formatHandlersApi.list(),
    enabled: !!user?.is_admin,
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { key: string; enabled: boolean }) =>
      formatHandlersApi.setEnabled(vars.key, vars.enabled),
    onSuccess: (h) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(`${h.display_name} 已${h.is_enabled ? "启用" : "禁用"}`);
    },
    onError: mutationErrorToast("切换格式处理器失败"),
  });

  const testMutation = useMutation({
    mutationFn: (vars: { key: string; path: string; content: string }) =>
      formatHandlersApi.test(vars.key, { path: vars.path, content: vars.content }),
    onSuccess: (res) => setTestResult(res),
    onError: mutationErrorToast("格式测试失败"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = handlers ?? [];
    if (!q) return all;
    return all.filter(
      (h) =>
        h.format_key.toLowerCase().includes(q) ||
        h.display_name.toLowerCase().includes(q) ||
        h.extensions.some((e) => e.toLowerCase().includes(q)),
    );
  }, [handlers, search]);

  if (!user?.is_admin) {
    return (
      <div className="p-8 text-center text-muted-foreground" role="alert">
        <Blocks className="mx-auto mb-2 size-8 opacity-50" />
        <p className="text-sm">格式处理器管理需要管理员权限。</p>
      </div>
    );
  }

  function openTest(h: FormatHandler) {
    setTestTarget(h);
    setTestPath("");
    setTestContent("");
    setTestResult(null);
  }
  const canRunTest = testPath.trim() !== "" && testContent !== "" && !testMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Blocks className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">格式处理器</h1>
          <p className="text-sm text-muted-foreground">
            启用、禁用并测试包格式处理器（内置及 WASM 插件）。
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="按格式、名称或扩展名筛选…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="筛选处理器" />
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
          <p className="text-sm font-medium">无法加载格式处理器</p>
          <p className="mt-1 text-xs text-muted-foreground">{toUserMessage(error, "未知错误")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
            <RotateCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            重试
          </Button>
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {search ? "没有匹配筛选条件的处理器。" : "未找到格式处理器。"}
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <ul className="divide-y rounded-md border">
          {filtered.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={h.is_enabled}
                  onCheckedChange={(v) => toggleMutation.mutate({ key: h.format_key, enabled: v })}
                  aria-label={`启用 ${h.display_name}`}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{h.display_name}</span>
                    <Badge variant="outline" className="font-mono">{h.format_key}</Badge>
                    <Badge variant={h.handler_type === "Wasm" ? "secondary" : "outline"}>{h.handler_type}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {h.extensions.length > 0 ? h.extensions.join(", ") : "无扩展名"} · 优先级 {h.priority}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" aria-label={`测试 ${h.display_name}`} onClick={() => openTest(h)}>
                <FlaskConical className="size-4" /> 测试
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Test dialog */}
      <Dialog open={testTarget !== null} onOpenChange={(o) => !o && setTestTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>测试 {testTarget?.display_name}</DialogTitle>
            <DialogDescription>
              使用示例内容试运行处理器——仅检查解析，不存储任何内容。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="fh-path">制品路径</Label>
              <Input id="fh-path" value={testPath} onChange={(e) => setTestPath(e.target.value)} placeholder="acme/acme-1.0.0.whl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fh-content">内容</Label>
              <Textarea id="fh-content" rows={6} value={testContent} onChange={(e) => setTestContent(e.target.value)} placeholder="粘贴制品内容或元数据…" />
            </div>
            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-md border p-3 text-sm ${testResult.valid ? "border-emerald-500/40 text-emerald-600" : "border-destructive/40 text-destructive"}`}
                role={testResult.valid ? "status" : "alert"}
              >
                {testResult.valid ? <CheckCircle2 className="size-4 mt-0.5" /> : <XCircle className="size-4 mt-0.5" />}
                <span>{testResult.valid ? "有效——处理器已解析此内容。" : testResult.parse_error || "无效内容。"}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestTarget(null)}>关闭</Button>
            <Button
              disabled={!canRunTest}
              onClick={() => testTarget && testMutation.mutate({ key: testTarget.format_key, path: testPath.trim(), content: testContent })}
            >
              {testMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
              运行测试
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
