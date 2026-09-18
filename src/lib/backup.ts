import JSZip from 'jszip';
import type { Asset, Project } from '../data/db';
import { assetRepository } from '../data/assetRepository';
import { projectRepository, newId } from '../data/projectRepository';
import { settingsRepository, SETTINGS_KEYS } from '../data/settingsRepository';
import type { Scene } from '../types/scene';

export const PROJECT_FILE_EXTENSION = '.kadra';
const MANIFEST_VERSION = 1;

interface ProjectManifest {
  version: number;
  project: Omit<Project, 'thumbnail'>;
  assets: Array<Pick<Asset, 'id' | 'name' | 'width' | 'height' | 'createdAt'>>;
}

const assetPath = (id: string, kind: 'original' | 'preview') => `assets/${id}.${kind}.jpg`;

async function writeProjectInto(zip: JSZip, project: Project, assets: Asset[]): Promise<void> {
  const manifest: ProjectManifest = {
    version: MANIFEST_VERSION,
    project: { ...project, thumbnail: undefined } as Omit<Project, 'thumbnail'>,
    assets: assets.map(({ id, name, width, height, createdAt }) => ({
      id,
      name,
      width,
      height,
      createdAt,
    })),
  };
  zip.file('scene.json', JSON.stringify(manifest, null, 2));
  for (const asset of assets) {
    zip.file(assetPath(asset.id, 'original'), asset.original);
    zip.file(assetPath(asset.id, 'preview'), asset.preview);
  }
}

/** Exporte un projet complet (scène + photos) en fichier .kadra. */
export async function exportProjectArchive(project: Project): Promise<Blob> {
  const assets = await assetRepository.listByProject(project.id);
  const zip = new JSZip();
  await writeProjectInto(zip, project, assets);
  return zip.generateAsync({ type: 'blob' });
}

/** Sauvegarde complète : tous les projets dans un seul ZIP. */
export async function exportFullBackup(): Promise<Blob> {
  const projects = await projectRepository.list();
  const zip = new JSZip();
  zip.file(
    'backup.json',
    JSON.stringify(
      {
        version: MANIFEST_VERSION,
        createdAt: Date.now(),
        projects: projects.map((project) => ({ id: project.id, name: project.name })),
      },
      null,
      2,
    ),
  );
  for (const project of projects) {
    const folder = zip.folder(`projects/${project.id}`);
    if (!folder) continue;
    const assets = await assetRepository.listByProject(project.id);
    await writeProjectInto(folder, project, assets);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  await settingsRepository.set(SETTINGS_KEYS.lastFullBackupAt, Date.now());
  return blob;
}

async function readManifest(zip: JSZip): Promise<ProjectManifest | undefined> {
  const file = zip.file('scene.json');
  if (!file) return undefined;
  return JSON.parse(await file.async('string')) as ProjectManifest;
}

async function restoreProject(zip: JSZip): Promise<Project | undefined> {
  const manifest = await readManifest(zip);
  if (!manifest?.project) return undefined;

  const existing = await projectRepository.get(manifest.project.id);
  const projectId = existing ? newId() : manifest.project.id;
  const idMap = new Map<string, string>();

  for (const meta of manifest.assets ?? []) {
    const originalFile = zip.file(assetPath(meta.id, 'original'));
    const previewFile = zip.file(assetPath(meta.id, 'preview'));
    if (!originalFile || !previewFile) continue;
    const assetId = existing ? newId() : meta.id;
    idMap.set(meta.id, assetId);
    await assetRepository.put({
      id: assetId,
      projectId,
      name: meta.name ?? 'photo.jpg',
      original: await originalFile.async('blob'),
      preview: await previewFile.async('blob'),
      width: meta.width,
      height: meta.height,
      createdAt: meta.createdAt ?? Date.now(),
    });
  }

  const scene: Scene = JSON.parse(JSON.stringify(manifest.project.scene));
  for (const element of scene.elements) {
    if (element.type === 'photoCell' && element.assetId) {
      element.assetId = idMap.get(element.assetId) ?? element.assetId;
    }
  }

  const project: Project = {
    ...manifest.project,
    id: projectId,
    name: existing ? `${manifest.project.name} (importé)` : manifest.project.name,
    scene,
    updatedAt: Date.now(),
  };
  await projectRepository.put(project);
  return project;
}

/** Importe un .kadra (un projet) ou une sauvegarde complète (plusieurs projets). */
export async function importArchive(file: File | Blob): Promise<Project[]> {
  const zip = await JSZip.loadAsync(file);

  if (zip.file('scene.json')) {
    const project = await restoreProject(zip);
    return project ? [project] : [];
  }

  const restored: Project[] = [];
  const folders = new Set<string>();
  zip.forEach((path) => {
    const match = /^projects\/([^/]+)\//.exec(path);
    if (match?.[1]) folders.add(match[1]);
  });

  for (const folderId of folders) {
    const folder = zip.folder(`projects/${folderId}`);
    if (!folder) continue;
    const project = await restoreProject(folder);
    if (project) restored.push(project);
  }
  return restored;
}

export const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

export async function shouldRemindBackup(): Promise<boolean> {
  const last = await settingsRepository.get<number>(SETTINGS_KEYS.lastFullBackupAt);
  if (!last) return true;
  return Date.now() - last > BACKUP_REMINDER_MS;
}
