import type { Crop, PhotoCellElement } from '../types/scene';

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Place une photo dans sa cellule : cadrage « cover » puis application du zoom
 * et du décalage de recadrage. La cellule ne bouge jamais.
 */
export function computePlacement(
  cell: PhotoCellElement,
  imageWidth: number,
  imageHeight: number,
): Placement {
  if (!imageWidth || !imageHeight) {
    return { x: cell.x, y: cell.y, width: cell.w, height: cell.h };
  }
  const base = Math.max(cell.w / imageWidth, cell.h / imageHeight);
  const scale = base * Math.max(0.2, cell.crop?.scale ?? 1);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: cell.x + (cell.w - width) / 2 + (cell.crop?.offsetX ?? 0),
    y: cell.y + (cell.h - height) / 2 + (cell.crop?.offsetY ?? 0),
    width,
    height,
  };
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const clampZoom = (scale: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

/** Empêche la photo de laisser apparaître un vide dans sa cellule. */
export function clampOffsets(
  cell: PhotoCellElement,
  imageWidth: number,
  imageHeight: number,
  offsetX: number,
  offsetY: number,
): { offsetX: number; offsetY: number } {
  const placement = computePlacement(
    { ...cell, crop: { ...cell.crop, offsetX: 0, offsetY: 0 } },
    imageWidth,
    imageHeight,
  );
  const slackX = Math.max(0, (placement.width - cell.w) / 2);
  const slackY = Math.max(0, (placement.height - cell.h) / 2);
  return {
    offsetX: Math.min(slackX, Math.max(-slackX, offsetX)),
    offsetY: Math.min(slackY, Math.max(-slackY, offsetY)),
  };
}

/**
 * Zoome la photo en gardant fixe le point visé (curseur ou milieu des deux
 * doigts). Sans cet ancrage, l'image fuit sous le doigt pendant le pincement.
 * La cellule, elle, ne bouge jamais : seul le recadrage change.
 */
export function zoomCropAround(
  cell: PhotoCellElement,
  imageWidth: number,
  imageHeight: number,
  factor: number,
  anchor: { x: number; y: number },
): Crop {
  const crop = cell.crop ?? { offsetX: 0, offsetY: 0, scale: 1 };
  if (!imageWidth || !imageHeight) return crop;

  const base = Math.max(cell.w / imageWidth, cell.h / imageHeight);
  const before = Math.max(0.2, crop.scale ?? 1);
  const after = clampZoom(before * factor);
  if (after === before) return crop;

  const drawBefore = { w: imageWidth * base * before, h: imageHeight * base * before };
  const drawAfter = { w: imageWidth * base * after, h: imageHeight * base * after };

  // Position du coin haut-gauche de l'image avant et après, décalage exclu.
  const restBefore = { x: (cell.w - drawBefore.w) / 2, y: (cell.h - drawBefore.h) / 2 };
  const restAfter = { x: (cell.w - drawAfter.w) / 2, y: (cell.h - drawAfter.h) / 2 };

  // Point visé, exprimé en fraction de l'image.
  const u = (anchor.x - (restBefore.x + crop.offsetX)) / drawBefore.w;
  const v = (anchor.y - (restBefore.y + crop.offsetY)) / drawBefore.h;

  const offsets = clampOffsets(
    { ...cell, crop: { ...crop, scale: after } },
    imageWidth,
    imageHeight,
    anchor.x - u * drawAfter.w - restAfter.x,
    anchor.y - v * drawAfter.h - restAfter.y,
  );

  return { ...offsets, scale: after };
}

/** Passe d'un point de la scène aux coordonnées locales d'une cellule, rotation comprise. */
export function toCellLocal(
  cell: Pick<PhotoCellElement, 'x' | 'y' | 'w' | 'h' | 'rotation'>,
  point: { x: number; y: number },
): { x: number; y: number } {
  const centerX = cell.x + cell.w / 2;
  const centerY = cell.y + cell.h / 2;
  const radians = (-(cell.rotation ?? 0) * Math.PI) / 180;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians) + cell.w / 2,
    y: dx * Math.sin(radians) + dy * Math.cos(radians) + cell.h / 2,
  };
}
