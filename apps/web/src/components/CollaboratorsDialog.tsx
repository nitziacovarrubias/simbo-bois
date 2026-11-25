import { useState } from 'react';
import { LoaderCircle, UsersRound } from 'lucide-react';
import type { CollaboratorUser, ProjectSummary } from '../apiClient';
import SharedDialog from './SharedDialog';
import './CollaboratorsDialog.css';

interface Props {
  project: ProjectSummary;
  available: CollaboratorUser[];
  onSave: (ids: string[]) => Promise<void>;
  onClose: () => void;
}

export default function CollaboratorsDialog({ project, available, onSave, onClose }: Props) {
  const [selected, setSelected] = useState(() =>
    project.collaborators.map((member) => member.userId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = new Set(project.collaborators.map((member) => member.userId));
  const changed = selected.length !== current.size || selected.some((id) => !current.has(id));
  const assignedButUnavailable = project.collaborators.filter(
    (member) => !available.some((person) => person.id === member.userId),
  );

  const save = async () => {
    if (busy || !changed) return;
    setBusy(true);
    setError('');
    try {
      await onSave(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el equipo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SharedDialog
      title="Colaboradores"
      description={project.name}
      icon={<UsersRound />}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="simbo-dialog-button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="simbo-dialog-button simbo-dialog-button--primary"
            disabled={!changed || busy}
            onClick={() => void save()}
          >
            {busy && <LoaderCircle size={15} className="simbo-spin-icon" aria-hidden="true" />}
            {busy ? 'Guardando…' : 'Guardar asignaciones'}
          </button>
        </>
      }
    >
      <div className="simbo-collaborators-body">
        <p className="simbo-collaborators-intro">
          Los colaboradores asignados pueden consultar el diseño y sus versiones, pero no
          modificarlos.
        </p>
        {error && (
          <p className="simbo-dialog-error" role="alert">
            {error}
          </p>
        )}
        {available.length === 0 && (
          <p className="simbo-collaborators-empty">
            Todavía no hay colaboradores activos. Agrega una cuenta con este rol para poder
            asignarla.
          </p>
        )}
        {available.map((person) => (
          <label className="simbo-collaborator-row" key={person.id}>
            <input
              type="checkbox"
              checked={selected.includes(person.id)}
              disabled={busy}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, person.id]
                    : current.filter((id) => id !== person.id),
                )
              }
            />
            <span>
              <strong>{person.name}</strong>
              <small>{person.email}</small>
            </span>
          </label>
        ))}
        {assignedButUnavailable.map((member) => (
          <label className="simbo-collaborator-row" key={member.userId}>
            <input
              type="checkbox"
              checked={selected.includes(member.userId)}
              disabled={busy}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, member.userId]
                    : current.filter((id) => id !== member.userId),
                )
              }
            />
            <span>
              <strong>{member.user.name}</strong>
              <small>Cuenta inactiva o sin acceso de Colaborador: quita esta asignación.</small>
            </span>
          </label>
        ))}
        <p className="simbo-collaborators-count">
          {selected.length} {selected.length === 1 ? 'persona asignada' : 'personas asignadas'}
        </p>
      </div>
    </SharedDialog>
  );
}
