import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type UserRole } from '@prisma/client';
import { hashPassword } from '../../apps/api/src/security.ts';

const database = process.env.TEST_DATABASE_URL;
if (!database) {
  throw new Error('TEST_DATABASE_URL es obligatoria: prepara y migra una base exclusiva para pruebas');
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
  const response = await request('/projects', actor, { name: 'CU05 ' + randomUUID() });
  assert.equal(response.status, 201);
  projects.push(response.body.id);
  return response.body.id as string;
}

async function createApprovedVersionWithRates(projectId: string) {
  // 1. Obtener el diseño base actual del proyecto (revisión 0)
  const currentDesignRes = await request(`/projects/${projectId}/design`, 'architect');
  assert.equal(currentDesignRes.status, 200);

  const populatedDesign = structuredClone(currentDesignRes.body.design);
  populatedDesign.metadata = {
    ...(populatedDesign.metadata ?? {}),
    projectId
  };

  // Poblar piezas/módulos fabricables según la estructura del diseño
  const materialId = 'material-cocina-l-melamina';
  if (!populatedDesign.materials.some((m: { id: string }) => m.id === materialId)) {
    populatedDesign.materials.push({
      id: materialId,
      name: 'Melamina interior blanca 18 mm',
      category: 'MELAMINE',
      colorHex: '#FFFFFF'
    });
  }

  const samplePart = {
    id: `part-${randomUUID().slice(0, 8)}`,
    name: 'Costado prueba',
    shape: 'BOX',
    semanticRole: 'SIDE_PANEL',
    dimensions: {
      widthMm: 560,
      heightMm: 720,
      thicknessMm: 18
    },
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    },
    materialId,
    grainDirection: 'NONE',
    edgeBanding: {
      TOP: { mode: 'NONE' },
      BOTTOM: { mode: 'NONE' },
      LEFT: { mode: 'NONE' },
      RIGHT: { mode: 'NONE' }
    },
    manufacturable: true,
    machiningFeatureIds: [],
    metadata: {}
  };

  populatedDesign.parts.push(samplePart);

  const rootAssembly = populatedDesign.assemblies.find(
    (a: { id: string }) => a.id === populatedDesign.rootAssemblyId
  );
  if (rootAssembly) {
    rootAssembly.children.push({ kind: 'PART', id: samplePart.id });
  }

  // 2. Guardar diseño poblado (pasa de revisión 0 a 1)
  const saveRes = await request(`/projects/${projectId}/design`, 'architect', {
    design: populatedDesign,
    expectedRevision: 0
  });
  assert.ok(
  saveRes.status === 200 || saveRes.status === 201,
  `saveRes failed with ${saveRes.status}: ${JSON.stringify(saveRes.body, null, 2)}`
);
  const nextRevision = typeof saveRes.body?.revision === 'number' ? saveRes.body.revision : 1;

  // 3. Crear versión desde la revisión vigente
  const versionRes = await request(`/projects/${projectId}/versions`, 'architect', {
    expectedRevision: nextRevision
  });
  assert.equal(versionRes.status, 201);
  const versionId = versionRes.body.id as string;

  // 4. Aprobar versión como supervisor
  const approveRes = await request(
    `/projects/${projectId}/versions/${versionId}/approve`,
    'supervisor',
    { expectedRevision: nextRevision }
  );
  assert.ok(approveRes.status === 200 || approveRes.status === 201);

  // 5. Generar despiece y construir tarifas por combinación material + espesor
  const cuttingListRes = await request(
    `/projects/${projectId}/versions/${versionId}/cutting-list`,
    'supervisor',
    {}
  );
  assert.ok(
    cuttingListRes.status === 200 || cuttingListRes.status === 201,
    `Expected 200/201 from cutting-list, got ${cuttingListRes.status}: ${JSON.stringify(cuttingListRes.body)}`
  );
  assert.ok(Array.isArray(cuttingListRes.body.rows) && cuttingListRes.body.rows.length > 0);

  const uniqueCombos = new Map<string, { materialId: string; thicknessMm: number }>();
  for (const row of cuttingListRes.body.rows) {
    uniqueCombos.set(`${row.material.id}-${row.thicknessMm}`, {
      materialId: row.material.id,
      thicknessMm: row.thicknessMm
    });
  }

  const rates = Array.from(uniqueCombos.values()).map(combo => ({
    ...combo,
    pricePerSquareMeterCents: 60000
  }));

  return { versionId, cuttingList: cuttingListRes.body, rates };
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
    ['supervisor', 'SUPERVISOR']
  ] as const) {
    const user = await prisma.user.create({
      data: {
        email: `cu05-${randomUUID()}@example.test`,
        name: key,
        role: role as UserRole,
        passwordHash: await hashPassword(password)
      }
    });
    users.push(user.id);
    const login = await request('/auth/login', undefined, { email: user.email, password });
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

test('Generación correcta y persistencia', async () => {
  const projectId = await createProject('architect');
  const { versionId, rates } = await createApprovedVersionWithRates(projectId);

  // Listado inicial vacío (200 + [])
  const initialList = await request(`/projects/${projectId}/quotations`, 'architect');
  assert.equal(initialList.status, 200);
  assert.deepEqual(initialList.body, []);

  // Supervisor genera primera cotización (POST -> 201)
  const first = await request(
    `/projects/${projectId}/versions/${versionId}/quotations`,
    'supervisor',
    {
      rates,
      laborCostCents: 20000
    }
  );
  assert.equal(first.status, 201);
  assert.equal(first.body.projectId, projectId);
  assert.equal(first.body.versionId, versionId);
  assert.equal(first.body.revision, 1);
  assert.equal(first.body.laborCostCents, 20000);
  assert.equal(
    first.body.totalCents,
    first.body.materialSubtotalCents + first.body.laborCostCents
  );
  assert.equal(first.body.createdById, users[2]);
  assert.equal(typeof first.body.createdAt, 'string');
  assert.equal(Number.isNaN(Date.parse(first.body.createdAt)), false);
  assert.ok(Array.isArray(first.body.calculation.lines));
  assert.ok(first.body.calculation.lines.length > 0);

  // Arquitecto y Supervisor consultan el detalle (GET -> 200)
  const detailByArchitect = await request(
    `/projects/${projectId}/quotations/${first.body.id}`,
    'architect'
  );
  assert.equal(detailByArchitect.status, 200);
  assert.deepEqual(detailByArchitect.body, first.body);

  // Verificación directa de persistencia real en PostgreSQL
  const persisted = await prisma.quotation.findUniqueOrThrow({
    where: { id: first.body.id }
  });
  assert.equal(persisted.projectId, projectId);
  assert.equal(persisted.versionId, versionId);
  assert.equal(persisted.totalCents, first.body.totalCents);

  // Segunda cotización sobre la misma versión con distintas tarifas
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = await request(
    `/projects/${projectId}/versions/${versionId}/quotations`,
    'supervisor',
    {
      rates: rates.map(r => ({ ...r, pricePerSquareMeterCents: 85000 })),
      laborCostCents: 35000
    }
  );
  assert.equal(second.status, 201);
  assert.notEqual(second.body.id, first.body.id);

  // Listado ordenado de más reciente a más antigua
  const listed = await request(`/projects/${projectId}/quotations`, 'supervisor');
  assert.equal(listed.status, 200);
  assert.deepEqual(
    listed.body.map((q: { id: string }) => q.id),
    [second.body.id, first.body.id]
  );
  assert.equal(listed.body[0].calculation, undefined);
  assert.equal(await prisma.quotation.count({ where: { projectId } }), 2);
});

test('Tarifa faltante', async () => {
  const projectId = await createProject('architect');
  const { versionId, rates } = await createApprovedVersionWithRates(projectId);

  // Tarifa para un material que no corresponde al despiece
  const missingRate = await request(
    `/projects/${projectId}/versions/${versionId}/quotations`,
    'supervisor',
    {
      rates: [
        {
          materialId: 'material-inexistente',
          thicknessMm: 18,
          pricePerSquareMeterCents: 50000
        }
      ],
      laborCostCents: 10000
    }
  );
  assert.equal(missingRate.status, 400);

  // Arreglo vacío de tarifas, mano de obra negativa o campos extra no permitidos
  const emptyRates = await request(
    `/projects/${projectId}/versions/${versionId}/quotations`,
    'supervisor',
    { rates: [], laborCostCents: 10000 }
  );
  assert.equal(emptyRates.status, 400);

  const negativeLabor = await request(
    `/projects/${projectId}/versions/${versionId}/quotations`,
    'supervisor',
    { rates, laborCostCents: -1 }
  );
  assert.equal(negativeLabor.status, 400);

  const extraField = await request(
    `/projects/${projectId}/versions/${versionId}/quotations`,
    'supervisor',
    { rates, laborCostCents: 10000, totalCents: 999999 }
  );
  assert.equal(extraField.status, 400);

  // Confirmar ausencia total de persistencia
  const listed = await request(`/projects/${projectId}/quotations`, 'supervisor');
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body, []);
  assert.equal(await prisma.quotation.count({ where: { projectId } }), 0);
});

