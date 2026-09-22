import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import {
  downloadBlob,
  renderExportImages,
  slugify,
  zipExportedImages,
  type ExportedImages,
} from '../../lib/export';
import { blobsToFiles, canShareFiles, shareFiles } from '../../lib/share';
import { slideCountOf } from '../../lib/scene';
import type { Asset, Project } from '../../data/db';
import { useToast } from '../ui/Toast';

interface Props {
  project: Project;
  assets: Asset[];
  onClose: () => void;
}

export default function ExportDialog({ project, assets, onClose }: Props) {
  const toast = useToast();
  const [step, setStep] = useState('Préparation');
  const [ratio, setRatio] = useState(0);
  const [images, setImages] = useState<ExportedImages | null>(null);
  const [zipped, setZipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const slides = slideCountOf(project.scene);
  const slug = slugify(project.name);

  // Les images sont rendues dès l'ouverture : iOS exige que le partage parte
  // directement du clic, sans attente entre les deux.
  useEffect(() => {
    let cancelled = false;
    const start = performance.now();

    void renderExportImages(project, assets, (label, value) => {
      if (cancelled) return;
      setStep(label);
      setRatio(value);
    })
      .then((result) => {
        if (cancelled) return;
        setImages(result);
        setRatio(1);
        setStep(
          `${result.slides.length} image${result.slides.length > 1 ? 's' : ''} prête${
            result.slides.length > 1 ? 's' : ''
          } en ${((performance.now() - start) / 1000).toFixed(1)} s`,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setStep("Le rendu a échoué");
          toast("L'export a échoué");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project, assets, toast]);

  const slideFiles = useMemo(
    () =>
      images
        ? blobsToFiles(
            images.slides,
            images.slides.map((_, index) => `${slug}-${String(index + 1).padStart(2, '0')}.jpg`),
          )
        : [],
    [images, slug],
  );

  const facebookFile = useMemo(
    () => (images ? blobsToFiles([images.facebook], [`${slug}-facebook.jpg`]) : []),
    [images, slug],
  );

  const shareable = slideFiles.length > 0 && canShareFiles(slideFiles);

  const share = async (files: File[], title: string, label: string) => {
    const outcome = await shareFiles(files, title);
    if (outcome === 'shared') toast(`${label} — choisissez « Enregistrer » dans la feuille`);
    else if (outcome === 'failed') toast('Le partage a échoué');
  };

  const downloadZip = async () => {
    if (!images) return;
    setBusy(true);
    try {
      downloadBlob(await zipExportedImages(images), `${slug}.zip`);
      setZipped(true);
      toast('ZIP téléchargé');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export"
      size="sm"
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Fermer
        </button>
      }
    >
      <div className="progress" style={{ marginBottom: 8 }}>
        <div className="progress__bar" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <span className="muted">{step}</span>

      <div className="divider" />

      {shareable ? (
        <>
          <div className="field">
            <label>Enregistrer dans Photos</label>
            <button
              type="button"
              className="btn btn--accent"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() =>
                void share(
                  slideFiles,
                  `${project.name} — Instagram`,
                  `${slides} image${slides > 1 ? 's' : ''} Instagram`,
                )
              }
            >
              {slides} slide{slides > 1 ? 's' : ''} Instagram
            </button>
            <button
              type="button"
              className="btn"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              onClick={() => void share(facebookFile, `${project.name} — Facebook`, 'Visuel Facebook')}
            >
              Visuel Facebook
            </button>
            <span className="hint">
              La feuille de partage s'ouvre : « Enregistrer {slides > 1 ? 'les images' : "l'image"} »
              les dépose dans votre pellicule, dans l'ordre de publication.
            </span>
          </div>

          <button
            type="button"
            className="btn btn--sm btn--ghost"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={downloadZip}
            disabled={!images || busy}
          >
            {zipped ? 'ZIP téléchargé' : 'Plutôt un ZIP dans Fichiers'}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn btn--accent"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={downloadZip}
            disabled={!images || busy}
          >
            {zipped ? 'ZIP téléchargé' : 'Télécharger le ZIP'}
          </button>
          <span className="hint">
            instagram/01.jpg … {String(slides).padStart(2, '0')}.jpg + facebook/facebook.jpg — JPEG
            qualité 0,92, aux dimensions exactes du format.
          </span>
        </>
      )}

      <div className="divider" />

      <span className="hint">{shareable ? 'Une slide à la fois' : 'Exporter une seule slide'}</span>
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: slides }, (_, index) => (
          <button
            key={index}
            type="button"
            className="btn btn--sm"
            disabled={!images}
            onClick={() => {
              const file = slideFiles[index];
              if (!file) return;
              if (shareable) void share([file], `${project.name} — ${index + 1}`, 'Image');
              else downloadBlob(file, file.name);
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
    </Modal>
  );
}
