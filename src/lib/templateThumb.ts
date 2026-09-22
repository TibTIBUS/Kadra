import type { Scene } from '../types/scene';
import { renderSceneCanvas } from './export';

const cache = new Map<string, string>();

/**
 * Miniature d'un template, rendue au premier affichage puis mise en cache
 * pour la durée de la session.
 */
export async function renderTemplateThumbnail(id: string, scene: Scene): Promise<string> {
  const cached = cache.get(id);
  if (cached) return cached;

  // Une miniature n'a pas besoin de la pleine résolution : un carrousel de dix
  // slides ferait sinon 10 800 px de large, pour un affichage de 360 px.
  const source = await renderSceneCanvas(scene, new Map(), 0.25);
  const canvas = document.createElement('canvas');
  const width = 360;
  canvas.width = width;
  canvas.height = Math.round((source.height / source.width) * width);
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
  cache.set(id, dataUrl);
  return dataUrl;
}
