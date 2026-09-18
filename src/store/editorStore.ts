import { create } from 'zustand';
import type { Asset, Project } from '../data/db';
import { assetRepository } from '../data/assetRepository';
import { projectRepository } from '../data/projectRepository';
import type { Background, FbVariant, Scene, SceneElement } from '../types/scene';
import { addSlide, cloneScene, removeSlide, slideCountOf } from '../lib/scene';
import { renderProjectThumbnail } from '../lib/preview';

const HISTORY_LIMIT = 50;
const AUTOSAVE_DELAY = 5000;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

interface EditorState {
  project: Project | null;
  scene: Scene | null;
  assets: Asset[];
  /** URLs blob des aperçus, révoquées à la fermeture du projet. */
  assetUrls: Record<string, string>;
  images: Map<string, HTMLImageElement>;
  selectedId: string | null;
  /** Photo « armée » au doigt : la prochaine cellule touchée la recevra. */
  pendingAssetId: string | null;
  past: Scene[];
  future: Scene[];
  saveState: SaveState;
  lastSavedAt: number | null;
  loading: boolean;

  loadProject: (id: string) => Promise<void>;
  closeProject: () => void;

  select: (id: string | null) => void;
  setPendingAsset: (assetId: string | null) => void;
  /** Place la photo armée dans une cellule. Renvoie true si une photo a été posée. */
  placePendingAsset: (cellId: string) => boolean;
  /** Applique une modification de scène. history=false pour les gestes continus. */
  mutate: (updater: (scene: Scene) => Scene, options?: { history?: boolean }) => void;
  commitHistory: () => void;
  updateElement: (id: string, patch: Partial<SceneElement>, options?: { history?: boolean }) => void;
  addElement: (element: SceneElement) => void;
  removeElement: (id: string) => void;
  setBackground: (background: Background) => void;
  addSlide: () => void;
  removeSlide: () => void;
  setFbVariant: (variant: FbVariant) => void;

  undo: () => void;
  redo: () => void;

