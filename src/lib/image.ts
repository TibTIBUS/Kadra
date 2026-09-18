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

/** Erreur d'import portant un motif lisible par l'utilisateur. */
export class ImageImportError extends Error {
  constructor(
    message: string,
    readonly fileName: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ImageImportError';
  }
}

/** Convertit un HEIC iPhone en JPEG. La librairie n'est chargée qu'au besoin. */
async function convertHeic(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  // Un HEIC peut contenir une séquence d'images : on garde la première.
  const blob = Array.isArray(result) ? result[0] : result;
  if (!(blob instanceof Blob)) throw new Error('Conversion HEIC sans résultat');
  return blob;
}

export function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Les images locales sont servies en blob: ; crossOrigin reste indispensable
    // pour toute image distante, sinon le canvas devient « tainted » et l'export échoue.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Le navigateur n'a pas su décoder cette image"));
    image.src = src;
  });
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Décode un fichier image. createImageBitmap est le chemin rapide, mais il refuse
 * des fichiers que le décodeur du navigateur accepte (profils couleur exotiques,
 * EXIF abîmé) : on retente alors via <img>.
 */
async function decodeBlob(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // from-image applique la rotation EXIF des photos iPhone.
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      };
    } catch {
      // On bascule sur le décodeur <img> ci-dessous.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await loadHTMLImage(url);
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('Image de dimensions nulles');
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
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
  if (!blob) throw new Error("Échec de l'encodage JPEG (image trop grande ?)");
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
  const heic = isHeic(file);
  let source: Blob = file;
  let heicError: unknown;

  if (heic) {
    try {
      source = await convertHeic(file);
    } catch (error) {
      // Safari décode le HEIC nativement : on laisse sa chance au décodeur du
      // navigateur avant d'abandonner.
      heicError = error;
      source = file;
    }
  }

  let decoded: DecodedImage;
  try {
    decoded = await decodeBlob(source);
  } catch (error) {
    if (heic) {
      throw new ImageImportError(
        heicError
          ? 'HEIC non pris en charge par le convertisseur (photo en mode Portrait ou Live Photo ?). Réexportez-la en JPEG depuis Photos.'
          : 'HEIC illisible après conversion.',
        file.name,
        heicError ?? error,
      );
    }
    throw new ImageImportError(
      'Fichier illisible : image corrompue, format non pris en charge, ou vidéo renommée en image.',
      file.name,
      error,
    );
  }

  try {
    const originalSize = fitInside(decoded.width, decoded.height, MAX_ORIGINAL_SIDE);
    const previewSize = fitInside(decoded.width, decoded.height, MAX_PREVIEW_SIDE);

    // On réencode toujours, même si le fichier tient déjà dans les limites : les
    // pixels stockés sont ainsi orientés comme les dimensions enregistrées, et
    // l'aperçu de l'éditeur et l'export partent exactement de la même image.
    const original = await drawToBlob(decoded.source, originalSize.width, originalSize.height);
    const preview = await drawToBlob(decoded.source, previewSize.width, previewSize.height, 0.85);

    return { original, preview, width: originalSize.width, height: originalSize.height };
  } catch (error) {
    throw new ImageImportError(
      "Redimensionnement impossible : la photo dépasse peut-être les limites du navigateur.",
      file.name,
      error,
    );
  } finally {
    decoded.release();
  }
}

/** Réduit un dataURL en miniature JPEG pour la liste des projets. */
export async function dataUrlToThumbnail(dataUrl: string, maxSide = THUMBNAIL_SIDE): Promise<Blob> {
  const image = await loadHTMLImage(dataUrl);
  const size = fitInside(image.naturalWidth, image.naturalHeight, maxSide);
  return drawToBlob(image, size.width, size.height, 0.8);
}
