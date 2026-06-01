"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Server,
  Wifi,
  Globe,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { peersApi } from "@/lib/api/replication";
import type { PeerInstance, PeerConnection } from "@/lib/api/replication";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import { repositoriesApi } from "@/lib/api/repositories";
import type { Repository } from "@/types";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";

// -- helpers --

function formatBandwidth(bps: number): string {
  if (bps === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return `${parseFloat((bps / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function cachePercent(peer: PeerInstance): number {
  if (peer.cache_size_bytes === 0) return 0;
  return Math.round(
    (peer.cache_used_bytes / peer.cache_size_bytes) * 100
  );
}

const STATUS_COLORS: Record<string, "green" | "red" | "blue" | "yellow" | "default"> = {
  online: "green",
  offline: "red",
  syncing: "blue",
  degraded: "yellow",
  connected: "green",
  disconnected: "red",
};

type ReplicationModeOption = "push" | "pull" | "mirror" | "none";

// -- page --

export default function ReplicationPage() {
  const queryClient = useQueryClient();
  const [selectedPeerId, setSelectedPeerId] = useState<string>("__none__");
  const [topologyPeerId, setTopologyPeerId] = useState<string>("__none__");
  const [repoModes, setRepoModes] = useState<Record<string, ReplicationModeOption>>({});

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["peers"],
    queryFn: () => peersApi.list({ per_page: 100 }),
  });

  const peers = data?.items ?? [];
  const onlineCount = peers.filter((p) => p.status === "online").length;
  const syncingCount = peers.filter((p) => p.status === "syncing").length;
  const totalCacheUsed = peers.reduce((a, p) => a + p.cache_used_bytes, 0);
  const totalCacheSize = peers.reduce((a, p) => a + p.cache_size_bytes, 0);

  // Subscriptions tab queries
  const { data: reposData } = useQuery({
    queryKey: ["repositories-list"],
    queryFn: () => repositoriesApi.list({ per_page: 200 }),
  });
  const repositories = reposData?.items ?? [];

  const { data: assignedRepos = [] } = useQuery({
    queryKey: ["peer-repos", selectedPeerId],
    queryFn: () => peersApi.getRepositories(selectedPeerId),
    enabled: selectedPeerId !== "__none__",
  });

  const assignedSet = new Set(assignedRepos);

  // Topology tab queries
  const { data: connections = [], isLoading: connectionsLoading } = useQuery({
    queryKey: ["peer-connections", topologyPeerId],
    queryFn: () => peersApi.getConnections(topologyPeerId),
    enabled: topologyPeerId !== "__none__",
  });

  const peerMap = new Map(peers.map((p) => [p.id, p]));

  const assignMutation = useMutation({
    mutationFn: ({
      peerId,
      repoId,
      mode,
    }: {
      peerId: string;
      repoId: string;
      mode: ReplicationModeOption;
    }) =>
      peersApi.assignRepository(peerId, {
        repository_id: repoId,
        sync_enabled: mode !== "none",
        replication_mode: mode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["peer-repos", selectedPeerId],
      });
      toast.success("复制设置已更新");
    },
    onError: mutationErrorToast("更新复制设置失败"),
  });

  // -- subscription repo columns --
  const repoColumns: DataTableColumn<Repository>[] = [
    {
      id: "key",
      header: "仓库键",
      accessor: (r) => r.key,
      sortable: true,
      cell: (r) => (
        <span className="text-sm font-medium">{r.key}</span>
      ),
    },
    {
      id: "format",
      header: "格式",
      cell: (r) => (
        <Badge variant="secondary" className="text-xs">
          {r.format}
        </Badge>
      ),
    },
    {
      id: "mode",
      header: "复制模式",
      cell: (r) => {
        const currentMode = repoModes[r.id] ?? (assignedSet.has(r.id) ? "pull" : "none");
        return (
          <Select
            value={currentMode}
            onValueChange={(val) =>
              setRepoModes((prev) => ({
                ...prev,
                [r.id]: val as ReplicationModeOption,
              }))
            }
          >
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="pull">Pull</SelectItem>
              <SelectItem value="mirror">Mirror</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: "assigned",
      header: "已分配",
      cell: (r) => (
        <Badge
          variant="secondary"
          className={
            assignedSet.has(r.id)
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs"
              : "text-xs"
          }
        >
          {assignedSet.has(r.id) ? "是" : "否"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (r) => {
        const mode = repoModes[r.id];
        if (!mode) return null;
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={assignMutation.isPending}
            onClick={() =>
              assignMutation.mutate({
                peerId: selectedPeerId,
                repoId: r.id,
                mode,
              })
            }
          >
            保存
          </Button>
        );
      },
    },
  ];

  // -- connection columns --
  const connectionColumns: DataTableColumn<PeerConnection>[] = [
    {
      id: "target",
      header: "目标对等节点",
      cell: (c) => {
        const target = peerMap.get(c.target_peer_id);
        return (
          <span className="text-sm font-medium">
            {target?.name ?? c.target_peer_id.slice(0, 8)}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "状态",
      cell: (c) => (
        <StatusBadge
          status={c.status}
          color={STATUS_COLORS[c.status] ?? "default"}
        />
      ),
    },
    {
      id: "latency",
      header: "延迟",
      accessor: (c) => c.latency_ms,
      sortable: true,
      cell: (c) => (
        <span className="text-sm text-muted-foreground">{c.latency_ms} ms</span>
      ),
    },
    {
      id: "bandwidth",
      header: "带宽",
      cell: (c) => (
        <span className="text-sm text-muted-foreground">
          {formatBandwidth(c.bandwidth_estimate_bps)}
        </span>
      ),
    },
    {
      id: "shared",
      header: "共享制品",
      cell: (c) => (
        <span className="text-sm text-muted-foreground">
          {c.shared_artifacts_count}
        </span>
      ),
    },
    {
      id: "transferred",
      header: "传输字节数",
      cell: (c) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(c.bytes_transferred_total)}
        </span>
      ),
    },
    {
      id: "success_failure",
      header: "成功 / 失败",
      cell: (c) => {
        const total = c.transfer_success_count + c.transfer_failure_count;
        if (total === 0)
          return <span className="text-sm text-muted-foreground">-</span>;
        return (
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs"
            >
              {c.transfer_success_count}
            </Badge>
            <Badge
              variant="secondary"
              className={`text-xs ${c.transfer_failure_count > 0 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : ""}`}
            >
              {c.transfer_failure_count}
            </Badge>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="复制仪表板"
        description="监控对等节点复制状态和拓扑。"
        actions={
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
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
        <Card className="py-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">缓存使用</p>
            <p className="text-2xl font-semibold">
              {totalCacheSize > 0
                ? `${formatBytes(totalCacheUsed)} / ${formatBytes(totalCacheSize)}`
                : "N/A"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="subscriptions">订阅</TabsTrigger>
          <TabsTrigger value="topology">拓扑</TabsTrigger>
        </TabsList>

        {/* -- Overview Tab -- */}
        <TabsContent value="overview" className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="h-40" />
                </Card>
              ))}
            </div>
          ) : peers.length === 0 ? (
            <EmptyState
              icon={Server}
              title="暂无对等节点"
              description="从对等节点页面注册对等节点以在此处查看。"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {peers.map((peer) => {
                const pct = cachePercent(peer);
                return (
                  <Card key={peer.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{peer.name}</CardTitle>
                        <StatusBadge
                          status={peer.status}
                          color={STATUS_COLORS[peer.status] ?? "default"}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {peer.region && (
                        <p className="text-xs text-muted-foreground">
                          区域: {peer.region}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground truncate">
                        {peer.endpoint_url}
                      </p>
                      <div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>缓存使用</span>
                          <span>
                            {formatBytes(peer.cache_used_bytes)} /{" "}
                            {formatBytes(peer.cache_size_bytes)}
                          </span>
                        </div>
                        <Progress
                          value={pct}
                          className={`h-1.5 ${pct > 90 ? "[&>[data-slot=progress-indicator]]:bg-red-500" : ""}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">
                            最后同步
                          </p>
                          <p>
                            {peer.last_sync_at
                              ? new Date(peer.last_sync_at).toLocaleString("zh-CN")
                              : "从未"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            心跳
                          </p>
                          <p>
                            {peer.last_heartbeat_at
                              ? new Date(
                                  peer.last_heartbeat_at
                                ).toLocaleString("zh-CN")
                              : "从未"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* -- Subscriptions Tab -- */}
        <TabsContent value="subscriptions" className="mt-6 space-y-4">
          <div>
            <Select
              value={selectedPeerId}
              onValueChange={(val) => {
                setSelectedPeerId(val);
                setRepoModes({});
              }}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="选择一个对等节点" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">选择一个对等节点...</SelectItem>
                {peers.map((peer) => (
                  <SelectItem key={peer.id} value={peer.id}>
                    {peer.name} ({peer.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPeerId === "__none__" ? (
            <EmptyState
              icon={Server}
              title="选择一个对等节点"
              description="在上方选择一个对等节点以管理仓库订阅。"
            />
          ) : (
            <DataTable
              columns={repoColumns}
              data={repositories}
              loading={isLoading}
              rowKey={(r) => r.id}
              emptyMessage="未找到仓库。"
            />
          )}
        </TabsContent>

        {/* -- Topology Tab -- */}
        <TabsContent value="topology" className="mt-6 space-y-4">
          <div>
            <Select
              value={topologyPeerId}
              onValueChange={setTopologyPeerId}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="选择一个对等节点以查看连接" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  选择一个对等节点...
                </SelectItem>
                {peers.map((peer) => (
                  <SelectItem key={peer.id} value={peer.id}>
                    {peer.name} ({peer.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {topologyPeerId === "__none__" ? (
            <EmptyState
              icon={Globe}
              title="选择一个对等节点"
              description="在上方选择一个对等节点以查看其连接。"
            />
          ) : (
            <DataTable
              columns={connectionColumns}
              data={connections}
              loading={connectionsLoading}
              rowKey={(c) => c.id}
              emptyMessage="未找到此对等节点的连接。"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
