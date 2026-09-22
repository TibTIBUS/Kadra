import type { Asset, Project } from '../data/db';
import type { Scene } from '../types/scene';
import {
  buildFacebookCanvas,
  loadImageMap,
  releaseCanvas,
  renderRegion,
  scaleCanvasTo,
} from './export';
import { slideCountOf } from './scene';
import { PROFILE_GRID_RATIO } from '../theme';

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
    // Les aperçus sont rendus à leur taille d'affichage : inutile d'allouer la
    // pleine résolution, et c'est ce qui tient dans la mémoire d'un iPhone.
    const scale = slideDisplayWidth / project.scene.slideWidth;
    const count = slideCountOf(project.scene);
    const slides: string[] = [];
    const minis: HTMLCanvasElement[] = [];

    for (let index = 0; index < count; index += 1) {
      const canvas = await renderRegion(
        project.scene,
        images,
        { x: index * project.scene.slideWidth, y: 0, width: project.scene.slideWidth, height: project.scene.height },
        scale,
      );
      slides.push(canvas.toDataURL('image/jpeg', 0.85));
      // La mosaïque Facebook réutilise ces mêmes vignettes : inutile de rendre
      // une seconde fois les slides en pleine résolution.
      if (project.fbVariant === 'collage') minis.push(canvas);
      else releaseCanvas(canvas);
    }

    const facebookCanvas = await buildFacebookCanvas(project.scene, images, project.fbVariant, minis);
    const facebook = scaleCanvasTo(facebookCanvas, slideDisplayWidth).toDataURL('image/jpeg', 0.85);
    releaseCanvas(facebookCanvas);
    minis.forEach(releaseCanvas);

    const crop = profileGridCrop(project.scene);
    const profileGrid = (
      await renderRegion(project.scene, images, crop, 360 / crop.width)
    ).toDataURL('image/jpeg', 0.85);

    return { slides, facebook, profileGrid };
  } finally {
    release();
  }
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
    const thumb = await renderRegion(
      project.scene,
      images,
      { x: 0, y: 0, width: project.scene.slideWidth, height: project.scene.height },
      360 / project.scene.slideWidth,
    );
    return await new Promise<Blob | undefined>((resolve) =>
      thumb.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', 0.8),
    );
  } finally {
    release();
  }
}

export const previewSlideCount = (scene: Scene): number => slideCountOf(scene);