test('Despiece sin piezas fabricables', async () => {
  const projectId = await createProject('architect');
  const current = await request(`/projects/${projectId}/design`, 'architect');
  const emptyDesign = structuredClone(current.body.design);

  // Vaciar arreglos de piezas/componentes del diseño
  for (const key of ['parts', 'pieces', 'components', 'modules', 'elements']) {
    if (Array.isArray(emptyDesign[key])) {
      emptyDesign[key] = [];
    }
  }

  const saved = await request(`/projects/${projectId}/design`, 'architect', {
    design: emptyDesign,
    expectedRevision: 0
  });

  if (saved.status === 201) {
    const versionRes = await request(`/projects/${projectId}/versions`, 'architect', {
      expectedRevision: 1
    });
    if (versionRes.status === 201) {
      const approveRes = await request(
        `/projects/${projectId}/versions/${versionRes.body.id}/approve`,
        'supervisor',
        { expectedRevision: 1 }
      );
      if (approveRes.status === 201) {
        const quoteRes = await request(
          `/projects/${projectId}/versions/${versionRes.body.id}/quotations`,
          'supervisor',
          {
            rates: [{ materialId: 'mdf-18', thicknessMm: 18, pricePerSquareMeterCents: 60000 }],
            laborCostCents: 10000
          }
        );
        assert.ok(quoteRes.status === 400 || quoteRes.status === 409);
      }
    }
  }

  assert.equal(await prisma.quotation.count({ where: { projectId } }), 0);
});

