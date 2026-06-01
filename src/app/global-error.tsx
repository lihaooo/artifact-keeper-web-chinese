"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#0a0a12",
          color: "#e8e0d4",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            maxWidth: "28rem",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-48.png"
            alt="Artifact Keeper"
            width={48}
            height={48}
            style={{ marginBottom: "1.5rem" }}
          />
          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              margin: 0,
            }}
          >
            出现了问题
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#9a918a",
            }}
          >
            发生严重错误导致页面无法加载。您可以重试，或返回首页。
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.75rem",
                color: "#9a918a",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              错误 ID: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            <button
              onClick={reset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "0.375rem",
                backgroundColor: "#d4a853",
                color: "#0a0a12",
                padding: "0.625rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              重试
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "0.375rem",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: "transparent",
                color: "#e8e0d4",
                padding: "0.625rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              返回首页
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
