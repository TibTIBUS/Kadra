import type { Background, ProjectFormat, Scene, SceneElement } from '../types/scene';
import { getFormat } from '../lib/formats';
import { cloneScene, createPhotoCell } from '../lib/scene';
import { newId } from '../data/projectRepository';
import { SAFE_MARGIN } from '../theme';

export type TemplateCategory = 'collage' | 'carousel';

/**
 * Un template ne décrit pas une scène figée mais un **motif**, réassemblé pour
 * le nombre de slides demandé. C'est ce qui permet à un carrousel d'être juste
 * de 2 à 10 slides : la photo panoramique s'étire sur toute la longueur au lieu
 * de rester large de trois slides, et les slides intermédiaires reprennent le
 * même rythme plutôt que de recevoir une cellule générique.
 */
export interface TemplateDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  formats: ProjectFormat[];
  defaultSlides: number;
  background: Background;
  /**
   * Éléments couvrant toute la scène. Leur `x` et leur `w` sont exprimés en
   * fraction de la largeur totale (0 → 1) et recalculés à chaque longueur.
   */
  full?: SceneElement[];
  /** Première slide : couverture, titre. Coordonnées locales à la slide. */
  lead?: SceneElement[];
  /** Motif répété sur chaque slide intermédiaire. */
  body?: SceneElement[];
  /** Variante appliquée une slide sur deux : c'est elle qui crée le rythme. */
  bodyAlt?: SceneElement[];
  /** Dernière slide : récapitulatif, appel à l'action. */
  tail?: SceneElement[];
  /** Nombre de photos plaçables, pour l'afficher à la création. */
  photoSlots?: (slideCount: number) => number;
}

interface TemplateFile extends Omit<TemplateDefinition, 'photoSlots'> {
  /** Hauteur de référence des coordonnées du fichier. */
  refHeight: number;
  refSlideWidth: number;
}

const modules = import.meta.glob<{ default: TemplateFile }>('./*.json', { eager: true });

const files: TemplateFile[] = Object.values(modules)
  .map((module) => module.default)
  .sort((a, b) =>
    a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category),
  );

const countCells = (elements: SceneElement[] | undefined) =>
  (elements ?? []).filter((element) => element.type === 'photoCell').length;

/** Combien de photos ce template accepte-t-il pour N slides ? */
export function photoSlotCount(template: TemplateFile, slideCount: number): number {
  const layout = slotLayout(template, slideCount);
  return (
    countCells(template.full) +
    layout.filter((slot) => slot === 'lead').length * countCells(template.lead) +
    Math.ceil(layout.filter((slot) => slot === 'body').length / 2) * countCells(template.body) +
    Math.floor(layout.filter((slot) => slot === 'body').length / 2) *
      countCells(template.bodyAlt?.length ? template.bodyAlt : template.body) +
    layout.filter((slot) => slot === 'tail').length * countCells(template.tail)
  );
}

export const templates: TemplateDefinition[] = files.map((file) => ({
  ...file,
  photoSlots: (slideCount: number) => photoSlotCount(file, slideCount),
}));

export const getTemplate = (id: string): TemplateDefinition | undefined =>
  templates.find((template) => template.id === id);

export const templatesForFormat = (format: ProjectFormat): TemplateDefinition[] =>
  templates.filter((template) => template.formats.includes(format));

type Slot = 'lead' | 'body' | 'tail' | 'empty';

/** Répartit couverture, motif courant et slide finale sur N slides. */
function slotLayout(template: Pick<TemplateFile, 'lead' | 'body' | 'tail'>, slideCount: number): Slot[] {
  const layout: Slot[] = Array.from({ length: slideCount }, () => 'empty');
  const hasLead = Boolean(template.lead?.length);
  const hasTail = Boolean(template.tail?.length);

  if (hasLead) layout[0] = 'lead';
  if (hasTail && slideCount >= 2) layout[slideCount - 1] = 'tail';
  else if (hasTail && !hasLead) layout[0] = 'tail';

  if (template.body?.length) {
    for (let index = 0; index < slideCount; index += 1) {
      if (layout[index] === 'empty') layout[index] = 'body';
    }
  }
  return layout;
}

/**
 * Décale un élément sur sa slide et résout les jetons de numérotation :
 * `{n}` devient le numéro de slide, `{nn}` le même sur deux chiffres.
 * Sans cela, un motif répété afficherait « 01 » sur toutes les slides.
 */
