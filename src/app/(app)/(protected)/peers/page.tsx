"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Trash2,
  Server,
  Wifi,
  RefreshCcw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { peersApi } from "@/lib/api/replication";
import type { PeerInstance } from "@/lib/api/replication";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes, isSafeUrl } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";

// -- helpers --

function cachePercent(peer: PeerInstance): number {
  if (peer.cache_size_bytes === 0) return 0;
  return Math.round(
    (peer.cache_used_bytes / peer.cache_size_bytes) * 100
  );
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}天前`;
}

const STATUS_COLORS: Record<string, "green" | "red" | "blue" | "yellow" | "default"> = {
  online: "green",
  offline: "red",
  syncing: "blue",
  degraded: "yellow",
};

// -- page --

export default function PeersPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // create form
  const [form, setForm] = useState({
    name: "",
    endpoint_url: "",
    region: "",
    api_key: "",
  });

  // -- queries --
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["peers", statusFilter === "__all__" ? undefined : statusFilter],
    queryFn: () =>
      peersApi.list({
        per_page: 100,
        status: statusFilter === "__all__" ? undefined : statusFilter,
      }),
  });

  const peers = data?.items ?? [];
  const onlineCount = peers.filter((p) => p.status === "online").length;
  const syncingCount = peers.filter((p) => p.status === "syncing").length;

  // -- mutations --
  const registerMutation = useMutation({
    mutationFn: (req: { name: string; endpoint_url: string; region?: string; api_key: string }) =>
      peersApi.register(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peers"] });
      setCreateOpen(false);
      setForm({ name: "", endpoint_url: "", region: "", api_key: "" });
      toast.success("对等节点注册成功");
    },
    onError: mutationErrorToast("注册对等节点失败"),
  });

  const unregisterMutation = useMutation({
    mutationFn: (id: string) => peersApi.unregister(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peers"] });
      setDeleteId(null);
      toast.success("对等节点已注销");
    },
    onError: mutationErrorToast("注销对等节点失败"),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => peersApi.triggerSync(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["peers"] });
      toast.success("同步已触发");
    },
    onError: mutationErrorToast("触发同步失败"),
  });

  // -- columns --
  const columns: DataTableColumn<PeerInstance>[] = [
    {
      id: "name",
      header: "名称",
      accessor: (p) => p.name,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Server className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{p.name}</span>
          {p.is_local && (
            <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              LOCAL
            </span>
          )}
        </div>
      ),
    },
    {
      id: "endpoint",
      header: "端点",
      accessor: (p) => p.endpoint_url,
      cell: (p) =>
        isSafeUrl(p.endpoint_url) ? (
          <a
            href={p.endpoint_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary truncate block max-w-[250px]"
          >
            {p.endpoint_url}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground truncate block max-w-[250px]">
            {p.endpoint_url}
          </span>
        ),
    },
    {
      id: "status",
      header: "状态",
      cell: (p) => (
        <StatusBadge
          status={p.status}
          color={STATUS_COLORS[p.status] ?? "default"}
        />
      ),
    },
    {
      id: "region",
      header: "区域",
      accessor: (p) => p.region ?? "",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.region || "-"}
        </span>
      ),
    },
    {
      id: "cache",
      header: "缓存使用",
      cell: (p) => {
        const pct = cachePercent(p);
        return (
          <div className="flex items-center gap-2 min-w-[140px]">
            <Progress
              value={pct}
              className={`flex-1 h-1.5 ${pct > 90 ? "[&>[data-slot=progress-indicator]]:bg-red-500" : ""}`}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatBytes(p.cache_used_bytes)} / {formatBytes(p.cache_size_bytes)} ({pct}%)
            </span>
          </div>
        );
      },
    },
    {
      id: "heartbeat",
      header: "最后心跳",
      accessor: (p) => p.last_heartbeat_at ?? "",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.last_heartbeat_at ? relativeTime(p.last_heartbeat_at) : "从未"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (p) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => syncMutation.mutate(p.id)}
                disabled={p.status === "offline"}
              >
                <RefreshCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>触发同步</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteId(p.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>注销</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="对等节点"
        description="管理网格网络中的对等节点实例"
        actions={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    queryClient.invalidateQueries({ queryKey: ["peers"] })
                  }
                >
                  <RefreshCw
                    className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新</TooltipContent>
            </Tooltip>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              注册对等节点
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">总对等节点</p>
              <p className="text-2xl font-semibold">{peers.length}</p>
            </div>
            <Server className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">在线</p>
              <p className="text-2xl font-semibold text-emerald-600">
                {onlineCount}
              </p>
            </div>
            <Wifi className="size-8 text-emerald-200" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">同步中</p>
              <p className="text-2xl font-semibold text-blue-600">
                {syncingCount}
              </p>
            </div>
            <Loader2 className="size-8 text-blue-200" />
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="按状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">所有状态</SelectItem>
            <SelectItem value="online">在线</SelectItem>
            <SelectItem value="offline">离线</SelectItem>
            <SelectItem value="syncing">同步中</SelectItem>
            <SelectItem value="degraded">降级</SelectItem>
          </SelectContent>
        </Select>
        {statusFilter !== "__all__" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter("__all__")}
          >
            清除筛选
          </Button>
        )}
      </div>

      {/* Table */}
      {peers.length === 0 && !isLoading ? (
        <EmptyState
          icon={Server}
          title="暂无对等节点"
          description="注册一个对等节点实例以启用网格复制。"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              注册对等节点
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={peers}
          loading={isLoading}
          rowKey={(p) => p.id}
          emptyMessage="未找到对等节点。"
        />
      )}

      {/* -- Register Peer Dialog -- */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o)
            setForm({ name: "", endpoint_url: "", region: "", api_key: "" });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>注册对等节点</DialogTitle>
            <DialogDescription>
              向网格网络添加新的对等节点实例。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              registerMutation.mutate({
                name: form.name,
                endpoint_url: form.endpoint_url,
                region: form.region || undefined,
                api_key: form.api_key,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="peer-name">名称</Label>
              <Input
                id="peer-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="peer-us-west-1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peer-url">端点 URL</Label>
              <Input
                id="peer-url"
                type="url"
                value={form.endpoint_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endpoint_url: e.target.value }))
                }
                placeholder="https://peer.example.com:8080"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peer-region">
                区域{" "}
                <span className="text-muted-foreground font-normal">
                  (可选)
                </span>
              </Label>
              <Input
                id="peer-region"
                value={form.region}
                onChange={(e) =>
                  setForm((f) => ({ ...f, region: e.target.value }))
                }
                placeholder="us-west-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peer-api-key">API 密钥</Label>
              <Input
                id="peer-api-key"
                type="password"
                value={form.api_key}
                onChange={(e) =>
                  setForm((f) => ({ ...f, api_key: e.target.value }))
                }
                placeholder="输入用于身份验证的 API 密钥"
                required
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "注册中..." : "注册"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Delete Confirm -- */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="注销对等节点"
        description="这将永久从网格网络中移除此对等节点。缓存制品将不再从此对等节点提供。"
        confirmText="注销"
        danger
        loading={unregisterMutation.isPending}
        onConfirm={() => {
          if (deleteId) unregisterMutation.mutate(deleteId);
        }}
      />
    </div>
  );
}
