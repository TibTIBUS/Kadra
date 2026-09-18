import { useEditorStore } from '../../store/editorStore';
import { createShape, createText, slideIndexOf } from '../../lib/scene';
import { palette, SAFE_MARGIN } from '../../theme';

/**
 * Boutons d'ajout d'éléments. Dans la barre d'outils sur grand écran,
 * dans la feuille « Composition » au doigt.
 */
export default function AddElementBar() {
  const scene = useEditorStore((state) => state.scene);
  const selectedId = useEditorStore((state) => state.selectedId);
  const addElement = useEditorStore((state) => state.addElement);

  if (!scene) return null;

  // Les nouveaux éléments arrivent sur la slide de l'élément sélectionné.
  const focus = selectedId ? scene.elements.find((element) => element.id === selectedId) : undefined;
  const origin = (focus ? slideIndexOf(scene, focus.x) : 0) * scene.slideWidth;

  return (
    <>
      <button
        type="button"
        className="btn btn--sm"
        onClick={() =>
          addElement(
            createText({
              x: origin + SAFE_MARGIN,
              y: scene.height / 2 - 60,
              w: scene.slideWidth - SAFE_MARGIN * 2,
            }),
          )
        }
      >
        + Texte
      </button>
      <button
        type="button"
        className="btn btn--sm"
        onClick={() =>
          addElement(
            createShape({
              x: origin + SAFE_MARGIN,
              y: SAFE_MARGIN,
              w: 320,
              h: 200,
              fill: palette.orange,
              radius: 16,
            }),
          )
        }
      >
        + Rectangle
      </button>
      <button
        type="button"
        className="btn btn--sm"
        onClick={() =>
          addElement(
            createShape({
              shape: 'circle',
              x: origin + scene.slideWidth / 2,
              y: scene.height / 2,
              r: 120,
              fill: palette.menthe,
            }),
          )
        }
      >
        + Cercle
      </button>
      <button
        type="button"
        className="btn btn--sm"
        onClick={() =>
          addElement(
            createShape({
              shape: 'line',
              x: origin + SAFE_MARGIN,
              y: scene.height / 2,
              points: [0, 0, scene.slideWidth - SAFE_MARGIN * 2, 0],
              stroke: palette.menthe,
              strokeWidth: 10,
            }),
          )
        }
      >
        + Ligne
      </button>
    </>
  );
}
