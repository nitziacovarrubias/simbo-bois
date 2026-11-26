import { expect, test, type Page } from '@playwright/test';
import type { DesignChangeProposal } from '@simbo/shared-contracts';

const projectId = 'project-cu03';
const versionId = 'version-cu03';
const createdAt = '2026-11-25T17:00:00.000Z';

interface MockOptions {
  role?: 'ARCHITECT' | 'SUPERVISOR';
  approvalStatus?: 'DRAFT' | 'APPROVED';
  current?: boolean;
  proposals?: DesignChangeProposal[];
  getError?: string;
  postError?: { status: number; message: string };
}

function createProposal(id: string, observation: string): DesignChangeProposal {
  return {
    id,
    projectId,
    versionId,
    observation,
    author: { id: 'user-cu03', name: 'Usuario CU03' },
    createdAt
  };
}

async function mockApi(page: Page, options: MockOptions = {}) {
  const role = options.role ?? 'ARCHITECT';
  const user = {
    id: 'user-cu03',
    name: 'Usuario CU03',
    email: 'cu03@example.test',
    role
  };
  const proposals = [...(options.proposals ?? [])];
  const postBodies: Array<{ observation: string }> = [];
  let proposalListRequests = 0;

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.startsWith('/api')
      ? url.pathname.slice('/api'.length)
      : url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body)
      });

    if (path === '/auth/login') {
      await json({ token: 'token-cu03', user }, 201);
      return;
    }
    if (path === '/auth/me') {
      await json(user);
      return;
    }
    if (path === '/projects' && request.method() === 'GET') {
      await json([{
        id: projectId,
        name: 'Proyecto CU03',
        ownerId: user.id,
        updatedAt: createdAt
      }]);
      return;
    }
    if (path === `/projects/${projectId}/versions` && request.method() === 'GET') {
      await json([{
        id: versionId,
        revision: 1,
        approvalStatus: options.approvalStatus ?? 'DRAFT',
        approvedAt: options.approvalStatus === 'APPROVED' ? createdAt : null,
        approvedById: options.approvalStatus === 'APPROVED' ? 'supervisor-cu03' : null,
        current: options.current ?? true,
        createdAt
      }]);
      return;
    }
    if (path === `/projects/${projectId}/versions/${versionId}/proposals`) {
      if (request.method() === 'GET') {
        proposalListRequests += 1;
        if (options.getError) {
          await json({ message: options.getError }, 503);
          return;
        }
        await json(proposals);
        return;
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { observation: string };
        postBodies.push(body);
        if (options.postError) {
          await json({ message: options.postError.message }, options.postError.status);
          return;
        }
        const proposal = createProposal(`proposal-${postBodies.length}`, body.observation);
        proposals.unshift(proposal);
        await json(proposal, 201);
        return;
      }
    }

    await json({ message: `Ruta de prueba no esperada: ${request.method()} ${path}` }, 404);
  });

  return {
    postBodies,
    getProposalRequestCount: () => proposalListRequests,
    proposals
  };
}

async function openProposalReview(page: Page, role: 'ARCHITECT' | 'SUPERVISOR' = 'ARCHITECT') {
  await page.goto('/');
  await page.getByLabel('Correo electrónico').fill('cu03@example.test');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText(`Usuario CU03 · ${role === 'SUPERVISOR' ? 'Supervisor' : 'Arquitecto'}`)).toBeVisible();
  await page.getByRole('button', { name: 'Revisar versiones' }).click();
  await expect(page.getByText('Revisión 1')).toBeVisible();
  await page.getByRole('button', { name: 'Ver propuestas' }).click();
}

test('TDD-009: registra y vuelve a consultar una propuesta con autor y fecha', async ({ page }) => {
  const api = await mockApi(page);
  await openProposalReview(page);

  const textarea = page.getByLabel('Nueva observación');
  const submit = page.getByRole('button', { name: 'Registrar propuesta' });
  await expect(submit).toBeDisabled();
  await textarea.fill('Revisar la altura del gabinete superior.');
  await expect(submit).toBeEnabled();
  await submit.click();

  const entry = page.locator('.project-proposal-entry');
  await expect(entry).toContainText('Revisar la altura del gabinete superior.');
  await expect(entry).toContainText('Usuario CU03');
  await expect(entry).toContainText(new Date(createdAt).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }));
  expect(api.postBodies).toEqual([{ observation: 'Revisar la altura del gabinete superior.' }]);

  await page.reload();
  await page.getByRole('button', { name: 'Revisar versiones' }).click();
  await page.getByRole('button', { name: 'Ver propuestas' }).click();
  await expect(page.locator('.project-proposal-entry')).toContainText('Revisar la altura del gabinete superior.');
  expect(api.getProposalRequestCount()).toBe(2);
});

test('TDD-010: impide enviar observaciones vacías o compuestas por espacios', async ({ page }) => {
  const api = await mockApi(page);
  await openProposalReview(page);

  const textarea = page.getByLabel('Nueva observación');
  const submit = page.getByRole('button', { name: 'Registrar propuesta' });
  await expect(submit).toBeDisabled();
  await expect(page.getByText('Escribe una observación de hasta 2000 caracteres para habilitar el registro.')).toBeVisible();

  await textarea.fill('   ');
  await expect(submit).toBeDisabled();
  await expect(page.getByText('La observación no puede contener solo espacios.')).toBeVisible();
  expect(api.postBodies).toHaveLength(0);
  await expect(page.getByText('No hay propuestas registradas para esta versión.')).toBeVisible();
});

test('TDD-011: consulta propuestas aprobadas sin ofrecer el formulario', async ({ page }) => {
  const api = await mockApi(page, {
    approvalStatus: 'APPROVED',
    proposals: [createProposal('existing-proposal', 'Ajustar el acabado exterior.')]
  });
  await openProposalReview(page);

  await expect(page.locator('.project-proposal-entry')).toContainText('Ajustar el acabado exterior.');
  await expect(page.getByText('No se pueden registrar propuestas sobre una versión aprobada.')).toBeVisible();
  await expect(page.getByLabel('Nueva observación')).toHaveCount(0);
  expect(api.postBodies).toHaveLength(0);
});

test('Supervisor puede consultar propuestas, pero no registrar', async ({ page }) => {
  const api = await mockApi(page, { role: 'SUPERVISOR' });
  await openProposalReview(page, 'SUPERVISOR');

  await expect(page.getByText('Tu rol permite consultar propuestas, pero no registrarlas.')).toBeVisible();
  await expect(page.getByLabel('Nueva observación')).toHaveCount(0);
  expect(api.postBodies).toHaveLength(0);
});

test('muestra errores HTTP de consulta y registro sin perder la observación', async ({ page }) => {
  const api = await mockApi(page, {
    getError: 'No se pudieron cargar las propuestas (prueba).',
    postError: { status: 403, message: 'No tienes permiso para registrar propuestas (prueba).' }
  });
  await openProposalReview(page);

  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar las propuestas (prueba).');
  const textarea = page.getByLabel('Nueva observación');
  await textarea.fill('Observación que debe conservarse.');
  await page.getByRole('button', { name: 'Registrar propuesta' }).click();

  await expect(page.locator('.project-proposal-form [role="alert"]')).toContainText(
    'No tienes permiso para registrar propuestas (prueba).'
  );
  await expect(textarea).toHaveValue('Observación que debe conservarse.');
  expect(api.postBodies).toEqual([{ observation: 'Observación que debe conservarse.' }]);
});
