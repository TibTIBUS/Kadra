/**
 * Partage natif des images.
 *
 * Aucune API web ne permet d'écrire directement dans la pellicule d'un iPhone.
 * Le seul chemin est la feuille de partage du système, qui propose
 * « Enregistrer l'image » : l'image part alors dans Photos, pas dans Fichiers.
 * C'est la voie qu'utilisent toutes les applications web qui savent faire ça.
 */

export const SHARE_FILENAME_PREFIX = 'kadra';

export function blobsToFiles(blobs: Blob[], names: string[]): File[] {
  return blobs.map(
    (blob, index) =>
      new File([blob], names[index] ?? `${SHARE_FILENAME_PREFIX}-${index + 1}.jpg`, {
        type: blob.type || 'image/jpeg',
        lastModified: Date.now(),
      }),
  );
}

/** Le navigateur sait-il partager ces fichiers ? Faux sur tous les navigateurs de bureau. */
export function canShareFiles(files: File[]): boolean {
  if (!files.length) return false;
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed';

/**
 * Ouvre la feuille de partage. À appeler directement dans le gestionnaire de
 * clic : iOS refuse un partage déclenché après une opération asynchrone, d'où
 * le rendu des images en amont.
 */
export async function shareFiles(files: File[], title: string): Promise<ShareOutcome> {
  if (!canShareFiles(files)) return 'unsupported';
  try {
    await navigator.share({ files, title });
    return 'shared';
  } catch (error) {
    // L'utilisateur qui ferme la feuille produit une AbortError : ce n'est pas un échec.
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}
