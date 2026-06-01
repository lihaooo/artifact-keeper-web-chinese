"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AuthError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("Auth route error:", error);
  }, [error]);

  return (
    <Card className="w-full">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
          <AlertTriangle className="size-7 text-destructive" />
        </div>
        <CardTitle className="text-lg">认证错误</CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          认证过程中出现了问题，请重试。
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            错误 ID: {error.digest}
          </p>
        )}
        <Button onClick={reset} variant="default" size="sm" className="w-full">
          <RefreshCw className="mr-2 size-4" />
          重试
        </Button>
      </CardContent>
    </Card>
  );
}
