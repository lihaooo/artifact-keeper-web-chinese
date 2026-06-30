"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gauge, Info, Plus, Trash2, Loader2, User, Bot, Network } from "lucide-react";

import {
  rateLimitsApi,
  validateExemption,
  type ExemptionType,
  type RateLimitConfig,
  type RateLimitExemption,
} from "@/lib/api/rate-limits";
import { mutationErrorToast } from "@/lib/error-utils";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const RATE_LIMITS_QUERY_KEY = ["rate-limits"] as const;
export const RATE_LIMIT_EXEMPTIONS_QUERY_KEY = ["rate-limit-exemptions"] as const;

const TYPE_META: Record<
  ExemptionType,
  { label: string; icon: React.ComponentType<{ className?: string }>; placeholder: string }
> = {
  username: { label: "用户名", icon: User, placeholder: "ci-bot" },
  service_account: { label: "服务账号", icon: Bot, placeholder: "deploy-sa" },
  cidr: { label: "CIDR 范围", icon: Network, placeholder: "10.0.0.0/8" },
};

function rate(window: { limit: number; window_secs: number }): string {
  if (window.window_secs <= 0) return `${window.limit} 个请求`;
  return `${window.limit} 个请求 / ${window.window_secs}s`;
}

// -- Current configuration card --

