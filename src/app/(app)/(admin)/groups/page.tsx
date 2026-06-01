"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Users2,
  UserPlus,
  UserMinus,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { groupsApi } from "@/lib/api/groups";
import { adminApi } from "@/lib/api/admin";
import { mutationErrorToast } from "@/lib/error-utils";
import { invalidateGroup } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";
import type { Group, GroupMember } from "@/types/groups";
import type { User } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";

// -- types --

interface GroupForm {
  name: string;
  description: string;
}

const EMPTY_FORM: GroupForm = { name: "", description: "" };

// -- page --

export default function GroupsPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM);
  const [memberSearch, setMemberSearch] = useState("");
  const [addUserId, setAddUserId] = useState<string>("");

  // -- queries --
  const { data: groupsData, isLoading } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => groupsApi.list({ per_page: 1000 }),
    enabled: !!currentUser?.is_admin,
  });

  const groups = groupsData?.items ?? [];

  // fetch group detail (with members) when members modal is open
  const { data: groupDetail, isLoading: membersLoading } = useQuery({
    queryKey: ["admin-group-detail", selectedGroup?.id],
    queryFn: () => groupsApi.get(selectedGroup!.id),
    enabled: membersOpen && !!selectedGroup?.id,
  });

  // all users for the add member dropdown
  const { data: allUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminApi.listUsers(),
    enabled: membersOpen && !!currentUser?.is_admin,
  });

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: (data: GroupForm) =>
      groupsApi.create({ name: data.name, description: data.description }),
    onSuccess: () => {
      toast.success("用户组创建成功");
      invalidateGroup(queryClient, "groups");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: mutationErrorToast("创建用户组失败"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<GroupForm> }) =>
      groupsApi.update(id, { description: data.description }),
    onSuccess: () => {
      toast.success("用户组更新成功");
      invalidateGroup(queryClient, "groups");
      setEditOpen(false);
      setSelectedGroup(null);
    },
    onError: mutationErrorToast("更新用户组失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => groupsApi.delete(id),
    onSuccess: () => {
      toast.success("用户组删除成功");
      invalidateGroup(queryClient, "groups");
      setDeleteOpen(false);
      setSelectedGroup(null);
    },
    onError: mutationErrorToast("删除用户组失败"),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      groupsApi.addMembers(groupId, [userId]),
    onSuccess: () => {
      toast.success("成员已添加");
      queryClient.invalidateQueries({
        queryKey: ["admin-group-detail", selectedGroup?.id],
      });
      invalidateGroup(queryClient, "groups");
      setAddUserId("");
    },
    onError: mutationErrorToast("添加成员失败"),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      groupsApi.removeMembers(groupId, [userId]),
    onSuccess: () => {
      toast.success("成员已移除");
      queryClient.invalidateQueries({
        queryKey: ["admin-group-detail", selectedGroup?.id],
      });
      invalidateGroup(queryClient, "groups");
    },
    onError: mutationErrorToast("移除成员失败"),
  });

  // -- handlers --
  const handleEdit = useCallback((g: Group) => {
    setSelectedGroup(g);
    setForm({ name: g.name, description: g.description ?? "" });
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback((g: Group) => {
    setSelectedGroup(g);
    setDeleteOpen(true);
  }, []);

  const handleManageMembers = useCallback((g: Group) => {
    setSelectedGroup(g);
    setMemberSearch("");
    setAddUserId("");
    setMembersOpen(true);
  }, []);

  // Compute members with type safety
  const members: GroupMember[] =
    (groupDetail as { members?: GroupMember[] })?.members ?? [];

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableUsers = (allUsers ?? []).filter(
    (u: User) => !memberIds.has(u.id)
  );

  const filteredMembers = memberSearch
    ? members.filter(
        (m) =>
          m.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
          (m.display_name ?? "")
            .toLowerCase()
            .includes(memberSearch.toLowerCase())
      )
    : members;

  // -- columns --
  const columns: DataTableColumn<Group>[] = [
    {
      id: "name",
      header: "名称",
      accessor: (g) => g.name,
      sortable: true,
      cell: (g) => <span className="text-sm font-medium">{g.name}</span>,
    },
    {
      id: "description",
      header: "描述",
      accessor: (g) => g.description ?? "",
      cell: (g) => (
        <span className="text-sm text-muted-foreground line-clamp-1">
          {g.description || "\u2014"}
        </span>
      ),
    },
    {
      id: "member_count",
      header: "成员",
      accessor: (g) => g.member_count,
      sortable: true,
      cell: (g) => (
        <Badge variant="secondary" className="text-xs">
          {g.member_count}
        </Badge>
      ),
    },
    {
      id: "created_at",
      header: "创建时间",
      accessor: (g) => g.created_at,
      sortable: true,
      cell: (g) => (
        <span className="text-sm text-muted-foreground">
          {new Date(g.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (g) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleEdit(g)}
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
                onClick={() => handleManageMembers(g)}
              >
                <Users2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>管理成员</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(g)}
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

  // -- render --
  if (!currentUser?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="用户组" />
        <p className="text-sm text-muted-foreground">
          您必须是管理员才能查看此页面。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户组"
        description="将用户组织为用户组以便权限管理。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            创建用户组
          </Button>
        }
      />

      {!isLoading && groups.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="暂无用户组"
          description="创建用户组来组织用户并集中管理权限。"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              创建用户组
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={groups}
          loading={isLoading}
          emptyMessage="未找到用户组。"
          rowKey={(g) => g.id}
        />
      )}

      {/* 创建用户组对话框 */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setForm(EMPTY_FORM);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建用户组</DialogTitle>
            <DialogDescription>
              添加新的用户组来组织用户。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="group-name">名称</Label>
              <Input
                id="group-name"
                placeholder="engineering"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-desc">描述</Label>
              <Textarea
                id="group-desc"
                placeholder="可选描述..."
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
              />
            </div>
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
                {createMutation.isPending ? "创建中..." : "创建用户组"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 编辑用户组对话框 */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setSelectedGroup(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑用户组：{selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              更新用户组描述。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedGroup) {
                updateMutation.mutate({
                  id: selectedGroup.id,
                  data: { description: form.description },
                });
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-group-name">名称</Label>
              <Input id="edit-group-name" value={form.name} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group-desc">描述</Label>
              <Textarea
                id="edit-group-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedGroup(null);
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

      {/* 管理成员对话框 */}
      <Dialog
        open={membersOpen}
        onOpenChange={(o) => {
          setMembersOpen(o);
          if (!o) {
            setSelectedGroup(null);
            setMemberSearch("");
            setAddUserId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              管理成员：{selectedGroup?.name}
            </DialogTitle>
            <DialogDescription>
              添加或移除此用户组中的用户。
            </DialogDescription>
          </DialogHeader>

          {/* Add member */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>添加成员</Label>
              <Select value={addUserId} onValueChange={setAddUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择用户..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u: User) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name || u.username} ({u.username})
                    </SelectItem>
                  ))}
                  {availableUsers.length === 0 && (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      没有可添加的用户
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!addUserId || addMemberMutation.isPending}
              onClick={() => {
                if (selectedGroup && addUserId) {
                  addMemberMutation.mutate({
                    groupId: selectedGroup.id,
                    userId: addUserId,
                  });
                }
              }}
            >
              <UserPlus className="size-3.5 mr-1" />
              添加
            </Button>
          </div>

          <Separator />

          {/* Member list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Members ({members.length})
              </Label>
              {members.length > 5 && (
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    aria-label="Filter members"
                    placeholder="筛选成员..."
                    className="pl-8 h-8 text-xs"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>
              )}
            </div>
            <ScrollArea className="h-[240px] rounded-md border">
              {membersLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  加载成员中...
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  {members.length === 0
                    ? "此用户组中暂无成员"
                    : "没有匹配搜索条件的成员"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredMembers.map((m) => (
                    <div
                      key={m.user_id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{m.username}</p>
                        {m.display_name && (
                          <p className="text-xs text-muted-foreground">
                            {m.display_name}
                          </p>
                        )}
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (selectedGroup) {
                                removeMemberMutation.mutate({
                                  groupId: selectedGroup.id,
                                  userId: m.user_id,
                                });
                              }
                            }}
                            disabled={removeMemberMutation.isPending}
                          >
                            <UserMinus className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>移除</TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMembersOpen(false);
                setSelectedGroup(null);
              }}
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除用户组确认 */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedGroup(null);
        }}
        title="删除用户组"
        description={`删除"${selectedGroup?.name}"将移除所有成员关联。成员将失去通过此用户组获得的权限。此操作无法撤销。`}
        typeToConfirm={selectedGroup?.name}
        confirmText="删除用户组"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedGroup) deleteMutation.mutate(selectedGroup.id);
        }}
      />
    </div>
  );
}
