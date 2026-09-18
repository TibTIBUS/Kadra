import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import EditorCanvas from '../components/editor/EditorCanvas';
import PhotoPanel from '../components/editor/PhotoPanel';
import InspectorPanel from '../components/editor/InspectorPanel';
import PreviewModal from '../components/editor/PreviewModal';
import ExportDialog from '../components/editor/ExportDialog';
import AddElementBar from '../components/editor/AddElementBar';
import { useMediaQuery, MOBILE_QUERY } from '../lib/useMediaQuery';
import { useToast } from '../components/ui/Toast';
import { useEditorStore } from '../store/editorStore';
import { DEFAULT_CROP } from '../lib/scene';
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
  const updateElement = useEditorStore((state) => state.updateElement);
  const selectedId = useEditorStore((state) => state.selectedId);
  const removeElement = useEditorStore((state) => state.removeElement);

  const [cropMode, setCropMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [sheet, setSheet] = useState<'photos' | 'composition' | null>(null);

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

  const openPreview = useCallback(async () => {
    await save();
    setPreviewOpen(true);
  }, [save]);

  const openExport = useCallback(async () => {
    await save();
    setExportOpen(true);
  }, [save]);

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
    <div className={`editor${isMobile ? ' editor--mobile' : ''}`}>
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

        {!isMobile ? <AddElementBar /> : null}

        <span className="row" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
            aria-label="Réduire l'affichage"
          >
            −
          </button>
          <span className="muted" style={{ width: 46, textAlign: 'center' }}>
            {Math.round(zoom * 100)} %
          </span>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setZoom((z) => Math.min(4, z + 0.15))}
            aria-label="Agrandir l'affichage"
          >
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
          {isMobile ? '.kadra' : 'Sauvegarder .kadra'}
        </button>
        {!isMobile ? (
          <>
            <button type="button" className="btn btn--sm" onClick={openPreview}>
              Aperçu
            </button>
            <button type="button" className="btn btn--accent" onClick={openExport}>
              Exporter
            </button>
          </>
        ) : null}
      </div>

      {!isMobile ? <PhotoPanel /> : null}
      <EditorCanvas cropMode={cropMode} zoom={zoom} onDropAsset={handleDropAsset} />
      {!isMobile ? (
        <InspectorPanel cropMode={cropMode} onCropMode={setCropMode} />
      ) : null}

      {isMobile ? (
        <>
          <nav className="tabbar">
            <button
              type="button"
              className="tabbar__btn"
              aria-pressed={sheet === 'photos'}
              onClick={() => setSheet(sheet === 'photos' ? null : 'photos')}
            >
              Photos
            </button>
            <button
              type="button"
              className="tabbar__btn"
              aria-pressed={sheet === 'composition'}
              onClick={() => setSheet(sheet === 'composition' ? null : 'composition')}
            >
              Composition
            </button>
            <button
              type="button"
              className="tabbar__btn"
              onClick={() => {
                setSheet(null);
                void openPreview();
              }}
            >
              Aperçu
            </button>
            <button
              type="button"
              className="tabbar__btn tabbar__btn--accent"
              onClick={() => {
                setSheet(null);
                void openExport();
              }}
            >
              Exporter
            </button>
          </nav>

          {sheet ? (
            <div
              className="sheet-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setSheet(null);
              }}
            >
              <div className="sheet" role="dialog" aria-label={sheet === 'photos' ? 'Photos' : 'Composition'}>
                <div className="sheet__handle">
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setSheet(null)}
                    aria-label="Fermer le panneau"
                  >
                    ▾
                  </button>
                </div>
                {sheet === 'photos' ? (
                  <PhotoPanel />
                ) : (
                  <InspectorPanel cropMode={cropMode} onCropMode={setCropMode} showAddElements />
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

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
