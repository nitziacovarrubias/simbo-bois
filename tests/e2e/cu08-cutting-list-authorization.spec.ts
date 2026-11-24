import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { addPartToAssembly, createPanel, type DesignDocument } from '../../packages/design-domain/src/index.ts';
import { hashPassword } from '../../apps/api/src/security.ts';

const API_URL = process.env.VITE_API_URL ?? 'http://127.0.0.1:3001/api';
const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const supervisorEmail = `cu08-e2e-sup-${randomUUID()}@example.test`;
const password = 'Contraseña de E2E únicamente 2026';
let supervisorId: string;

test.beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: supervisorEmail,
      name: 'Supervisor CU08 E2E',
      role: 'SUPERVISOR',
      passwordHash: await hashPassword(password)
    }
  });
  supervisorId = user.id;
});

test.afterAll(async () => {
  if (supervisorId) {
    await prisma.project.deleteMany({ where: { ownerId: supervisorId } });
    await prisma.user.delete({ where: { id: supervisorId } });
  }
  await prisma.$disconnect();
});

async function apiJson<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`API ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data as T;
}

async function seedApprovedProject(name: string) {
  const session = await apiJson<{ token: string }>('/auth/login', undefined, {
    email: supervisorEmail,
    password
  });
  const project = await apiJson<{ id: string }>('/projects', session.token, { name });
  const initial = await apiJson<{ design: DesignDocument; revision: number }>(
    `/projects/${project.id}/design`,
    session.token
  );
  const materialId = initial.design.materials[0]!.id;
  const panel = createPanel({
    name: 'Lateral E2E',
    materialId
  });
  addPartToAssembly(initial.design, panel, initial.design.rootAssemblyId);
  const saved = await apiJson<{ revision: number }>(`/projects/${project.id}/design`, session.token, {
    design: initial.design,
    expectedRevision: initial.revision
  });
  const version = await apiJson<{ id: string; revision: number }>(
    `/projects/${project.id}/versions`,
    session.token,
    { expectedRevision: saved.revision }
  );
  await apiJson(
    `/projects/${project.id}/versions/${version.id}/approve`,
    session.token,
    { expectedRevision: saved.revision }
  );
  return {
    token: session.token,
    projectId: project.id,
    versionId: version.id,
    design: initial.design,
    revision: saved.revision
  };
}

async function signInSupervisor(page: Page) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill(supervisorEmail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Supervisor CU08 E2E · Supervisor')).toBeVisible();
}

function projectCard(page: Page, name: string) {
  return page.locator('.project-list article').filter({
    has: page.getByRole('heading', { name })
  });
}

test('CU08-02: generar despiece, confirmar autorización, persistir tras recarga y consultar historial', async ({ page }) => {
  const name = `CU08-02 E2E ${randomUUID()}`;
  const seeded = await seedApprovedProject(name);

  await signInSupervisor(page);
  await projectCard(page, name).getByRole('button', { name: 'Revisar versiones' }).click();
  await expect(page.getByText('Aprobada · Vigente')).toBeVisible();

  await page.getByRole('button', { name: 'Generar despiece' }).click();
  await expect(page.locator('.cutting-table tbody')).toContainText('Lateral E2E');
  await expect(page.getByText('Estado: Pendiente de autorización')).toBeVisible();

  await page.getByRole('button', { name: 'Autorizar despiece' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('¿Autorizar este despiece?');
  await dialog.getByRole('button', { name: 'Confirmar autorización' }).click();

  await expect(page.getByText('El despiece se autorizó correctamente.')).toBeVisible();
  await expect(page.getByText('Estado: Autorizado · Vigente')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Autorizar despiece' })).toHaveCount(0);

  await page.reload();
  await projectCard(page, name).getByRole('button', { name: 'Revisar versiones' }).click();
  await page.getByRole('button', { name: 'Ver autorización' }).click();
  await expect(page.getByText('Estado: Autorizado · Vigente')).toBeVisible();
  await expect(page.locator('.cutting-auth-table tbody')).toContainText('Lateral E2E');

  const updatedDesign: DesignDocument = {
    ...seeded.design,
    metadata: { ...seeded.design.metadata, notes: 'Cambio posterior a autorización' }
  };
  await apiJson(`/projects/${seeded.projectId}/design`, seeded.token, {
    design: updatedDesign,
    expectedRevision: seeded.revision
  });

  await page.reload();
  await projectCard(page, name).getByRole('button', { name: 'Revisar versiones' }).click();
  await expect(page.getByText('Aprobada · Histórica')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generar despiece' })).toBeDisabled();

  await page.getByRole('button', { name: 'Ver autorización' }).click();
  await expect(page.getByText('Estado: Autorizado · Histórico')).toBeVisible();
  await expect(page.locator('.cutting-auth-table tbody')).toContainText('Lateral E2E');
  await expect(page.getByRole('button', { name: 'Autorizar despiece' })).toHaveCount(0);
});