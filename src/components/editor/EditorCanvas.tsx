import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Shape,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import { useEditorStore } from '../../store/editorStore';
import { useImages } from './useImages';
import { computePlacement, clampOffsets, toCellLocal, zoomCropAround } from '../../lib/photo';
import { slideCountOf } from '../../lib/scene';
import { profileGridCrop } from '../../lib/preview';
import { shadowProps, traceCellPath, type PathSink } from '../../lib/mask';
import { palette, SAFE_MARGIN } from '../../theme';
import type { PhotoCellElement, Scene, SceneElement } from '../../types/scene';

export const ASSET_DRAG_TYPE = 'application/x-kadra-asset';

interface Props {
  zoom: number;
  onDropAsset: (assetId: string, cellId: string) => void;
}

/** Cellule sous un point de la scène, rotation et ordre d'empilement compris. */
const hitTestCell = (scene: Scene, x: number, y: number): PhotoCellElement | undefined => {
  const cells = scene.elements.filter((el): el is PhotoCellElement => el.type === 'photoCell');
  return [...cells].reverse().find((cell) => {
    const local = toCellLocal(cell, { x, y });
    return local.x >= 0 && local.x <= cell.w && local.y >= 0 && local.y <= cell.h;
  });
};

function BackgroundRect({ scene }: { scene: Scene }) {
  if (scene.background.type === 'solid') {
    return <Rect x={0} y={0} width={scene.width} height={scene.height} fill={scene.background.color} listening={false} />;
  }
  const radians = (scene.background.angle * Math.PI) / 180;
  return (
    <Rect
      x={0}
      y={0}
      width={scene.width}
      height={scene.height}
      listening={false}
      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{
        x: Math.cos(radians) * scene.width,
        y: Math.sin(radians) * scene.height,
      }}
      fillLinearGradientColorStops={[0, scene.background.from, 1, scene.background.to]}
    />
  );
}

