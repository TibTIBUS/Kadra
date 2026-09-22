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

/** Rend la scène complète, sans aucun repère d'édition, à sa résolution exacte. */
export async function renderSceneCanvas(
  scene: Scene,
  images: ImageMap,
  pixelRatio = 1,
): Promise<HTMLCanvasElement> {
  await ensureFontsReady();
  const { stage, dispose } = createOffscreenStage(scene);
  try {
    const Konva = (await import('konva')).default;
    const layer = new Konva.Layer({ listening: false });
    stage.add(layer);
    drawScene(layer, scene, images);
    layer.draw();
    return stage.toCanvas({ pixelRatio });
  } finally {
    dispose();
  }
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

/** Découpe la scène en une image par slide, dans l'ordre de publication. */
export function sliceSlideCanvases(source: HTMLCanvasElement, scene: Scene): HTMLCanvasElement[] {
  const count = slideCountOf(scene);
  const result: HTMLCanvasElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const { canvas, ctx } = newCanvas(scene.slideWidth, scene.height);
    ctx.drawImage(
      source,
      index * scene.slideWidth,
      0,
      scene.slideWidth,
      scene.height,
      0,
      0,
      scene.slideWidth,
      scene.height,
    );
    result.push(canvas);
  }
  return result;
}

/**
 * Variante Facebook : une Page affiche un post multi-photos en mosaïque,
 * l'effet seamless est perdu. On produit donc un visuel unique.
 */
export function buildFacebookCanvas(
  source: HTMLCanvasElement,
  scene: Scene,
  variant: FbVariant,
): HTMLCanvasElement {
  const width = 1080;
  const height = scene.height === 1080 ? 1080 : 1350;
  const { canvas, ctx } = newCanvas(width, height);
  fillBackground(ctx, width, height, scene.background);

  if (variant === 'panorama') {
    const scale = width / scene.width;
    const drawHeight = scene.height * scale;
    ctx.drawImage(source, 0, (height - drawHeight) / 2, width, drawHeight);
    return canvas;
  }

  const slides = sliceSlideCanvases(source, scene);
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
    onProgress?.('Rendu de la composition', 0.35);
    const source = await renderSceneCanvas(project.scene, images);

    onProgress?.('Découpe des slides', 0.65);
    const slides = await Promise.all(
      sliceSlideCanvases(source, project.scene).map((canvas) => canvasToBlob(canvas)),
    );

    onProgress?.('Variante Facebook', 0.85);
    const facebook = await canvasToBlob(
      buildFacebookCanvas(source, project.scene, project.fbVariant),
    );

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
    const source = await renderSceneCanvas(project.scene, images);
    const slides = sliceSlideCanvases(source, project.scene);
    const canvas = slides[slideIndex];
    if (!canvas) throw new Error('Slide introuvable');
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
