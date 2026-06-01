"use client";

import { useState } from "react";
import { Globe, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useInstance } from "@/providers/instance-provider";
import { isValidInstanceUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InstanceSwitcher() {
  const { instances, activeInstance, switchInstance, addInstance, removeInstance, instanceStatuses, refreshStatuses } = useInstance();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    const trimmedUrl = url.trim().replace(/\/$/, "");
    if (!isValidInstanceUrl(trimmedUrl)) {
      toast.error("无效的实例 URL。不允许使用私有 IP、localhost 和非 HTTP 协议。");
      return;
    }
    setAdding(true);
    try {
      await addInstance({
        name: name.trim(),
        url: trimmedUrl,
        apiKey: apiKey.trim() || "",
      });
      setAddOpen(false);
      setName("");
      setUrl("");
      setApiKey("");
    } catch {
      toast.error("添加实例失败，请检查 URL 后重试。");
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) refreshStatuses(); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Globe className="size-4" />
            <span className="hidden sm:inline text-sm">{activeInstance.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {instances.map((inst) => (
            <DropdownMenuItem
              key={inst.id}
              className="flex items-center justify-between"
              onClick={() => {
                if (inst.id !== activeInstance.id) switchInstance(inst.id);
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {inst.id === activeInstance.id && <Check className="size-4 text-green-500 shrink-0" />}
                {inst.id !== activeInstance.id && <div className="size-4 shrink-0" />}
                <span className={`size-2 rounded-full shrink-0 ${instanceStatuses[inst.id] === true ? "bg-green-500" : instanceStatuses[inst.id] === false ? "bg-red-400" : "bg-gray-400"}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{inst.name}</div>
                  {inst.url && (
                    <div className="text-xs text-muted-foreground truncate">{inst.url}</div>
                  )}
                </div>
              </div>
              {inst.id !== "local" && (
                <button
                  className="ml-2 p-1 hover:text-destructive shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeInstance(inst.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-2" />
            添加实例
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加 Artifact Keeper 实例</DialogTitle>
            <DialogDescription>
              连接到远程 Artifact Keeper 实例以浏览其仓库和制品。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="inst-name">名称</Label>
              <Input
                id="inst-name"
                placeholder="Production"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-url">URL</Label>
              <Input
                id="inst-url"
                placeholder="https://artifacts.example.com"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-key">API 密钥</Label>
              <Input
                id="inst-key"
                placeholder="可选 -- 在服务器上加密存储"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={!name.trim() || !url.trim() || adding}>
              {adding ? "添加中..." : "添加实例"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
