import { migrateDocument } from "../document/migrations";
import type { OpenWordDocument } from "../document/model";

const RECOVERY_KEY = "openword.recovery.v1";

export interface RecoverySnapshot {
  id: string;
  savedAt: string;
  document: OpenWordDocument;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadRecoverySnapshots(): RecoverySnapshot[] {
  const target = storage();
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(RECOVERY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    const snapshots: RecoverySnapshot[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      try {
        const document = migrateDocument(record.document);
        snapshots.push({
          id: typeof record.id === "string" ? record.id : document.id,
          savedAt: typeof record.savedAt === "string" ? record.savedAt : document.updatedAt,
          document,
        });
      } catch {
        // Ignore one corrupt snapshot without discarding healthy snapshots.
      }
    }
    return snapshots;
  } catch {
    target.removeItem(RECOVERY_KEY);
    return [];
  }
}

function writeSnapshots(snapshots: RecoverySnapshot[]): void {
  const target = storage();
  if (!target) return;
  try {
    target.setItem(RECOVERY_KEY, JSON.stringify(snapshots.slice(-20)));
  } catch {
    // Recovery is best-effort and must never interrupt editing.
  }
}

export function saveRecoverySnapshot(document: OpenWordDocument): void {
  const snapshots = loadRecoverySnapshots().filter((snapshot) => snapshot.id !== document.id);
  snapshots.push({ id: document.id, savedAt: new Date().toISOString(), document });
  writeSnapshots(snapshots);
}

export function removeRecoverySnapshot(id: string): void {
  writeSnapshots(loadRecoverySnapshots().filter((snapshot) => snapshot.id !== id));
}

export function clearRecoverySnapshots(): void {
  storage()?.removeItem(RECOVERY_KEY);
}
