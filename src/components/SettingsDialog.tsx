import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import {
  formatBytes,
  isSafari,
  readStorageStatus,
  requestPersistentStorage,
  type StorageStatus,
} from '../lib/storage';
import { settingsRepository, SETTINGS_KEYS } from '../data/settingsRepository';

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setStatus(await readStorageStatus());
    setLastBackup((await settingsRepository.get<number>(SETTINGS_KEYS.lastFullBackupAt)) ?? null);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const askPersist = async () => {
    setBusy(true);
    try {
      await requestPersistentStorage();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Réglages et stockage" onClose={onClose} size="sm">
      <p className="hint">
        KADRA fonctionne entièrement dans ce navigateur : aucune donnée n'est envoyée sur un serveur.
        Les projets et les photos vivent dans IndexedDB.
      </p>

      <div className="divider" />

      <div className="row row--between" style={{ marginBottom: 10 }}>
        <span>Stockage persistant</span>
        <span className="tag">{status?.persisted ? 'Actif' : 'Non accordé'}</span>
      </div>
      {!status?.persisted ? (
        <button type="button" className="btn btn--sm" onClick={askPersist} disabled={busy}>
          Demander la persistance
        </button>
      ) : null}

      <div className="row row--between" style={{ margin: '14px 0' }}>
        <span>Espace utilisé</span>
        <span className="muted">
          {formatBytes(status?.usageBytes ?? 0)}
          {status?.quotaBytes ? ` / ${formatBytes(status.quotaBytes)}` : ''}
        </span>
      </div>

      <div className="row row--between">
        <span>Dernière sauvegarde complète</span>
        <span className="muted">
          {lastBackup ? new Date(lastBackup).toLocaleDateString('fr-FR') : 'jamais'}
        </span>
      </div>

      {isSafari() ? (
        <div className="warning-list" style={{ marginTop: 16 }}>
          Safari détecté. Safari efface les données d'un site non visité pendant 7 jours. Utilisez
          Chrome sur ordinateur, et exportez régulièrement une sauvegarde complète.
        </div>
      ) : null}
    </Modal>
  );
}
