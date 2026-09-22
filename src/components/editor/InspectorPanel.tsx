import { useMemo } from 'react';
import AddElementBar from './AddElementBar';
import { useEditorStore } from '../../store/editorStore';
import { swatches, fontWeights, fontWeightLabels, palette, type FontWeight } from '../../theme';
import { slideCountOf, textsCrossingCut } from '../../lib/scene';
import { getFormat } from '../../lib/formats';
import type { CellMask, SceneElement, TextAlign } from '../../types/scene';

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="swatches">
        {swatches.map((swatch) => (
          <button
            key={swatch.key}
            type="button"
            className="swatch"
            style={{ background: swatch.value }}
            aria-pressed={value === swatch.value}
            aria-label={swatch.label}
            title={swatch.label}
            onClick={() => onChange(swatch.value)}
          />
        ))}
      </div>
    </div>
  );
}

interface InspectorPanelProps {
  /** Au doigt, la barre d'outils est réduite : les ajouts vivent ici. */
  showAddElements?: boolean;
}

export default function InspectorPanel({ showAddElements }: InspectorPanelProps) {
  const project = useEditorStore((state) => state.project);
  const scene = useEditorStore((state) => state.scene);
  const selectedId = useEditorStore((state) => state.selectedId);
  const updateElement = useEditorStore((state) => state.updateElement);
  const removeElement = useEditorStore((state) => state.removeElement);
  const setBackground = useEditorStore((state) => state.setBackground);
  const setFbVariant = useEditorStore((state) => state.setFbVariant);
  const addSlide = useEditorStore((state) => state.addSlide);
  const removeSlideAction = useEditorStore((state) => state.removeSlide);

  const selected = useMemo(
    () => scene?.elements.find((element) => element.id === selectedId) ?? null,
    [scene, selectedId],
  );
  const warnings = useMemo(() => (scene ? textsCrossingCut(scene) : []), [scene]);

  if (!scene || !project) return <aside className="editor__panel editor__panel--right" />;

  const spec = getFormat(project.format);
  const slides = slideCountOf(scene);
  const patch = (value: Partial<SceneElement>) => selected && updateElement(selected.id, value);

  return (
    <aside className="editor__panel editor__panel--right">
      <h2 className="panel-title">Composition</h2>

      {showAddElements ? (
        <div className="field">
          <label>Ajouter</label>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <AddElementBar />
          </div>
        </div>
      ) : null}

      {spec.isCarousel ? (
        <div className="field">
          <label>Slides — {slides}</label>
          <div className="row">
            <button
              type="button"
              className="btn btn--sm"
              onClick={removeSlideAction}
              disabled={slides <= spec.minSlides}
            >
              − Retirer
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={addSlide}
              disabled={slides >= spec.maxSlides}
            >
              + Ajouter
            </button>
          </div>
          <span className="hint">Scène : {scene.width} × {scene.height} px</span>
        </div>
      ) : null}

      <div className="field">
        <label>Fond</label>
        <div className="row" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn--sm"
            aria-pressed={scene.background.type === 'solid'}
            onClick={() => setBackground({ type: 'solid', color: palette.vertFonce })}
          >
            Uni
          </button>
          <button
            type="button"
            className="btn btn--sm"
            aria-pressed={scene.background.type === 'gradient'}
            onClick={() =>
              setBackground({ type: 'gradient', from: palette.vertFonce, to: palette.noir, angle: 90 })
            }
          >
            Dégradé
          </button>
        </div>
        {scene.background.type === 'solid' ? (
          <ColorRow
            label="Couleur"
            value={scene.background.color}
            onChange={(color) => setBackground({ type: 'solid', color })}
          />
        ) : (
          <>
            <ColorRow
              label="Début"
              value={scene.background.from}
              onChange={(from) =>
                scene.background.type === 'gradient' && setBackground({ ...scene.background, from })
              }
            />
            <ColorRow
              label="Fin"
              value={scene.background.to}
              onChange={(to) =>
                scene.background.type === 'gradient' && setBackground({ ...scene.background, to })
              }
            />
          </>
        )}
      </div>

      <div className="field">
        <label>Variante Facebook</label>
        <select
          className="select"
          value={project.fbVariant}
          onChange={(event) => setFbVariant(event.target.value as 'panorama' | 'collage')}
        >
          <option value="panorama">Panorama unique</option>
          <option value="collage">Collage résumé</option>
        </select>
        <span className="hint">
          Une Page Facebook affiche un post multi-photos en mosaïque : le seamless est perdu, on
          publie donc un visuel unique.
        </span>
      </div>

      {warnings.length ? (
        <div className="warning-list">
          {warnings.length} zone{warnings.length > 1 ? 's' : ''} de texte chevauche
          {warnings.length > 1 ? 'nt' : ''} une ligne de découpe : le texte sera coupé entre deux
          slides.
        </div>
      ) : null}

      <div className="divider" />

      <h2 className="panel-title">Sélection</h2>

      {!selected ? (
        <p className="hint">Cliquez sur un élément de la composition pour le modifier.</p>
      ) : null}

      {selected?.type === 'photoCell' ? (
        <>
          <div className="field">
            <label>Forme de la cellule</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--sm"
                aria-pressed={(selected.mask?.type ?? 'rect') === 'rect'}
                onClick={() =>
                  patch({ mask: { type: 'rect', radius: selected.radius ?? 0 } } as Partial<SceneElement>)
                }
              >
                Rectangle
              </button>
              <button
                type="button"
                className="btn btn--sm"
                aria-pressed={selected.mask?.type === 'ellipse'}
                onClick={() => patch({ mask: { type: 'ellipse' } as CellMask } as Partial<SceneElement>)}
              >
                Ovale
              </button>
            </div>
            {selected.mask?.type === 'polygon' ? (
              <span className="hint">
                Découpe sur mesure du template : elle partage son arête avec la cellule voisine,
                les deux photos se raccordent donc exactement.
              </span>
            ) : null}
          </div>

          <div className="field">
            <label>Cadre — {selected.strokeWidth ?? 0} px</label>
            <input
              type="range"
              min={0}
              max={40}
              value={selected.strokeWidth ?? 0}
              onChange={(event) =>
                patch({
                  strokeWidth: Number(event.target.value),
                  stroke: selected.stroke ?? palette.blanc,
                })
              }
            />
            {selected.strokeWidth ? (
              <div className="swatches" style={{ marginTop: 6 }}>
                {swatches.map((swatch) => (
                  <button
                    key={swatch.key}
                    type="button"
                    className="swatch"
                    style={{ background: swatch.value }}
                    aria-pressed={selected.stroke === swatch.value}
                    aria-label={swatch.label}
                    onClick={() => patch({ stroke: swatch.value })}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="field">
            <label>Recadrage</label>
            <span className="hint">
              Le cadre est fixe. Faites glisser la photo pour la déplacer dedans, et pincez à deux
              doigts — ou utilisez la molette — pour zoomer.
            </span>
          </div>

          {(selected.mask?.type ?? 'rect') === 'rect' ? (
            <div className="field">
              <label>Arrondi des coins — {Math.round(selected.radius ?? 0)} px</label>
              <input
                type="range"
                min={0}
                max={160}
                value={selected.radius ?? 0}
                onChange={(event) =>
                  patch({
                    radius: Number(event.target.value),
                    mask: { type: 'rect', radius: Number(event.target.value) },
                  } as Partial<SceneElement>)
                }
              />
            </div>
          ) : null}
          <div className="field">
            <label>Zoom photo — {(selected.crop.scale ?? 1).toFixed(2)}×</label>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={selected.crop.scale ?? 1}
              onChange={(event) =>
                patch({ crop: { ...selected.crop, scale: Number(event.target.value) } } as Partial<SceneElement>)
              }
            />
          </div>
          {selected.assetId ? (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() =>
                patch({ assetId: undefined, crop: { offsetX: 0, offsetY: 0, scale: 1 } } as Partial<SceneElement>)
              }
            >
              Retirer la photo
            </button>
          ) : null}
        </>
      ) : null}

      {selected?.type === 'text' ? (
        <>
          <div className="field">
            <label htmlFor="text-content">Texte</label>
            <textarea
              id="text-content"
              className="textarea"
              value={selected.text}
              onChange={(event) => patch({ text: event.target.value })}
            />
          </div>
          <div className="field">
            <label>Taille — {selected.size} px</label>
            <input
              type="range"
              min={18}
              max={220}
              value={selected.size}
              onChange={(event) => patch({ size: Number(event.target.value) })}
            />
          </div>
          <div className="field">
            <label>Graisse</label>
            <div className="row">
              {fontWeights.map((weight) => (
                <button
                  key={weight}
                  type="button"
                  className="btn btn--sm"
                  aria-pressed={selected.weight === weight}
                  onClick={() => patch({ weight })}
                >
                  {fontWeightLabels[weight as FontWeight]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Alignement</label>
            <div className="row">
              {(['left', 'center', 'right'] as TextAlign[]).map((align) => (
                <button
                  key={align}
                  type="button"
                  className="btn btn--sm"
                  aria-pressed={selected.align === align}
                  onClick={() => patch({ align })}
                >
                  {align === 'left' ? 'Gauche' : align === 'center' ? 'Centre' : 'Droite'}
                </button>
              ))}
            </div>
          </div>
          <ColorRow label="Couleur" value={selected.color} onChange={(color) => patch({ color })} />
        </>
      ) : null}

      {selected?.type === 'shape' ? (
        <>
          <ColorRow
            label="Couleur"
            value={selected.fill}
            onChange={(fill) =>
              patch(selected.shape === 'line' ? { stroke: fill, fill } : { fill })
            }
          />
          {selected.shape === 'rect' ? (
            <div className="field">
              <label>Arrondi — {Math.round(selected.radius ?? 0)} px</label>
              <input
                type="range"
                min={0}
                max={200}
                value={selected.radius ?? 0}
                onChange={(event) => patch({ radius: Number(event.target.value) })}
              />
            </div>
          ) : null}
          {selected.shape === 'line' ? (
            <div className="field">
              <label>Épaisseur — {selected.strokeWidth ?? 8} px</label>
              <input
                type="range"
                min={2}
                max={60}
                value={selected.strokeWidth ?? 8}
                onChange={(event) => patch({ strokeWidth: Number(event.target.value) })}
              />
            </div>
          ) : null}
          <div className="field">
            <label>Opacité — {Math.round((selected.opacity ?? 1) * 100)} %</label>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={selected.opacity ?? 1}
              onChange={(event) => patch({ opacity: Number(event.target.value) })}
            />
          </div>
        </>
      ) : null}

      {selected ? (
        <button
          type="button"
          className="btn btn--sm btn--danger"
          style={{ marginTop: 10 }}
          onClick={() => removeElement(selected.id)}
        >
          Supprimer l'élément
        </button>
      ) : null}
    </aside>
  );
}
