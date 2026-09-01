import type { PlatformRecoveryStore, RecoveryFormat } from "./types";

/**
 * Which shell owns a snapshot. Structurally the same union as
 * `ShellMode` in `@/lib/shellMode`, so `resolveShellMode` is a valid
 * `currentShell` without the platform layer depending on that module's type.
 */
export type RecoveryShell = "editor" | "writer";

export function recoveryShellForFormat(format: RecoveryFormat | undefined): RecoveryShell;

export function createShellScopedRecoveryStore(
  slots: Record<RecoveryShell, PlatformRecoveryStore>,
  currentShell: () => RecoveryShell,
): PlatformRecoveryStore;
