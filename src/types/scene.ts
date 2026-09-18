export type ProjectFormat =
  | 'collage_portrait'
  | 'collage_square'
  | 'carousel_portrait'
  | 'carousel_square';

export type FbVariant = 'panorama' | 'collage';

export interface SolidBackground {
  type: 'solid';
  color: string;
}

export interface GradientBackground {
  type: 'gradient';
  from: string;
  to: string;
  /** Angle en degrés, 0 = gauche → droite, 90 = haut → bas. */
  angle: number;
}

export type Background = SolidBackground | GradientBackground;

export interface Crop {
  /** Décalage en px de scène, appliqué après le cadrage « cover ». */
  offsetX: number;
  offsetY: number;
  /** Facteur de zoom, 1 = cadrage « cover » exact. */
  scale: number;
}

export interface PhotoCellElement {
  id: string;
  type: 'photoCell';
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  assetId?: string;
  crop: Crop;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextElement {
  id: string;
  type: 'text';
  x: number;
  y: number;
  w: number;
  text: string;
  font: string;
  weight: number;
  size: number;
  color: string;
  align: TextAlign;
  lineHeight?: number;
  letterSpacing?: number;
}

export type ShapeKind = 'rect' | 'circle' | 'line';

export interface ShapeElement {
  id: string;
  type: 'shape';
  shape: ShapeKind;
  x: number;
  y: number;
  /** rect : largeur / hauteur. */
  w?: number;
  h?: number;
  /** circle : rayon. */
  r?: number;
  /** line : points relatifs à x / y. */
  points?: number[];
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export type SceneElement = PhotoCellElement | TextElement | ShapeElement;

export interface Scene {
  width: number;
  height: number;
  slideWidth: number;
  background: Background;
  elements: SceneElement[];
}

export const isPhotoCell = (el: SceneElement): el is PhotoCellElement => el.type === 'photoCell';
export const isText = (el: SceneElement): el is TextElement => el.type === 'text';
export const isShape = (el: SceneElement): el is ShapeElement => el.type === 'shape';
