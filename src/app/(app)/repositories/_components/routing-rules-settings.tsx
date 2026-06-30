"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Route, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { repositoriesApi, type RoutingRule } from "@/lib/api/repositories";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RoutingRulesSettingsProps {
  repository: Repository;
}

/**
 * Routing rules management for a repository (issue #263).
 *
 * Routing rules rewrite the request path before it is forwarded to an upstream
 * server. Each rule is a regex `path_pattern` and a `rewrite_to` template that
 * may reference capture groups (`$1`, `$2`, ...). Rules are evaluated in order
 * and the first match wins.
 *
 * The backend stores the full ordered list, so add/edit/remove all save the
 * complete set via a single POST. Deleting the last rule clears all rules.
 */
export function RoutingRulesSettings({ repository }: RoutingRulesSettingsProps) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["repository", repository.key, "routing-rules"],
    [repository.key]
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => repositoriesApi.getRoutingRules(repository.key),
  });

  // Local editable copy of the rule list. Synced from the server response using
  // the "adjust state during render" pattern (React docs) rather than an effect,
  // so the table reflects fresh query data without an extra commit cycle.
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [syncedRef, setSyncedRef] = useState<RoutingRule[] | null>(null);
  // Draft for the "add rule" row.
  const [draft, setDraft] = useState<RoutingRule>({
    path_pattern: "",
    rewrite_to: "",
  });
  // Validation message for the add-rule row, associated with the pattern input
  // via aria-describedby so it is announced rather than only shown in a toast.
  const [addError, setAddError] = useState<string | null>(null);

  // Whether the locally edited rules differ from the server copy. Computed
  // before the resync below so the resync can avoid clobbering unsaved edits.
  const serverRules = data?.rules ?? [];
  // `dirty` is only meaningful after the first sync. Before the initial seed
  // (syncedRef === null), local `rules` is still [] while the server may already
  // have rules, so a raw length/content comparison would report dirty and the
  // `!dirty` guard below would block the seed, leaving the table empty. Gating
  // on syncedRef !== null lets the initial seed run, then resumes protecting
  // unsaved edits once a sync has happened.
  const dirty =
    syncedRef !== null &&
    (serverRules.length !== rules.length ||
      rules.some(
        (rule, i) =>
          rule.path_pattern !== serverRules[i]?.path_pattern ||
          rule.rewrite_to !== serverRules[i]?.rewrite_to
      ));

  // Resync only when there are no unsaved edits. React Query hands back a fresh
  // array reference on every refetch (e.g. window focus) even when the content
  // is unchanged, so a by-reference check alone would discard in-progress edits.
  // (review fix #462)
  if (data?.rules && data.rules !== syncedRef && !dirty) {
    setSyncedRef(data.rules);
    setRules(data.rules);
  }

  const saveMutation = useMutation({
    mutationFn: (next: RoutingRule[]) =>
      repositoriesApi.setRoutingRules(repository.key, next),
    onSuccess: (resp) => {
      setRules(resp.rules);
      queryClient.invalidateQueries({ queryKey });
      toast.success("路由规则已保存");
    },
    onError: mutationErrorToast("保存路由规则失败"),
  });

  const clearMutation = useMutation({
    mutationFn: () => repositoriesApi.deleteRoutingRules(repository.key),
    onSuccess: () => {
      setRules([]);
      queryClient.invalidateQueries({ queryKey });
      toast.success("路由规则已清空");
    },
    onError: mutationErrorToast("清空路由规则失败"),
  });

  const isBusy = saveMutation.isPending || clearMutation.isPending;

  const handleAdd = () => {
    const pattern = draft.path_pattern.trim();
    const rewrite = draft.rewrite_to.trim();
    if (!pattern || !rewrite) {
      setAddError("模式和重写目标均为必填项。");
      return;
    }
    // The pattern is a regex evaluated by the backend; reject an invalid one
    // here so the operator gets immediate, associated feedback instead of a
    // 400 at save time.
    try {
      new RegExp(pattern);
    } catch {
      setAddError("路径模式不是有效的正则表达式。");
      return;
    }
    setAddError(null);
    const next = [...rules, { path_pattern: pattern, rewrite_to: rewrite }];
    saveMutation.mutate(next, {
      onSuccess: (resp) => {
        setRules(resp.rules);
        setDraft({ path_pattern: "", rewrite_to: "" });
        queryClient.invalidateQueries({ queryKey });
        toast.success("路由规则已添加");
      },
    });
  };

  const handleRemove = (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    if (next.length === 0) {
      // No rules left: clear the config entry entirely.
      clearMutation.mutate();
      return;
    }
    saveMutation.mutate(next, {
      onSuccess: (resp) => {
        setRules(resp.rules);
        queryClient.invalidateQueries({ queryKey });
        toast.success("路由规则已移除");
      },
    });
  };

  const handleEditField = (
    index: number,
    field: keyof RoutingRule,
    value: string
  ) => {
    setRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule))
    );
  };

  return (
    <section aria-labelledby="settings-routing-rules-heading">
      <div className="flex items-center gap-2 mb-2">
        <Route className="size-4 text-muted-foreground" />
        <h3
          id="settings-routing-rules-heading"
          className="text-base font-semibold"
        >
          路由规则
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        在请求转发到上游之前重写请求路径。每条规则由一个正则表达式模式和一个重写模板组成。使用{" "}
        <code className="font-mono">$1</code>、{" "}
        <code className="font-mono">$2</code>{" "}
        等引用捕获组。规则按顺序评估；第一个匹配的规则生效。
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {rules.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                未配置路由规则。请求将原样转发到上游。
              </p>
            </div>
          ) : (
            <Table aria-label="路由规则">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>路径模式</TableHead>
                  <TableHead>重写为</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`规则 ${index + 1} 路径模式`}
                        value={rule.path_pattern}
                        onChange={(e) =>
                          handleEditField(index, "path_pattern", e.target.value)
                        }
                        className="font-mono text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`规则 ${index + 1} 重写为`}
                        value={rule.rewrite_to}
                        onChange={(e) =>
                          handleEditField(index, "rewrite_to", e.target.value)
                        }
                        className="font-mono text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemove(index)}
                        disabled={isBusy}
                        aria-label={`移除规则 ${index + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Save edits to existing rules */}
          {dirty && rules.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => saveMutation.mutate(rules)}
                disabled={isBusy}
                size="sm"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    保存中…
                  </>
                ) : (
                  "保存更改"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRules(data?.rules ?? [])}
                disabled={isBusy}
              >
                放弃
              </Button>
            </div>
          )}

          {/* Add a new rule */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">添加规则</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="routing-rule-pattern" className="text-xs">
                  路径模式
                </Label>
                <Input
                  id="routing-rule-pattern"
                  value={draft.path_pattern}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, path_pattern: e.target.value }));
                    if (addError) setAddError(null);
                  }}
                  placeholder="releases/(.+)"
                  className="font-mono text-xs"
                  aria-invalid={addError != null}
                  aria-describedby="routing-rule-error"
                />
              </div>
              <div className="hidden items-end pb-2 text-muted-foreground sm:flex">
                <ArrowRight className="size-4" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="routing-rule-rewrite" className="text-xs">
                  重写为
                </Label>
                <Input
                  id="routing-rule-rewrite"
                  value={draft.rewrite_to}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, rewrite_to: e.target.value }))
                  }
                  placeholder="download/$1"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            {/* Persistent live region so the error is announced when it
                appears and stays associated with the pattern input. */}
            <p
              id="routing-rule-error"
              role="alert"
              className="min-h-[1rem] text-sm text-red-500"
            >
              {addError}
            </p>
            <Button
              onClick={handleAdd}
              disabled={isBusy || !draft.path_pattern.trim() || !draft.rewrite_to.trim()}
              size="sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              添加规则
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
