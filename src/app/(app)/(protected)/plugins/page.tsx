/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  Settings,
  Puzzle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Upload,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";

import "@/lib/sdk-client";
import {
  listPlugins,
  getPluginConfig,
  enablePlugin,
  disablePlugin,
  uninstallPlugin,
  updatePluginConfig,
  installFromGit,
  installFromZip,
} from "@artifact-keeper/sdk";
import { mutationErrorToast } from "@/lib/error-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { isSafeUrl } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";

// -- types --

interface Plugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  plugin_type:
    | "format_handler"
    | "storage_backend"
    | "authentication"
    | "authorization"
    | "webhook"
    | "custom";
  status: "active" | "disabled" | "error";
  author?: string;
  homepage?: string;
  error_message?: string;
  installed_at: string;
  updated_at: string;
}

interface PluginsResponse {
  items: Plugin[];
  total: number;
}

interface PluginConfig {
  key: string;
  value: string;
  description?: string;
}

// -- constants --

const TYPE_COLORS: Record<string, string> = {
  format_handler:
    "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  storage_backend:
    "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  authentication:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  authorization:
    "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  webhook:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400",
  custom: "",
};

const STATUS_COLORS: Record<string, "green" | "red" | "default"> = {
  active: "green",
  disabled: "default",
  error: "red",
};

// -- page --

