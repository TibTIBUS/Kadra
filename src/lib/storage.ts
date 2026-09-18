/** État du stockage navigateur : persistance, espace utilisé, avertissement Safari. */

export interface StorageStatus {
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
  supported: boolean;
}

export const isSafari = (): boolean => {
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
};

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function readStorageStatus(): Promise<StorageStatus> {
  if (!navigator.storage?.estimate) {
    return { persisted: false, usageBytes: 0, quotaBytes: 0, supported: false };
  }
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false),
    navigator.storage.estimate(),
  ]);
  return {
    persisted,
    usageBytes: estimate.usage ?? 0,
    quotaBytes: estimate.quota ?? 0,
    supported: true,
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 Mo';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
