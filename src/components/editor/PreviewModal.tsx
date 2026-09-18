import { useEffect, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import { renderPreviewBundle, type PreviewBundle } from '../../lib/preview';
import type { Asset, Project } from '../../data/db';

type Tab = 'instagram' | 'grid' | 'facebook';

interface Props {
  project: Project;
  assets: Asset[];
  onClose: () => void;
}

export default function PreviewModal({ project, assets, onClose }: Props) {
  const [bundle, setBundle] = useState<PreviewBundle | null>(null);
  const [tab, setTab] = useState<Tab>('instagram');
  const [index, setIndex] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderPreviewBundle(project, assets)
      .then((result) => {
        if (!cancelled) setBundle(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [project, assets]);

  const slides = bundle?.slides ?? [];
  const go = (next: number) => setIndex(Math.max(0, Math.min(slides.length - 1, next)));

  return (
    <Modal title="Aperçu" onClose={onClose}>
      <div className="preview-tabs">
        <button
          type="button"
          className="btn btn--sm"
          aria-pressed={tab === 'instagram'}
          onClick={() => setTab('instagram')}
        >
          Instagram
        </button>
        <button
          type="button"
          className="btn btn--sm"
          aria-pressed={tab === 'grid'}
          onClick={() => setTab('grid')}
        >
          Grille du profil
        </button>
        <button
          type="button"
          className="btn btn--sm"
          aria-pressed={tab === 'facebook'}
          onClick={() => setTab('facebook')}
        >
          Facebook
        </button>
      </div>

      {!bundle ? (
        <div className="row" style={{ justifyContent: 'center', padding: 40 }}>
          <span className="spinner" />
          <span className="muted">Rendu de l'aperçu…</span>
        </div>
      ) : null}

      {bundle && tab === 'instagram' ? (
        <div className="phone">
          <div className="phone__bar">
            <span className="phone__avatar" />
            <strong>localia.fr</strong>
          </div>
          <div
            className="phone__media"
            onPointerDown={(event) => {
              dragStart.current = event.clientX;
            }}
            onPointerUp={(event) => {
              if (dragStart.current === null) return;
              const delta = event.clientX - dragStart.current;
              if (Math.abs(delta) > 40) go(index + (delta < 0 ? 1 : -1));
              dragStart.current = null;
            }}
          >
            <div
              className="phone__track"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {slides.map((src, slideIndex) => (
                <img key={src.slice(-32) + slideIndex} src={src} alt={`Slide ${slideIndex + 1}`} draggable={false} />
              ))}
            </div>
            {index > 0 ? (
              <button
                type="button"
                className="phone__nav"
                style={{ left: 8 }}
                onClick={() => go(index - 1)}
                aria-label="Slide précédente"
              >
                ‹
              </button>
            ) : null}
            {index < slides.length - 1 ? (
              <button
                type="button"
                className="phone__nav"
                style={{ right: 8 }}
                onClick={() => go(index + 1)}
                aria-label="Slide suivante"
              >
                ›
              </button>
            ) : null}
          </div>
          {slides.length > 1 ? (
            <div className="phone__dots">
              {slides.map((src, dotIndex) => (
                <span
                  key={`dot-${src.slice(-16)}-${dotIndex}`}
                  className={`phone__dot${dotIndex === index ? ' phone__dot--active' : ''}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {bundle && tab === 'grid' ? (
        <>
          <div className="grid-preview">
            <img src={bundle.profileGrid} alt="Première slide recadrée en 3:4" />
            <div />
            <div />
            <div />
            <div />
            <div />
          </div>
          <p className="hint" style={{ textAlign: 'center', marginTop: 12 }}>
            La grille du profil recadre la première slide au format 3:4.
          </p>
        </>
      ) : null}

      {bundle && tab === 'facebook' ? (
        <>
          <div className="fb-card">
            <div className="fb-card__head">
              <span className="fb-card__avatar" />
              <div>
                <strong>Localia</strong>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Il y a quelques minutes · 🌍</div>
              </div>
            </div>
            <img src={bundle.facebook} alt="Aperçu Facebook" />
          </div>
          <p className="hint" style={{ textAlign: 'center', marginTop: 12 }}>
            Variante « {project.fbVariant === 'panorama' ? 'Panorama unique' : 'Collage résumé'} ».
          </p>
        </>
      ) : null}
    </Modal>
  );
}
