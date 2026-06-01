"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

import { permissionsApi } from "@/lib/api/permissions";
import type {
  Permission,
  PermissionAction,
  PermissionPrincipalType,
  PermissionTargetType,
  CreatePermissionRequest,
} from "@/lib/api/permissions";
import { groupsApi } from "@/lib/api/groups";
import { repositoriesApi } from "@/lib/api/repositories";
import { adminApi } from "@/lib/api/admin";
import { mutationErrorToast } from "@/lib/error-utils";
import { useAuth } from "@/providers/auth-provider";
import type { User, Repository } from "@/types";
import type { Group } from "@/types/groups";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { EmptyState } from "@/components/common/empty-state";

// -- constants --

const ALL_ACTIONS: PermissionAction[] = ["read", "write", "delete", "admin"];

const ACTION_COLORS: Record<PermissionAction, string> = {
  read: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  write: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

// -- form type --

interface PermissionForm {
  principal_type: PermissionPrincipalType;
  principal_id: string;
  target_type: PermissionTargetType;
  target_id: string;
  actions: PermissionAction[];
}

const EMPTY_FORM: PermissionForm = {
  principal_type: "user",
  principal_id: "",
  target_type: "repository",
  target_id: "",
  actions: ["read"],
};

// -- page --

export default function PermissionsPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);

  const [form, setForm] = useState<PermissionForm>(EMPTY_FORM);

  // -- queries --
  const { data: permissionsData, isLoading: permissionsLoading } = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: () => permissionsApi.list({ per_page: 1000 }),
    enabled: !!currentUser?.is_admin,
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers(),
    enabled: !!currentUser?.is_admin,
  });

  const { data: groupsData } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => groupsApi.list({ per_page: 1000 }),
    enabled: !!currentUser?.is_admin,
  });

  const { data: repositoriesData } = useQuery({
    queryKey: ["admin-repositories"],
    queryFn: () => repositoriesApi.list({ per_page: 1000 }),
    enabled: !!currentUser?.is_admin,
  });

  const permissions = permissionsData?.items ?? [];
  const users = usersData ?? [];
  const groups = groupsData?.items ?? [];
  const repositories = repositoriesData?.items ?? [];

  // principal options based on selected type
  const principalOptions = useMemo(() => {
    if (form.principal_type === "user") {
      return users.map((u: User) => ({
        value: u.id,
        label: u.display_name || u.username,
      }));
    }
    return groups.map((g: Group) => ({
      value: g.id,
      label: g.name,
    }));
  }, [form.principal_type, users, groups]);

  const repositoryOptions = useMemo(() =>
    repositories.map((r: Repository) => ({
      value: r.id,
      label: `${r.key}${r.name ? ` — ${r.name}` : ""}`,
    })),
  [repositories]);

  const targetOptions = useMemo(() => {
    switch (form.target_type) {
      case "repository":
        return repositoryOptions;
      case "group":
        return groups.map((g: Group) => ({ value: g.id, label: g.name }));
      default:
        return [];
    }
  }, [form.target_type, repositoryOptions, groups]);

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: (data: CreatePermissionRequest) => permissionsApi.create(data),
    onSuccess: () => {
      toast.success("权限创建成功");
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: mutationErrorToast("创建权限失败"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: CreatePermissionRequest;
    }) => permissionsApi.update(id, data),
    onSuccess: () => {
      toast.success("权限更新成功");
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setEditOpen(false);
      setSelectedPermission(null);
    },
    onError: mutationErrorToast("更新权限失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => permissionsApi.delete(id),
    onSuccess: () => {
      toast.success("权限删除成功");
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
      setDeleteOpen(false);
      setSelectedPermission(null);
    },
    onError: mutationErrorToast("删除权限失败"),
  });

  // -- handlers --
  const handleEdit = useCallback(
    (p: Permission) => {
      setSelectedPermission(p);
      setForm({
        principal_type: p.principal_type,
        principal_id: p.principal_id,
        target_type: p.target_type,
        target_id: p.target_id,
        actions: [...p.actions],
      });
      setEditOpen(true);
    },
    []
  );

  const handleDelete = useCallback((p: Permission) => {
    setSelectedPermission(p);
    setDeleteOpen(true);
  }, []);

  const toggleAction = useCallback((action: PermissionAction) => {
    setForm((f) => ({
      ...f,
      actions: f.actions.includes(action)
        ? f.actions.filter((a) => a !== action)
        : [...f.actions, action],
    }));
  }, []);

  // -- columns --
  const columns: DataTableColumn<Permission>[] = [
    {
      id: "principal",
      header: "授权主体",
      accessor: (p) => p.principal_name ?? p.principal_id,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs capitalize"
          >
            {p.principal_type}
          </Badge>
          <span className="text-sm font-medium">
            {p.principal_name ?? p.principal_id}
          </span>
        </div>
      ),
    },
    {
      id: "target",
      header: "目标",
      accessor: (p) => p.target_name ?? p.target_id,
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs capitalize">
            {p.target_type}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {p.target_name ?? p.target_id}
          </span>
        </div>
      ),
    },
    {
      id: "actions_list",
      header: "操作",
      cell: (p) => (
        <div className="flex items-center gap-1 flex-wrap">
          {p.actions.map((a) => (
            <span
              key={a}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[a] ?? ""}`}
            >
              {a}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "created_at",
      header: "创建时间",
      accessor: (p) => p.created_at,
      sortable: true,
      cell: (p) => (
        <span className="text-sm text-muted-foreground">
          {new Date(p.created_at).toLocaleDateString()}
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
                onClick={() => handleEdit(p)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(p)}
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

  // -- shared form fields --
  const renderFormFields = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>主体类型</Label>
          <Select
            value={form.principal_type}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                principal_type: v as PermissionPrincipalType,
                principal_id: "",
              }))
            }
            disabled={editOpen}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">用户</SelectItem>
              <SelectItem value="group">用户组</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>主体</Label>
          <Select
            value={form.principal_id}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, principal_id: v }))
            }
            disabled={editOpen}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择..." />
            </SelectTrigger>
            <SelectContent>
              {principalOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>目标类型</Label>
          <Select
            value={form.target_type}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                target_type: v as PermissionTargetType,
                target_id: "",
              }))
            }
            disabled={editOpen}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="repository">仓库</SelectItem>
              <SelectItem value="group">用户组</SelectItem>
              <SelectItem value="artifact">制品</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{form.target_type === "repository" ? "仓库" : form.target_type === "group" ? "目标用户组" : "制品 ID"}</Label>
          {form.target_type === "artifact" ? (
            <Input
              placeholder="制品 UUID"
              value={form.target_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, target_id: e.target.value.trim() }))
              }
              disabled={editOpen}
            />
          ) : (
            <Select
              value={form.target_id}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, target_id: v }))
              }
              disabled={editOpen}
            >
              <SelectTrigger>
                <SelectValue placeholder={`选择${form.target_type === "repository" ? "仓库" : "用户组"}...`} />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>权限操作</Label>
        <div className="flex items-center gap-4">
          {ALL_ACTIONS.map((action) => (
            <div key={action} className="flex items-center gap-2">
              <Checkbox
                id={`action-${action}`}
                checked={form.actions.includes(action)}
                onCheckedChange={() => toggleAction(action)}
              />
              <Label
                htmlFor={`action-${action}`}
                className="text-sm capitalize cursor-pointer"
              >
                {action}
              </Label>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  // -- render --
  if (!currentUser?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="权限" />
        <p className="text-sm text-muted-foreground">
          您必须是管理员才能查看此页面。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="权限"
        description="控制对仓库和资源的访问权限。"
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" />
            创建权限
          </Button>
        }
      />

      {!permissionsLoading && permissions.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="暂无权限配置"
          description="创建权限规则以控制对仓库和资源的访问。"
          action={
            <Button
              onClick={() => {
                setForm(EMPTY_FORM);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              创建权限
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={permissions}
          loading={permissionsLoading}
          emptyMessage="未找到权限。"
          rowKey={(p) => p.id}
        />
      )}

      {/* 创建权限对话框 */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setForm(EMPTY_FORM);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>创建权限</DialogTitle>
            <DialogDescription>
              授予用户或用户组对目标资源的访问权限。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.principal_id || !form.target_id || form.actions.length === 0) {
                toast.error("请填写所有必填字段");
                return;
              }
              createMutation.mutate({
                principal_type: form.principal_type,
                principal_id: form.principal_id,
                target_type: form.target_type,
                target_id: form.target_id,
                actions: form.actions,
              });
            }}
          >
            {renderFormFields()}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setForm(EMPTY_FORM);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "创建中..." : "创建权限"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑权限对话框 */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) {
            setSelectedPermission(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑权限</DialogTitle>
            <DialogDescription>
              更新此权限的已授权操作。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedPermission && form.principal_id && form.target_id && form.actions.length > 0) {
                updateMutation.mutate({
                  id: selectedPermission.id,
                  data: {
                    principal_type: form.principal_type,
                    principal_id: form.principal_id,
                    target_type: form.target_type,
                    target_id: form.target_id,
                    actions: form.actions,
                  },
                });
              }
            }}
          >
            {renderFormFields()}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedPermission(null);
                  setForm(EMPTY_FORM);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "保存中..." : "保存更改"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除权限确认 */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedPermission(null);
        }}
        title="删除权限"
        description="删除此权限将撤销关联的访问权限。用户或用户组将失去对目标资源的已授权操作。此操作无法撤销。"
        confirmText="删除权限"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedPermission) deleteMutation.mutate(selectedPermission.id);
        }}
      />
    </div>
  );
}
