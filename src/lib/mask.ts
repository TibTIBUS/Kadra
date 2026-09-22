import type { CellMask, PhotoCellElement, Shadow } from '../types/scene';

/**
 * Chemin de découpe d'une cellule, en coordonnées locales (0,0 → w,h).
 * Ce tracé est partagé par l'éditeur et par le rendu d'export : ce que l'on
 * voit à l'écran est exactement ce qui sort dans le JPEG.
 */
/** Sous-ensemble du contexte 2D suffisant pour tracer un masque. */
export interface PathSink {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): void;
  closePath(): void;
}

export function traceCellPath(
  ctx: PathSink,
  cell: Pick<PhotoCellElement, 'w' | 'h' | 'radius' | 'mask'>,
): void {
  const mask: CellMask = cell.mask ?? { type: 'rect', radius: cell.radius ?? 0 };
  const { w, h } = cell;

  ctx.beginPath();

  if (mask.type === 'polygon') {
    const points = mask.points;
    for (let index = 0; index + 1 < points.length; index += 2) {
      const x = (points[index] ?? 0) * w;
      const y = (points[index + 1] ?? 0) * h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return;
  }

  if (mask.type === 'ellipse') {
    // Approximation d'une ellipse par quatre arcs de Bézier : disponible aussi
    // bien sur le contexte 2D que sur le contexte de clip de Konva.
    const kappa = 0.5522847498;
    const rx = w / 2;
    const ry = h / 2;
    const cx = rx;
    const cy = ry;
    const bezier = ctx;
    bezier.moveTo(cx, cy - ry);
    bezier.bezierCurveTo(cx + rx * kappa, cy - ry, cx + rx, cy - ry * kappa, cx + rx, cy);
    bezier.bezierCurveTo(cx + rx, cy + ry * kappa, cx + rx * kappa, cy + ry, cx, cy + ry);
    bezier.bezierCurveTo(cx - rx * kappa, cy + ry, cx - rx, cy + ry * kappa, cx - rx, cy);
    bezier.bezierCurveTo(cx - rx, cy - ry * kappa, cx - rx * kappa, cy - ry, cx, cy - ry);
    bezier.closePath();
    return;
  }

  const radius = Math.min(mask.radius ?? cell.radius ?? 0, w / 2, h / 2);
  if (radius <= 0) {
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    return;
  }
  ctx.moveTo(radius, 0);
  ctx.arcTo(w, 0, w, h, radius);
  ctx.arcTo(w, h, 0, h, radius);
  ctx.arcTo(0, h, 0, 0, radius);
  ctx.arcTo(0, 0, w, 0, radius);
  ctx.closePath();
}

export const shadowProps = (shadow?: Shadow) =>
  shadow
    ? {
        shadowColor: shadow.color,
        shadowBlur: shadow.blur,
        shadowOffsetX: shadow.offsetX,
        shadowOffsetY: shadow.offsetY,
        shadowOpacity: shadow.opacity,
      }
    : {};

/**
 * Deux polygones qui se partagent exactement la même arête oblique.
 * `tilt` est le décalage vertical de l'arête, en fraction de la hauteur.
 */
export function diagonalSplit(
  at: number,
  tilt: number,
): { top: number[]; bottom: number[] } {
  const left = at - tilt / 2;
  const right = at + tilt / 2;
  return {
    top: [0, 0, 1, 0, 1, right, 0, left],
    bottom: [0, left, 1, right, 1, 1, 0, 1],
  };
}