  refreshAssets: () => Promise<void>;
  registerImage: (assetId: string, image: HTMLImageElement) => void;
  save: (options?: { thumbnail?: boolean }) => Promise<void>;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingHistoryBase: Scene | null = null;

const scheduleAutosave = (save: () => void) => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(save, AUTOSAVE_DELAY);
};

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  scene: null,
  assets: [],
  assetUrls: {},
  images: new Map(),
  selectedId: null,
  pendingAssetId: null,
  past: [],
  future: [],
  saveState: 'idle',
  lastSavedAt: null,
  loading: false,

  async loadProject(id) {
    get().closeProject();
    set({ loading: true });
    const project = await projectRepository.get(id);
    if (!project) {
      set({ loading: false, project: null, scene: null });
      return;
    }
    const assets = await assetRepository.listByProject(id);
    const assetUrls: Record<string, string> = {};
    for (const asset of assets) {
      assetUrls[asset.id] = URL.createObjectURL(asset.preview);
    }
    set({
      project,
      scene: cloneScene(project.scene),
      assets,
      assetUrls,
      images: new Map(),
      past: [],
      future: [],
      selectedId: null,
      pendingAssetId: null,
      saveState: 'idle',
      loading: false,
    });
  },

  closeProject() {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    const { assetUrls } = get();
    Object.values(assetUrls).forEach((url) => URL.revokeObjectURL(url));
    pendingHistoryBase = null;
    set({
      project: null,
      scene: null,
      assets: [],
      assetUrls: {},
      images: new Map(),
      selectedId: null,
      pendingAssetId: null,
      past: [],
      future: [],
      saveState: 'idle',
    });
  },

  select(id) {
    set({ selectedId: id });
  },

  setPendingAsset(assetId) {
    set({ pendingAssetId: assetId });
  },

  placePendingAsset(cellId) {
    const { pendingAssetId } = get();
    if (!pendingAssetId) return false;
    get().updateElement(cellId, {
      assetId: pendingAssetId,
      crop: { offsetX: 0, offsetY: 0, scale: 1 },
    } as Partial<SceneElement>);
    set({ pendingAssetId: null });
    return true;
  },

  mutate(updater, options) {
    const { scene, past } = get();
    if (!scene) return;
    const history = options?.history ?? true;

    if (history) {
      set({
        past: [...past, cloneScene(scene)].slice(-HISTORY_LIMIT),
        future: [],
      });
      pendingHistoryBase = null;
    } else if (!pendingHistoryBase) {
      pendingHistoryBase = cloneScene(scene);
    }

    set({ scene: updater(cloneScene(scene)), saveState: 'dirty' });
    scheduleAutosave(() => void get().save());
  },

  /** Referme un geste continu (drag, zoom) en inscrivant un seul point d'annulation. */
  commitHistory() {
    if (!pendingHistoryBase) return;
    const { past } = get();
    set({ past: [...past, pendingHistoryBase].slice(-HISTORY_LIMIT), future: [] });
    pendingHistoryBase = null;
  },

  updateElement(id, patch, options) {
    get().mutate(
      (scene) => ({
        ...scene,
        elements: scene.elements.map((element) =>
          element.id === id ? ({ ...element, ...patch } as SceneElement) : element,
        ),
      }),
      options,
    );
  },

  addElement(element) {
    get().mutate((scene) => ({ ...scene, elements: [...scene.elements, element] }));
    set({ selectedId: element.id });
  },

  removeElement(id) {
    get().mutate((scene) => ({
      ...scene,
      elements: scene.elements.filter((element) => element.id !== id),
    }));
    set({ selectedId: null });
  },

  setBackground(background) {
    get().mutate((scene) => ({ ...scene, background }));
  },

  addSlide() {
    const { scene, project } = get();
    if (!scene || !project) return;
    if (slideCountOf(scene) >= 10) return;
    get().mutate((current) => addSlide(current));
  },

  removeSlide() {
    const { scene } = get();
    if (!scene || slideCountOf(scene) <= 1) return;
    get().mutate((current) => removeSlide(current));
  },

  setFbVariant(variant) {
    const { project } = get();
    if (!project) return;
    set({ project: { ...project, fbVariant: variant }, saveState: 'dirty' });
    scheduleAutosave(() => void get().save());
  },

  undo() {
    const { past, future, scene } = get();
    const previous = past[past.length - 1];
    if (!previous || !scene) return;
    set({
      past: past.slice(0, -1),
      future: [cloneScene(scene), ...future].slice(0, HISTORY_LIMIT),
      scene: previous,
      saveState: 'dirty',
    });
    scheduleAutosave(() => void get().save());
  },

  redo() {
    const { past, future, scene } = get();
    const next = future[0];
    if (!next || !scene) return;
    set({
      past: [...past, cloneScene(scene)].slice(-HISTORY_LIMIT),
      future: future.slice(1),
      scene: next,
      saveState: 'dirty',
    });
    scheduleAutosave(() => void get().save());
  },

  async refreshAssets() {
    const { project, assetUrls } = get();
    if (!project) return;
    const assets = await assetRepository.listByProject(project.id);
    const nextUrls: Record<string, string> = {};
    for (const asset of assets) {
      nextUrls[asset.id] = assetUrls[asset.id] ?? URL.createObjectURL(asset.preview);
    }
    for (const [id, url] of Object.entries(assetUrls)) {
      if (!nextUrls[id]) URL.revokeObjectURL(url);
    }
    set({ assets, assetUrls: nextUrls });
  },

  registerImage(assetId, image) {
    const images = new Map(get().images);
    images.set(assetId, image);
    set({ images });
  },

  async save(options) {
    const { project, scene } = get();
    if (!project || !scene) return;
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    set({ saveState: 'saving' });

    await projectRepository.update(project.id, {
      scene,
      slideCount: slideCountOf(scene),
      fbVariant: project.fbVariant,
    });

    if (options?.thumbnail !== false) {
      try {
        const thumbnail = await renderProjectThumbnail({ ...project, scene }, get().assets);
        if (thumbnail) await projectRepository.saveThumbnail(project.id, thumbnail);
      } catch {
        // La miniature est un confort : son échec ne doit jamais bloquer la sauvegarde.
      }
    }

    set({ saveState: 'saved', lastSavedAt: Date.now() });
  },
}));

export const canUndo = (state: EditorState) => state.past.length > 0;
export const canRedo = (state: EditorState) => state.future.length > 0;
