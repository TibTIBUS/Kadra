import { db, type Asset } from './db';
import { newId } from './projectRepository';

export const assetRepository = {
  async listByProject(projectId: string): Promise<Asset[]> {
    const assets = await db.assets.where('projectId').equals(projectId).toArray();
    return assets.sort((a, b) => a.createdAt - b.createdAt);
  },

  async get(id: string): Promise<Asset | undefined> {
    return db.assets.get(id);
  },

  async add(input: Omit<Asset, 'id' | 'createdAt'> & { id?: string }): Promise<Asset> {
    const asset: Asset = { ...input, id: input.id ?? newId(), createdAt: Date.now() };
    await db.assets.add(asset);
    return asset;
  },

  async put(asset: Asset): Promise<void> {
    await db.assets.put(asset);
  },

  async remove(id: string): Promise<void> {
    await db.assets.delete(id);
  },
};
