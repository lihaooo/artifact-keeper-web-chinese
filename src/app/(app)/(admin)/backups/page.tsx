/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Play,
  StopCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Archive,
  HardDrive,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

import "@/lib/sdk-client";
import {
  listBackups,
  createBackup,
  executeBackup,
  cancelBackup,
  restoreBackup,
  deleteBackup,
} from "@artifact-keeper/sdk";
import { useAuth } from "@/providers/auth-provider";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";

// -- types --

interface Backup {
  id: string;
  type: "full" | "incremental" | "metadata";
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  storage_path?: string;
  size_bytes: number;
  artifact_count: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  created_by?: string;
  created_at: string;
}

interface BackupsResponse {
  items: Backup[];
  total: number;
}

// -- helpers --

function formatDuration(start: string, end?: string): string {
  if (!end) return "进行中...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

const STATUS_COLORS: Record<string, "green" | "yellow" | "red" | "blue" | "default"> =
  {
    pending: "default",
    in_progress: "blue",
    completed: "green",
    failed: "red",
    cancelled: "yellow",
  };

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="size-3.5" />,
  in_progress: <Loader2 className="size-3.5 animate-spin" />,
  completed: <CheckCircle2 className="size-3.5 text-emerald-600" />,
  failed: <XCircle className="size-3.5 text-red-600" />,
  cancelled: <StopCircle className="size-3.5 text-amber-600" />,
};

