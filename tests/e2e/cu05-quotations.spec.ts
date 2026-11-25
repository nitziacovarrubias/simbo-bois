import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  addPartToAssembly,
  createPanel,
  type DesignDocument,
} from '../../packages/design-domain/src/index.ts';
import { hashPassword } from '../../apps/api/src/security.ts';

const API_URL = process.env.VITE_API_URL ?? 'http://127.0.0.1:3001/api';
const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const password = 'Contraseña de E2E cotizaciones 2026';
const supervisorEmail = `cu05-sup-${randomUUID()}@example.test`;
const architectEmail = `cu05-arq-${randomUUID()}@example.test`;

let supervisorId: string;
let architectId: string;
let supervisorToken: string;
let architectToken: string;

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function formatCents(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

interface QuotationApiResponse {
  id: string;
  revision: number;
  createdAt: string;
  materialSubtotalCents: number;
  laborCostCents: number;
  totalCents: number;
  calculation: {
    lines: Array<{
      cuttingListRowId: string;
      name: string;
      materialId: string;
      thicknessMm: number;
      quantity: number;
      areaM2: number;
      pricePerSquareMeterCents: number;
      amountCents: number;
    }>;
  };
}

interface SeedProjectOptions {
  name: string;
  ownerEmail?: string;
  panelCount?: number;
  useMultipleMaterials?: boolean;
  approve?: boolean;
}

async function apiJson<T>(
  path: string,
  token?: string,
  body?: unknown,
  method?: 'GET' | 'POST'
): Promise<T> {
  const resolvedMethod = method ?? (body === undefined ? 'GET' : 'POST');
  const response = await fetch(`${API_URL}${path}`, {
    method: resolvedMethod,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`API ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data as T;
}

async function loginApi(email: string): Promise<string> {
  const session = await apiJson<{ token: string }>('/auth/login', undefined, {
    email,
    password,
  });
  return session.token;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);

  const passwordHash = await hashPassword(password);
  const [supervisor, architect] = await Promise.all([
    prisma.user.create({
      data: {
        email: supervisorEmail,
        name: 'Supervisor CU05',
        role: 'SUPERVISOR',
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: architectEmail,
        name: 'Arquitecto CU05',
        role: 'ARCHITECT',
        passwordHash,
      },
    }),
  ]);
  supervisorId = supervisor.id;
  architectId = architect.id;

  [supervisorToken, architectToken] = await Promise.all([
    loginApi(supervisorEmail),
    loginApi(architectEmail),
  ]);

  // Warm up Vite once so initial dep pre-bundling does not eat into test timeouts
  const page = await browser.newPage();
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.getByLabel('Correo electrónico', { exact: true }).waitFor({ timeout: 90_000 });
  } finally {
    await page.close();
  }
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  try {
    const diag = await page.evaluate(() => ({
      url: location.href,
      projectCards: [...document.querySelectorAll('.project-list article h2')].map((el) =>
        el.textContent?.trim()
      ),
      alerts: [...document.querySelectorAll('[role="alert"]')].map((el) =>
        el.textContent?.trim()
      ),
      bodySample: document.body.innerText.slice(0, 500),
    }));
    console.log(`\n=== DIAG [${testInfo.title}] ===\n`, JSON.stringify(diag, null, 2));
  } catch {
    // Ignore diagnostic failures if page is already closed
  }
});

test.afterAll(async () => {
  const userIds = [supervisorId, architectId].filter(Boolean);
  if (userIds.length > 0) {
    // Delete quotations first because Quotation.version and Quotation.createdBy use onDelete: Restrict
    await prisma.quotation.deleteMany({
      where: {
        OR: [
          { createdById: { in: userIds } },
          { project: { ownerId: { in: userIds } } },
        ],
      },
    });
    await prisma.project.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

async function seedProject({
  name,
  ownerEmail = supervisorEmail,
  panelCount = 1,
  useMultipleMaterials = false,
  approve = true,
}: SeedProjectOptions) {
  const ownerToken =
    ownerEmail === supervisorEmail ? supervisorToken : architectToken;

  const project = await apiJson<{ id: string }>('/projects', ownerToken, { name });
  const initial = await apiJson<{ design: DesignDocument; revision: number }>(
    `/projects/${project.id}/design`,
    ownerToken
  );

  for (let i = 0; i < panelCount; i += 1) {
    const materialIndex = useMultipleMaterials
      ? i % initial.design.materials.length
      : 0;
    const materialId = initial.design.materials[materialIndex]!.id;
    const panel = createPanel({
      name: `Panel E2E ${i + 1}`,
      materialId,
    });
    addPartToAssembly(initial.design, panel, initial.design.rootAssemblyId);
  }

  const saved = await apiJson<{ revision: number }>(
    `/projects/${project.id}/design`,
    ownerToken,
    {
      design: initial.design,
      expectedRevision: initial.revision,
    }
  );

  const version = await apiJson<{ id: string; revision: number }>(
    `/projects/${project.id}/versions`,
    ownerToken,
    { expectedRevision: saved.revision }
  );

  if (approve) {
    await apiJson(
      `/projects/${project.id}/versions/${version.id}/approve`,
      supervisorToken,
      { expectedRevision: saved.revision }
    );
  }

  return {
    ownerToken,
    supervisorToken,
    projectId: project.id,
    versionId: version.id,
    design: initial.design,
    revision: saved.revision,
  };
}

async function signIn(page: Page, email: string, expectedBadge: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const emailInput = page.getByLabel('Correo electrónico', { exact: true });
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText(expectedBadge, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeEnabled();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
}

function projectRow(page: Page, name: string) {
  return page.locator('.project-list article').filter({
    has: page.getByRole('heading', { name, exact: true }),
  });
}

test('TDD-012: generación correcta de cotización, versión pendiente, teclado y persistencia tras recarga', async ({
  page,
}) => {
  const projectName = `Cotización TDD-012 ${randomUUID().slice(0, 8)}`;
  await seedProject({ name: projectName, panelCount: 1, approve: false });

  await signIn(page, supervisorEmail, 'Supervisor CU05 · Supervisor');
  await projectRow(page, projectName).getByRole('button', { name: 'Revisar versiones' }).click();

  const versionCard = page.locator('.project-version-card').first();
  await expect(versionCard.getByText('Pendiente · Vigente', { exact: true })).toBeVisible();
  // Pending version cannot generate quotations
  await expect(versionCard.getByRole('button', { name: 'Generar cotización' })).toHaveCount(0);

  // Approve version via keyboard activation
  const approveBtn = versionCard.getByRole('button', { name: 'Aprobar diseño' });
  await approveBtn.focus();
  await page.keyboard.press('Enter');
  await expect(versionCard.getByText('Aprobada · Vigente', { exact: true })).toBeVisible();

  // Open quotation form via keyboard
  const openQuotationBtn = versionCard.getByRole('button', { name: 'Generar cotización' });
  await openQuotationBtn.focus();
  await page.keyboard.press('Enter');

  const panel = page.locator('.quotation-panel');
  await expect(panel).toBeVisible();

  const form = panel.locator('.quotation-form');
  const rateInputs = form.locator('input[id^="rate-"]');
  await expect(rateInputs).toHaveCount(1);

  await rateInputs.first().fill('600.00');
  await form.locator('#quotation-labor-cost').fill('250.50');

  const createResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/quotations') &&
      res.request().method() === 'POST' &&
      res.status() === 201
  );
  await form.getByRole('button', { name: 'Generar cotización', exact: true }).click();
  const created = (await (await createResponsePromise).json()) as QuotationApiResponse;

  expect(created.calculation.lines.length).toBeGreaterThan(0);
  expect(created.laborCostCents).toBe(25050);
  expect(created.totalCents).toBe(created.materialSubtotalCents + created.laborCostCents);

  const expectedSubtotal = formatCents(created.materialSubtotalCents);
  const expectedLabor = formatCents(created.laborCostCents);
  const expectedTotal = formatCents(created.totalCents);
  const firstLine = created.calculation.lines[0]!;

  const result = panel.locator('.quotation-result');
  await expect(result).toBeVisible();
  await expect(result.locator('tbody tr')).toHaveCount(created.calculation.lines.length);
  await expect(result.locator('tbody')).toContainText(firstLine.name);
  await expect(result.locator('tbody')).toContainText(firstLine.areaM2.toFixed(4));
  await expect(result.locator('tbody')).toContainText(
    formatCents(firstLine.pricePerSquareMeterCents)
  );
  await expect(result.locator('tbody')).toContainText(formatCents(firstLine.amountCents));

  const totals = result.locator('.quotation-totals');
  await expect(totals).toContainText(expectedSubtotal);
  await expect(totals).toContainText(expectedLabor);
  await expect(totals).toContainText(`${expectedTotal} MXN`);
  // Two-decimal monetary formatting check
  await expect(totals).toContainText(/\$\d[\d,]*\.\d{2}/);

  const historyRows = panel.locator('section[aria-labelledby="quotation-history-title"] tbody tr');
  await expect(historyRows).toHaveCount(1);
  await expect(historyRows.first()).toContainText(`${expectedTotal} MXN`);

  // Reload page and consult persisted quotation without re-executing calculation
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Supervisor CU05 · Supervisor', { exact: true })).toBeVisible();

  let recalculationCalls = 0;
  await page.route('**/api/projects/*/versions/*/*', async (route) => {
    if (route.request().method() === 'POST') {
      recalculationCalls += 1;
    }
    await route.continue();
  });

  await projectRow(page, projectName).getByRole('button', { name: 'Revisar versiones' }).click();
  await page.getByRole('button', { name: 'Ver cotizaciones' }).click();

  const reloadedPanel = page.locator('.quotation-panel');
  const reloadedHistory = reloadedPanel.locator(
    'section[aria-labelledby="quotation-history-title"] tbody tr'
  );
  await expect(reloadedHistory).toHaveCount(1);
  await reloadedHistory.first().getByRole('button', { name: 'Ver detalle' }).click();

  const reloadedResult = reloadedPanel.locator('.quotation-result');
  await expect(reloadedResult).toBeVisible();
  await expect(reloadedResult.locator('.quotation-totals')).toContainText(expectedSubtotal);
  await expect(reloadedResult.locator('.quotation-totals')).toContainText(expectedLabor);
  await expect(reloadedResult.locator('.quotation-totals')).toContainText(`${expectedTotal} MXN`);
  expect(recalculationCalls).toBe(0);
});

test('TDD-013: tarifa faltante o inválida, preservación ante error de conexión y bloqueo de envíos simultáneos', async ({
  page,
}) => {
  const projectName = `Cotización TDD-013 ${randomUUID().slice(0, 8)}`;
  await seedProject({
    name: projectName,
    panelCount: 2,
    useMultipleMaterials: true,
    approve: true,
  });

  await signIn(page, supervisorEmail, 'Supervisor CU05 · Supervisor');
  await projectRow(page, projectName).getByRole('button', { name: 'Revisar versiones' }).click();
  const versionCard = page.locator('.project-version-card').first();
  await versionCard.getByRole('button', { name: 'Generar cotización' }).click();

  const panel = page.locator('.quotation-panel');
  const form = panel.locator('.quotation-form');
  const rateInputs = form.locator('input[id^="rate-"]');
  const laborInput = form.locator('#quotation-labor-cost');
  const submitBtn = form.getByRole('button', { name: 'Generar cotización', exact: true });

  await expect(rateInputs.first()).toBeVisible();
  const rateCount = await rateInputs.count();

  const postRoute = '**/api/projects/*/versions/*/quotations';
  let invalidPostCalls = 0;
  await page.route(postRoute, async (route) => {
    if (route.request().method() === 'POST') invalidPostCalls += 1;
    await route.continue();
  });

  // If multiple materials exist, fill the first and leave the last empty
  if (rateCount > 1) {
    await rateInputs.first().fill('500.00');
  }
  await submitBtn.click();
  await expect(form.getByText('Ingresa una tarifa en MXN por m².')).toBeVisible();
  await expect(
    form.getByText('Corrige los campos marcados antes de generar la cotización.')
  ).toBeVisible();

  // Negative values
  const targetRate = rateInputs.last();
  await targetRate.fill('-50');
  await laborInput.fill('-10');
  await submitBtn.click();
  await expect(
    form.getByText('Debe ser un número mayor a 0 con máximo 2 decimales.')
  ).toBeVisible();
  await expect(
    form.getByText('Debe ser un importe válido mayor o igual a 0 (máx. 2 decimales).')
  ).toBeVisible();

  // More than 2 decimal places
  await targetRate.fill('100.123');
  await laborInput.fill('0.00');
  await submitBtn.click();
  await expect(
    form.getByText('Debe ser un número mayor a 0 con máximo 2 decimales.')
  ).toBeVisible();

  expect(invalidPostCalls).toBe(0);
  await expect(panel.getByText('No hay cotizaciones registradas para este proyecto.')).toBeVisible();

  // Connection error preserves entered rates
  await page.unroute(postRoute);
  await page.route(postRoute, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Error de conexión temporal' }),
      });
      return;
    }
    await route.continue();
  });

  for (let i = 0; i < rateCount; i += 1) {
    await rateInputs.nth(i).fill('625.50');
  }
  await laborInput.fill('120.00');
  await submitBtn.click();

  await expect(form.getByText('Error de conexión temporal')).toBeVisible();
  for (let i = 0; i < rateCount; i += 1) {
    await expect(rateInputs.nth(i)).toHaveValue('625.50');
  }
  await expect(laborInput).toHaveValue('120.00');

  // Simultaneous submissions are prevented while a request is in flight
  await page.unroute(postRoute);
  let concurrentPostCalls = 0;
  let releaseRequest: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route(postRoute, async (route) => {
    if (route.request().method() === 'POST') {
      concurrentPostCalls += 1;
      await gate;
    }
    await route.continue();
  });

  await submitBtn.click();
  await expect(form.getByRole('button', { name: 'Generando cotización...' })).toBeDisabled();
  await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
  releaseRequest?.();

  await expect(panel.locator('.quotation-result')).toBeVisible();
  expect(concurrentPostCalls).toBe(1);
});

test('TDD-014: diseño sin piezas fabricables rechaza la preparación de forma controlada', async ({
  page,
}) => {
  const projectName = `Cotización TDD-014 ${randomUUID().slice(0, 8)}`;
  await seedProject({ name: projectName, panelCount: 0, approve: true });

  await signIn(page, supervisorEmail, 'Supervisor CU05 · Supervisor');
  await projectRow(page, projectName).getByRole('button', { name: 'Revisar versiones' }).click();

  const versionCard = page.locator('.project-version-card').first();
  await expect(versionCard.getByText('Aprobada · Vigente', { exact: true })).toBeVisible();
  await versionCard.getByRole('button', { name: 'Generar cotización' }).click();

  const panel = page.locator('.quotation-panel');
  await expect(panel.locator('.project-error[role="alert"]')).toBeVisible();
  await expect(panel.locator('.quotation-form')).toHaveCount(0);
  await expect(panel.locator('.quotation-result')).toHaveCount(0);
  await expect(panel.getByText('No hay cotizaciones registradas para este proyecto.')).toBeVisible();
});

test('Arquitecto solo lectura, versión histórica conserva importes y cambio de proyecto no mezcla resultados', async ({
  page,
}) => {
  const projectWithQuoteName = `Cotización Arq Hist ${randomUUID().slice(0, 8)}`;
  const emptyOtherProjectName = `Cotización Otro Proy ${randomUUID().slice(0, 8)}`;

  const seeded = await seedProject({
    name: projectWithQuoteName,
    ownerEmail: architectEmail,
    panelCount: 1,
    approve: true,
  });
  await seedProject({
    name: emptyOtherProjectName,
    ownerEmail: supervisorEmail,
    panelCount: 1,
    approve: true,
  });

  // Supervisor generates quotation on Architect's approved project
  await signIn(page, supervisorEmail, 'Supervisor CU05 · Supervisor');
  await projectRow(page, projectWithQuoteName)
    .getByRole('button', { name: 'Revisar versiones' })
    .click();

  const supVersionCard = page.locator('.project-version-card').first();
  await supVersionCard.getByRole('button', { name: 'Generar cotización' }).click();

  const supForm = page.locator('.quotation-panel .quotation-form');
  const supRates = supForm.locator('input[id^="rate-"]');
  await expect(supRates).toHaveCount(1);
  await supRates.first().fill('450.00');
  await supForm.locator('#quotation-labor-cost').fill('100.00');

  const createResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/quotations') &&
      res.request().method() === 'POST' &&
      res.status() === 201
  );
  await supForm.getByRole('button', { name: 'Generar cotización', exact: true }).click();
  const created = (await (await createResponsePromise).json()) as QuotationApiResponse;
  const expectedTotal = `${formatCents(created.totalCents)} MXN`;
  await expect(page.locator('.quotation-result .quotation-totals')).toContainText(expectedTotal);

  // Switching to another project does not mix quotation results
  await projectRow(page, emptyOtherProjectName)
    .getByRole('button', { name: 'Revisar versiones' })
    .click();
  await page.getByRole('button', { name: 'Ver cotizaciones' }).click();
  const otherPanel = page.locator('.quotation-panel');
  await expect(otherPanel).toContainText(emptyOtherProjectName);
  await expect(otherPanel.locator('.quotation-result')).toHaveCount(0);
  await expect(
    otherPanel.getByText('No hay cotizaciones registradas para este proyecto.')
  ).toBeVisible();

  // Save a newer draft so the quoted version becomes Historical
  const updatedDesign: DesignDocument = {
    ...seeded.design,
    metadata: { ...seeded.design.metadata, notes: 'Cambio posterior a cotización' },
  };
  await apiJson(`/projects/${seeded.projectId}/design`, seeded.ownerToken, {
    design: updatedDesign,
    expectedRevision: seeded.revision,
  });

  // Historical version does not allow generating new quotations and preserves original amounts
  await projectRow(page, projectWithQuoteName)
    .getByRole('button', { name: 'Revisar versiones' })
    .click();
  const histVersionCard = page.locator('.project-version-card').first();
  await expect(histVersionCard.getByText('Aprobada · Histórica', { exact: true })).toBeVisible();
  await expect(histVersionCard.getByRole('button', { name: 'Generar cotización' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ver cotizaciones' }).click();
  const histPanel = page.locator('.quotation-panel');
  const histRows = histPanel.locator(
    'section[aria-labelledby="quotation-history-title"] tbody tr'
  );
  await expect(histRows).toHaveCount(1);
  await histRows.first().getByRole('button', { name: 'Ver detalle' }).click();
  await expect(histPanel.locator('.quotation-result .quotation-totals')).toContainText(
    expectedTotal
  );

  await signOut(page);

  // Architect can view quotations in read-only mode but cannot generate them
  await signIn(page, architectEmail, 'Arquitecto CU05 · Arquitecto');
  await projectRow(page, projectWithQuoteName)
    .getByRole('button', { name: 'Revisar versiones' })
    .click();
  await expect(page.getByRole('button', { name: 'Generar cotización' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ver cotizaciones' }).click();
  const arqPanel = page.locator('.quotation-panel');
  await expect(arqPanel.locator('.quotation-form')).toHaveCount(0);

  const arqHistoryRows = arqPanel.locator(
    'section[aria-labelledby="quotation-history-title"] tbody tr'
  );
  await expect(arqHistoryRows).toHaveCount(1);
  await arqHistoryRows.first().getByRole('button', { name: 'Ver detalle' }).click();
  await expect(arqPanel.locator('.quotation-result .quotation-totals')).toContainText(
    expectedTotal
  );
});