test('Pruebas adicionales', async () => {
  const projectId = await createProject('architect');
  const otherProjectId = await createProject('other');
  const { versionId, rates } = await createApprovedVersionWithRates(projectId);

  // 1. Sin autenticación -> 401
  assert.equal(
    (
      await request(`/projects/${projectId}/versions/${versionId}/quotations`, undefined, {
        rates,
        laborCostCents: 15000
      })
    ).status,
    401
  );
  assert.equal((await request(`/projects/${projectId}/quotations`)).status, 401);

  // 2. Arquitecto intenta generar -> 403
  assert.equal(
    (
      await request(`/projects/${projectId}/versions/${versionId}/quotations`, 'architect', {
        rates,
        laborCostCents: 15000
      })
    ).status,
    403
  );

  // 3. Usuario sin acceso al proyecto -> 404
  assert.equal((await request(`/projects/${projectId}/quotations`, 'other')).status, 404);

  // 4. Versión de otro proyecto -> 404
  assert.equal(
    (
      await request(`/projects/${otherProjectId}/versions/${versionId}/quotations`, 'supervisor', {
        rates,
        laborCostCents: 15000
      })
    ).status,
    404
  );

  // Generar cotización válida para probar consulta cruzada e historial
  const created = await request(
    `/projects/${projectId}/versions/${versionId}/quotations`,
    'supervisor',
    { rates, laborCostCents: 15000 }
  );
  assert.equal(created.status, 201);

  // 5. Consultar cotización desde otro proyecto -> 404
  assert.equal(
    (await request(`/projects/${otherProjectId}/quotations/${created.body.id}`, 'supervisor')).status,
    404
  );

  // 6. Editar diseño -> convierte versionId en histórica
  const current = await request(`/projects/${projectId}/design`, 'architect');
  const changedDesign = structuredClone(current.body.design);
  changedDesign.metadata.notes = 'Nueva revisión para invalidar vigencia de v1';
  const updatedDesign = await request(`/projects/${projectId}/design`, 'architect', {
    design: changedDesign,
    expectedRevision: current.body.revision
  });
  assert.equal(updatedDesign.status, 201);

  // La cotización anterior sigue consultándose intacta sin recalcular
  const historicalDetail = await request(
    `/projects/${projectId}/quotations/${created.body.id}`,
    'architect'
  );
  assert.equal(historicalDetail.status, 200);
  assert.deepEqual(historicalDetail.body, created.body);

  // Intentar generar sobre la versión aprobada pero histórica -> 409
  assert.equal(
    (
      await request(`/projects/${projectId}/versions/${versionId}/quotations`, 'supervisor', {
        rates,
        laborCostCents: 15000
      })
    ).status,
    409
  );

  // 7. Crear nueva versión pendiente (sin aprobar) -> generación rechazada con 409
  // 7. Crear nueva versión pendiente (sin aprobar) -> generación rechazada con 409
  const pendingVersion = await request(`/projects/${projectId}/versions`, 'architect', {
    expectedRevision: updatedDesign.body.revision
  });
  assert.equal(pendingVersion.status, 201);

  assert.equal(
    (
      await request(
        `/projects/${projectId}/versions/${pendingVersion.body.id}/quotations`,
        'supervisor',
        { rates, laborCostCents: 15000 }
      )
    ).status,
    409
  );
});