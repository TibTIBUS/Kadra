import { db } from './db';

export const SETTINGS_KEYS = {
  lastFullBackupAt: 'lastFullBackupAt',
  storagePersistAsked: 'storagePersistAsked',
} as const;

export const settingsRepository = {
  async get<T>(key: string): Promise<T | undefined> {
    const row = await db.settings.get(key);
    return row?.value as T | undefined;
  },

  async set(key: string, value: unknown): Promise<void> {
    await db.settings.put({ key, value });
  },
};