function ConfigCard({
  config,
  isLoading,
  isError,
}: {
  config: RateLimitConfig | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">当前速率限制</CardTitle>
        <CardDescription>
          每个时间窗口的有效请求限制。通过环境变量配置，此处只读展示。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && (isError || !config) && (
          <p className="text-sm text-muted-foreground">
            此服务器未提供速率限制配置。
          </p>
        )}
        {!isLoading && config && (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">认证</dt>
              <dd className="text-sm font-medium">{rate(config.auth)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">API</dt>
              <dd className="text-sm font-medium">{rate(config.api)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">搜索</dt>
              <dd className="text-sm font-medium">{rate(config.search)}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-xs text-muted-foreground">
                服务账号全局豁免
              </dt>
              <dd className="text-sm font-medium">
                {config.exempt_service_accounts ? "是" : "否"}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

// -- Add exemption dialog --

function AddExemptionDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ExemptionType>("username");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  // Validation error associated with the value input via aria-describedby so it
  // is announced rather than only surfaced in a toast. (review fix #465)
  const [valueError, setValueError] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: () => rateLimitsApi.addExemption({ type, value, note }),
    onSuccess: () => {
      toast.success("豁免已添加");
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_EXEMPTIONS_QUERY_KEY });
      setOpen(false);
      setValue("");
      setNote("");
      setType("username");
      setValueError(null);
    },
    onError: mutationErrorToast("添加豁免失败"),
  });

  function handleSubmit() {
    const error = validateExemption({ type, value, note });
    if (error) {
      setValueError(error);
      return;
    }
    setValueError(null);
    addMutation.mutate();
  }

  const meta = TYPE_META[type];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4 mr-1.5" />
          添加豁免
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加速率限制豁免</DialogTitle>
          <DialogDescription>
            豁免用户、服务账号或网络范围的速率限制。请谨慎使用，豁免会削弱滥用防护。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="exemption-type">类型</Label>
            <Select value={type} onValueChange={(v) => setType(v as ExemptionType)}>
              <SelectTrigger id="exemption-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="username">用户名</SelectItem>
                <SelectItem value="service_account">服务账号</SelectItem>
                <SelectItem value="cidr">CIDR 范围</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exemption-value">{meta.label}</Label>
            <Input
              id="exemption-value"
              placeholder={meta.placeholder}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (valueError) setValueError(null);
              }}
              aria-invalid={valueError != null}
              aria-describedby="exemption-value-error"
            />
            {/* Persistent live region so the validation error is announced and
                stays associated with the input. */}
            <p
              id="exemption-value-error"
              role="alert"
              className="min-h-[1rem] text-sm text-destructive"
            >
              {valueError}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exemption-note">备注（可选）</Label>
            <Input
              id="exemption-note"
              placeholder="为什么豁免此项？"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={addMutation.isPending}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={addMutation.isPending}>
            {addMutation.isPending && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            添加豁免
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -- Exemptions table --

function ExemptionsTable({
  exemptions,
  isLoading,
  isError,
}: {
  exemptions: RateLimitExemption[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<RateLimitExemption | null>(null);

  const removeMutation = useMutation({
    mutationFn: (id: string) => rateLimitsApi.removeExemption(id),
    onSuccess: () => {
      toast.success("豁免已移除");
      queryClient.invalidateQueries({ queryKey: RATE_LIMIT_EXEMPTIONS_QUERY_KEY });
      setPendingDelete(null);
    },
    onError: mutationErrorToast("移除豁免失败"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>豁免不可用</AlertTitle>
        <AlertDescription>
          无法加载速率限制豁免。此服务器可能尚不支持通过界面管理豁免。
        </AlertDescription>
      </Alert>
    );
  }

  if (!exemptions || exemptions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        尚未配置速率限制豁免。
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>类型</TableHead>
            <TableHead>值</TableHead>
            <TableHead>备注</TableHead>
            <TableHead>来源</TableHead>
            <TableHead className="w-[1%]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {exemptions.map((ex) => {
            const meta = TYPE_META[ex.type];
            const Icon = meta.icon;
            return (
              <TableRow key={ex.id}>
                <TableCell>
                  <span className="flex items-center gap-1.5 text-sm">
                    <Icon className="size-3.5 text-muted-foreground" />
                    {meta.label}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm">{ex.value}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ex.note || "—"}
                </TableCell>
                <TableCell>
                  {ex.source_env ? (
                    <Badge variant="secondary">环境</Badge>
                  ) : (
                    <Badge variant="outline">手动</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`移除豁免 ${ex.value}`}
                    disabled={ex.source_env}
                    title={
                      ex.source_env
                        ? "通过环境变量配置，编辑服务器配置以更改"
                        : "移除豁免"
                    }
                    onClick={() => setPendingDelete(ex)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除豁免？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete &&
                `${TYPE_META[pendingDelete.type].label} "${pendingDelete.value}" 将重新受到速率限制。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) removeMutation.mutate(pendingDelete.id);
              }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// -- Page --

export default function RateLimitsPage() {
  const { user } = useAuth();

  const configQuery = useQuery({
    queryKey: RATE_LIMITS_QUERY_KEY,
    queryFn: () => rateLimitsApi.getConfig(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const exemptionsQuery = useQuery({
    queryKey: RATE_LIMIT_EXEMPTIONS_QUERY_KEY,
    queryFn: () => rateLimitsApi.listExemptions(),
    retry: false,
    staleTime: 60 * 1000,
  });

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="速率限制" />
        <Alert variant="destructive">
          <AlertTitle>拒绝访问</AlertTitle>
          <AlertDescription>
            你必须是管理员才能管理速率限制豁免。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="速率限制"
        description="查看请求速率限制，并管理受信任用户、服务账号和网络的豁免。"
        actions={
          <span className="flex items-center gap-2 text-muted-foreground">
            <Gauge className="size-5" />
          </span>
        }
      />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>关于豁免</AlertTitle>
        <AlertDescription>
          被豁免的主体完全绕过速率限制。标记为“环境”的条目来自服务器配置，此处只读。
          手动添加的条目可在下方添加和移除。
        </AlertDescription>
      </Alert>

      <ConfigCard
        config={configQuery.data}
        isLoading={configQuery.isLoading}
        isError={configQuery.isError}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">豁免</CardTitle>
            <CardDescription>
              绕过速率限制的用户、服务账号和 CIDR 范围。
            </CardDescription>
          </div>
          <AddExemptionDialog />
        </CardHeader>
        <CardContent>
          <ExemptionsTable
            exemptions={exemptionsQuery.data}
            isLoading={exemptionsQuery.isLoading}
            isError={exemptionsQuery.isError}
          />
        </CardContent>
      </Card>
    </div>
  );
}
