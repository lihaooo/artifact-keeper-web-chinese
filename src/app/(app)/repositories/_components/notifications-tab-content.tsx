"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Plus,
  Trash2,
  TestTube,
  Power,
  PowerOff,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { webhooksApi } from "@/lib/api/webhooks";
import type {
  Webhook,
  WebhookEvent,
  CreateWebhookRequest,
} from "@/lib/api/webhooks";
import { toUserMessage, mutationErrorToast } from "@/lib/error-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string; description: string }[] = [
  {
    value: "artifact_uploaded",
    label: "制品上传",
    description: "当制品被推送到此仓库时触发",
  },
  {
    value: "artifact_deleted",
    label: "制品删除",
    description: "当制品从此仓库中删除时触发",
  },
  {
    value: "build_started",
    label: "构建开始",
    description: "当此仓库中的制品开始构建时触发",
  },
  {
    value: "build_completed",
    label: "构建完成",
    description: "当构建成功完成时触发",
  },
  {
    value: "build_failed",
    label: "构建失败",
    description: "当构建完成但有错误时触发",
  },
  {
    value: "repository_created",
    label: "仓库创建",
    description: "当创建新仓库时触发",
  },
  {
    value: "repository_deleted",
    label: "仓库删除",
    description: "当仓库被删除时触发",
  },
  {
    value: "user_created",
    label: "用户创建",
    description: "当创建新用户账户时触发",
  },
  {
    value: "user_deleted",
    label: "用户删除",
    description: "当用户账户被删除时触发",
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NotificationsTabContentProps {
  repositoryId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsTabContent({ repositoryId }: NotificationsTabContentProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [webhookToDelete, setWebhookToDelete] = useState<string | null>(null);
  const [actingWebhookId, setActingWebhookId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEvent[]>([]);
  const [urlError, setUrlError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormUrl("");
    setFormSecret("");
    setFormEvents([]);
    setUrlError(null);
  }, []);

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  const { data: webhooksData, isLoading } = useQuery({
    queryKey: ["webhooks", repositoryId],
    queryFn: () => webhooksApi.list({ repository_id: repositoryId }),
    enabled: !!repositoryId,
  });

  const webhooks = webhooksData?.items ?? [];

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: (data: CreateWebhookRequest) => webhooksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      setCreateOpen(false);
      resetForm();
      toast.success("Webhook 已创建");
    },
    onError: mutationErrorToast("创建 Webhook 失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      setWebhookToDelete(null);
      setActingWebhookId(null);
      toast.success("Webhook 已删除");
    },
    onError: (err: unknown) => {
      setActingWebhookId(null);
      toast.error(toUserMessage(err, "删除 Webhook 失败"));
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      setActingWebhookId(null);
      toast.success("Webhook 已启用");
    },
    onError: (err: unknown) => {
      setActingWebhookId(null);
      toast.error(toUserMessage(err, "启用 Webhook 失败"));
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks", repositoryId] });
      setActingWebhookId(null);
      toast.success("Webhook 已禁用");
    },
    onError: (err: unknown) => {
      setActingWebhookId(null);
      toast.error(toUserMessage(err, "禁用 Webhook 失败"));
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.test(id),
    onSuccess: (result) => {
      setActingWebhookId(null);
      if (result.success) {
        toast.success(`测试投递成功 (HTTP ${result.status_code})`);
      } else {
        toast.error(result.error ?? "测试投递失败");
      }
    },
    onError: (err: unknown) => {
      setActingWebhookId(null);
      toast.error(toUserMessage(err, "发送测试失败"));
    },
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleToggleEvent = useCallback(
    (event: WebhookEvent, checked: boolean) => {
      setFormEvents((prev) =>
        checked ? [...prev, event] : prev.filter((e) => e !== event)
      );
    },
    []
  );

  const handleCreate = useCallback(() => {
    if (!formName.trim() || !formUrl.trim() || formEvents.length === 0) {
      toast.error("名称、URL 和至少一个事件为必填项");
      return;
    }
    const trimmedUrl = formUrl.trim();
    if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
      setUrlError("URL 必须以 http:// 或 https:// 开头");
      return;
    }
    setUrlError(null);
    createMutation.mutate({
      name: formName.trim(),
      url: trimmedUrl,
      events: formEvents,
      secret: formSecret.trim() || undefined,
      repository_id: repositoryId,
    });
  }, [formName, formUrl, formSecret, formEvents, repositoryId, createMutation]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="notifications-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="size-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Webhook 通知</h3>
          {webhooks.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {webhooks.length} 个已配置
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="add-webhook-button"
        >
          <Plus className="size-4 mr-1" />
          添加 Webhook
        </Button>
      </div>

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Bell className="size-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">
            此仓库尚未配置 Webhook。
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            添加 Webhook 以在事件发生时接收通知。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => {
            const isActing = actingWebhookId === webhook.id;
            return (
              <WebhookCard
                key={webhook.id}
                webhook={webhook}
                onDelete={(id) => setWebhookToDelete(id)}
                onEnable={(id) => {
                  setActingWebhookId(id);
                  enableMutation.mutate(id);
                }}
                onDisable={(id) => {
                  setActingWebhookId(id);
                  disableMutation.mutate(id);
                }}
                onTest={(id) => {
                  setActingWebhookId(id);
                  testMutation.mutate(id);
                }}
                isDeleting={isActing && deleteMutation.isPending}
                isTesting={isActing && testMutation.isPending}
              />
            );
          })}
        </div>
      )}

      {/* Create Webhook Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>添加 Webhook</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="webhook-name">名称</Label>
              <Input
                id="webhook-name"
                placeholder="例如 CI/CD 流水线"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-url">Payload URL</Label>

              <Input
                id="webhook-url"
                type="url"
                placeholder="https://example.com/webhook"
                value={formUrl}
                onChange={(e) => {
                  setFormUrl(e.target.value);
                  setUrlError(null);
                }}
              />
              {urlError && (
                <p className="text-xs text-destructive" data-testid="url-error">
                  {urlError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhook-secret">
                密钥{" "}
                <span className="text-muted-foreground font-normal">（可选）</span>
              </Label>
              <Input
                id="webhook-secret"
                type="password"
                placeholder="用于签名 payload"
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label>事件</Label>
              <div className="grid gap-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <label
                    key={event.value}
                    className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={formEvents.includes(event.value)}
                      onCheckedChange={(checked) =>
                        handleToggleEvent(event.value, checked === true)
                      }
                      aria-label={event.label}
                    />
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">{event.label}</span>
                      <p className="text-xs text-muted-foreground">
                        {event.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                resetForm();
              }}
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="create-webhook-submit"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  创建中...
                </>
              ) : (
                "创建 Webhook"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Webhook Confirm */}
      <ConfirmDialog
        open={!!webhookToDelete}
        onOpenChange={(open) => {
          if (!open) setWebhookToDelete(null);
        }}
        title="删除 Webhook"
        description="此操作将永久移除此 Webhook，它将不再接收事件通知。"
        confirmText="删除 Webhook"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (webhookToDelete) {
            setActingWebhookId(webhookToDelete);
            deleteMutation.mutate(webhookToDelete);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebhookCard sub-component
// ---------------------------------------------------------------------------

interface WebhookCardProps {
  webhook: Webhook;
  onDelete: (id: string) => void;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  onTest: (id: string) => void;
  isDeleting: boolean;
  isTesting: boolean;
}

function WebhookCard({
  webhook,
  onDelete,
  onEnable,
  onDisable,
  onTest,
  isDeleting,
  isTesting,
}: WebhookCardProps) {
  return (
    <div
      className="rounded-lg border bg-card p-4 space-y-3"
      data-testid={`webhook-card-${webhook.id}`}
    >
      {/* Top row: name + status + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{webhook.name}</span>
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${
              webhook.is_enabled
                ? "text-green-600 bg-green-100 dark:bg-green-950/40"
                : "text-muted-foreground"
            }`}
          >
            {webhook.is_enabled ? "活跃" : "未启用"}
          </Badge>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onTest(webhook.id)}
                disabled={isTesting}
                aria-label="测试 Webhook"
              >
                {isTesting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <TestTube className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>发送测试投递</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  webhook.is_enabled
                    ? onDisable(webhook.id)
                    : onEnable(webhook.id)
                }
                aria-label={webhook.is_enabled ? "禁用 Webhook" : "启用 Webhook"}
              >
                {webhook.is_enabled ? (
                  <PowerOff className="size-3.5" />
                ) : (
                  <Power className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {webhook.is_enabled ? "禁用" : "启用"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(webhook.id)}
                disabled={isDeleting}
                aria-label="删除 Webhook"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* URL */}
      <p className="text-xs text-muted-foreground font-mono truncate" title={webhook.url}>
        {webhook.url}
      </p>

      {/* Events + last triggered */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {webhook.events.map((event) => (
            <Badge key={event} variant="secondary" className="text-xs font-normal">
              {formatEventLabel(event)}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          {webhook.last_triggered_at ? (
            <>
              <CheckCircle2 className="size-3 text-green-500" />
              <Clock className="size-3" />
              <span>
                上次触发{" "}
                {new Date(webhook.last_triggered_at).toLocaleDateString("zh-CN")}
              </span>
            </>
          ) : (
            <>
              <XCircle className="size-3" />
              <span>从未触发</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventLabel(event: WebhookEvent): string {
  const found = WEBHOOK_EVENTS.find((e) => e.value === event);
  return found?.label ?? event;
}
