/** Permisos de proyecto. Las comprobaciones de membresía se hacen en la base de datos. */
export type ProjectRole = 'SUPERVISOR' | 'ARCHITECT' | 'COLLABORATOR';

export function canCreateProject(role: ProjectRole): boolean {
  return role !== 'COLLABORATOR';
}
export function canEditProject(role: ProjectRole): boolean {
  return role !== 'COLLABORATOR';
}
export function canEditDesign(role: ProjectRole): boolean {
  return role !== 'COLLABORATOR';
}
export function canManageCollaborators(role: ProjectRole): boolean {
  return role === 'SUPERVISOR';
}
export function canReadProject(
  role: ProjectRole,
  ownerId: string | null,
  responsibleId: string | null,
  actorId: string,
  assigned: boolean,
): boolean {
  return (
    role === 'SUPERVISOR' ||
    (role === 'COLLABORATOR' ? assigned : ownerId === actorId || responsibleId === actorId)
  );
}