export default function PluginsPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [installOpen, setInstallOpen] = useState(false);
  const [configPlugin, setConfigPlugin] = useState<Plugin | null>(null);
  const [uninstallId, setUninstallId] = useState<string | null>(null);

  // install form
  const [installTab, setInstallTab] = useState<"git" | "zip">("git");
  const [gitUrl, setGitUrl] = useState("");
  const [gitRef, setGitRef] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);

  // -- queries --
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "plugins",
      statusFilter === "__all__" ? undefined : statusFilter,
    ],
    queryFn: async () => {
      const { data, error } = await listPlugins({
        query: {
          status: statusFilter !== "__all__" ? statusFilter : undefined,
        },
      });
      if (error) throw error;
      return data as any as PluginsResponse;
    },
  });

  const { data: pluginConfig } = useQuery({
    queryKey: ["plugin-config", configPlugin?.id],
    queryFn: async () => {
      const { data, error } = await getPluginConfig({
        path: { id: configPlugin!.id },
      });
      if (error) throw error;
      return (data as any).items as PluginConfig[];
    },
    enabled: !!configPlugin,
  });

  const plugins = data?.items ?? [];
  const activeCount = plugins.filter((p) => p.status === "active").length;
  const errorCount = plugins.filter((p) => p.status === "error").length;

  // -- mutations --
  const enableMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await enablePlugin({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast.success("插件已启用");
    },
    onError: mutationErrorToast("启用插件失败"),
  });

  const disableMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await disablePlugin({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      toast.success("插件已禁用");
    },
    onError: mutationErrorToast("禁用插件失败"),
  });

  const uninstallMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await uninstallPlugin({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setUninstallId(null);
      toast.success("插件已卸载");
    },
    onError: mutationErrorToast("卸载插件失败"),
  });

  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  const saveConfigMutation = useMutation({
    mutationFn: async ({
      id,
      config,
    }: {
      id: string;
      config: Record<string, string>;
    }) => {
      const { error } = await updatePluginConfig({
        path: { id },
        body: { config } as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plugin-config"] });
      toast.success("配置已保存");
    },
    onError: mutationErrorToast("保存配置失败"),
  });

  const resetInstallForm = () => {
    setGitUrl("");
    setGitRef("");
    setZipFile(null);
    setInstallTab("git");
  };

  const installGitMutation = useMutation({
    mutationFn: async ({ url, ref }: { url: string; ref?: string }) => {
      const { data, error } = await installFromGit({
        body: { url, ref: ref || null },
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setInstallOpen(false);
      resetInstallForm();
      toast.success(
        `插件 "${data?.name ?? "未知"}" 安装成功`,
      );
    },
    onError: mutationErrorToast("从 Git 安装插件失败"),
  });

  const installZipMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await installFromZip({
        body: formData,
      } as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["plugins"] });
      setInstallOpen(false);
      resetInstallForm();
      toast.success(
        `插件 "${data?.name ?? "未知"}" 安装成功`,
      );
    },
    onError: mutationErrorToast("从 ZIP 安装插件失败"),
  });

  const isInstalling =
    installGitMutation.isPending || installZipMutation.isPending;

  // -- columns --
  const columns: DataTableColumn<Plugin>[] = [
    {
      id: "name",
      header: "名称",
      accessor: (p) => p.name,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Puzzle className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{p.name}</span>
          <Badge variant="secondary" className="text-xs">
            {p.version}
          </Badge>
        </div>
      ),
    },
    {
      id: "type",
      header: "类型",
      cell: (p) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[p.plugin_type] ?? ""}`}
        >
          {p.plugin_type.replace(/_/g, " ")}
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
      id: "description",
      header: "描述",
      cell: (p) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[200px]">
          {p.description || "-"}
        </span>
      ),
    },
    {
      id: "author",
      header: "作者",
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {p.author || "-"}
        </span>
      ),
    },
    {
      id: "installed",
      header: "安装时间",
      accessor: (p) => p.installed_at,
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {new Date(p.installed_at).toLocaleDateString("zh-CN")}
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
                onClick={() => {
                  setConfigPlugin(p);
                  setConfigValues({});
                }}
              >
                <Settings className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>配置</TooltipContent>
          </Tooltip>
          {p.status === "disabled" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => enableMutation.mutate(p.id)}
                >
                  <Play className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>启用</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => disableMutation.mutate(p.id)}
                >
                  <Pause className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>禁用</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setUninstallId(p.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>卸载</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="插件"
        description="管理 WASM 格式处理程序插件。"
        actions={
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    queryClient.invalidateQueries({ queryKey: ["plugins"] })
                  }
                >
                  <RefreshCw
                    className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新</TooltipContent>
            </Tooltip>
            <Button onClick={() => setInstallOpen(true)}>
              <Plus className="size-4" />
              安装插件
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">总计</p>
              <p className="text-2xl font-semibold">{plugins.length}</p>
            </div>
            <Puzzle className="size-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">活跃</p>
              <p className="text-2xl font-semibold text-emerald-600">
                {activeCount}
              </p>
            </div>
            <CheckCircle2 className="size-8 text-emerald-200" />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">错误</p>
              <p
                className={`text-2xl font-semibold ${errorCount > 0 ? "text-red-600" : ""}`}
              >
                {errorCount}
              </p>
            </div>
            <XCircle
              className={`size-8 ${errorCount > 0 ? "text-red-200" : "text-muted-foreground/30"}`}
            />
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent>
            <p className="text-sm text-muted-foreground">已禁用</p>
            <p className="text-2xl font-semibold">
              {plugins.length - activeCount - errorCount}
            </p>
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
            <SelectItem value="active">活跃</SelectItem>
            <SelectItem value="disabled">已禁用</SelectItem>
            <SelectItem value="error">错误</SelectItem>
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
      {plugins.length === 0 && !isLoading ? (
        <EmptyState
          icon={Puzzle}
          title="暂无已安装的插件"
          description="安装插件以扩展 Artifact Keeper 的自定义功能。"
          action={
            <Button onClick={() => setInstallOpen(true)}>
              <Plus className="size-4" />
              安装插件
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={plugins}
          loading={isLoading}
          rowKey={(p) => p.id}
          emptyMessage="未找到插件。"
        />
      )}

      {/* -- Install Plugin Dialog -- */}
      <Dialog
        open={installOpen}
        onOpenChange={(o) => {
          setInstallOpen(o);
          if (!o) resetInstallForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>安装插件</DialogTitle>
            <DialogDescription>
              从 Git 仓库或 ZIP 文件安装格式处理程序插件。
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={installTab}
            onValueChange={(v) => setInstallTab(v as "git" | "zip")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="git" className="flex-1 gap-1.5">
                <GitBranch className="size-3.5" />
                Git 仓库
              </TabsTrigger>
              <TabsTrigger value="zip" className="flex-1 gap-1.5">
                <Upload className="size-3.5" />
                ZIP 上传
              </TabsTrigger>
            </TabsList>
            <TabsContent value="git" className="mt-4">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!gitUrl.trim()) return;
                  installGitMutation.mutate({
                    url: gitUrl.trim(),
                    ref: gitRef.trim() || undefined,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="git-url">仓库 URL</Label>
                  <Input
                    id="git-url"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    placeholder="https://github.com/org/plugin-repo.git"
                    required
                    disabled={isInstalling}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="git-ref">
                    Git 引用{" "}
                    <span className="text-muted-foreground font-normal">
                      (可选)
                    </span>
                  </Label>
                  <Input
                    id="git-ref"
                    value={gitRef}
                    onChange={(e) => setGitRef(e.target.value)}
                    placeholder="v1.0.0, main, or commit SHA"
                    disabled={isInstalling}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setInstallOpen(false)}
                    disabled={isInstalling}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={isInstalling || !gitUrl.trim()}>
                    {installGitMutation.isPending ? "安装中..." : "安装"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
            <TabsContent value="zip" className="mt-4">
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!zipFile) return;
                  installZipMutation.mutate(zipFile);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="zip-file">插件 ZIP 文件</Label>
                  <Input
                    id="zip-file"
                    type="file"
                    accept=".zip"
                    onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                    disabled={isInstalling}
                  />
                  {zipFile && (
                    <p className="text-xs text-muted-foreground">
                      {zipFile.name} ({(zipFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setInstallOpen(false)}
                    disabled={isInstalling}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={isInstalling || !zipFile}>
                    {installZipMutation.isPending ? "上传中..." : "上传并安装"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* -- Plugin Config Dialog -- */}
      <Dialog
        open={!!configPlugin}
        onOpenChange={(o) => {
          if (!o) {
            setConfigPlugin(null);
            setConfigValues({});
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {configPlugin && (
            <>
              <DialogHeader>
                <DialogTitle>配置: {configPlugin.name}</DialogTitle>
                <DialogDescription>
                  查看插件信息并编辑配置。
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="info">
                <TabsList>
                  <TabsTrigger value="info">信息</TabsTrigger>
                  <TabsTrigger value="config">配置</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">名称</p>
                      <p className="font-medium">{configPlugin.name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">版本</p>
                      <p className="font-medium">{configPlugin.version}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">类型</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[configPlugin.plugin_type] ?? ""}`}
                      >
                        {configPlugin.plugin_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div>
                      <p className="text-muted-foreground">状态</p>
                      <StatusBadge
                        status={configPlugin.status}
                        color={STATUS_COLORS[configPlugin.status] ?? "default"}
                      />
                    </div>
                    {configPlugin.description && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">描述</p>
                        <p>{configPlugin.description}</p>
                      </div>
                    )}
                    {configPlugin.author && (
                      <div>
                        <p className="text-muted-foreground">作者</p>
                        <p>{configPlugin.author}</p>
                      </div>
                    )}
                    {configPlugin.homepage && (
                      <div>
                        <p className="text-muted-foreground">主页</p>
                        {isSafeUrl(configPlugin.homepage) ? (
                          <a
                            href={configPlugin.homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            {configPlugin.homepage}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            {configPlugin.homepage}
                          </span>
                        )}
                      </div>
                    )}
                    {configPlugin.error_message && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">错误</p>
                        <p className="text-red-500">
                          {configPlugin.error_message}
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="config" className="mt-4">
                  {pluginConfig && pluginConfig.length > 0 ? (
                    <form
                      className="space-y-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (configPlugin) {
                          const merged = pluginConfig.reduce(
                            (acc, c) => ({
                              ...acc,
                              [c.key]:
                                configValues[c.key] !== undefined
                                  ? configValues[c.key]
                                  : c.value,
                            }),
                            {} as Record<string, string>
                          );
                          saveConfigMutation.mutate({
                            id: configPlugin.id,
                            config: merged,
                          });
                        }
                      }}
                    >
                      {pluginConfig.map((c) => (
                        <div key={c.key} className="space-y-2">
                          <Label htmlFor={`cfg-${c.key}`}>{c.key}</Label>
                          {c.description && (
                            <p className="text-xs text-muted-foreground">
                              {c.description}
                            </p>
                          )}
                          <Input
                            id={`cfg-${c.key}`}
                            defaultValue={c.value}
                            onChange={(e) =>
                              setConfigValues((prev) => ({
                                ...prev,
                                [c.key]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                      <Button
                        type="submit"
                        disabled={saveConfigMutation.isPending}
                      >
                        {saveConfigMutation.isPending
                          ? "保存中..."
                          : "保存配置"}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      此插件没有可用的配置选项。
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* -- Uninstall Confirm -- */}
      <ConfirmDialog
        open={!!uninstallId}
        onOpenChange={(o) => {
          if (!o) setUninstallId(null);
        }}
        title="卸载插件"
        description="这将永久移除此插件及其配置。此插件提供的所有功能将停止工作。"
        confirmText="卸载"
        danger
        loading={uninstallMutation.isPending}
        onConfirm={() => {
          if (uninstallId) uninstallMutation.mutate(uninstallId);
        }}
      />
    </div>
  );
}
