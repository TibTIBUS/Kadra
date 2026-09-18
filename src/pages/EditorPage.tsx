import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import EditorCanvas from '../components/editor/EditorCanvas';
import PhotoPanel from '../components/editor/PhotoPanel';
import InspectorPanel from '../components/editor/InspectorPanel';
import PreviewModal from '../components/editor/PreviewModal';
import ExportDialog from '../components/editor/ExportDialog';
import { useToast } from '../components/ui/Toast';
import { useEditorStore } from '../store/editorStore';
import { createShape, createText, DEFAULT_CROP, slideIndexOf } from '../lib/scene';
import { palette, SAFE_MARGIN } from '../theme';
import { exportProjectArchive, PROJECT_FILE_EXTENSION } from '../lib/backup';
import { downloadBlob, slugify } from '../lib/export';
import type { SceneElement } from '../types/scene';

const saveLabel = {
  idle: 'À jour',
  dirty: 'Modifications en cours…',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
} as const;

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const project = useEditorStore((state) => state.project);
  const scene = useEditorStore((state) => state.scene);
  const assets = useEditorStore((state) => state.assets);
  const loading = useEditorStore((state) => state.loading);
  const saveState = useEditorStore((state) => state.saveState);
  const past = useEditorStore((state) => state.past);
  const future = useEditorStore((state) => state.future);
  const loadProject = useEditorStore((state) => state.loadProject);
  const closeProject = useEditorStore((state) => state.closeProject);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const save = useEditorStore((state) => state.save);
  const addElement = useEditorStore((state) => state.addElement);
  const updateElement = useEditorStore((state) => state.updateElement);
  const selectedId = useEditorStore((state) => state.selectedId);
  const removeElement = useEditorStore((state) => state.removeElement);

  const [cropMode, setCropMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (projectId) void loadProject(projectId);
    return () => closeProject();
  }, [projectId, loadProject, closeProject]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        removeElement(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, save, selectedId, removeElement]);

  const currentSlideOrigin = useCallback(() => {
    if (!scene) return 0;
    const focus = selectedId ? scene.elements.find((element) => element.id === selectedId) : undefined;
    const index = focus ? slideIndexOf(scene, 'x' in focus ? focus.x : 0) : 0;
    return index * scene.slideWidth;
  }, [scene, selectedId]);

  const handleDropAsset = useCallback(
    (assetId: string, cellId: string) => {
      updateElement(cellId, { assetId, crop: { ...DEFAULT_CROP } } as Partial<SceneElement>);
    },
    [updateElement],
  );

  if (loading || !project || !scene) {
    return (
      <div className="row" style={{ justifyContent: 'center', padding: 80 }}>
        <span className="spinner" />
        <span className="muted">Ouverture du projet…</span>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor__toolbar">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate('/')}>
          ← Projets
        </button>
        <strong>{project.name}</strong>
        <span className={`save-pill${saveState === 'saved' ? ' save-pill--saved' : ''}`}>
          {saveLabel[saveState]}
        </span>

        <span style={{ flex: 1 }} />

        <button
          type="button"
          className="btn btn--sm"
          onClick={undo}
          disabled={past.length === 0}
          title="Annuler (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={redo}
          disabled={future.length === 0}
          title="Rétablir (Ctrl+Maj+Z)"
        >
          ↷
        </button>

        <button
          type="button"
          className="btn btn--sm"
          onClick={() =>
            addElement(
              createText({
                x: currentSlideOrigin() + SAFE_MARGIN,
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
                x: currentSlideOrigin() + SAFE_MARGIN,
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
                x: currentSlideOrigin() + scene.slideWidth / 2,
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
                x: currentSlideOrigin() + SAFE_MARGIN,
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

        <span className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn--sm" onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}>
            −
          </button>
          <span className="muted" style={{ width: 46, textAlign: 'center' }}>
            {Math.round(zoom * 100)} %
          </span>
          <button type="button" className="btn btn--sm" onClick={() => setZoom((z) => Math.min(4, z + 0.15))}>
            +
          </button>
        </span>

        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => {
            await save();
            const blob = await exportProjectArchive({ ...project, scene });
            downloadBlob(blob, `${slugify(project.name)}${PROJECT_FILE_EXTENSION}`);
            toast('Projet sauvegardé en .kadra');
          }}
        >
          Sauvegarder .kadra
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => {
            await save();
            setPreviewOpen(true);
          }}
        >
          Aperçu
        </button>
        <button
          type="button"
          className="btn btn--accent"
          onClick={async () => {
            await save();
            setExportOpen(true);
          }}
        >
          Exporter
        </button>
      </div>

      <PhotoPanel />
      <EditorCanvas cropMode={cropMode} zoom={zoom} onDropAsset={handleDropAsset} />
      <InspectorPanel cropMode={cropMode} onCropMode={setCropMode} />

      {previewOpen ? (
        <PreviewModal
          project={{ ...project, scene }}
          assets={assets}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      {exportOpen ? (
        <ExportDialog
          project={{ ...project, scene }}
          assets={assets}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}
