import JSZip from 'jszip';
import type { Asset, Project } from '../data/db';
import type { Background, FbVariant, Scene } from '../types/scene';
import { slideCountOf } from './scene';
import { createOffscreenStage, drawScene, ensureFontsReady, type ImageMap } from './render';

export const JPEG_QUALITY = 0.92;

/** Charge les photos d'une scène en mémoire. Les URLs blob sont révoquées à la libération. */
export async function loadImageMap(
  assets: Asset[],
  quality: 'original' | 'preview',
): Promise<{ images: ImageMap; release: () => void }> {
  const urls: string[] = [];
  const images: ImageMap = new Map();

  await Promise.all(
    assets.map(async (asset) => {
      const url = URL.createObjectURL(quality === 'original' ? asset.original : asset.preview);
      urls.push(url);
      const image = new Image();
      image.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = url;
      });
      images.set(asset.id, image);
    }),
  );

  return { images, release: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rend une portion de la scène, à l'échelle demandée, sans aucun repère
 * d'édition. Rendre par région évite d'allouer un canvas à la largeur de tout
 * le carrousel : une slide fait toujours 1080 px de large, quel que soit le
 * nombre de slides, ce qui tient dans les limites mémoire d'un iPhone.
 */
export async function renderRegion(
  scene: Scene,
  images: ImageMap,
  region: Region,
  scale = 1,
): Promise<HTMLCanvasElement> {
  await ensureFontsReady();
  const { stage, dispose } = createOffscreenStage(region.width * scale, region.height * scale);
  try {
    const Konva = (await import('konva')).default;
    const layer = new Konva.Layer({
      listening: false,
      scaleX: scale,
      scaleY: scale,
      x: -region.x * scale,
      y: -region.y * scale,
    });
    // Konva applique par défaut le ratio de pixels de l'écran, soit 3 sur un
    // iPhone : un rendu de 1080 × 1350 allouerait 3240 × 4050 px pour rien,
    // puisque la composition est déjà à sa résolution finale. Le ratio doit
    // être fixé **avant** l'ajout à la scène, qui dimensionne le canvas.
    layer.getCanvas().setPixelRatio(1);
    stage.add(layer);
    drawScene(layer, scene, images);
    layer.draw();
    return stage.toCanvas({ pixelRatio: 1 });
  } finally {
    dispose();
  }
}

/** Rend la scène entière. `scale` réduit la taille du canvas alloué. */
export async function renderSceneCanvas(
  scene: Scene,
  images: ImageMap,
  scale = 1,
): Promise<HTMLCanvasElement> {
  return renderRegion(
    scene,
    images,
    { x: 0, y: 0, width: scene.width, height: scene.height },
    scale,
  );
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Échec de l'encodage JPEG"))),
      'image/jpeg',
      quality,
    );
  });
}

function fillBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: Background,
) {
  if (background.type === 'solid') {
    ctx.fillStyle = background.color;
  } else {
    const radians = (background.angle * Math.PI) / 180;
    const gradient = ctx.createLinearGradient(
      0,
      0,
      Math.cos(radians) * width,
      Math.sin(radians) * height,
    );
    gradient.addColorStop(0, background.from);
    gradient.addColorStop(1, background.to);
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, width, height);
}

function newCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** Libère immédiatement la mémoire d'un canvas devenu inutile. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Réduit un canvas à une largeur donnée. */
export function scaleCanvasTo(source: HTMLCanvasElement, width: number): HTMLCanvasElement {
  const ratio = width / source.width;
  const { canvas, ctx } = newCanvas(Math.round(width), Math.round(source.height * ratio));
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Une image par slide, rendue indépendamment : aucun canvas géant. */
export async function renderSlideCanvases(
  scene: Scene,
  images: ImageMap,
  onProgress?: (done: number, total: number) => void,
): Promise<HTMLCanvasElement[]> {
  const count = slideCountOf(scene);
  const result: HTMLCanvasElement[] = [];
  for (let index = 0; index < count; index += 1) {
    result.push(
      await renderRegion(scene, images, {
        x: index * scene.slideWidth,
        y: 0,
        width: scene.slideWidth,
        height: scene.height,
      }),
    );
    onProgress?.(index + 1, count);
  }
  return result;
}

/**
 * Variante Facebook : une Page affiche un post multi-photos en mosaïque,
 * l'effet seamless est perdu. On produit donc un visuel unique.
 */
export async function buildFacebookCanvas(
  scene: Scene,
  images: ImageMap,
  variant: FbVariant,
  slides: HTMLCanvasElement[],
): Promise<HTMLCanvasElement> {
  const width = 1080;
  const height = scene.height === 1080 ? 1080 : 1350;
  const { canvas, ctx } = newCanvas(width, height);
  fillBackground(ctx, width, height, scene.background);

  if (variant === 'panorama') {
    // Rendu directement à la largeur voulue : le panorama d'un carrousel de dix
    // slides n'alloue jamais plus de 1080 px de large.
    const scale = width / scene.width;
    const panorama = await renderRegion(
      scene,
      images,
      { x: 0, y: 0, width: scene.width, height: scene.height },
      scale,
    );
    ctx.drawImage(panorama, 0, (height - panorama.height) / 2);
    return canvas;
  }

  const gap = 24;
  const padding = 48;
  const columns = slides.length <= 1 ? 1 : slides.length <= 4 ? 2 : 3;
  const rows = Math.ceil(slides.length / columns);
  const cellWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const cellHeight = (height - padding * 2 - gap * (rows - 1)) / rows;

  slides.forEach((slide, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const scale = Math.min(cellWidth / slide.width, cellHeight / slide.height);
    const drawWidth = slide.width * scale;
    const drawHeight = slide.height * scale;
    const x = padding + column * (cellWidth + gap) + (cellWidth - drawWidth) / 2;
    const y = padding + row * (cellHeight + gap) + (cellHeight - drawHeight) / 2;
    ctx.drawImage(slide, x, y, drawWidth, drawHeight);
  });

  return canvas;
}

export interface ExportResult {
  zip: Blob;
  slideCount: number;
}

export interface ExportedImages {
  /** Slides Instagram dans l'ordre de publication. */
  slides: Blob[];
  facebook: Blob;
}

export interface ExportProgress {
  (step: string, ratio: number): void;
}

/**
 * Produit les images finales, en pleine résolution. Séparé de la mise en ZIP :
 * sur iPhone on partage les JPEG un par un vers la pellicule, un ZIP n'y entre pas.
 */
export async function renderExportImages(
  project: Project,
  assets: Asset[],
  onProgress?: ExportProgress,
): Promise<ExportedImages> {
  onProgress?.('Chargement des photos haute résolution', 0.05);
  const { images, release } = await loadImageMap(assets, 'original');

  try {
    const scene = project.scene;
    const count = slideCountOf(scene);
    const slides: Blob[] = [];
    // La variante « collage » est la seule à réutiliser les slides, et elle les
    // réduit : on n'en garde donc que des vignettes. Chaque canvas pleine
    // résolution est libéré dès qu'il est encodé, sinon dix slides restent en
    // mémoire pour rien.
    const minis: HTMLCanvasElement[] = [];

    for (let index = 0; index < count; index += 1) {
      onProgress?.(`Rendu de la slide ${index + 1} sur ${count}`, 0.1 + (0.7 * index) / count);
      const canvas = await renderRegion(scene, images, {
        x: index * scene.slideWidth,
        y: 0,
        width: scene.slideWidth,
        height: scene.height,
      });
      slides.push(await canvasToBlob(canvas));
      if (project.fbVariant === 'collage') minis.push(scaleCanvasTo(canvas, 420));
      releaseCanvas(canvas);
    }

    onProgress?.('Variante Facebook', 0.85);
    const facebookCanvas = await buildFacebookCanvas(scene, images, project.fbVariant, minis);
    const facebook = await canvasToBlob(facebookCanvas);
    releaseCanvas(facebookCanvas);
    minis.forEach(releaseCanvas);

    onProgress?.('Images prêtes', 0.95);
    return { slides, facebook };
  } finally {
    release();
  }
}

/** Assemble les images rendues en un ZIP prêt à télécharger. */
export async function zipExportedImages(images: ExportedImages): Promise<Blob> {
  const zip = new JSZip();
  const instagram = zip.folder('instagram');
  images.slides.forEach((blob, index) => {
    instagram?.file(`${String(index + 1).padStart(2, '0')}.jpg`, blob);
  });
  zip.folder('facebook')?.file('facebook.jpg', images.facebook);
  return zip.generateAsync({ type: 'blob' });
}

/** Export ZIP complet : slides Instagram numérotées + variante Facebook. */
export async function exportProjectZip(
  project: Project,
  assets: Asset[],
  onProgress?: ExportProgress,
): Promise<ExportResult> {
  const images = await renderExportImages(project, assets, onProgress);
  onProgress?.('Création du ZIP', 0.92);
  const zip = await zipExportedImages(images);
  onProgress?.('Terminé', 1);
  return { zip, slideCount: images.slides.length };
}

/** Export d'une seule slide en pleine résolution. */
export async function exportSingleSlide(
  project: Project,
  assets: Asset[],
  slideIndex: number,
): Promise<Blob> {
  const { images, release } = await loadImageMap(assets, 'original');
  try {
    const canvas = await renderRegion(project.scene, images, {
      x: slideIndex * project.scene.slideWidth,
      y: 0,
      width: project.scene.slideWidth,
      height: project.scene.height,
    });
    return canvasToBlob(canvas);
  } finally {
    release();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'projet';
