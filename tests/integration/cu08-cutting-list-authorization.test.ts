import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type UserRole } from '@prisma/client';
import {
  addPartToAssembly,
  createPanel,
  type DesignDocument
} from '../../packages/design-domain/src/index.ts';
import { hashPassword } from '../../apps/api/src/security.ts';

const database = process.env.TEST_DATABASE_URL;
if (!database) {
  throw new Error(
    'TEST_DATABASE_URL es obligatoria: prepara y migra una base exclusiva para pruebas'
  );
}
process.env.DATABASE_URL = database;

const prisma = new PrismaClient();
const users: string[] = [];
const projects: string[] = [];
let app: {
  listen: (port: number, host: string) => Promise<unknown>;
  getUrl: () => Promise<string>;
  close: () => Promise<void>;
};
let base: string;
const tokens: Record<string, string> = {};
const userIds: Record<string, string> = {};
const password = 'Contraseña exclusiva de integración';

async function request(path: string, actor?: string, body?: unknown) {
  const response = await fetch(base + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(actor ? { authorization: 'Bearer ' + tokens[actor] } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}

async function createProject(actor = 'architect') {
  const response = await request('/projects', actor, {
    name: 'Proyecto CU08 ' + randomUUID()
  });
  assert.equal(response.status, 201);
  projects.push(response.body.id);
  return response.body.id as string;
}

async function getDraft(id: string, actor = 'architect') {
  const r = await request(`/projects/${id}/design`, actor);
  assert.equal(r.status, 200);
  return r.body as {
    design: DesignDocument;
    revision: number;
    approvedVersionId: string | null;
    persisted: boolean;
  };
}

async function prepareApprovedProjectWithParts() {
  const projectId = await createProject('architect');
  const current = await getDraft(projectId, 'architect');
  const design = structuredClone(current.design);
  addPartToAssembly(
    design,
    createPanel({
      name: 'Costado Izquierdo',
      materialId: design.materials[0]!.id
    })
  );

  const saved = await request(`/projects/${projectId}/design`, 'architect', {
    design,
    expectedRevision: 0
  });
  assert.equal(saved.status, 201);

  const versionRes = await request(
    `/projects/${projectId}/versions`,
    'architect',
    { expectedRevision: 1 }
  );
  assert.equal(versionRes.status, 201);
  const versionId = versionRes.body.id as string;

  const approveRes = await request(
    `/projects/${projectId}/versions/${versionId}/approve`,
    'supervisor',
    { expectedRevision: 1 }
  );
  assert.equal(approveRes.status, 201);

  return { projectId, versionId, revision: 1, design };
}

before(async () => {
  const compiled = new URL('../../apps/api/dist/main.js', import.meta.url).href;
  const { createApp } = await import(compiled);
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();

  for (const [key, role] of [
    ['architect', 'ARCHITECT'],
    ['other', 'ARCHITECT'],
    ['supervisor', 'SUPERVISOR'],
    ['supervisor2', 'SUPERVISOR']
  ] as const) {
    const email = `cu08-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        name: key,
        role: role as UserRole,
        passwordHash: await hashPassword(password)
      }
    });
    users.push(user.id);
    userIds[key] = user.id;
    const login = await request('/auth/login', undefined, { email, password });
    assert.equal(login.status, 201);
    tokens[key] = login.body.token;
  }
});

after(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projects } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
  await app?.close();
});

test('TDD-018: Autorización correcta del despiece, persistencia, idempotencia y concurrencia', async () => {
  const { projectId, versionId, revision } =
    await prepareApprovedProjectWithParts();

  // Consulta previa sin autorización devuelve authorized: false
  const beforeGet = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorization`,
    'supervisor'
  );
  assert.equal(beforeGet.status, 200);
  assert.deepEqual(beforeGet.body, {
    authorized: false,
    authorization: null
  });

  // Generar despiece de referencia
  const generated = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list`,
    'supervisor',
    {}
  );
  assert.equal(generated.status, 201);

  // Dos solicitudes simultáneas no crean dos autorizaciones y devuelven HTTP 200
  const [auth1, auth2] = await Promise.all([
    request(
      `/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,
      'supervisor',
      { expectedRevision: revision }
    ),
    request(
      `/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,
      'supervisor2',
      { expectedRevision: revision }
    )
  ]);

  assert.equal(auth1.status, 200);
  assert.equal(auth2.status, 200);
  assert.equal(auth1.body.id, auth2.body.id);

  // Verificar campos de la autorización
  const firstAuth = auth1.body;
  assert.equal(firstAuth.projectId, projectId);
  assert.equal(firstAuth.versionId, versionId);
  assert.equal(firstAuth.revision, revision);
  assert.ok(firstAuth.authorizedById);
  assert.ok(firstAuth.authorizedAt);
  assert.deepEqual(firstAuth.cuttingList, generated.body);

  // Solicitud repetida conserva responsable, fecha e id originales
  const repeated = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,
    'supervisor2',
    { expectedRevision: revision }
  );
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.id, firstAuth.id);
  assert.equal(repeated.body.authorizedById, firstAuth.authorizedById);
  assert.equal(repeated.body.authorizedAt, firstAuth.authorizedAt);
  assert.deepEqual(repeated.body.cuttingList, firstAuth.cuttingList);

  // Consultar autorización mediante GET
  const getAuth = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorization`,
    'supervisor'
  );
  assert.equal(getAuth.status, 200);
  assert.equal(getAuth.body.authorized, true);
  assert.deepEqual(getAuth.body.authorization, firstAuth);

  // Verificar registro único en PostgreSQL
  const dbCount = await prisma.cuttingListAuthorization.count({
    where: { versionId }
  });
  assert.equal(dbCount, 1);
});

test('TDD-019: Autorización y consulta sin permisos son rechazadas (HTTP 401 y 403)', async () => {
  const { projectId, versionId, revision } =
    await prepareApprovedProjectWithParts();

  // Sin autenticar -> 401
  const unauthPost = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,
    undefined,
    { expectedRevision: revision }
  );
  assert.equal(unauthPost.status, 401);

  // Arquitecto intenta autorizar -> 403
  const archPost = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,
    'architect',
    { expectedRevision: revision }
  );
  assert.equal(archPost.status, 403);

  // Arquitecto intenta consultar autorización -> 403
  const archGet = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorization`,
    'architect'
  );
  assert.equal(archGet.status, 403);

  // Comprobar con Supervisor que no existe autorización registrada
  const supGet = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorization`,
    'supervisor'
  );
  assert.equal(supGet.status, 200);
  assert.equal(supGet.body.authorized, false);
  assert.equal(supGet.body.authorization, null);
});

