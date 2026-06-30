"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Target, Info } from "lucide-react";
import { toast } from "sonner";

import { repositoriesApi } from "@/lib/api/repositories";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const NONE_VALUE = "__none__";

interface ReleaseTargetSettingsProps {
  repository: Repository;
}

/**
 * Release target configuration for staging repositories (issue #260).
 *
 * A staging repository can be linked to a single local "release" repository of
 * the same package format. Promotions from the staging repo then default to the
 * linked release repo, and promotions to any other repository are rejected by
 * the backend.
 *
 * The backend has no GET that returns the current link, so this control is a
 * write-through "set the release target" form. Eligible targets are local
 * repositories that share the staging repo's format.
 */
export function ReleaseTargetSettings({ repository }: ReleaseTargetSettingsProps) {
  const queryClient = useQueryClient();

  // Only staging repositories support release-target linking.
  const isStaging = repository.repo_type === "staging";

  const { data: repoList, isLoading: candidatesLoading } = useQuery({
    queryKey: ["repositories", "release-target-candidates", repository.format],
    // Pull local repos of the matching format. The backend enforces the same
    // format + local-type constraints, so this keeps the picker in sync.
    queryFn: () =>
      repositoriesApi.list({
        repo_type: "local",
        format: repository.format,
        per_page: 200,
      }),
    enabled: isStaging,
  });

  const candidates = useMemo(
    () => (repoList?.items ?? []).filter((r) => r.id !== repository.id),
    [repoList, repository.id]
  );

  const [selected, setSelected] = useState<string>(NONE_VALUE);
  // The backend exposes no GET for the current link, so the picker seeds to
  // "none". Track an explicit change and keep Save disabled until then, so a
  // pristine form cannot unlink an existing target on an accidental click.
  // (review fix #462)
  const [dirty, setDirty] = useState(false);

  const handleSelect = (value: string) => {
    setSelected(value);
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: (releaseKey: string) =>
      repositoriesApi.setReleaseTarget(repository.key, releaseKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setDirty(false);
      toast.success(
        selected === NONE_VALUE
          ? "已移除发布目标链接"
          : "发布目标已保存"
      );
    },
    onError: mutationErrorToast("保存发布目标失败"),
  });

  if (!isStaging) {
    return (
      <section aria-labelledby="settings-release-target-heading">
        <div className="flex items-center gap-2 mb-2">
          <Target className="size-4 text-muted-foreground" />
          <h3
            id="settings-release-target-heading"
            className="text-base font-semibold"
          >
            发布目标
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          发布目标晋升将制品从暂存仓库链接到发布仓库。
        </p>
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            发布目标仅适用于暂存仓库。此仓库是{" "}
            <span className="capitalize">{repository.repo_type}</span>{" "}
            仓库。
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const handleSave = () => {
    // An empty string tells the backend to remove the link.
    saveMutation.mutate(selected === NONE_VALUE ? "" : selected);
  };

  return (
    <section aria-labelledby="settings-release-target-heading">
      <div className="flex items-center gap-2 mb-2">
        <Target className="size-4 text-muted-foreground" />
          <h3
            id="settings-release-target-heading"
            className="text-base font-semibold"
          >
            发布目标
          </h3>
        <Badge variant="secondary" className="text-xs">
          暂存
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        将此暂存仓库链接到发布仓库。从此处的晋升默认指向链接的目标，晋升到其他仓库将被拒绝。目标必须是使用相同{" "}
        <span className="font-medium uppercase">{repository.format}</span>{" "}
        格式的本地仓库。
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="release-target-select">发布仓库</Label>
          {candidatesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selected} onValueChange={handleSelect}>
              <SelectTrigger id="release-target-select" className="w-full">
                <SelectValue placeholder="选择发布仓库" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>无发布目标（取消链接）</SelectItem>
                {candidates.map((repo) => (
                  <SelectItem key={repo.id} value={repo.key}>
                    {repo.name} ({repo.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!candidatesLoading && candidates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              未找到符合条件的发布仓库。请创建一个本地{" "}
              <span className="uppercase">{repository.format}</span>{" "}
              仓库作为发布目标。
            </p>
          )}
        </div>

        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending || !dirty}
          className="w-fit"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              保存中…
            </>
          ) : (
            "保存发布目标"
          )}
        </Button>
      </div>
    </section>
  );
}
