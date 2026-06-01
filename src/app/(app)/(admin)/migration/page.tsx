"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  Square,
  RotateCcw,
  Database,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Unplug,
  ArrowRight,
  Download,
} from "lucide-react";
import { toast } from "sonner";

import { migrationApi } from "@/lib/api/migration";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import type {
  AuthType,
  SourceConnection,
  SourceType,
  CreateConnectionRequest,
  MigrationJob,
  MigrationItem,
  CreateMigrationRequest,
  MigrationJobStatus,
  MigrationProgressEvent,
} from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
import { Skeleton } from "@/components/ui/skeleton";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";

// -- helpers --

function statusColor(
  status: MigrationJobStatus
): "green" | "blue" | "yellow" | "red" | "default" {
  switch (status) {
    case "completed":
      return "green";
    case "running":
    case "assessing":
      return "blue";
    case "paused":
    case "ready":
      return "yellow";
    case "failed":
    case "cancelled":
      return "red";
    default:
      return "default";
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// -- page --

// Default to Artifactory to preserve the prior backend default behavior;
// the user can switch to Nexus before submitting.
const INITIAL_CONN_FORM: {
  name: string;
  url: string;
  auth_type: AuthType;
  source_type: SourceType;
  username: string;
  token: string;
} = {
  name: "",
  url: "",
  auth_type: "api_token",
  source_type: "artifactory",
  username: "",
  token: "",
};

export default function MigrationPage() {
  const queryClient = useQueryClient();

  // -- Connection state --
  const [createConnOpen, setCreateConnOpen] = useState(false);
  const [deleteConnId, setDeleteConnId] = useState<string | null>(null);
  const [connForm, setConnForm] = useState(INITIAL_CONN_FORM);

  // -- Migration state --
  const [createMigOpen, setCreateMigOpen] = useState(false);
  const [deleteMigId, setDeleteMigId] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<MigrationJob | null>(null);
  const [migForm, setMigForm] = useState({
    source_connection_id: "",
    job_type: "full" as "full" | "incremental" | "assessment",
    dry_run: false,
  });

  // -- SSE progress --
  const eventSourceRef = useRef<EventSource | null>(null);
  const [streamingJobId, setStreamingJobId] = useState<string | null>(null);

  // -- Queries --
  const {
    data: connections = [],
    isLoading: connectionsLoading,
  } = useQuery({
    queryKey: ["migration", "connections"],
    queryFn: () => migrationApi.listConnections(),
  });

  const { data: migrationsData, isLoading: migrationsLoading } = useQuery({
    queryKey: ["migration", "jobs"],
    queryFn: () => migrationApi.listMigrations({ per_page: 100 }),
  });

  const { data: detailItems } = useQuery({
    queryKey: ["migration", "items", detailJob?.id],
    queryFn: () =>
      migrationApi.listMigrationItems(detailJob!.id, { per_page: 100 }),
    enabled: !!detailJob,
  });

  const migrations = migrationsData?.items ?? [];

  // -- SSE streaming --
  const startStream = useCallback(
    async (jobId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      const es = await migrationApi.createProgressStream(jobId);
      eventSourceRef.current = es;
      setStreamingJobId(jobId);

      es.onmessage = (event) => {
        try {
          const data: MigrationProgressEvent = JSON.parse(event.data);
          if (
            data.type === "job_complete" ||
            data.type === "job_failed"
          ) {
            es.close();
            eventSourceRef.current = null;
            setStreamingJobId(null);
            queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
          } else {
            queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setStreamingJobId(null);
      };
    },
    [queryClient]
  );

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // -- Connection mutations --
  const createConnMutation = useMutation({
    mutationFn: (data: CreateConnectionRequest) =>
      migrationApi.createConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["migration", "connections"],
      });
      setCreateConnOpen(false);
      setConnForm(INITIAL_CONN_FORM);
      toast.success("连接已创建");
    },
    onError: mutationErrorToast("创建连接失败"),
  });

  const deleteConnMutation = useMutation({
    mutationFn: (id: string) => migrationApi.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["migration", "connections"],
      });
      setDeleteConnId(null);
      toast.success("连接已删除");
    },
    onError: mutationErrorToast("删除连接失败"),
  });

  const testConnMutation = useMutation({
    mutationFn: (id: string) => migrationApi.testConnection(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          `连接已验证。${result.artifactory_version ? `Artifactory ${result.artifactory_version}` : ""}`
        );
      } else {
        toast.error(`连接失败：${result.message}`);
      }
    },
    onError: mutationErrorToast("测试连接失败"),
  });

  // -- Migration mutations --
  const createMigMutation = useMutation({
    mutationFn: (data: CreateMigrationRequest) =>
      migrationApi.createMigration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      setCreateMigOpen(false);
      setMigForm({
        source_connection_id: "",
        job_type: "full",
        dry_run: false,
      });
      toast.success("迁移任务已创建");
    },
    onError: mutationErrorToast("创建迁移失败"),
  });

  const startMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.startMigration(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      startStream(job.id);
      toast.success("迁移已启动");
    },
    onError: mutationErrorToast("启动迁移失败"),
  });

  const pauseMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.pauseMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      toast.success("迁移已暂停");
    },
    onError: mutationErrorToast("暂停迁移失败"),
  });

  const resumeMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.resumeMigration(id),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      startStream(job.id);
      toast.success("迁移已恢复");
    },
    onError: mutationErrorToast("恢复迁移失败"),
  });

  const cancelMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.cancelMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      toast.success("迁移已取消");
    },
    onError: mutationErrorToast("取消迁移失败"),
  });

  const deleteMigMutation = useMutation({
    mutationFn: (id: string) => migrationApi.deleteMigration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["migration", "jobs"] });
      setDeleteMigId(null);
      toast.success("迁移已删除");
    },
    onError: mutationErrorToast("删除迁移失败"),
  });

  // -- Connection columns --
  const connColumns: DataTableColumn<SourceConnection>[] = [
    {
      id: "name",
      header: "名称",
      accessor: (c) => c.name,
      sortable: true,
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Database className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{c.name}</span>
        </div>
      ),
    },
    {
      id: "url",
      header: "端点",
      accessor: (c) => c.url,
      cell: (c) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[300px]">
          {c.url}
        </span>
      ),
    },
    {
      id: "auth_type",
      header: "认证类型",
      cell: (c) => (
        <Badge variant="secondary" className="text-xs">
          {c.auth_type === "api_token" ? "API Token" : "Basic Auth"}
        </Badge>
      ),
    },
    {
      id: "verified",
      header: "已验证",
      cell: (c) => (
        <StatusBadge
          status={c.verified_at ? "已验证" : "未验证"}
          color={c.verified_at ? "green" : "default"}
        />
      ),
    },
    {
      id: "created",
      header: "创建时间",
      accessor: (c) => c.created_at,
      cell: (c) => (
        <span className="text-sm text-muted-foreground">
          {new Date(c.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (c) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => testConnMutation.mutate(c.id)}
                disabled={testConnMutation.isPending}
              >
                <Unplug className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>测试连接</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConnId(c.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // -- Migration columns --
  const migColumns: DataTableColumn<MigrationJob>[] = [
    {
      id: "id",
      header: "任务",
      cell: (j) => (
        <button
          className="text-sm font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setDetailJob(j);
          }}
        >
          {j.id.slice(0, 8)}...
        </button>
      ),
    },
    {
      id: "connection",
      header: "来源",
      cell: (j) => {
        const conn = connections.find(
          (c) => c.id === j.source_connection_id
        );
        return (
          <span className="text-sm">
            {conn?.name ?? j.source_connection_id.slice(0, 8)}
          </span>
        );
      },
    },
    {
      id: "type",
      header: "类型",
      cell: (j) => (
        <Badge variant="secondary" className="text-xs capitalize">
          {j.job_type}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "状态",
      cell: (j) => <StatusBadge status={j.status} color={statusColor(j.status)} />,
    },
    {
      id: "progress",
      header: "进度",
      cell: (j) => (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress
            value={j.progress_percent ?? 0}
            className="flex-1 h-1.5"
          />
          <span className="text-xs text-muted-foreground w-10 text-right">
            {j.progress_percent ?? 0}%
          </span>
        </div>
      ),
    },
    {
      id: "items",
      header: "项目",
      cell: (j) => (
        <span className="text-sm text-muted-foreground">
          {j.completed_items}/{j.total_items}
          {j.failed_items > 0 && (
            <span className="text-red-500 ml-1">
              ({j.failed_items} 失败)
            </span>
          )}
        </span>
      ),
    },
    {
      id: "started",
      header: "启动时间",
      accessor: (j) => j.started_at ?? "",
      cell: (j) => (
        <span className="text-sm text-muted-foreground">
          {j.started_at
            ? new Date(j.started_at).toLocaleString()
            : "未启动"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (j) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          {(j.status === "pending" || j.status === "ready") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => startMigMutation.mutate(j.id)}
                >
                  <Play className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>启动</TooltipContent>
            </Tooltip>
          )}
          {j.status === "running" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => pauseMigMutation.mutate(j.id)}
                >
                  <Pause className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>暂停</TooltipContent>
            </Tooltip>
          )}
          {j.status === "paused" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => resumeMigMutation.mutate(j.id)}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>恢复</TooltipContent>
            </Tooltip>
          )}
          {(j.status === "running" || j.status === "paused") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => cancelMigMutation.mutate(j.id)}
                >
                  <Square className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>取消</TooltipContent>
            </Tooltip>
          )}
          {(j.status === "completed" ||
            j.status === "failed" ||
            j.status === "cancelled" ||
            j.status === "pending") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteMigId(j.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  // -- Item columns for detail dialog --
  const itemColumns: DataTableColumn<MigrationItem>[] = [
    {
      id: "source_path",
      header: "来源路径",
      accessor: (i) => i.source_path,
      cell: (i) => (
        <code className="text-xs">{i.source_path}</code>
      ),
    },
    {
      id: "target_path",
      header: "目标路径",
      cell: (i) => (
        <code className="text-xs text-muted-foreground">
          {i.target_path ?? "-"}
        </code>
      ),
    },
    {
      id: "type",
      header: "类型",
      cell: (i) => (
        <Badge variant="secondary" className="text-xs capitalize">
          {i.item_type}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "状态",
      cell: (i) => {
        const colors: Record<string, "green" | "blue" | "red" | "default"> = {
          completed: "green",
          in_progress: "blue",
          failed: "red",
          skipped: "default",
          pending: "default",
        };
        return (
          <StatusBadge
            status={i.status}
            color={colors[i.status] ?? "default"}
          />
        );
      },
    },
    {
      id: "size",
      header: "大小",
      accessor: (i) => i.size_bytes,
      cell: (i) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(i.size_bytes)}
        </span>
      ),
    },
    {
      id: "error",
      header: "错误",
      cell: (i) =>
        i.error_message ? (
          <span className="text-xs text-red-500 truncate block max-w-[200px]">
            {i.error_message}
          </span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="迁移"
        description="从 Artifactory 或 Nexus 迁移制品到 Artifact Keeper。"
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="刷新迁移数据"
                onClick={() => {
                  queryClient.invalidateQueries({
                    queryKey: ["migration"],
                  });
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新</TooltipContent>
          </Tooltip>
        }
      />

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">
            <Database className="size-4" />
            来源连接
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <ArrowRight className="size-4" />
            迁移任务
          </TabsTrigger>
        </TabsList>

        {/* -- Connections Tab -- */}
        <TabsContent value="connections" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">来源连接</h2>
              <p className="text-sm text-muted-foreground">
                配置到源制品仓库的连接。
              </p>
            </div>
            <Button onClick={() => setCreateConnOpen(true)}>
              <Plus className="size-4" />
              添加连接
            </Button>
          </div>

          {connections.length === 0 && !connectionsLoading ? (
            <EmptyState
              icon={Database}
              title="暂无连接"
              description="添加到 Artifactory 或 Nexus 实例的连接以开始迁移。"
              action={
                <Button onClick={() => setCreateConnOpen(true)}>
                  <Plus className="size-4" />
                  添加连接
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={connColumns}
              data={connections}
              loading={connectionsLoading}
              rowKey={(c) => c.id}
              emptyMessage="未找到连接。"
            />
          )}
        </TabsContent>

        {/* -- Jobs Tab -- */}
        <TabsContent value="jobs" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">迁移任务</h2>
              <p className="text-sm text-muted-foreground">
                创建和管理迁移任务。
              </p>
            </div>
            <Button
              onClick={() => setCreateMigOpen(true)}
              disabled={connections.length === 0}
            >
              <Plus className="size-4" />
              创建迁移
            </Button>
          </div>

          {migrations.length === 0 && !migrationsLoading ? (
            <EmptyState
              icon={ArrowRight}
              title="暂无迁移任务"
              description="创建迁移任务以从源仓库传输制品。"
              action={
                <Button
                  onClick={() => setCreateMigOpen(true)}
                  disabled={connections.length === 0}
                >
                  <Plus className="size-4" />
                  创建迁移
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={migColumns}
              data={migrations}
              loading={migrationsLoading}
              rowKey={(j) => j.id}
              emptyMessage="未找到迁移任务。"
            />
          )}
        </TabsContent>
      </Tabs>

      {/* -- 创建连接对话框 -- */}
      <Dialog
        open={createConnOpen}
        onOpenChange={(o) => {
          setCreateConnOpen(o);
          if (!o) setConnForm(INITIAL_CONN_FORM);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加来源连接</DialogTitle>
            <DialogDescription>
              连接到 Artifactory 或 Nexus 实例以进行迁移。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createConnMutation.mutate({
                name: connForm.name,
                url: connForm.url,
                auth_type: connForm.auth_type,
                source_type: connForm.source_type,
                credentials:
                  connForm.auth_type === "api_token"
                    ? { token: connForm.token }
                    : {
                        username: connForm.username,
                        password: connForm.token,
                      },
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="conn-name">名称</Label>
              <Input
                id="conn-name"
                value={connForm.name}
                onChange={(e) =>
                  setConnForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="例如，生产环境 Artifactory"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-url">端点 URL</Label>
              <Input
                id="conn-url"
                type="url"
                value={connForm.url}
                onChange={(e) =>
                  setConnForm((f) => ({ ...f, url: e.target.value }))
                }
                placeholder="https://artifactory.example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-source-type">来源类型</Label>
              <Select
                value={connForm.source_type}
                onValueChange={(v) =>
                  setConnForm((f) => ({ ...f, source_type: v as SourceType }))
                }
              >
                <SelectTrigger id="conn-source-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="artifactory">Artifactory</SelectItem>
                  <SelectItem value="nexus">Nexus</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>认证类型</Label>
              <Select
                value={connForm.auth_type}
                onValueChange={(v) =>
                  setConnForm((f) => ({ ...f, auth_type: v as AuthType }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api_token">API Token</SelectItem>
                  <SelectItem value="basic_auth">Basic Auth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {connForm.auth_type === "basic_auth" && (
              <div className="space-y-2">
                <Label htmlFor="conn-username">用户名</Label>
                <Input
                  id="conn-username"
                  value={connForm.username}
                  onChange={(e) =>
                    setConnForm((f) => ({ ...f, username: e.target.value }))
                  }
                  placeholder="admin"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="conn-token">
                {connForm.auth_type === "api_token" ? "API Token" : "密码"}
              </Label>
              <Input
                id="conn-token"
                type="password"
                value={connForm.token}
                onChange={(e) =>
                  setConnForm((f) => ({ ...f, token: e.target.value }))
                }
                placeholder={
                  connForm.auth_type === "api_token"
                    ? "输入 API Token"
                    : "输入密码"
                }
                required
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateConnOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={createConnMutation.isPending}>
                {createConnMutation.isPending
                  ? "创建中..."
                  : "添加连接"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- 创建迁移对话框 -- */}
      <Dialog
        open={createMigOpen}
        onOpenChange={(o) => {
          setCreateMigOpen(o);
          if (!o)
            setMigForm({
              source_connection_id: "",
              job_type: "full",
              dry_run: false,
            });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建迁移任务</DialogTitle>
            <DialogDescription>
              从来源连接配置新的迁移。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMigMutation.mutate({
                source_connection_id: migForm.source_connection_id,
                job_type: migForm.job_type,
                config: {
                  dry_run: migForm.dry_run,
                },
              });
            }}
          >
            <div className="space-y-2">
              <Label>来源连接</Label>
              <Select
                value={migForm.source_connection_id}
                onValueChange={(v) =>
                  setMigForm((f) => ({ ...f, source_connection_id: v }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择连接" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>任务类型</Label>
              <Select
                value={migForm.job_type}
                onValueChange={(v) =>
                  setMigForm((f) => ({
                    ...f,
                    job_type: v as "full" | "incremental" | "assessment",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">完整迁移</SelectItem>
                  <SelectItem value="incremental">增量迁移</SelectItem>
                  <SelectItem value="assessment">仅评估</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={migForm.dry_run}
                  onChange={(e) =>
                    setMigForm((f) => ({ ...f, dry_run: e.target.checked }))
                  }
                  className="rounded border-input"
                />
                模拟运行（不实际传输）
              </label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateMigOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={
                  createMigMutation.isPending ||
                  !migForm.source_connection_id
                }
              >
                {createMigMutation.isPending
                  ? "创建中..."
                  : "创建迁移"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- 任务详情对话框 -- */}
      <Dialog
        open={!!detailJob}
        onOpenChange={(o) => {
          if (!o) setDetailJob(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              迁移任务：{detailJob?.id.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              查看详细进度和各个项目的状态。
            </DialogDescription>
          </DialogHeader>
          {detailJob && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">状态</p>
                  <StatusBadge
                    status={detailJob.status}
                    color={statusColor(detailJob.status)}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">进度</p>
                  <p className="font-semibold">
                    {detailJob.progress_percent ?? 0}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">项目</p>
                  <p className="font-semibold">
                    {detailJob.completed_items}/{detailJob.total_items}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">已传输</p>
                  <p className="font-semibold">
                    {formatBytes(detailJob.transferred_bytes)}/{formatBytes(detailJob.total_bytes)}
                  </p>
                </div>
              </div>
              <Progress
                value={detailJob.progress_percent ?? 0}
                className="h-2"
              />
              {detailJob.error_summary && (
                <div className="text-sm text-red-500 rounded-md border border-red-200 bg-red-50 p-3 dark:bg-red-950/20 dark:border-red-800">
                  {detailJob.error_summary}
                </div>
              )}
              <DataTable
                columns={itemColumns}
                data={detailItems?.items ?? []}
                loading={!detailItems}
                rowKey={(i) => i.id}
                emptyMessage="暂无项目。"
              />
            </div>
          )}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* -- 删除连接确认 -- */}
      <ConfirmDialog
        open={!!deleteConnId}
        onOpenChange={(o) => {
          if (!o) setDeleteConnId(null);
        }}
        title="删除连接"
        description="此操作将永久删除此来源连接。引用它的现有迁移任务将保留。"
        confirmText="删除"
        danger
        loading={deleteConnMutation.isPending}
        onConfirm={() => {
          if (deleteConnId) deleteConnMutation.mutate(deleteConnId);
        }}
      />

      {/* -- 删除迁移确认 -- */}
      <ConfirmDialog
        open={!!deleteMigId}
        onOpenChange={(o) => {
          if (!o) setDeleteMigId(null);
        }}
        title="删除迁移任务"
        description="此操作将永久删除此迁移任务及其历史记录。"
        confirmText="删除"
        danger
        loading={deleteMigMutation.isPending}
        onConfirm={() => {
          if (deleteMigId) deleteMigMutation.mutate(deleteMigId);
        }}
      />
    </div>
  );
}
