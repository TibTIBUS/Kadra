/**
 * Style KADRA (V1). Point unique de vérité pour les couleurs et polices.
 * En V2, les kits de marque multi-clients remplaceront ce module.
 */

export const palette = {
  vertFonce: '#0f3d2e',
  menthe: '#7ed6ad',
  orange: '#ef8a3f',
  blanc: '#ffffff',
  noir: '#111111',
} as const;

export type PaletteKey = keyof typeof palette;

/** Couleurs proposées dans les sélecteurs de l'éditeur, dans l'ordre d'affichage. */
export const swatches: { key: PaletteKey; label: string; value: string }[] = [
  { key: 'vertFonce', label: 'Vert foncé', value: palette.vertFonce },
  { key: 'menthe', label: 'Menthe', value: palette.menthe },
  { key: 'orange', label: 'Orange', value: palette.orange },
  { key: 'blanc', label: 'Blanc', value: palette.blanc },
  { key: 'noir', label: 'Noir', value: palette.noir },
];

export const fontFamily = 'Poppins';
export const fontWeights = [400, 600, 800] as const;
export type FontWeight = (typeof fontWeights)[number];

export const fontWeightLabels: Record<FontWeight, string> = {
  400: 'Regular',
  600: 'Semi-bold',
  800: 'Extra-bold',
};

/** Marge de sécurité appliquée sur chaque slide (px de scène). */
export const SAFE_MARGIN = 60;

/** Proportion du recadrage appliqué par Instagram dans la grille du profil. */
export const PROFILE_GRID_RATIO = 3 / 4;
