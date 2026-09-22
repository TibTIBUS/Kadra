import Konva from 'konva';
import type { Background, Scene } from '../types/scene';
import { computePlacement } from './photo';
import { shadowProps, traceCellPath, type PathSink } from './mask';

export type ImageMap = Map<string, HTMLImageElement>;

function applyBackground(layer: Konva.Layer, scene: Scene, background: Background) {
  const rect = new Konva.Rect({ x: 0, y: 0, width: scene.width, height: scene.height });
  if (background.type === 'solid') {
    rect.fill(background.color);
  } else {
    const radians = (background.angle * Math.PI) / 180;
    const dx = Math.cos(radians) * scene.width;
    const dy = Math.sin(radians) * scene.height;
    rect.fillLinearGradientStartPoint({ x: 0, y: 0 });
    rect.fillLinearGradientEndPoint({ x: dx, y: dy });
    rect.fillLinearGradientColorStops([0, background.from, 1, background.to]);
  }
  layer.add(rect);
}

/** Construit les nœuds Konva d'une scène dans une couche, sans repères d'édition. */
export function drawScene(layer: Konva.Layer, scene: Scene, images: ImageMap): void {
  applyBackground(layer, scene, scene.background);

  for (const element of scene.elements) {
    if (element.type === 'photoCell') {
      // Le groupe est positionné par son centre pour que la rotation tourne
      // autour du centre de la cellule, et non de son coin.
      const group = new Konva.Group({
        x: element.x + element.w / 2,
        y: element.y + element.h / 2,
        offsetX: element.w / 2,
        offsetY: element.h / 2,
        rotation: element.rotation ?? 0,
        clipFunc: (ctx) => traceCellPath(ctx as unknown as PathSink, element),
      });

      const image = element.assetId ? images.get(element.assetId) : undefined;
      if (image) {
        const local = { ...element, x: 0, y: 0 };
        const placement = computePlacement(local, image.naturalWidth, image.naturalHeight);
        group.add(new Konva.Image({ image, ...placement }));
      } else {
        group.add(
          new Konva.Rect({
            width: element.w,
            height: element.h,
            fill: 'rgba(255,255,255,0.08)',
          }),
        );
      }
      layer.add(group);

      // Le contour est dessiné hors du groupe découpé, sinon la moitié
      // extérieure du trait serait rognée.
      if (element.stroke && element.strokeWidth) {
        const outline = new Konva.Shape({
          x: element.x + element.w / 2,
          y: element.y + element.h / 2,
          offsetX: element.w / 2,
          offsetY: element.h / 2,
          rotation: element.rotation ?? 0,
          stroke: element.stroke,
          strokeWidth: element.strokeWidth,
          listening: false,
          sceneFunc: (ctx, shape) => {
            traceCellPath(ctx as unknown as PathSink, element);
            ctx.strokeShape(shape);
          },
        });
        layer.add(outline);
      }
      continue;
    }

    if (element.type === 'text') {
      layer.add(
        new Konva.Text({
          x: element.x,
          y: element.y,
          width: element.w,
          rotation: element.rotation ?? 0,
          text: element.text,
          fontFamily: element.font,
          fontSize: element.size,
          fontStyle: String(element.weight),
          fill: element.color,
          align: element.align,
          lineHeight: element.lineHeight ?? 1.2,
          letterSpacing: element.letterSpacing ?? 0,
          wrap: 'word',
          ...shadowProps(element.shadow),
        }),
      );
      continue;
    }

    const common = {
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth ?? 0,
      opacity: element.opacity ?? 1,
      rotation: element.rotation ?? 0,
      ...shadowProps(element.shadow),
    };

    if (element.shape === 'circle') {
      layer.add(new Konva.Circle({ x: element.x, y: element.y, radius: element.r ?? 40, ...common }));
    } else if (element.shape === 'line') {
      layer.add(
        new Konva.Line({
          x: element.x,
          y: element.y,
          points: element.points ?? [0, 0, 100, 0],
          stroke: element.stroke ?? element.fill,
          strokeWidth: element.strokeWidth ?? 8,
          lineCap: 'round',
          opacity: element.opacity ?? 1,
          rotation: element.rotation ?? 0,
          ...shadowProps(element.shadow),
        }),
      );
    } else {
      const width = element.w ?? 100;
      const height = element.h ?? 100;
      // Comme les cellules photo, un rectangle tourne autour de son centre :
      // deux éléments superposés restent alignés quand on les fait pivoter.
      const rect = new Konva.Rect({
        x: element.x + width / 2,
        y: element.y + height / 2,
        offsetX: width / 2,
        offsetY: height / 2,
        width,
        height,
        cornerRadius: element.radius ?? 0,
        ...common,
      });
      if (element.gradient) {
        const radians = (element.gradient.angle * Math.PI) / 180;
        rect.fillLinearGradientStartPoint({ x: 0, y: 0 });
        rect.fillLinearGradientEndPoint({
          x: Math.cos(radians) * (element.w ?? 100),
          y: Math.sin(radians) * (element.h ?? 100),
        });
        rect.fillLinearGradientColorStops([0, element.gradient.from, 1, element.gradient.to]);
      }
      layer.add(rect);
    }
  }
}

/** Crée une scène Konva hors écran, à la résolution exacte de la scène. */
export function createOffscreenStage(scene: Scene): { stage: Konva.Stage; dispose: () => void } {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  document.body.appendChild(container);

  const stage = new Konva.Stage({ container, width: scene.width, height: scene.height });
  return {
    stage,
    dispose: () => {
      stage.destroy();
      container.remove();
    },
  };
}

/** S'assure que Poppins est chargée avant tout rendu texte sur canvas. */
export async function ensureFontsReady(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load('400 72px Poppins'),
    document.fonts.load('600 72px Poppins'),
    document.fonts.load('800 72px Poppins'),
  ]).catch(() => undefined);
  await document.fonts.ready;
}
