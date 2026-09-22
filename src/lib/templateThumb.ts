import type { Scene } from '../types/scene';
import { renderRegion } from './export';

const cache = new Map<string, string>();

/** Largeur de rendu d'une miniature, en pixels. */
const THUMB_WIDTH = 360;

/**
 * Les miniatures sont rendues **une par une**. Dix rendus simultanés, chacun
 * allouant son propre canvas, suffisaient à faire tuer l'onglet par Safari sur
 * iPhone au moment de choisir un format de carrousel.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * Miniature d'un template, rendue au premier affichage puis mise en cache
 * pour la durée de la session.
 */
export async function renderTemplateThumbnail(id: string, scene: Scene): Promise<string> {
  const cached = cache.get(id);
  if (cached) return cached;

  return enqueue(async () => {
    const already = cache.get(id);
    if (already) return already;

    // Rendu directement à la taille d'affichage : un carrousel de dix slides
    // n'alloue jamais un canvas de 10 800 px de large.
    const canvas = await renderRegion(
      scene,
      new Map(),
      { x: 0, y: 0, width: scene.width, height: scene.height },
      THUMB_WIDTH / scene.width,
    );
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    cache.set(id, dataUrl);
    return dataUrl;
  });
}
