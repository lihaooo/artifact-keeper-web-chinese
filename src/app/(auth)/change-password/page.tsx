"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Shield, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import {
  toUserMessage,
  isPasswordReuseError,
  PASSWORD_REUSE_MESSAGE,
} from "@/lib/error-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordPolicyHint } from "@/components/common/password-policy-hint";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "密码至少需要 8 个字符"),
    confirmPassword: z.string().min(1, "请确认新密码"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const { changePassword, logout, setupRequired } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: ChangePasswordValues) {
    setIsLoading(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success("密码修改成功！");
      router.push("/");
    } catch (err) {
      if (isPasswordReuseError(err)) {
        form.setError("newPassword", { message: PASSWORD_REUSE_MESSAGE });
        toast.error(PASSWORD_REUSE_MESSAGE);
      } else {
        toast.error(toUserMessage(err, "修改密码失败。"));
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className={`mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl ${setupRequired ? "bg-blue-100 dark:bg-blue-950/30" : "bg-amber-100 dark:bg-amber-950/30"}`}>
          {setupRequired ? (
            <Shield className="size-7 text-blue-600 dark:text-blue-400" />
          ) : (
            <Lock className="size-7 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <CardTitle className="text-xl">{setupRequired ? "完成设置" : "修改密码"}</CardTitle>
        <CardDescription>
          {setupRequired
            ? "设置一个安全的管理员密码以解锁 API 并完成首次设置。"
            : "您的密码是自动生成的或已被重置。请设置新密码以继续。"}
        </CardDescription>
        {setupRequired && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-left text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>在此步骤完成之前，所有 API 端点将被锁定。</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>当前密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="请输入当前密码"
                      autoComplete="current-password"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>新密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="请输入新密码"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <PasswordPolicyHint password={field.value} className="mt-1" />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>确认新密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="请确认新密码"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  修改密码中...
                </>
              ) : (
                "修改密码"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleLogout}
              disabled={isLoading}
            >
              退出登录
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
