import { useEffect, useState } from 'react';
import type { TemplateDefinition } from '../templates';
import type { ProjectFormat } from '../types/scene';
import { renderTemplateThumbnail } from '../lib/templateThumb';
import { instantiateTemplate } from '../templates';

export default function TemplateThumb({
  template,
  format,
  slideCount,
}: {
  template: TemplateDefinition;
  format: ProjectFormat;
  slideCount: number;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const scene = instantiateTemplate(template, format, slideCount);
    renderTemplateThumbnail(`${template.id}:${format}:${slideCount}`, scene)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [template, format, slideCount]);

  return src ? (
    <img className="template-card__preview" src={src} alt="" loading="lazy" />
  ) : (
    <div className="template-card__preview" />
  );
}
