import type { ProjectFormat } from '../types/scene';

export interface FormatSpec {
  id: ProjectFormat;
  label: string;
  description: string;
  slideWidth: number;
  slideHeight: number;
  minSlides: number;
  maxSlides: number;
  isCarousel: boolean;
}

export const FORMATS: Record<ProjectFormat, FormatSpec> = {
  collage_portrait: {
    id: 'collage_portrait',
    label: 'Collage portrait',
    description: '1080 × 1350 — une image',
    slideWidth: 1080,
    slideHeight: 1350,
    minSlides: 1,
    maxSlides: 1,
    isCarousel: false,
  },
  collage_square: {
    id: 'collage_square',
    label: 'Collage carré',
    description: '1080 × 1080 — une image',
    slideWidth: 1080,
    slideHeight: 1080,
    minSlides: 1,
    maxSlides: 1,
    isCarousel: false,
  },
  carousel_portrait: {
    id: 'carousel_portrait',
    label: 'Carrousel seamless portrait',
    description: '1080 × 1350 par slide — 2 à 10 slides',
    slideWidth: 1080,
    slideHeight: 1350,
    minSlides: 2,
    maxSlides: 10,
    isCarousel: true,
  },
  carousel_square: {
    id: 'carousel_square',
    label: 'Carrousel seamless carré',
    description: '1080 × 1080 par slide — 2 à 10 slides',
    slideWidth: 1080,
    slideHeight: 1080,
    minSlides: 2,
    maxSlides: 10,
    isCarousel: true,
  },
};

export const FORMAT_LIST = Object.values(FORMATS);

export const getFormat = (format: ProjectFormat): FormatSpec => FORMATS[format];

export const clampSlideCount = (format: ProjectFormat, count: number): number => {
  const spec = FORMATS[format];
  return Math.min(spec.maxSlides, Math.max(spec.minSlides, Math.round(count)));
};

/** Variante Facebook : un seul visuel 1080 × 1350 (collage) ou 1080 de large (panorama). */
export const FB_WIDTH = 1080;
export const FB_COLLAGE_HEIGHT = 1350;
