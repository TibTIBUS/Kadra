import type { Asset, Project } from '../data/db';
import type { Scene } from '../types/scene';
import { loadImageMap, renderSceneCanvas, buildFacebookCanvas, sliceSlideCanvases } from './export';
import { slideCountOf } from './scene';
import { PROFILE_GRID_RATIO } from '../theme';

const scaleCanvas = (source: HTMLCanvasElement, width: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  const ratio = width / source.width;
  canvas.width = Math.round(width);
  canvas.height = Math.round(source.height * ratio);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
};

export interface PreviewBundle {
  slides: string[];
  facebook: string;
  profileGrid: string;
}

/**
 * Rendu basse résolution pour les aperçus : on utilise les photos d'aperçu (1200 px),
 * la pleine résolution est réservée à l'export.
 */
export async function renderPreviewBundle(
  project: Project,
  assets: Asset[],
  slideDisplayWidth = 420,
): Promise<PreviewBundle> {
  const { images, release } = await loadImageMap(assets, 'preview');
  try {
    const source = await renderSceneCanvas(project.scene, images);
    const slides = sliceSlideCanvases(source, project.scene).map((canvas) =>
      scaleCanvas(canvas, slideDisplayWidth).toDataURL('image/jpeg', 0.85),
    );
    const facebook = scaleCanvas(
      buildFacebookCanvas(source, project.scene, project.fbVariant),
      slideDisplayWidth,
    ).toDataURL('image/jpeg', 0.85);
    const profileGrid = cropProfileGrid(source, project.scene).toDataURL('image/jpeg', 0.85);
    return { slides, facebook, profileGrid };
  } finally {
    release();
  }
}

/** Première slide recadrée au format 3:4 de la grille du profil Instagram. */
export function cropProfileGrid(source: HTMLCanvasElement, scene: Scene): HTMLCanvasElement {
  const crop = profileGridCrop(scene);
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = Math.round((360 * crop.height) / crop.width);
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Zone conservée par la grille du profil (3:4) sur la première slide.
 * En 1080 × 1350 la hauteur est conservée et les côtés sont rognés.
 */
export function profileGridCrop(scene: Scene): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const slideRatio = scene.slideWidth / scene.height;
  if (slideRatio > PROFILE_GRID_RATIO) {
    const width = scene.height * PROFILE_GRID_RATIO;
    return { x: (scene.slideWidth - width) / 2, y: 0, width, height: scene.height };
  }
  const height = scene.slideWidth / PROFILE_GRID_RATIO;
  return { x: 0, y: (scene.height - height) / 2, width: scene.slideWidth, height };
}

/** Miniature de la première slide, stockée avec le projet pour la liste. */
export async function renderProjectThumbnail(
  project: Project,
  assets: Asset[],
): Promise<Blob | undefined> {
  const { images, release } = await loadImageMap(assets, 'preview');
  try {
    const source = await renderSceneCanvas(project.scene, images);
    const first = sliceSlideCanvases(source, project.scene)[0];
    if (!first) return undefined;
    const thumb = scaleCanvas(first, 360);
    return await new Promise<Blob | undefined>((resolve) =>
      thumb.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', 0.8),
    );
  } finally {
    release();
  }
}

export const previewSlideCount = (scene: Scene): number => slideCountOf(scene);
