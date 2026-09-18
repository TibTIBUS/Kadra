/** Traitement des images côté client : conversion HEIC, redimensionnement, aperçus. */

export const MAX_ORIGINAL_SIDE = 3000;
export const MAX_PREVIEW_SIDE = 1200;
export const THUMBNAIL_SIDE = 480;

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export const ACCEPT_ATTRIBUTE = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/*';

const isHeic = (file: File): boolean =>
  /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

export const isAcceptedImage = (file: File): boolean =>
  isHeic(file) || ACCEPTED_MIME.includes(file.type) || file.type.startsWith('image/');

/** Convertit un HEIC iPhone en JPEG. La librairie n'est chargée qu'au besoin. */
async function convertHeic(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(result) ? (result[0] as Blob) : (result as Blob);
}

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  const image = await loadHTMLImage(URL.createObjectURL(blob), true);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return createImageBitmap(canvas);
}

export function loadHTMLImage(src: string, revokeAfter = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Les images locales sont servies en blob: ; crossOrigin reste indispensable
    // pour toute image distante, sinon le canvas devient « tainted » et l'export échoue.
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (revokeAfter) URL.revokeObjectURL(src);
      resolve(image);
    };
    image.onerror = () => {
      if (revokeAfter) URL.revokeObjectURL(src);
      reject(new Error("Impossible de charger l'image"));
    };
    image.src = src;
  });
}

function fitInside(width: number, height: number, maxSide: number) {
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

async function drawToBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality = 0.92,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error("Échec de l'encodage JPEG");
  return blob;
}

export interface ProcessedImage {
  original: Blob;
  preview: Blob;
  width: number;
  height: number;
}

/**
 * Prépare une photo pour le stockage : HEIC → JPEG, grand côté ramené à 3000 px,
 * plus une version d'aperçu 1200 px utilisée dans l'éditeur.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  const source: Blob = isHeic(file) ? await convertHeic(file) : file;
  const bitmap = await loadBitmap(source);

  try {
    const originalSize = fitInside(bitmap.width, bitmap.height, MAX_ORIGINAL_SIDE);
    const previewSize = fitInside(bitmap.width, bitmap.height, MAX_PREVIEW_SIDE);

    const needsResize =
      originalSize.width !== bitmap.width ||
      originalSize.height !== bitmap.height ||
      source.type !== 'image/jpeg';

    const original = needsResize
      ? await drawToBlob(bitmap, originalSize.width, originalSize.height)
      : source;
    const preview = await drawToBlob(bitmap, previewSize.width, previewSize.height, 0.85);

    return {
      original,
      preview,
      width: originalSize.width,
      height: originalSize.height,
    };
  } finally {
    bitmap.close?.();
  }
}

/** Réduit un dataURL en miniature JPEG pour la liste des projets. */
export async function dataUrlToThumbnail(dataUrl: string, maxSide = THUMBNAIL_SIDE): Promise<Blob> {
  const image = await loadHTMLImage(dataUrl);
  const size = fitInside(image.naturalWidth, image.naturalHeight, maxSide);
  return drawToBlob(image, size.width, size.height, 0.8);
}
