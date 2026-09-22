import { palette, SAFE_MARGIN } from '../theme';
import type {
  Background,
  Crop,
  PhotoCellElement,
  Scene,
  SceneElement,
  ShapeElement,
  TextElement,
} from '../types/scene';
import { newId } from '../data/projectRepository';
import { getFormat } from './formats';
import type { ProjectFormat } from '../types/scene';

export const DEFAULT_CROP: Crop = { offsetX: 0, offsetY: 0, scale: 1 };

export const cloneScene = (scene: Scene): Scene => JSON.parse(JSON.stringify(scene)) as Scene;

export const slideCountOf = (scene: Scene): number =>
  Math.max(1, Math.round(scene.width / scene.slideWidth));

export function emptyScene(format: ProjectFormat, slideCount: number): Scene {
  const spec = getFormat(format);
  return {
    width: spec.slideWidth * slideCount,
    height: spec.slideHeight,
    slideWidth: spec.slideWidth,
    background: { type: 'solid', color: palette.vertFonce },
    elements: [],
  };
}

export function createPhotoCell(partial: Partial<PhotoCellElement> = {}): PhotoCellElement {
  return {
    id: newId(),
    type: 'photoCell',
    x: 0,
    y: 0,
    w: 400,
    h: 400,
    radius: 24,
    crop: { ...DEFAULT_CROP },
    ...partial,
  };
}

export function createText(partial: Partial<TextElement> = {}): TextElement {
  return {
    id: newId(),
    type: 'text',
    x: 0,
    y: 0,
    w: 600,
    text: 'Votre texte',
    font: 'Poppins',
    weight: 800,
    size: 72,
    color: palette.blanc,
    align: 'left',
    lineHeight: 1.2,
    ...partial,
  };
}

export function createShape(partial: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: newId(),
    type: 'shape',
    shape: 'rect',
    x: 0,
    y: 0,
    w: 300,
    h: 300,
    radius: 0,
    fill: palette.orange,
    ...partial,
  };
}

/** Réattribue de nouveaux identifiants à tous les éléments (duplication de template). */
export function reassignIds(scene: Scene): Scene {
  const copy = cloneScene(scene);
  copy.elements = copy.elements.map((element) => ({ ...element, id: newId() }));
  return copy;
}

export const slideIndexOf = (scene: Scene, x: number): number =>
  Math.max(0, Math.min(slideCountOf(scene) - 1, Math.floor(x / scene.slideWidth)));

export const slideBounds = (scene: Scene, index: number) => ({
  x: index * scene.slideWidth,
  y: 0,
  width: scene.slideWidth,
  height: scene.height,
});

export function elementBounds(element: SceneElement): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (element.type === 'photoCell') {
    return { x: element.x, y: element.y, w: element.w, h: element.h };
  }
  if (element.type === 'text') {
    const lines = Math.max(1, element.text.split('\n').length);
    return {
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.size * (element.lineHeight ?? 1.2) * lines,
    };
  }
  if (element.shape === 'circle') {
    const r = element.r ?? 0;
    return { x: element.x - r, y: element.y - r, w: r * 2, h: r * 2 };
  }
  if (element.shape === 'line') {
    const points = element.points ?? [0, 0];
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: element.x + minX,
      y: element.y + minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    };
  }
  return { x: element.x, y: element.y, w: element.w ?? 0, h: element.h ?? 0 };
}

/** Un élément chevauche-t-il une ligne de découpe entre deux slides ? */
export function crossesSlideBoundary(scene: Scene, element: SceneElement): boolean {
  const bounds = elementBounds(element);
  const first = Math.floor(bounds.x / scene.slideWidth);
  const last = Math.floor((bounds.x + bounds.w - 1) / scene.slideWidth);
  return last > first;
}

/** Textes à cheval sur une découpe : signalés à l'utilisateur, jamais bloquants. */
export function textsCrossingCut(scene: Scene): TextElement[] {
  return scene.elements.filter(
    (element): element is TextElement => element.type === 'text' && crossesSlideBoundary(scene, element),
  );
}

/** Un élément couvre-t-il toute la largeur de la scène ? */
function spansScene(element: SceneElement, sceneWidth: number, tolerance = 80): boolean {
  if (element.type === 'shape' && element.shape === 'line') {
    const points = element.points ?? [];
    const xs = points.filter((_, index) => index % 2 === 0);
    if (!xs.length) return false;
    return element.x + Math.min(...xs) <= tolerance && element.x + Math.max(...xs) >= sceneWidth - tolerance;
  }
  const bounds = elementBounds(element);
  return bounds.x <= tolerance && bounds.x + bounds.w >= sceneWidth - tolerance;
}