const shift = (element: SceneElement, dx: number, slideNumber: number): SceneElement => {
  const moved = { ...element, id: newId(), x: element.x + dx };
  if (moved.type === 'text') {
    moved.text = moved.text
      .replace(/\{nn\}/g, String(slideNumber).padStart(2, '0'))
      .replace(/\{n\}/g, String(slideNumber));
  }
  return moved;
};

/** Passe les éléments « pleine scène » de fractions à pixels. */
const stretch = (element: SceneElement, sceneWidth: number): SceneElement => {
  const id = newId();
  const x = element.x * sceneWidth;

  if (element.type === 'photoCell') return { ...element, id, x, w: element.w * sceneWidth };
  if (element.type === 'text') return { ...element, id, x, w: element.w * sceneWidth };
  if (element.shape === 'line') {
    return {
      ...element,
      id,
      x,
      points: (element.points ?? []).map((value, index) =>
        index % 2 === 0 ? value * sceneWidth : value,
      ),
    };
  }
  if (element.shape === 'rect') {
    return { ...element, id, x, w: (element.w ?? 0) * sceneWidth };
  }
  return { ...element, id, x };
};

/** Met une scène à l'échelle verticale du format visé (1350 → 1080). */
function scaleHeight(scene: Scene, targetHeight: number): Scene {
  const factor = targetHeight / scene.height;
  if (factor === 1) return scene;

  const next = cloneScene(scene);
  next.height = targetHeight;
  next.elements = next.elements.map((element): SceneElement => {
    if (element.type === 'photoCell') return { ...element, y: element.y * factor, h: element.h * factor };
    if (element.type === 'text') {
      return { ...element, y: element.y * factor, size: Math.round(element.size * factor) };
    }
    if (element.shape === 'circle') return { ...element, y: element.y * factor, r: (element.r ?? 0) * factor };
    if (element.shape === 'line') {
      return {
        ...element,
        y: element.y * factor,
        points: (element.points ?? []).map((value, index) => (index % 2 === 1 ? value * factor : value)),
      };
    }
    return { ...element, y: element.y * factor, h: (element.h ?? 0) * factor };
  });
  return next;
}

/** Assemble la scène d'un projet pour le nombre de slides demandé. */
export function instantiateTemplate(
  template: TemplateDefinition,
  format: ProjectFormat,
  slideCount: number,
): Scene {
  const spec = getFormat(format);
  const file = template as TemplateFile;
  const sceneWidth = spec.slideWidth * slideCount;
  const elements: SceneElement[] = [];

  for (const element of file.full ?? []) {
    elements.push(stretch(element, sceneWidth));
  }

  let bodyRank = 0;
  slotLayout(file, slideCount).forEach((slot, index) => {
    let source: SceneElement[] | undefined;
    if (slot === 'lead') source = file.lead;
    else if (slot === 'tail') source = file.tail;
    else if (slot === 'body') {
      // Une slide sur deux prend la variante, quand le template en fournit une.
      source = bodyRank % 2 === 1 && file.bodyAlt?.length ? file.bodyAlt : file.body;
      bodyRank += 1;
    }
    if (!source) return;
    for (const element of source) {
      elements.push(shift(element, index * spec.slideWidth, index + 1));
    }
  });

  // Filet de sécurité : une slide sans aucun élément et sans photo pleine scène
  // recevrait un vide. On y place une cellule plein cadre.
  const covered = new Set<number>();
  for (const element of elements) {
    const width = element.type === 'photoCell' ? element.w : element.type === 'text' ? element.w : (element.w ?? 0);
    const first = Math.floor(element.x / spec.slideWidth);
    const last = Math.floor((element.x + Math.max(width, 1) - 1) / spec.slideWidth);
    for (let slide = Math.max(0, first); slide <= Math.min(slideCount - 1, last); slide += 1) {
      covered.add(slide);
    }
  }
  for (let index = 0; index < slideCount; index += 1) {
    if (covered.has(index)) continue;
    elements.push(
      createPhotoCell({
        x: index * spec.slideWidth + SAFE_MARGIN,
        y: SAFE_MARGIN,
        w: spec.slideWidth - SAFE_MARGIN * 2,
        h: file.refHeight - SAFE_MARGIN * 2,
        radius: 6,
      }),
    );
  }

  const scene: Scene = {
    width: sceneWidth,
    height: file.refHeight,
    slideWidth: spec.slideWidth,
    background: file.background,
    elements,
  };

  return scaleHeight(scene, spec.slideHeight);
}
