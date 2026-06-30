"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Tag } from "lucide-react";

import repoLabelsApi, { type RepoLabel } from "@/lib/api/repo-labels";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface RepoLabelsPanelProps {
  repository: Repository;
}

const LABELS_KEY = (key: string) => ["repo-labels", key];

/** Manage a repository's key/value labels (artifact-keeper#... labels API). */
export function RepoLabelsPanel({ repository }: RepoLabelsPanelProps) {
  const queryClient = useQueryClient();
  const [labelKey, setLabelKey] = useState("");
  const [labelValue, setLabelValue] = useState("");

  const { data: labels, isLoading } = useQuery({
    queryKey: LABELS_KEY(repository.key),
    queryFn: () => repoLabelsApi.list(repository.key),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: LABELS_KEY(repository.key) });

  const addMutation = useMutation({
    mutationFn: ({ k, v }: { k: string; v: string }) => repoLabelsApi.add(repository.key, k, v),
    onSuccess: (_l, { k }) => {
      invalidate();
      setLabelKey("");
      setLabelValue("");
      toast.success(`标签"${k}"已保存`);
    },
    onError: mutationErrorToast("保存标签失败"),
  });

  const removeMutation = useMutation({
    mutationFn: (k: string) => repoLabelsApi.remove(repository.key, k),
    onSuccess: () => {
      invalidate();
      toast.success("标签已移除");
    },
    onError: mutationErrorToast("移除标签失败"),
  });

  const trimmedKey = labelKey.trim();
  const canAdd = trimmedKey !== "" && !addMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    addMutation.mutate({ k: trimmedKey, v: labelValue.trim() });
  }

  const rows = labels ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        用于组织和筛选仓库的键/值标签。
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center" aria-label="添加标签">
        <Input placeholder="键（例如 team）" value={labelKey} onChange={(e) => setLabelKey(e.target.value)} aria-label="标签键" className="sm:max-w-xs" />
        <Input placeholder="值（例如 platform）" value={labelValue} onChange={(e) => setLabelValue(e.target.value)} aria-label="标签值" />
        <Button type="submit" disabled={!canAdd}>
          {addMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          添加
        </Button>
      </form>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-10 text-center text-muted-foreground">
          <Tag className="size-6 mb-2 opacity-50" />
          <p className="text-sm">暂无标签。</p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((l: RepoLabel) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-sm">
                <span className="font-medium">{l.key}</span>
                {l.value && <span className="text-muted-foreground"> = {l.value}</span>}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`移除标签 ${l.key}`}
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(l.key)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
