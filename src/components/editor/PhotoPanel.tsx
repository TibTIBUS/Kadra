import { useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { assetRepository } from '../../data/assetRepository';
import { ACCEPT_ATTRIBUTE, isAcceptedImage, processImageFile } from '../../lib/image';
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

  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(0);

  const selectedCell =
    scene?.elements.find((element) => element.id === selectedId && element.type === 'photoCell') ?? null;

  const importFiles = async (files: FileList | File[]) => {
    if (!project) return;
    const list = Array.from(files).filter(isAcceptedImage);
    if (!list.length) {
      toast('Formats acceptés : JPEG, PNG, WEBP, HEIC');
      return;
    }
    setImporting(list.length);
    let failures = 0;
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
        failures += 1;
      }
      setImporting((count) => count - 1);
    }
    await refreshAssets();
    if (failures) toast(`${failures} photo(s) n'ont pas pu être importées`);
  };

  const assignToSelection = (assetId: string) => {
    if (!selectedCell) {
      toast('Sélectionnez d\'abord une cellule photo');
      return;
    }
    updateElement(selectedCell.id, { assetId, crop: { ...DEFAULT_CROP } } as Partial<SceneElement>);
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

      <div className="photo-list">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="photo-item"
            draggable
            title={`${asset.name} — glissez-la dans une cellule`}
            onDragStart={(event) => {
              event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onDoubleClick={() => assignToSelection(asset.id)}
          >
            <img src={assetUrls[asset.id]} alt={asset.name} />
            <button
              type="button"
              className="photo-item__remove"
              title="Retirer du projet"
              onClick={async (event) => {
                event.stopPropagation();
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
          Glissez une photo dans une cellule, ou double-cliquez pour la placer dans la cellule
          sélectionnée.
        </p>
      ) : null}
    </aside>
  );
}