test('TDD-020: Despiece desactualizado se rechaza (409), pero autorización histórica se conserva y puede consultarse', async () => {
  // Caso A: Versión aprobada que nunca se autorizó y luego el diseño cambió
  const { projectId, versionId, design } =
    await prepareApprovedProjectWithParts();

  const modified = structuredClone(design);
  modified.metadata.notes = 'Cambio posterior a la aprobación';
  const saveRes = await request(`/projects/${projectId}/design`, 'architect', {
    design: modified,
    expectedRevision: 1
  });
  assert.equal(saveRes.status, 201);
  assert.equal(saveRes.body.revision, 2);

  // Intentar autorizar versión anterior con revisión vieja o nueva -> 409
  const staleAttempt1 = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,
    'supervisor',
    { expectedRevision: 1 }
  );
  assert.equal(staleAttempt1.status, 409);

  const staleAttempt2 = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,
    'supervisor',
    { expectedRevision: 2 }
  );
  assert.equal(staleAttempt2.status, 409);

  const checkEmpty = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorization`,
    'supervisor'
  );
  assert.equal(checkEmpty.body.authorized, false);

  // Caso B: Versión autorizada que luego pasa a ser histórica al modificar el diseño
  const hist = await prepareApprovedProjectWithParts();
  const snapshotBefore = await getDraft(hist.projectId, 'supervisor');

  const authRes = await request(
    `/projects/${hist.projectId}/versions/${hist.versionId}/cutting-list/authorize`,
    'supervisor',
    { expectedRevision: hist.revision }
  );
  assert.equal(authRes.status, 200);

  // Verificar que autorizar no modificó DesignDocument ni estado de aprobación
  const snapshotAfter = await getDraft(hist.projectId, 'supervisor');
  assert.deepEqual(snapshotAfter.design, snapshotBefore.design);
  assert.equal(snapshotAfter.approvedVersionId, hist.versionId);

  // Modificar el diseño para volver histórica la versión autorizada
  const modHist = structuredClone(hist.design);
  addPartToAssembly(
    modHist,
    createPanel({
      name: 'Entrepaño Nuevo',
      materialId: modHist.materials[0]!.id
    })
  );
  const savedHist = await request(
    `/projects/${hist.projectId}/design`,
    'architect',
    { design: modHist, expectedRevision: 1 }
  );
  assert.equal(savedHist.status, 201);

  // Intentar re-autorizar la versión histórica debe rechazarse con 409
  const reauthStale = await request(
    `/projects/${hist.projectId}/versions/${hist.versionId}/cutting-list/authorize`,
    'supervisor',
    { expectedRevision: 2 }
  );
  assert.equal(reauthStale.status, 409);

  // Pero consultar la autorización histórica con GET sigue disponible e intacta
  const getHistorical = await request(
    `/projects/${hist.projectId}/versions/${hist.versionId}/cutting-list/authorization`,
    'supervisor'
  );
  assert.equal(getHistorical.status, 200);
  assert.equal(getHistorical.body.authorized, true);
  assert.deepEqual(getHistorical.body.authorization, authRes.body);
});

test('Validaciones adicionales: versión DRAFT, otro proyecto, expectedRevision incorrecto y despiece inválido', async () => {
  // 1. Diseño sin piezas fabricables -> 422 al intentar autorizar
  const emptyProjectId = await createProject('architect');
  const emptyVersion = await request(
    `/projects/${emptyProjectId}/versions`,
    'architect',
    { expectedRevision: 0 }
  );
  assert.equal(emptyVersion.status, 201);

  // Intentar autorizar en estado DRAFT -> 409
  const draftAuth = await request(
    `/projects/${emptyProjectId}/versions/${emptyVersion.body.id}/cutting-list/authorize`,
    'supervisor',
    { expectedRevision: 0 }
  );
  assert.equal(draftAuth.status, 409);

  // Aprobar versión sin piezas e intentar autorizar -> 422
  await request(
    `/projects/${emptyProjectId}/versions/${emptyVersion.body.id}/approve`,
    'supervisor',
    { expectedRevision: 0 }
  );
  const invalidCuttingAuth = await request(
    `/projects/${emptyProjectId}/versions/${emptyVersion.body.id}/cutting-list/authorize`,
    'supervisor',
    { expectedRevision: 0 }
  );
  assert.equal(invalidCuttingAuth.status, 422);

  // 2. expectedRevision incorrecto y versión de otro proyecto
  const { projectId, versionId } = await prepareApprovedProjectWithParts();

  const wrongRev = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,
    'supervisor',
    { expectedRevision: 99 }
  );
  assert.equal(wrongRev.status, 409);

  const crossProject = await request(
    `/projects/${emptyProjectId}/versions/${versionId}/cutting-list/authorize`,
    'supervisor',
    { expectedRevision: 1 }
  );
  assert.equal(crossProject.status, 404);
});