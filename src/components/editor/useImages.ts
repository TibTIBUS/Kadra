import { useEffect, useState } from 'react';

/** Charge les aperçus des photos en HTMLImageElement pour le rendu Konva. */
export function useImages(assetUrls: Record<string, string>): Map<string, HTMLImageElement> {
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(assetUrls);

    void Promise.all(
      entries.map(
        ([id, url]) =>
          new Promise<[string, HTMLImageElement] | null>((resolve) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve([id, image]);
            image.onerror = () => resolve(null);
            image.src = url;
          }),
      ),
    ).then((loaded) => {
      if (cancelled) return;
      setImages(new Map(loaded.filter((entry): entry is [string, HTMLImageElement] => entry !== null)));
    });

    return () => {
      cancelled = true;
    };
  }, [assetUrls]);

  return images;
}
