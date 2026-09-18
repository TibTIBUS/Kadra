import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import { downloadBlob, exportProjectZip, exportSingleSlide, slugify } from '../../lib/export';
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
  const [done, setDone] = useState(false);
  const slides = slideCountOf(project.scene);

  useEffect(() => {
    let cancelled = false;
    const start = performance.now();

    void exportProjectZip(project, assets, (label, value) => {
      if (cancelled) return;
      setStep(label);
      setRatio(value);
    })
      .then(({ zip, slideCount }) => {
        if (cancelled) return;
        downloadBlob(zip, `${slugify(project.name)}.zip`);
        setDone(true);
        toast(
          `${slideCount} image${slideCount > 1 ? 's' : ''} exportée${slideCount > 1 ? 's' : ''} en ${(
            (performance.now() - start) / 1000
          ).toFixed(1)} s`,
        );
      })
      .catch(() => {
        if (!cancelled) toast("L'export a échoué");
      });

    return () => {
      cancelled = true;
    };
  }, [project, assets, toast]);

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
      <p className="hint">
        instagram/01.jpg … {String(slides).padStart(2, '0')}.jpg + facebook/facebook.jpg — JPEG
        qualité 0,92, dimensions exactes du format.
      </p>
      <div className="progress" style={{ margin: '16px 0 8px' }}>
        <div className="progress__bar" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <span className="muted">{done ? 'ZIP téléchargé' : step}</span>

      <div className="divider" />

      <label className="hint" htmlFor="single-slide">
        Exporter une seule slide
      </label>
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: slides }, (_, index) => (
          <button
            key={index}
            id={index === 0 ? 'single-slide' : undefined}
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              const blob = await exportSingleSlide(project, assets, index);
              downloadBlob(blob, `${slugify(project.name)}-${String(index + 1).padStart(2, '0')}.jpg`);
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
    </Modal>
  );
}
