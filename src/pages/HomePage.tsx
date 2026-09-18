import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NewProjectDialog from '../components/NewProjectDialog';
import SettingsDialog from '../components/SettingsDialog';
import { useToast } from '../components/ui/Toast';
import { projectRepository } from '../data/projectRepository';
import type { Project } from '../data/db';
import { getFormat } from '../lib/formats';
import { exportFullBackup, exportProjectArchive, importArchive, shouldRemindBackup, PROJECT_FILE_EXTENSION } from '../lib/backup';
import { downloadBlob, slugify } from '../lib/export';
import { isSafari, requestPersistentStorage } from '../lib/storage';
import { settingsRepository, SETTINGS_KEYS } from '../data/settingsRepository';

function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
}: {
  project: Project;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!project.thumbnail) return undefined;
    const url = URL.createObjectURL(project.thumbnail);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [project.thumbnail]);

  const spec = getFormat(project.format);

  return (
    <article className="project-card">
      <button
        type="button"
        className="project-card__thumb"
        style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}
        onClick={onOpen}
        aria-label={`Ouvrir ${project.name}`}
      >
        {thumbUrl ? '' : 'Aperçu à venir'}
      </button>
      <div className="project-card__body">
        <span className="project-card__name">{project.name}</span>
        <span className="project-card__meta">
          {spec.label} · {project.slideCount} slide{project.slideCount > 1 ? 's' : ''}
        </span>
        <span className="project-card__meta">
          Modifié le {new Date(project.updatedAt).toLocaleDateString('fr-FR')} à{' '}
          {new Date(project.updatedAt).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <div className="project-card__actions">
          <button type="button" className="btn btn--sm btn--primary" onClick={onOpen}>
            Ouvrir
          </button>
          <button type="button" className="btn btn--sm" onClick={onRename}>
            Renommer
          </button>
          <button type="button" className="btn btn--sm" onClick={onDuplicate}>
            Dupliquer
          </button>
          <button type="button" className="btn btn--sm" onClick={onExport}>
            .kadra
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={onDelete}>
            Supprimer
          </button>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupReminder, setBackupReminder] = useState(false);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setProjects(await projectRepository.list());
  }, []);

  useEffect(() => {
    void refresh();
    void (async () => {
      const asked = await settingsRepository.get<boolean>(SETTINGS_KEYS.storagePersistAsked);
      if (!asked) {
        await requestPersistentStorage();
        await settingsRepository.set(SETTINGS_KEYS.storagePersistAsked, true);
      }
      setBackupReminder(await shouldRemindBackup());
    })();
  }, [refresh]);

  const handleFullBackup = async () => {
    setBusy(true);
    try {
      const blob = await exportFullBackup();
      downloadBlob(blob, `kadra-sauvegarde-${new Date().toISOString().slice(0, 10)}.zip`);
      setBackupReminder(false);
      toast('Sauvegarde complète téléchargée');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      const restored = await importArchive(file);
      await refresh();
      toast(
        restored.length
          ? `${restored.length} projet${restored.length > 1 ? 's' : ''} importé${restored.length > 1 ? 's' : ''}`
          : 'Aucun projet trouvé dans ce fichier',
      );
    } catch {
      toast('Fichier illisible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="app-header">
        <span className="brand">
          <span className="brand__dot" />
          KADRA
        </span>
        <div className="row">
          {busy ? <span className="spinner" aria-label="Traitement en cours" /> : null}
          <button type="button" className="btn btn--sm" onClick={() => importRef.current?.click()}>
            Importer
          </button>
          <button type="button" className="btn btn--sm" onClick={handleFullBackup} disabled={busy}>
            Sauvegarde complète
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setSettingsOpen(true)}>
            Réglages
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
            Nouveau projet
          </button>
        </div>
      </header>

      <input
        ref={importRef}
        type="file"
        accept={`${PROJECT_FILE_EXTENSION},.zip`}
        hidden
        onChange={(event) => {
          // Copier le fichier avant de réinitialiser l'input : remettre value à ''
          // vide le FileList.
          const [file] = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (file) void handleImport(file);
        }}
      />

      <main className="page">
        <h1 className="page__title">Vos projets</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Collages et carrousels seamless pour Instagram et Facebook — tout reste sur ce poste.
        </p>

        {backupReminder ? (
          <div className="banner banner--warn">
            <span>
              Aucune sauvegarde complète depuis plus de 7 jours. Les données ne vivent que dans ce
              navigateur.
            </span>
            <button type="button" className="btn btn--sm" onClick={handleFullBackup}>
              Sauvegarder
            </button>
          </div>
        ) : null}

        {isSafari() ? (
          <div className="banner banner--warn">
            Safari supprime les données d'un site non visité pendant 7 jours. Préférez Chrome sur
            ordinateur.
          </div>
        ) : null}

        {projects.length === 0 ? (
          <div className="empty-state">
            Aucun projet pour l'instant. Créez votre premier collage ou carrousel seamless.
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => navigate(`/projet/${project.id}`)}
                onRename={async () => {
                  const name = window.prompt('Nouveau nom du projet', project.name);
                  if (name?.trim()) {
                    await projectRepository.rename(project.id, name.trim());
                    await refresh();
                  }
                }}
                onDuplicate={async () => {
                  await projectRepository.duplicate(project.id);
                  await refresh();
                  toast('Projet dupliqué');
                }}
                onDelete={async () => {
                  if (!window.confirm(`Supprimer « ${project.name} » et ses photos ?`)) return;
                  await projectRepository.remove(project.id);
                  await refresh();
                  toast('Projet supprimé');
                }}
                onExport={async () => {
                  const blob = await exportProjectArchive(project);
                  downloadBlob(blob, `${slugify(project.name)}${PROJECT_FILE_EXTENSION}`);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {creating ? (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            navigate(`/projet/${project.id}`);
          }}
        />
      ) : null}

      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </>
  );
}
