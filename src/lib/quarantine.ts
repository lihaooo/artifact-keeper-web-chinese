import type { Artifact } from "@/types";

/**
 * Check whether an artifact is currently under quarantine.
 * Returns true if `is_quarantined` is set and, when a `quarantine_until`
 * timestamp is present, the current time has not yet passed that deadline.
 */
export function isActivelyQuarantined(artifact: Artifact): boolean {
  if (!artifact.is_quarantined) return false;
  if (!artifact.quarantine_until) return true;
  return new Date(artifact.quarantine_until).getTime() > Date.now();
}

/**
 * Format a quarantine expiry timestamp into a human-readable relative
 * description (e.g. "Expires in 3 hours" or "Expires on Apr 20, 2026").
 * Returns null if no expiry is set.
 */
export function formatQuarantineExpiry(quarantineUntil: string | null | undefined): string | null {
  if (!quarantineUntil) return null;

  const expiry = new Date(quarantineUntil);
  const now = Date.now();
  const diffMs = expiry.getTime() - now;

  if (diffMs <= 0) {
    return "已过期";
  }

  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 60) {
    return `${diffMinutes}分钟后过期`;
  }
  if (diffHours < 24) {
    return `${diffHours}小时后过期`;
  }
  if (diffDays < 14) {
    return `${diffDays}天后过期`;
  }

  return `过期于${expiry.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;
}
