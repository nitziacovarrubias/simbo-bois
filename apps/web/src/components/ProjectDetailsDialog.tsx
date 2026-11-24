import { CalendarDays, FolderOpen, Pencil } from 'lucide-react';
import type { ProjectSummary } from '../apiClient';
import { PROJECT_TYPE_LABELS } from './NewProjectDialog';
import SharedDialog from './SharedDialog';
import './ProjectDetailsDialog.css';

interface Props { project: ProjectSummary; onClose: () => void; onEdit?: () => void; }
const date = (value: string) => new Date(value).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' });
export default function ProjectDetailsDialog({ project, onClose, onEdit }: Props) {
  const fields: Array<[string,string]> = [
    ['Tipo', project.projectType ? PROJECT_TYPE_LABELS[project.projectType] : 'Sin especificar'],
    ['Cliente', project.clientName || 'Sin especificar'],
    ['Ubicación', project.location || 'Sin especificar'],
    ['Responsable', project.responsible?.name || 'Sin asignar'],
    ['Colaboradores', project.collaborators?.map(member => member.user.name).join(', ') || 'Sin asignar'],
    ['Creado', date(project.createdAt)],
    ['Última actualización', date(project.updatedAt)]
  ];
  return <SharedDialog title={project.name} description="Información general del proyecto" icon={<FolderOpen />} onClose={onClose} dismissOnBackdrop
    footer={<>
      <button type="button" className="simbo-dialog-button" onClick={onClose}>Cerrar</button>
      {onEdit && <button type="button" className="simbo-dialog-button simbo-dialog-button--primary" onClick={onEdit}><Pencil /> Editar datos</button>}
    </>}>
    <dl className="simbo-project-details">
      {fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    {project.description && <div className="simbo-project-description"><h3>Descripción</h3><p>{project.description}</p></div>}
    {!project.description && <p className="simbo-project-no-description"><CalendarDays size={15}/> Sin descripción adicional.</p>}
  </SharedDialog>;
}
