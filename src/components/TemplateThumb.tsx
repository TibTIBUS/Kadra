import { useEffect, useState } from 'react';
import type { TemplateDefinition } from '../templates';
import { renderTemplateThumbnail } from '../lib/templateThumb';

export default function TemplateThumb({ template }: { template: TemplateDefinition }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderTemplateThumbnail(template.id, template.scene)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [template]);

  return src ? (
    <img className="template-card__preview" src={src} alt="" loading="lazy" />
  ) : (
    <div className="template-card__preview" />
  );
}
