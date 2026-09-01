import { isTauri } from "@/lib/tauriEnv";
import { desktopPlatform } from "./desktop";
import { webPlatform } from "./web/webPlatform";
import type { Platform } from "./types";

export type {
  DocumentPick,
  DocumentReplaceResult,
  FileDialogFilter,
  MessageDialogOptions,
  Platform,
  PlatformKind,
  PlatformRecoveryStore,
  RecoveryFormat,
  RecoveryMetadata,
  RecoverySnapshot,
  SaveDialogOptions,
} from "./types";

/**
 * The desktop and website versions of OpenWord are the same application over
 * two storage backends: the Tauri shell persists to the real filesystem,
 * the web backend persists to browser storage. Selection is a runtime
 * feature-detect so one build serves both.
 */
export function getPlatform(): Platform {
  return isTauri() ? desktopPlatform : webPlatform;
}
