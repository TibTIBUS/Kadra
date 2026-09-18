import type { ProjectFormat, Scene, SceneElement } from '../types/scene';
import { getFormat } from '../lib/formats';
import { cloneScene, fitSceneToSlideCount, reassignIds } from '../lib/scene';

export type TemplateCategory = 'collage' | 'carousel';

export interface TemplateDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  slideCount: number;
  formats: ProjectFormat[];
  /** Scène de référence, définie en 1080 × 1350 par slide. */
  scene: Scene;
}

// Les templates sont de simples fichiers JSON : en ajouter un revient à déposer
// un fichier dans ce dossier (voir scripts/generate-templates.mjs).
const modules = import.meta.glob<{ default: TemplateDefinition }>('./*.json', { eager: true });

export const templates: TemplateDefinition[] = Object.values(modules)
  .map((module) => module.default)
  .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)));

export const getTemplate = (id: string): TemplateDefinition | undefined =>
  templates.find((template) => template.id === id);

export const templatesForFormat = (format: ProjectFormat): TemplateDefinition[] =>
  templates.filter((template) => template.formats.includes(format));

/** Met une scène de référence à l'échelle verticale du format visé (1350 → 1080). */
function scaleSceneHeight(scene: Scene, targetHeight: number): Scene {
  const factor = targetHeight / scene.height;
  if (factor === 1) return cloneScene(scene);

  const next = cloneScene(scene);
  next.height = targetHeight;
  next.elements = next.elements.map((element): SceneElement => {
    if (element.type === 'photoCell') {
      return { ...element, y: element.y * factor, h: element.h * factor };
    }
    if (element.type === 'text') {
      return { ...element, y: element.y * factor, size: Math.round(element.size * factor) };
    }
    if (element.shape === 'circle') {
      return { ...element, y: element.y * factor, r: (element.r ?? 0) * factor };
    }
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

/** Produit la scène d'un nouveau projet à partir d'un template. */
export function instantiateTemplate(
  template: TemplateDefinition,
  format: ProjectFormat,
  slideCount: number,
): Scene {
  const spec = getFormat(format);
  const scaled = scaleSceneHeight(template.scene, spec.slideHeight);
  const fitted = fitSceneToSlideCount(scaled, slideCount);
  return reassignIds(fitted);
}
