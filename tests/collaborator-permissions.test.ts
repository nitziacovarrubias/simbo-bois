import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCreateProject,canEditDesign,canEditProject,canManageCollaborators,canReadProject
} from '../apps/api/src/project-permissions.ts';

test('colaborador asignado: consulta exclusivamente y no modifica proyectos',()=>{
  assert.equal(canReadProject('COLLABORATOR','owner','architect','member',true),true);
  assert.equal(canReadProject('COLLABORATOR','owner','architect','member',false),false);
  assert.equal(canReadProject('COLLABORATOR','member','member','member',false),false);
  assert.equal(canCreateProject('COLLABORATOR'),false);
  assert.equal(canEditProject('COLLABORATOR'),false);
  assert.equal(canEditDesign('COLLABORATOR'),false);
  assert.equal(canManageCollaborators('COLLABORATOR'),false);
});

test('arquitecto mantiene permisos sobre proyectos propios o asignados',()=>{
  assert.equal(canReadProject('ARCHITECT','architect',null,'architect',false),true);
  assert.equal(canReadProject('ARCHITECT','other','architect','architect',false),true);
  assert.equal(canReadProject('ARCHITECT','other','other','architect',true),false);
  assert.equal(canCreateProject('ARCHITECT'),true);
  assert.equal(canEditProject('ARCHITECT'),true);
  assert.equal(canEditDesign('ARCHITECT'),true);
  assert.equal(canManageCollaborators('ARCHITECT'),false);
});

test('supervisor puede administrar y asignar colaboradores',()=>{
  assert.equal(canReadProject('SUPERVISOR',null,null,'supervisor',false),true);
  assert.equal(canCreateProject('SUPERVISOR'),true);
  assert.equal(canEditProject('SUPERVISOR'),true);
  assert.equal(canEditDesign('SUPERVISOR'),true);
  assert.equal(canManageCollaborators('SUPERVISOR'),true);
});
