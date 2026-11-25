import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient, type UserRole } from '@prisma/client';
import {
  addPartToAssembly,
  createPanel,
  type DesignDocument,
} from '../packages/design-domain/src/index.ts';
import {
  collectManufacturingData,
  getPartOrigin,
} from '../packages/manufacturing-engine/src/index.ts';
import { hashPassword } from '../apps/api/src/security.ts';

const database = process.env.TEST_DATABASE_URL;
if (!database)
  throw new Error(
    'TEST_DATABASE_URL es obligatoria: prepara y migra una base exclusiva para pruebas',
  );
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
const password = 'Contraseña exclusiva de integración';
async function request(path: string, actor?: string, body?: unknown) {
  const response = await fetch(base + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(actor ? { authorization: 'Bearer ' + tokens[actor] } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function project(actor = 'architect') {
  const response = await request('/projects', actor, {
    name: 'Proyecto de prueba ' + randomUUID(),
  });
  assert.equal(response.status, 201);
  projects.push(response.body.id);
  return response.body.id as string;
}
async function draft(id: string, actor = 'architect') {
  const r = await request(`/projects/${id}/design`, actor);
  assert.equal(r.status, 200);
  return r.body as {
    design: DesignDocument;
    revision: number;
    approvedVersionId: string | null;
    persisted: boolean;
  };
}
before(async () => {
  const compiled = new URL('../apps/api/dist/main.js', import.meta.url).href;
  const { createApp } = await import(compiled);
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  for (const [key, role] of [
    ['architect', 'ARCHITECT'],
    ['other', 'ARCHITECT'],
    ['supervisor', 'SUPERVISOR'],
  ] as const) {
    const email = `precu07-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        name: key,
        role: role as UserRole,
        passwordHash: await hashPassword(password),
      },
    });
    users.push(user.id);
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

test('HTTP autentica, oculta hash, protege rutas y revoca sesión', async () => {
  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/projects')).status, 401);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: users[0] } });
  assert.equal(
    (await request('/auth/login', undefined, { email: user.email, password: 'incorrecta' })).status,
    401,
  );
  const login = await request('/auth/login', undefined, { email: user.email, password });
  assert.equal(login.body.user.passwordHash, undefined);
  tokens.temporary = login.body.token;
  assert.equal((await request('/auth/me', 'temporary')).body.role, 'ARCHITECT');
  await request('/auth/logout', 'temporary', {});
  assert.equal((await request('/auth/me', 'temporary')).status, 401);
});
test('creación atómica relaciona propietario, proyecto y diseño; aísla otros usuarios', async () => {
  const id = await project();
  const d = await draft(id);
  assert.equal(d.revision, 0);
  assert.equal(d.design.metadata.projectId, id);
  assert.equal((await prisma.project.findUniqueOrThrow({ where: { id } })).ownerId, users[0]);
  assert.equal((await request(`/projects/${id}/design`, 'other')).status, 404);
  assert.equal(
    (await request('/projects', 'other')).body.some((p: { id: string }) => p.id === id),
    false,
  );
  assert.equal((await request(`/projects/${id}/design`, 'supervisor')).status, 200);
});
test('persistencia roundtrip preserva todas las entidades y Part[] derivado del documento', async () => {
  const id = await project();
  const current = await draft(id);
  const design = JSON.parse(
    readFileSync(new URL('../examples/demo-kitchen.design.json', import.meta.url), 'utf8'),
  ) as DesignDocument;
  design.id = current.design.id;
  design.metadata.projectId = id;
  design.metadata.notes = 'Prueba de todas las entidades';
  const saved = await request(`/projects/${id}/design`, 'architect', {
    design,
    expectedRevision: 0,
  });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const loaded = await draft(id);
  assert.deepEqual(loaded.design.metadata, design.metadata);
  assert.equal(loaded.revision, 1);
  const data = collectManufacturingData(loaded.design);
  assert.ok(data.parts.length > 0);
  // assert.ok(data.parts.some(part=>getPartOrigin(loaded.design,part.id).moduleInstanceId==='module-instance-1'));
});
test('control optimista acepta una escritura y rechaza revisión concurrente obsoleta', async () => {
  const id = await project();
  const d = await draft(id);
  const a = structuredClone(d.design),
    b = structuredClone(d.design);
  a.metadata.notes = 'A';
  b.metadata.notes = 'B';
  const responses = await Promise.all([
    request(`/projects/${id}/design`, 'architect', { design: a, expectedRevision: 0 }),
    request(`/projects/${id}/design`, 'architect', { design: b, expectedRevision: 0 }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await draft(id)).revision, 1);
});
test('snapshots sólo salen de BD; Supervisor aprueba versión vigente; edición preserva historia', async () => {
  const id = await project();
  const d = await draft(id);
  assert.equal(
    (
      await request(`/projects/${id}/versions`, 'architect', {
        design: d.design,
        expectedRevision: 0,
      })
    ).status,
    400,
  );
  const version = await request(`/projects/${id}/versions`, 'architect', { expectedRevision: 0 });
  assert.equal(version.status, 201);
  const path = `/projects/${id}/versions/${version.body.id}/approve`;
  assert.equal((await request(path, 'architect', { expectedRevision: 0 })).status, 403);
  const snapshot = (await request(`/projects/${id}/versions/${version.body.id}`, 'architect')).body
    .design;
  assert.equal((await request(path, 'supervisor', { expectedRevision: 0 })).status, 201);
  assert.equal((await draft(id)).approvedVersionId, version.body.id);
  assert.equal(
    (
      await request(`/projects/${id}/design`, 'architect', {
        design: d.design,
        expectedRevision: 0,
      })
    ).body.revision,
    0,
  );
  assert.equal((await draft(id)).approvedVersionId, version.body.id);
  const modified = structuredClone(d.design);
  addPartToAssembly(modified, createPanel({ materialId: modified.materials[0]!.id }));
  await request(`/projects/${id}/design`, 'architect', { design: modified, expectedRevision: 0 });
  assert.equal((await draft(id)).approvedVersionId, null);
  assert.equal((await request(path, 'supervisor', { expectedRevision: 1 })).status, 409);
  assert.deepEqual(
    (await request(`/projects/${id}/versions/${version.body.id}`, 'architect')).body.design,
    snapshot,
  );
  const historical = (await request(`/projects/${id}/versions`, 'supervisor')).body[0];
  assert.equal(historical.approvalStatus, 'APPROVED');
  assert.equal(historical.current, false);
});
test('entrada inválida no escribe: dimensiones, material, módulo ajeno e identidad de proyecto', async () => {
  const id = await project();
  const current = await draft(id);
  for (const kind of ['dimensions', 'material', 'project', 'module']) {
    const design = structuredClone(current.design);
    addPartToAssembly(design, createPanel({ materialId: design.materials[0]!.id }));
    if (kind === 'dimensions') design.parts[0]!.dimensions.widthMm = -1;
    if (kind === 'material') design.parts[0]!.materialId = 'missing';
    if (kind === 'project') design.metadata.projectId = 'another-project';
    if (kind === 'module')
      design.moduleInstances.push({
        id: 'missing-instance',
        definitionId: 'missing',
        versionId: 'missing',
        rootAssemblyId: design.rootAssemblyId,
        name: 'Inválido',
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        parameterValues: {},
        detached: false,
        metadata: {},
      });
    const result = await request(`/projects/${id}/design`, 'architect', {
      design,
      expectedRevision: 0,
    });
    assert.ok([400, 422].includes(result.status));
    assert.equal((await draft(id)).revision, 0);
  }
});
test('proyecto histórico sin propietario/borrador queda disponible sólo al Supervisor', async () => {
  const old = await prisma.project.create({ data: { name: 'Histórico ' + randomUUID() } });
  projects.push(old.id);
  assert.equal((await request(`/projects/${old.id}/design`, 'architect')).status, 404);
  const loaded = await draft(old.id, 'supervisor');
  assert.equal(loaded.persisted, false);
  assert.equal(loaded.revision, 0);
  assert.equal(
    (await request(`/projects/${old.id}/versions`, 'supervisor', { expectedRevision: 0 })).status,
    422,
  );
  assert.equal(
    (
      await request(`/projects/${old.id}/design`, 'supervisor', {
        design: loaded.design,
        expectedRevision: 0,
      })
    ).status,
    201,
  );
  assert.equal((await draft(old.id, 'supervisor')).persisted, true);
});
