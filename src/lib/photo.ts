import type { PhotoCellElement } from '../types/scene';

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