const TYPE_COLORS: Record<string, string> = {
  full: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  incremental:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  metadata:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

// -- page --

export default function BackupsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [backupType, setBackupType] = useState<string>("full");

  // -- queries --
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["backups", statusFilter],
    queryFn: async () => {
      const { data, error } = await listBackups({
        query: {
          per_page: 100,
          status: statusFilter !== "__all__" ? statusFilter : undefined,
        },
      });
      if (error) throw error;
      return data as any as BackupsResponse;
    },
    enabled: !!user?.is_admin,
    refetchInterval: 10000,
  });

  const backups = data?.items ?? [];

  // -- computed stats --
  const completedBackups = backups.filter((b) => b.status === "completed").length;
  const inProgressBackups = backups.filter(
    (b) => b.status === "in_progress"
  ).length;
  const totalSize = backups
    .filter((b) => b.status === "completed")
    .reduce((acc, b) => acc + b.size_bytes, 0);
  const lastBackup = backups.find((b) => b.status === "completed");

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: async (type: string) => {
      const { data, error } = await createBackup({
        body: { type },
      });
      if (error) throw error;
      return data as any as Backup;
    },
    onSuccess: () => {
      toast.success("备份创建成功");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      setCreateOpen(false);
      setBackupType("full");
    },
    onError: mutationErrorToast("创建备份失败"),
  });

  const executeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await executeBackup({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("备份已启动");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: mutationErrorToast("启动备份失败"),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await cancelBackup({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("备份已取消");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: mutationErrorToast("取消备份失败"),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await restoreBackup({
        path: { id },
        body: {} as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("恢复已启动");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      setRestoreOpen(false);
      setSelectedBackup(null);
    },
    onError: mutationErrorToast("启动恢复失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteBackup({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("备份已删除");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      setDeleteOpen(false);
      setSelectedBackup(null);
    },
    onError: mutationErrorToast("删除备份失败"),
  });

  // -- handlers --
  const handleRestore = useCallback((b: Backup) => {
    setSelectedBackup(b);
    setRestoreOpen(true);
  }, []);

  const handleDelete = useCallback((b: Backup) => {
    setSelectedBackup(b);
    setDeleteOpen(true);
  }, []);

  // -- columns --
  const columns: DataTableColumn<Backup>[] = [
    {
      id: "type",
      header: "类型",
      accessor: (b) => b.type,
      cell: (b) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[b.type] ?? ""}`}
        >
          {b.type.toUpperCase()}
        </span>
      ),
    },
    {
      id: "status",
      header: "状态",
      accessor: (b) => b.status,
      cell: (b) => (
        <div className="flex items-center gap-1.5">
          {STATUS_ICONS[b.status]}
          <StatusBadge
            status={b.status.replace("_", " ")}
            color={STATUS_COLORS[b.status] ?? "default"}
          />
        </div>
      ),
    },
    {
      id: "size",
      header: "大小",
      accessor: (b) => b.size_bytes,
      sortable: true,
      cell: (b) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(b.size_bytes)}
        </span>
      ),
    },
    {
      id: "artifacts",
      header: "制品数",
      accessor: (b) => b.artifact_count,
      sortable: true,
      cell: (b) => (
        <span className="text-sm text-muted-foreground">
          {b.artifact_count.toLocaleString()}
        </span>
      ),
    },
    {
      id: "duration",
      header: "耗时",
      cell: (b) => (
        <span className="text-sm text-muted-foreground">
          {b.started_at ? formatDuration(b.started_at, b.completed_at) : "\u2014"}
        </span>
      ),
    },
    {
      id: "created_at",
      header: "创建时间",
      accessor: (b) => b.created_at,
      sortable: true,
      cell: (b) => (
        <span className="text-sm text-muted-foreground">
          {new Date(b.created_at).toLocaleString()}
        </span>
      ),
    },
    {
      id: "error",
      header: "错误",
      cell: (b) =>
        b.error_message ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-destructive truncate max-w-[200px] block">
                {b.error_message}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              {b.error_message}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-sm text-muted-foreground">{"\u2014"}</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: (b) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          {b.status === "pending" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => executeMutation.mutate(b.id)}
                  disabled={executeMutation.isPending}
                >
                  <Play className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>执行</TooltipContent>
            </Tooltip>
          )}
          {b.status === "in_progress" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => cancelMutation.mutate(b.id)}
                  disabled={cancelMutation.isPending}
                >
                  <StopCircle className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>取消</TooltipContent>
            </Tooltip>
          )}
          {b.status === "completed" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleRestore(b)}
                >
                  <Download className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>恢复</TooltipContent>
            </Tooltip>
          )}
          {(b.status === "completed" ||
            b.status === "failed" ||
            b.status === "cancelled") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(b)}
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

  // -- render --
  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="备份" />
        <Alert variant="destructive">
          <AlertTitle>访问被拒绝</AlertTitle>
          <AlertDescription>
            您必须是管理员才能查看此页面。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="备份"
        description="创建、管理和恢复系统备份。"
        actions={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    queryClient.invalidateQueries({ queryKey: ["backups"] })
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
              创建备份
            </Button>
          </div>
        }
      />

      {/* In-progress alert */}
      {inProgressBackups > 0 && (
        <Alert>
          <Loader2 className="size-4 animate-spin" />
          <AlertTitle>备份正在进行中</AlertTitle>
          <AlertDescription>
            {inProgressBackups} 个备份正在运行。此页面每 10 秒自动刷新。
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Archive}
          label="备份总数"
          value={backups.length}
          color="blue"
        />
        <StatCard
          icon={CheckCircle2}
          label="已完成"
          value={completedBackups}
          color="green"
        />
        <StatCard
          icon={HardDrive}
          label="备份总大小"
          value={formatBytes(totalSize)}
          color="purple"
        />
        <StatCard
          icon={CalendarDays}
          label="上次备份"
          value={
            lastBackup
              ? new Date(lastBackup.created_at).toLocaleDateString()
              : "从未"
          }
          color="default"
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="按状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部状态</SelectItem>
            <SelectItem value="pending">待处理</SelectItem>
            <SelectItem value="in_progress">进行中</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="failed">已失败</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
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
      {!isLoading && backups.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="暂无备份"
          description="创建备份以保护您的数据。"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              创建备份
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={backups}
          loading={isLoading}
          emptyMessage="未找到备份。"
          rowKey={(b) => b.id}
        />
      )}

      {/* 创建备份对话框 */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setBackupType("full");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建备份</DialogTitle>
            <DialogDescription>
              选择备份类型以创建新的系统备份。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(backupType);
            }}
          >
            <div className="space-y-2">
              <Label>备份类型</Label>
              <Select value={backupType} onValueChange={setBackupType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">
                    完整 - 备份所有数据和制品
                  </SelectItem>
                  <SelectItem value="incremental">
                    增量 - 仅上次备份以来的变更
                  </SelectItem>
                  <SelectItem value="metadata">
                    元数据 - 仅数据库，不含制品
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setBackupType("full");
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "创建中..." : "创建备份"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 恢复确认 */}
      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={(o) => {
          setRestoreOpen(o);
          if (!o) setSelectedBackup(null);
        }}
        title="从备份恢复"
        description={`这将恢复备份创建于 ${selectedBackup ? new Date(selectedBackup.created_at).toLocaleString() : ""} 的所有数据。此操作可能覆盖当前数据。确定吗？`}
        confirmText="确认恢复"
        danger
        loading={restoreMutation.isPending}
        onConfirm={() => {
          if (selectedBackup) restoreMutation.mutate(selectedBackup.id);
        }}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedBackup(null);
        }}
        title="删除备份"
        description="此操作将永久删除备份文件，且无法撤销。"
        confirmText="删除备份"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedBackup) deleteMutation.mutate(selectedBackup.id);
        }}
      />
    </div>
  );
}
