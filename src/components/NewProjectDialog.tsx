import { useMemo, useState } from 'react';
import Modal from './ui/Modal';
import TemplateThumb from './TemplateThumb';
import { FORMAT_LIST, clampSlideCount, getFormat } from '../lib/formats';
import { instantiateTemplate, templatesForFormat, type TemplateDefinition } from '../templates';
import { emptyScene } from '../lib/scene';
import { projectRepository } from '../data/projectRepository';
import type { Project } from '../data/db';
import type { ProjectFormat } from '../types/scene';

interface Props {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export default function NewProjectDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('Nouveau projet');
  const [format, setFormat] = useState<ProjectFormat>('collage_portrait');
  const [slideCount, setSlideCount] = useState(3);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spec = getFormat(format);
  const available = useMemo(() => templatesForFormat(format), [format]);
  const effectiveSlides = spec.isCarousel ? clampSlideCount(format, slideCount) : 1;

  const pickTemplate = (template: TemplateDefinition) => {
    setTemplateId(template.id);
    if (spec.isCarousel) setSlideCount(clampSlideCount(format, template.slideCount));
  };

  const create = async () => {
    setBusy(true);
    try {
      const template = available.find((item) => item.id === templateId);
      const scene = template
        ? instantiateTemplate(template, format, effectiveSlides)
        : emptyScene(format, effectiveSlides);
      const project = await projectRepository.create({
        name: name.trim() || 'Nouveau projet',
        format,
        slideCount: effectiveSlides,
        scene,
        templateId: template?.id,
        fbVariant: 'panorama',
      });
      onCreated(project);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Nouveau projet"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn--primary" onClick={create} disabled={busy}>
            {busy ? 'Création…' : 'Créer le projet'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="project-name">Nom du projet</label>
        <input
          id="project-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <label>Format de sortie</label>
        <div className="format-list">
          {FORMAT_LIST.map((item) => (
            <button
              key={item.id}
              type="button"
              className="choice"
              aria-pressed={format === item.id}
              onClick={() => {
                setFormat(item.id);
                setTemplateId(null);
              }}
            >
              <div className="choice__title">{item.label}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {item.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {spec.isCarousel ? (
        <div className="field">
          <label htmlFor="slide-count">Nombre de slides — {effectiveSlides}</label>
          <input
            id="slide-count"
            type="range"
            min={spec.minSlides}
            max={spec.maxSlides}
            value={effectiveSlides}
            onChange={(event) => setSlideCount(Number(event.target.value))}
          />
          <span className="hint">
            La scène fera {effectiveSlides * spec.slideWidth} px de large, découpée en {effectiveSlides}{' '}
            images à l'export.
          </span>
        </div>
      ) : null}

      <div className="field">
        <label>Point de départ</label>
        <div className="template-grid">
          <button
            type="button"
            className="template-card"
            aria-pressed={templateId === null}
            onClick={() => setTemplateId(null)}
          >
            <div className="template-card__preview" />
            <div className="template-card__label">
              <div className="choice__title">Page blanche</div>
              <span className="muted" style={{ fontSize: 12 }}>
                Composition libre
              </span>
            </div>
          </button>
          {available.map((template) => (
            <button
              key={template.id}
              type="button"
              className="template-card"
              aria-pressed={templateId === template.id}
              onClick={() => pickTemplate(template)}
            >
              <TemplateThumb template={template} />
              <div className="template-card__label">
                <div className="choice__title">{template.name}</div>
                <span className="muted" style={{ fontSize: 12 }}>
                  {template.description}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
