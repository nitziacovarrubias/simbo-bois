import { useState, type FormEvent } from 'react';
import { FolderPlus, Save } from 'lucide-react';
import type { CreateProjectRequest, ProjectType } from '@simbo/shared-contracts';
import type { AssignableUser, ProjectSummary } from '../apiClient';
import Field from './Field';
import SharedDialog from './SharedDialog';
import './NewProjectDialog.css';

type Props = {
  onCancel: () => void;
  onSave: (input: CreateProjectRequest) => void | Promise<void>;
  assignees?: AssignableUser[];
  initial?: ProjectSummary;
  localOnly?: boolean;
  currentUserId?: string;
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  KITCHEN:'Cocina', CLOSET:'Closet', MIXED:'Cocina y closet', OTHER:'Otro'
};

export default function NewProjectDialog({ onCancel, onSave, assignees = [], initial, localOnly = false, currentUserId }: Props) {
  const [name, setName] = useState(initial?.name ?? (localOnly ? 'Nuevo diseño' : ''));
  const [projectType, setProjectType] = useState<ProjectType | ''>(initial?.projectType ?? '');
  const [clientName, setClientName] = useState(initial?.clientName ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [responsibleId, setResponsibleId] = useState(initial?.responsibleId ?? currentUserId ?? assignees[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempted, setAttempted] = useState(false);
  const nameValid = name.trim().length > 0;
  const typeValid = localOnly || projectType !== '';
  const responsibleValid = localOnly || Boolean(responsibleId && (assignees.some(user=>user.id===responsibleId) || initial?.responsibleId===responsibleId));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (!nameValid || !typeValid || !responsibleValid || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave({
        name:name.trim(),
        ...(localOnly ? {} : {
          projectType:projectType as ProjectType,
          responsibleId:initial?.responsibleId===responsibleId ? undefined : responsibleId,
          clientName:clientName.trim() || null,
          location:location.trim() || null,
          description:description.trim() || null
        })
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el proyecto');
    } finally { setBusy(false); }
  };

  return <SharedDialog title={localOnly ? 'Nuevo diseño local' : initial ? 'Editar proyecto' : 'Nuevo proyecto'}
    description={localOnly ? 'Este diseño se guardará en el navegador.' : 'Información general del proyecto'}
    icon={initial ? <Save /> : <FolderPlus />} width="wide" onClose={onCancel} busy={busy}
    footer={<>
      <button type="button" className="simbo-dialog-button" onClick={onCancel} disabled={busy}>Cancelar</button>
      <button type="submit" form="simbo-project-form" className="simbo-dialog-button simbo-dialog-button--primary" disabled={busy}>
        {initial ? <Save /> : <FolderPlus />}{busy ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear proyecto'}
      </button>
    </>}>
    <form className="simbo-project-form" id="simbo-project-form" onSubmit={event => void submit(event)} noValidate>
      {error && <p className="simbo-dialog-error" role="alert">{error}</p>}
      <Field id="simbo-project-name" label="Nombre del proyecto" required error={attempted && !nameValid ? 'Ingresa un nombre para el proyecto.' : undefined}>
        <input id="simbo-project-name" autoComplete="off" value={name} maxLength={120}
          aria-invalid={attempted && !nameValid} aria-describedby={attempted && !nameValid ? 'simbo-project-name-error' : undefined}
          onChange={event=>setName(event.target.value)} placeholder="Ej. Cocina residencial · Colonia Pitic" />
      </Field>
      {!localOnly && <>
        <div className="simbo-project-form-grid">
          <Field id="simbo-project-type" label="Tipo de proyecto" required error={attempted && !typeValid ? 'Selecciona un tipo.' : undefined}>
            <select id="simbo-project-type" value={projectType} aria-invalid={attempted && !typeValid}
              aria-describedby={attempted && !typeValid ? 'simbo-project-type-error' : undefined}
              onChange={event=>setProjectType(event.target.value as ProjectType | '')}>
              <option value="">Seleccionar tipo</option>
              {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map(key => <option key={key} value={key}>{PROJECT_TYPE_LABELS[key]}</option>)}
            </select>
          </Field>
          <Field id="simbo-project-responsible" label="Responsable" required
            error={attempted && !responsibleValid ? 'Selecciona un responsable disponible.' : undefined}>
            <select id="simbo-project-responsible" value={responsibleId} aria-invalid={attempted && !responsibleValid}
              aria-describedby={attempted && !responsibleValid ? 'simbo-project-responsible-error' : undefined}
              onChange={event=>setResponsibleId(event.target.value)}>
              <option value="">Seleccionar responsable</option>
              {initial?.responsible && !assignees.some(user=>user.id===initial.responsibleId) && <option value={initial.responsible.id}>{initial.responsible.name} · Asignación actual</option>}
              {assignees.map(user=><option key={user.id} value={user.id}>{user.name} · {user.role==='SUPERVISOR'?'Supervisor':'Arquitecto'}</option>)}
            </select>
          </Field>
        </div>
        <Field id="simbo-project-client" label="Cliente">
          <input id="simbo-project-client" value={clientName} onChange={event=>setClientName(event.target.value)} maxLength={160} placeholder="Nombre del cliente" autoComplete="off" />
        </Field>
        <Field id="simbo-project-location" label="Ubicación">
          <input id="simbo-project-location" value={location} onChange={event=>setLocation(event.target.value)} maxLength={240} placeholder="Dirección o referencia" autoComplete="off" />
        </Field>
        <Field id="simbo-project-description" label="Descripción" help="Opcional · Detalles importantes para el equipo.">
          <textarea id="simbo-project-description" value={description} onChange={event=>setDescription(event.target.value)}
            maxLength={1000} rows={3} placeholder="Distribución, acabados, observaciones…" />
        </Field>
      </>}
    </form>
  </SharedDialog>;
}