/**
 * Ajoute une slide. Les éléments qui traversaient déjà toute la scène —
 * photo panoramique, ligne de fil conducteur — sont étirés d'autant : sans
 * cela un panorama de 3 slides passé à 10 garderait sa photo sur 3 slides et
 * recevrait 7 cellules isolées, ce qui n'a aucun sens.
 */
export function addSlide(scene: Scene): Scene {
  const next = cloneScene(scene);
  const index = slideCountOf(next);
  const previousWidth = next.width;
  const newWidth = previousWidth + next.slideWidth;
  const growth = newWidth / previousWidth;

  let stretched = false;
  next.elements = next.elements.map((element) => {
    if (!spansScene(element, previousWidth)) return element;
    stretched = true;
    if (element.type === 'photoCell') return { ...element, w: element.w * growth };
    if (element.type === 'text') return { ...element, w: element.w * growth };
    if (element.type === 'shape' && element.shape === 'line') {
      return {
        ...element,
        points: (element.points ?? []).map((value, i) => (i % 2 === 0 ? value * growth : value)),
      };
    }
    if (element.type === 'shape' && element.shape === 'rect') {
      return { ...element, w: (element.w ?? 0) * growth };
    }
    return element;
  });

  next.width = newWidth;

  // Aucune composition continue à étirer : la nouvelle slide reçoit sa cellule.
  if (!stretched) {
    next.elements.push(
      createPhotoCell({
        x: index * next.slideWidth + SAFE_MARGIN,
        y: SAFE_MARGIN,
        w: next.slideWidth - SAFE_MARGIN * 2,
        h: next.height - SAFE_MARGIN * 2,
        radius: 6,
      }),
    );
  }
  return next;
}

/** Retire la dernière slide et les éléments qu'elle contient entièrement. */
export function removeSlide(scene: Scene): Scene {
  const next = cloneScene(scene);
  const count = slideCountOf(next);
  if (count <= 1) return next;
  const cutX = (count - 1) * next.slideWidth;
  const shrink = cutX / next.width;

  // Symétrique de addSlide : ce qui traversait toute la scène se rétracte.
  const spanning = new Set(
    next.elements.filter((element) => spansScene(element, next.width)).map((element) => element.id),
  );
  if (spanning.size) {
    next.elements = next.elements.map((element) => {
      if (!spanning.has(element.id)) return element;
      if (element.type === 'photoCell') return { ...element, w: element.w * shrink };
      if (element.type === 'text') return { ...element, w: element.w * shrink };
      if (element.type === 'shape' && element.shape === 'line') {
        return {
          ...element,
          points: (element.points ?? []).map((value, i) => (i % 2 === 0 ? value * shrink : value)),
        };
      }
      if (element.type === 'shape' && element.shape === 'rect') {
        return { ...element, w: (element.w ?? 0) * shrink };
      }
      return element;
    });
  }
  next.elements = next.elements.filter((element) => elementBounds(element).x < cutX);
  next.elements = next.elements.map((element) => {
    if (spanning.has(element.id)) return element;
    const bounds = elementBounds(element);
    if (bounds.x + bounds.w <= cutX) return element;
    // L'élément déborde sur la slide supprimée : on le rétrécit.
    if (element.type === 'photoCell') {
      return { ...element, w: Math.max(80, cutX - element.x) };
    }
    if (element.type === 'text') {
      return { ...element, w: Math.max(120, cutX - element.x) };
    }
    if (element.shape === 'rect') {
      return { ...element, w: Math.max(40, cutX - element.x) };
    }
    return element;
  });
  next.width = cutX;
  return next;
}

/** Ajuste une scène de template au nombre de slides demandé. */
export function fitSceneToSlideCount(scene: Scene, slideCount: number): Scene {
  let next = cloneScene(scene);
  while (slideCountOf(next) < slideCount) next = addSlide(next);
  while (slideCountOf(next) > slideCount) next = removeSlide(next);
  return next;
}

export const backgroundToCss = (background: Background): string =>
  background.type === 'solid'
    ? background.color
    : `linear-gradient(${background.angle + 90}deg, ${background.from}, ${background.to})`;
