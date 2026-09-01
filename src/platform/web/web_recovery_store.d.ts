import type { PlatformRecoveryStore, RecoveryMetadata } from "../types";

export interface AtomicKeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export function isValidRecoveryMetadata(metadata: unknown): metadata is RecoveryMetadata;
export function createWebRecoveryStore(
  kv: AtomicKeyValueStore,
  slotKey?: string,
): PlatformRecoveryStore;