export default function EditorCanvas({ zoom, onDropAsset }: Props) {
  const scene = useEditorStore((state) => state.scene);
  const assetUrls = useEditorStore((state) => state.assetUrls);
  const selectedId = useEditorStore((state) => state.selectedId);
  const select = useEditorStore((state) => state.select);
  const updateElement = useEditorStore((state) => state.updateElement);
  const commitHistory = useEditorStore((state) => state.commitHistory);
  const pendingAssetId = useEditorStore((state) => state.pendingAssetId);
  const placePendingAsset = useEditorStore((state) => state.placePendingAsset);

  const images = useImages(assetUrls);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodesRef = useRef<Map<string, Konva.Node>>(new Map());
  const [viewport, setViewport] = useState({ width: 900, height: 700 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({ width: entry.contentRect.width - 48, height: entry.contentRect.height - 48 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(() => {
    if (!scene) return 1;
    const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
    return Math.max(0.02, fit * zoom);
  }, [scene, viewport, zoom]);

  // Le cadre d'une cellule photo est verrouillé : pas de poignées, donc pas de
  // déplacement ni de redimensionnement accidentel. Textes et formes gardent
  // les leurs.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const selected = scene?.elements.find((el) => el.id === selectedId);
    const node = selectedId && selected?.type !== 'photoCell' ? nodesRef.current.get(selectedId) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, scene]);

  const registerNode = useCallback((id: string, node: Konva.Node | null) => {
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  }, []);

  const scenePointer = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage) return null;
      const box = stage.container().getBoundingClientRect();
      return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale };
    },
    [scale],
  );

  /**
   * Zoome la photo d'une cellule autour d'un point de la scène. Le cadre n'est
   * jamais touché : seul le recadrage change.
   */
  const zoomCellAt = useCallback(
    (cell: PhotoCellElement, factor: number, scenePoint: { x: number; y: number }) => {
      if (!cell.assetId) return;
      const image = images.get(cell.assetId);
      if (!image) return;

      const anchor = toCellLocal(cell, scenePoint);
      const crop = zoomCropAround(cell, image.naturalWidth, image.naturalHeight, factor, anchor);
      updateElement(cell.id, { crop } as Partial<SceneElement>, { history: false });
    },
    [images, updateElement],
  );

  const cellAt = useCallback(
    (clientX: number, clientY: number): { cell: PhotoCellElement; point: { x: number; y: number } } | null => {
      if (!scene) return null;
      const point = scenePointer(clientX, clientY);
      if (!point) return null;
      const cell = hitTestCell(scene, point.x, point.y);
      return cell ? { cell, point } : null;
    },
    [scene, scenePointer],
  );

  const handleWheel = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>) => {
      const hit = cellAt(event.evt.clientX, event.evt.clientY);
      if (!hit) return;
      event.evt.preventDefault();
      select(hit.cell.id);
      zoomCellAt(hit.cell, event.evt.deltaY > 0 ? 0.94 : 1.06, hit.point);
    },
    [cellAt, select, zoomCellAt],
  );

  const pinchDistance = useRef(0);
  const pinchCellId = useRef<string | null>(null);

  /** Interrompt le glissement de photo amorcé par le premier doigt. */
  const stopDrags = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (stage.isDragging()) stage.stopDrag();
    stage.find('Image').forEach((node) => {
      if (node.isDragging()) node.stopDrag();
    });
  }, []);

  /**
   * Pincement à deux doigts, branché directement sur le DOM. Konva cesse
   * d'émettre ses propres événements tactiles dès qu'un glissement est en
   * cours : passer par lui ne donnerait qu'un seul événement, puis plus rien.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      // Le premier doigt a pu amorcer un glissement de la photo : on
      // l'interrompt, sinon l'image saute quand le second doigt se pose.
      stopDrags();
      pinchDistance.current = 0;
      pinchCellId.current = null;
    };

    const onMove = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const [first, second] = [event.touches[0], event.touches[1]];
      if (!first || !second || !scene) return;
      event.preventDefault();
      stopDrags();

      const midX = (first.clientX + second.clientX) / 2;
      const midY = (first.clientY + second.clientY) / 2;
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      const point = scenePointer(midX, midY);
      if (!point) return;

      // Le pincement reste attaché à la cellule où il a commencé, même si les
      // doigts glissent au-delà de ses bords.
      const pinned = pinchCellId.current
        ? scene.elements.find(
            (el): el is PhotoCellElement => el.id === pinchCellId.current && el.type === 'photoCell',
          )
        : undefined;
      const cell = pinned ?? hitTestCell(scene, point.x, point.y);
      if (!cell) {
        pinchDistance.current = distance;
        return;
      }

      if (!pinchCellId.current) {
        pinchCellId.current = cell.id;
        select(cell.id);
      }
      if (pinchDistance.current) zoomCellAt(cell, distance / pinchDistance.current, point);
      pinchDistance.current = distance;
    };

    const onEnd = () => {
      if (!pinchDistance.current && !pinchCellId.current) return;
      pinchDistance.current = 0;
      pinchCellId.current = null;
      commitHistory();
    };

    container.addEventListener('touchstart', onStart, { passive: false });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onEnd);
    container.addEventListener('touchcancel', onEnd);
    return () => {
      container.removeEventListener('touchstart', onStart);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onEnd);
      container.removeEventListener('touchcancel', onEnd);
    };
  }, [scene, scenePointer, select, zoomCellAt, stopDrags, commitHistory]);

  if (!scene) return <div className="editor__stage" ref={containerRef} />;

  const slides = slideCountOf(scene);
  const gridCrop = profileGridCrop(scene);

  return (
    <div
      className="editor__stage"
      ref={containerRef}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) event.preventDefault();
      }}
      onDrop={(event) => {
        const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE);
        if (!assetId) return;
        event.preventDefault();
        const point = scenePointer(event.clientX, event.clientY);
        if (!point) return;
        const cell = hitTestCell(scene, point.x, point.y);
        if (cell) onDropAsset(assetId, cell.id);
      }}
    >
      {pendingAssetId ? (
        <div className="stage-hint" role="status">
          Touchez une cellule pour y placer la photo
        </div>
      ) : null}

      <Stage
        ref={stageRef}
        width={scene.width * scale}
        height={scene.height * scale}
        scaleX={scale}
        scaleY={scale}
        onWheel={handleWheel}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) select(null);
        }}
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        <Layer>
          <BackgroundRect scene={scene} />

          {scene.elements.map((element) => {
            if (element.type === 'photoCell') {
              const image = element.assetId ? images.get(element.assetId) : undefined;
              const local: PhotoCellElement = { ...element, x: 0, y: 0 };
              const placement = image
                ? computePlacement(local, image.naturalWidth, image.naturalHeight)
                : { x: 0, y: 0, width: element.w, height: element.h };


              return (
                <Fragment key={element.id}>
                <Group
                  ref={(node) => registerNode(element.id, node)}
                  x={element.x + element.w / 2}
                  y={element.y + element.h / 2}
                  offsetX={element.w / 2}
                  offsetY={element.h / 2}
                  rotation={element.rotation ?? 0}
                  draggable={false}
                  onClick={() => {
                    if (!placePendingAsset(element.id)) select(element.id);
                  }}
                  onTap={() => {
                    if (!placePendingAsset(element.id)) select(element.id);
                  }}
                  clipFunc={(ctx) => traceCellPath(ctx as unknown as PathSink, element)}
                >
                  {image ? (
                    <KonvaImage
                      image={image}
                      x={placement.x}
                      y={placement.y}
                      width={placement.width}
                      height={placement.height}
                      draggable
                      onDragMove={(event) => {
                        const base = computePlacement(
                          { ...local, crop: { ...element.crop, offsetX: 0, offsetY: 0 } },
                          image.naturalWidth,
                          image.naturalHeight,
                        );
                        const offsets = clampOffsets(
                          local,
                          image.naturalWidth,
                          image.naturalHeight,
                          event.target.x() - base.x,
                          event.target.y() - base.y,
                        );
                        event.target.x(base.x + offsets.offsetX);
                        event.target.y(base.y + offsets.offsetY);
                        updateElement(
                          element.id,
                          { crop: { ...element.crop, ...offsets } } as Partial<SceneElement>,
                          { history: false },
                        );
                      }}
                      onDragEnd={() => commitHistory()}
                    />
                  ) : (
                    <>
                      <Rect width={element.w} height={element.h} fill="rgba(255,255,255,0.07)" />
                      <Text
                        width={element.w}
                        y={element.h / 2 - 16}
                        align="center"
                        text="Déposez une photo"
                        fontFamily="Poppins"
                        fontSize={Math.max(18, Math.min(32, element.w / 12))}
                        fill="rgba(255,255,255,0.45)"
                        listening={false}
                      />
                    </>
                  )}
                </Group>

                {element.stroke && element.strokeWidth ? (
                  <Shape
                    x={element.x + element.w / 2}
                    y={element.y + element.h / 2}
                    offsetX={element.w / 2}
                    offsetY={element.h / 2}
                    rotation={element.rotation ?? 0}
                    stroke={element.stroke}
                    strokeWidth={element.strokeWidth}
                    listening={false}
                    sceneFunc={(ctx, shape) => {
                      traceCellPath(ctx as unknown as PathSink, element);
                      ctx.strokeShape(shape);
                    }}
                  />
                ) : null}
                </Fragment>
              );
            }

            if (element.type === 'text') {
              return (
                <Text
                  key={element.id}
                  ref={(node) => registerNode(element.id, node)}
                  x={element.x}
                  y={element.y}
                  width={element.w}
                  rotation={element.rotation ?? 0}
                  text={element.text}
                  fontFamily={element.font}
                  fontSize={element.size}
                  fontStyle={String(element.weight)}
                  fill={element.color}
                  align={element.align}
                  lineHeight={element.lineHeight ?? 1.2}
                  letterSpacing={element.letterSpacing ?? 0}
                  wrap="word"
                  {...shadowProps(element.shadow)}
                  draggable
                  onClick={() => {
                    if (!placePendingAsset(element.id)) select(element.id);
                  }}
                  onTap={() => {
                    if (!placePendingAsset(element.id)) select(element.id);
                  }}
                  onDragEnd={(event) =>
                    updateElement(element.id, { x: event.target.x(), y: event.target.y() })
                  }
                  onTransformEnd={(event) => {
                    const node = event.target;
                    updateElement(element.id, {
                      x: node.x(),
                      y: node.y(),
                      w: Math.max(80, element.w * node.scaleX()),
                    });
                    node.scaleX(1);
                    node.scaleY(1);
                  }}
                />
              );
            }

            const commonHandlers = {
              draggable: true,
              onClick: () => select(element.id),
              onTap: () => select(element.id),
              onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) =>
                updateElement(element.id, { x: event.target.x(), y: event.target.y() }),
            };

            if (element.shape === 'circle') {
              return (
                <Circle
                  key={element.id}
                  ref={(node) => registerNode(element.id, node)}
                  x={element.x}
                  y={element.y}
                  radius={element.r ?? 40}
                  fill={element.fill}
                  opacity={element.opacity ?? 1}
                  {...shadowProps(element.shadow)}
                  {...commonHandlers}
                  onTransformEnd={(event) => {
                    const node = event.target;
                    updateElement(element.id, {
                      x: node.x(),
                      y: node.y(),
                      r: Math.max(8, (element.r ?? 40) * node.scaleX()),
                    });
                    node.scaleX(1);
                    node.scaleY(1);
                  }}
                />
              );
            }

            if (element.shape === 'line') {
              return (
                <Line
                  key={element.id}
                  ref={(node) => registerNode(element.id, node)}
                  x={element.x}
                  y={element.y}
                  points={element.points ?? [0, 0, 200, 0]}
                  stroke={element.stroke ?? element.fill ?? palette.menthe}
                  strokeWidth={element.strokeWidth ?? 8}
                  lineCap="round"
                  hitStrokeWidth={Math.max(24, element.strokeWidth ?? 8)}
                  opacity={element.opacity ?? 1}
                  {...commonHandlers}
                />
              );
            }

            return (
              <Rect
                key={element.id}
                ref={(node) => registerNode(element.id, node)}
                x={element.x + (element.w ?? 100) / 2}
                y={element.y + (element.h ?? 100) / 2}
                offsetX={(element.w ?? 100) / 2}
                offsetY={(element.h ?? 100) / 2}
                width={element.w ?? 100}
                height={element.h ?? 100}
                cornerRadius={element.radius ?? 0}
                rotation={element.rotation ?? 0}
                fill={element.fill}
                opacity={element.opacity ?? 1}
                {...(element.gradient
                  ? {
                      fillLinearGradientStartPoint: { x: 0, y: 0 },
                      fillLinearGradientEndPoint: {
                        x: Math.cos((element.gradient.angle * Math.PI) / 180) * (element.w ?? 100),
                        y: Math.sin((element.gradient.angle * Math.PI) / 180) * (element.h ?? 100),
                      },
                      fillLinearGradientColorStops: [0, element.gradient.from, 1, element.gradient.to],
                    }
                  : {})}
                {...shadowProps(element.shadow)}
                {...commonHandlers}
                onDragEnd={(event) =>
                  updateElement(element.id, {
                    x: event.target.x() - (element.w ?? 100) / 2,
                    y: event.target.y() - (element.h ?? 100) / 2,
                  })
                }
                onTransformEnd={(event) => {
                  const node = event.target;
                  const w = Math.max(10, (element.w ?? 100) * node.scaleX());
                  const h = Math.max(10, (element.h ?? 100) * node.scaleY());
                  updateElement(element.id, {
                    x: node.x() - w / 2,
                    y: node.y() - h / 2,
                    w,
                    h,
                    rotation: node.rotation(),
                  });
                  node.scaleX(1);
                  node.scaleY(1);
                }}
              />
            );
          })}
        </Layer>

        {/* Repères d'édition : jamais présents à l'export, qui utilise un rendu dédié. */}
        <Layer listening={false}>
          {Array.from({ length: slides }, (_, index) => (
            <Rect
              key={`safe-${index}`}
              x={index * scene.slideWidth + SAFE_MARGIN}
              y={SAFE_MARGIN}
              width={scene.slideWidth - SAFE_MARGIN * 2}
              height={scene.height - SAFE_MARGIN * 2}
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={2 / scale}
              dash={[10 / scale, 10 / scale]}
            />
          ))}

          <Rect
            x={0}
            y={0}
            width={gridCrop.x}
            height={scene.height}
            fill="rgba(239,138,63,0.18)"
          />
          <Rect
            x={gridCrop.x + gridCrop.width}
            y={0}
            width={scene.slideWidth - gridCrop.x - gridCrop.width}
            height={scene.height}
            fill="rgba(239,138,63,0.18)"
          />

          {Array.from({ length: Math.max(0, slides - 1) }, (_, index) => (
            <Line
              key={`cut-${index}`}
              points={[(index + 1) * scene.slideWidth, 0, (index + 1) * scene.slideWidth, scene.height]}
              stroke={palette.menthe}
              strokeWidth={3 / scale}
              dash={[18 / scale, 14 / scale]}
            />
          ))}
        </Layer>

        <Layer>
          <Transformer
            ref={transformerRef}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
            borderStroke={palette.menthe}
            anchorStroke={palette.menthe}
            anchorFill={palette.blanc}
            anchorSize={10 / scale}
            borderStrokeWidth={2 / scale}
            ignoreStroke
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>
    </div>
  );
}
