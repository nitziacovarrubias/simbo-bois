import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../apps/api/src/security.ts';
import {
  canReadProject,
  canManageCollaborators,
  canEditDesign,
} from '../apps/api/src/project-permissions.ts';

test('contraseñas de cuentas nuevas se almacenan mediante hash salado y no en texto plano', async () => {
  const password = 'Simbo-UnaClaveSegura-2026';
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt:'));
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('clave incorrecta', a), false);
});

test('un colaborador solo consulta proyectos asignados y nunca los edita', () => {
  assert.equal(
    canReadProject('COLLABORATOR', 'owner', 'responsible', 'collaborator', false),
    false,
  );
  assert.equal(canReadProject('COLLABORATOR', 'owner', 'responsible', 'collaborator', true), true);
  assert.equal(canEditDesign('COLLABORATOR'), false);
  assert.equal(canManageCollaborators('COLLABORATOR'), false);
  assert.equal(canManageCollaborators('SUPERVISOR'), true);
});
