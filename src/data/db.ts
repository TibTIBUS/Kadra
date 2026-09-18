import Dexie, { type Table } from 'dexie';
import type { FbVariant, ProjectFormat, Scene } from '../types/scene';

export interface Project {
  id: string;
  name: string;
  format: ProjectFormat;
  /** 1 à 10 */
  slideCount: number;
  templateId?: string;
  scene: Scene;
  fbVariant: FbVariant;
  thumbnail?: Blob;
  createdAt: number;
  updatedAt: number;
}

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  /** Image d'origine redimensionnée à 3000 px max sur le grand côté. */
  original: Blob;
  /** Version d'affichage, 1200 px max sur le grand côté. */
  preview: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

class KadraDB extends Dexie {
  projects!: Table<Project, string>;
  assets!: Table<Asset, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('kadra-studio');
    this.version(1).stores({
      projects: 'id, updatedAt, name',
      assets: 'id, projectId',
      settings: 'key',
    });
  }
}

export const db = new KadraDB();
