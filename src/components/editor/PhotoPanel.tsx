import { useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { assetRepository } from '../../data/assetRepository';
import { ACCEPT_ATTRIBUTE, ImageImportError, isAcceptedImage, processImageFile } from '../../lib/image';
import { useToast } from '../ui/Toast';
import { ASSET_DRAG_TYPE } from './EditorCanvas';
import { DEFAULT_CROP } from '../../lib/scene';
import type { SceneElement } from '../../types/scene';

export default function PhotoPanel() {
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const assetUrls = useEditorStore((state) => state.assetUrls);
  const scene = useEditorStore((state) => state.scene);
  const selectedId = useEditorStore((state) => state.selectedId);
  const refreshAssets = useEditorStore((state) => state.refreshAssets);
  const updateElement = useEditorStore((state) => state.updateElement);
  const pendingAssetId = useEditorStore((state) => state.pendingAssetId);
  const setPendingAsset = useEditorStore((state) => state.setPendingAsset);

  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(0);
  const [failures, setFailures] = useState<{ name: string; reason: string }[]>([]);

  const selectedCell =
    scene?.elements.find((element) => element.id === selectedId && element.type === 'photoCell') ?? null;

  const importFiles = async (files: FileList | File[]) => {
    if (!project) return;
    const list = Array.from(files).filter(isAcceptedImage);
    if (!list.length) {
      toast('Formats acceptés : JPEG, PNG, WEBP, HEIC');
      return;
    }
    setFailures([]);
    setImporting(list.length);
    const rejected: { name: string; reason: string }[] = [];

    for (const file of list) {
      try {
        const processed = await processImageFile(file);
        await assetRepository.add({
          projectId: project.id,
          name: file.name,
          original: processed.original,
          preview: processed.preview,
          width: processed.width,
          height: processed.height,
        });
      } catch (error) {
        console.error('Import impossible :', file.name, error);
        rejected.push({
          name: file.name,
          reason:
            error instanceof ImageImportError
              ? error.message
              : "Erreur inattendue pendant l'import.",
        });
      }
      setImporting((count) => count - 1);
    }

    await refreshAssets();
    setFailures(rejected);
    if (rejected.length) {
      toast(`${rejected.length} photo(s) non importée(s) — détail dans le panneau`);
    }
  };

  /**
   * Le glisser-déposer HTML5 n'existe pas sur iOS : toucher une photo l'arme,
   * la cellule touchée ensuite la reçoit. Si une cellule est déjà sélectionnée,
   * la photo y va directement.
   */
  const pickPhoto = (assetId: string) => {
    if (selectedCell) {
      updateElement(selectedCell.id, { assetId, crop: { ...DEFAULT_CROP } } as Partial<SceneElement>);
      setPendingAsset(null);
      return;
    }
    setPendingAsset(pendingAssetId === assetId ? null : assetId);
  };

  return (
    <aside className="editor__panel">
      <h2 className="panel-title">Photos du projet</h2>

      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void importFiles(event.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter') inputRef.current?.click();
        }}
      >
        Glissez vos photos ici
        <br />
        JPEG, PNG, WEBP, HEIC
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        hidden
        onChange={(event) => {
          // La liste doit être copiée avant la réinitialisation : remettre value à ''
          // vide le FileList référencé.
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) void importFiles(files);
        }}
      />

      {importing > 0 ? (
        <p className="hint" style={{ marginTop: 10 }}>
          Import en cours — {importing} photo(s) restante(s)…
        </p>
      ) : null}

      {failures.length ? (
        <div className="warning-list">
          <div className="row row--between" style={{ marginBottom: 6 }}>
            <strong>Photos non importées</strong>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setFailures([])}
              aria-label="Masquer la liste"
            >
              ✕
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {failures.map((failure) => (
              <li key={failure.name} style={{ marginBottom: 6 }}>
                <strong>{failure.name}</strong>
                <br />
                {failure.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="photo-list">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="photo-item"
            draggable
            title={`${asset.name} — touchez-la puis touchez une cellule`}
            aria-selected={pendingAssetId === asset.id}
            onClick={() => pickPhoto(asset.id)}
            onDragStart={(event) => {
              event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
              event.dataTransfer.effectAllowed = 'copy';
              setPendingAsset(null);
            }}
          >
            <img src={assetUrls[asset.id]} alt={asset.name} />
            <button
              type="button"
              className="photo-item__remove"
              title="Retirer du projet"
              aria-label={`Retirer ${asset.name}`}
              onClick={async (event) => {
                event.stopPropagation();
                if (pendingAssetId === asset.id) setPendingAsset(null);
                await assetRepository.remove(asset.id);
                await refreshAssets();
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {assets.length ? (
        <p className="hint" style={{ marginTop: 12 }}>
          {pendingAssetId
            ? 'Photo prête : touchez maintenant une cellule de la composition.'
            : 'Touchez une photo puis une cellule pour la placer. À la souris, vous pouvez aussi la glisser directement.'}
        </p>
      ) : null}
    </aside>
  );
}
