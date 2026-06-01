"use client";

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { mutationErrorToast } from "@/lib/error-utils";
import type { RepoSelector, MatchedRepository } from "@/lib/api/service-accounts";
import { serviceAccountsApi } from "@/lib/api/service-accounts";

const COMMON_FORMATS = [
  "docker",
  "maven",
  "npm",
  "pypi",
  "cargo",
  "helm",
  "nuget",
  "go",
  "rubygems",
  "debian",
  "rpm",
  "generic",
];

interface RepoSelectorFormProps {
  readonly value: RepoSelector;
  readonly onChange: (selector: RepoSelector) => void;
}

export function RepoSelectorForm({ value, onChange }: RepoSelectorFormProps) {
  const [labelKey, setLabelKey] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [previewResults, setPreviewResults] = useState<MatchedRepository[] | null>(null);

  const previewMutation = useMutation({
    mutationFn: (selector: RepoSelector) =>
      serviceAccountsApi.previewRepoSelector(selector),
    onSuccess: (data) => {
      setPreviewResults(data.matched_repositories);
    },
    onError: mutationErrorToast("预览仓库选择器失败"),
  });

  const toggleFormat = useCallback(
    (format: string) => {
      const current = value.match_formats ?? [];
      const updated = current.includes(format)
        ? current.filter((f) => f !== format)
        : [...current, format];
      onChange({ ...value, match_formats: updated.length > 0 ? updated : undefined });
      setPreviewResults(null);
    },
    [value, onChange]
  );

  const addLabel = useCallback(() => {
    if (!labelKey.trim() || !labelValue.trim()) return;
    const current = value.match_labels ?? {};
    onChange({
      ...value,
      match_labels: { ...current, [labelKey.trim()]: labelValue.trim() },
    });
    setLabelKey("");
    setLabelValue("");
    setPreviewResults(null);
  }, [value, onChange, labelKey, labelValue]);

  const removeLabel = useCallback(
    (key: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _removed, ...current } = value.match_labels ?? {};
      onChange({
        ...value,
        match_labels: Object.keys(current).length > 0 ? current : undefined,
      });
      setPreviewResults(null);
    },
    [value, onChange]
  );

  const setPattern = useCallback(
    (pattern: string) => {
      onChange({
        ...value,
        match_pattern: pattern || undefined,
      });
      setPreviewResults(null);
    },
    [value, onChange]
  );

  const hasFilters =
    (value.match_formats?.length ?? 0) > 0 ||
    Object.keys(value.match_labels ?? {}).length > 0 ||
    !!value.match_pattern;

  return (
    <div className="space-y-4">
      {/* Formats */}
      <div className="space-y-2">
        <Label>格式</Label>
        <p className="text-xs text-muted-foreground">
          限制访问特定类型的仓库。
        </p>
        <div className="grid grid-cols-3 gap-2">
          {COMMON_FORMATS.map((fmt) => (
            <label key={fmt} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={(value.match_formats ?? []).includes(fmt)}
                onCheckedChange={() => toggleFormat(fmt)}
              />
              {fmt}
            </label>
          ))}
        </div>
      </div>

      {/* Name pattern */}
      <div className="space-y-2">
        <Label htmlFor="repo-pattern">名称模式</Label>
        <Input
          id="repo-pattern"
          value={value.match_pattern ?? ""}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="libs-*"
        />
        <p className="text-xs text-muted-foreground">
          使用 * 作为通配符。例如，&quot;prod-*&quot; 匹配所有以 &quot;prod-&quot; 开头的仓库。
        </p>
      </div>

      {/* Labels */}
      <div className="space-y-2">
        <Label>标签</Label>
        <p className="text-xs text-muted-foreground">
          匹配包含所有指定标签键值对的仓库。
        </p>
        {Object.entries(value.match_labels ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(value.match_labels ?? {}).map(([k, v]) => (
              <Badge key={k} variant="secondary" className="gap-1 pr-1">
                {k}={v}
                <button
                  type="button"
                  onClick={() => removeLabel(k)}
                  className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={labelKey}
            onChange={(e) => setLabelKey(e.target.value)}
            placeholder="键（例如，env）"
            className="flex-1"
          />
          <Input
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            placeholder="值（例如，production）"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLabel();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={addLabel}
            disabled={!labelKey.trim() || !labelValue.trim()}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasFilters || previewMutation.isPending}
          onClick={() => previewMutation.mutate(value)}
        >
          <Search className="size-4" />
          {previewMutation.isPending ? "检查中..." : "预览匹配的仓库"}
        </Button>
        {previewResults !== null && (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium mb-1">
              {previewResults.length} {previewResults.length === 1 ? "个仓库" : "个仓库"}匹配
            </p>
            {previewResults.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {previewResults.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      {r.format}
                    </Badge>
                    {r.key}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
