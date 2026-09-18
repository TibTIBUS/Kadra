import { db, type Project } from './db';
import type { FbVariant, ProjectFormat, Scene } from '../types/scene';

const now = () => Date.now();
export const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

export interface CreateProjectInput {
  name: string;
  format: ProjectFormat;
  slideCount: number;
  scene: Scene;
  templateId?: string;
  fbVariant?: FbVariant;
}

export const projectRepository = {
  async list(): Promise<Project[]> {
    return db.projects.orderBy('updatedAt').reverse().toArray();
  },

  async get(id: string): Promise<Project | undefined> {
    return db.projects.get(id);
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const project: Project = {
      id: newId(),
      name: input.name,
      format: input.format,
      slideCount: input.slideCount,
      scene: input.scene,
      templateId: input.templateId,
      fbVariant: input.fbVariant ?? 'panorama',
      createdAt: now(),
      updatedAt: now(),
    };
    await db.projects.add(project);
    return project;
  },

  async update(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<void> {
    await db.projects.update(id, { ...patch, updatedAt: now() });
  },

  async rename(id: string, name: string): Promise<void> {
    await db.projects.update(id, { name, updatedAt: now() });
  },

  async saveThumbnail(id: string, thumbnail: Blob): Promise<void> {
    await db.projects.update(id, { thumbnail });
  },

  /** Duplique le projet et l'intégralité de ses photos. */
  async duplicate(id: string): Promise<Project | undefined> {
    return db.transaction('rw', db.projects, db.assets, async () => {
      const source = await db.projects.get(id);
      if (!source) return undefined;

      const assets = await db.assets.where('projectId').equals(id).toArray();
      const assetIdMap = new Map<string, string>();
      const copiedAssets = assets.map((asset) => {
        const copyId = newId();
        assetIdMap.set(asset.id, copyId);
        return { ...asset, id: copyId, projectId: '', createdAt: now() };
      });

      const copyId = newId();
      const scene: Scene = JSON.parse(JSON.stringify(source.scene));
      for (const element of scene.elements) {
        if (element.type === 'photoCell' && element.assetId) {
          element.assetId = assetIdMap.get(element.assetId) ?? undefined;
        }
      }

      const copy: Project = {
        ...source,
        id: copyId,
        name: `${source.name} (copie)`,
        scene,
        createdAt: now(),
        updatedAt: now(),
      };

      await db.projects.add(copy);
      await db.assets.bulkAdd(copiedAssets.map((asset) => ({ ...asset, projectId: copyId })));
      return copy;
    });
  },

  /** Supprime le projet et ses photos dans une seule transaction. */
  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.projects, db.assets, async () => {
      await db.assets.where('projectId').equals(id).delete();
      await db.projects.delete(id);
    });
  },

  async put(project: Project): Promise<void> {
    await db.projects.put(project);
  },
};
