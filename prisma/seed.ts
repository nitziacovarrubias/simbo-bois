import { readFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const project = await prisma.project.upsert({
    where: { id: 'demo-project' },
    create: { id: 'demo-project', name: 'SIMBO Demo — Baseline 1.0' },
    update: { name: 'SIMBO Demo — Baseline 1.0' }
  });

  const demoRaw = await readFile(new URL('../examples/demo-kitchen.design.json', import.meta.url), 'utf8');
  const demoDesign = JSON.parse(demoRaw) as Record<string, unknown>;
  const metadata = demoDesign.metadata as Record<string, unknown>;
  metadata.projectId = project.id;
  await prisma.designDraft.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      schemaVersion: Number(demoDesign.schemaVersion),
      revision: Number(metadata.draftRevision ?? 0),
      designJson: demoDesign as Prisma.InputJsonValue
    },
    update: {
      schemaVersion: Number(demoDesign.schemaVersion),
      revision: Number(metadata.draftRevision ?? 0),
      designJson: demoDesign as Prisma.InputJsonValue
    }
  });

  const definition = {
    id: 'demo-module-definition',
    name: 'Módulo demostrativo data-driven',
    description: 'DEMO / SUPOSICIÓN: no representa un estándar BOIS',
    parameterDefinitions: [{ id: 'demo-width', key: 'width', label: 'Ancho', type: 'NUMBER', defaultValue: 800, unit: 'mm', min: 300, max: 1600, step: 1, ui: 'INPUT' }],
    snapDefinitions: [{ id: 'demo-snap-back', name: 'Conexión pared trasera', position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: -1 }, compatibleTypes: ['WALL', 'MODULE'], metadata: { demo: true } }],
    versionIds: ['demo-module-v1'],
    currentVersionId: 'demo-module-v1',
    tags: ['DEMO'],
    metadata: { demo: true }
  };
  const version = {
    id: 'demo-module-v1',
    definitionId: definition.id,
    version: 1,
    createdAt: new Date().toISOString(),
    immutable: true,
    snapshot: {
      rootAssemblyId: 'demo-root',
      parts: [],
      assemblies: [{ id: 'demo-root', name: 'Módulo demostrativo raíz', children: [], transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, metadata: { demo: true } }],
      constraints: [], bindings: [], joints: [], hardwareDefinitions: [], hardwareInstances: [], machiningFeatures: [], kinematics: [], materials: [], snapDefinitions: [], parameterBindings: []
    }
  };
  await prisma.moduleCatalogEntry.upsert({
    where: { definitionId: definition.id },
    create: { definitionId: definition.id, name: definition.name, definitionJson: definition, versionJson: version },
    update: { name: definition.name, definitionJson: definition, versionJson: version }
  });

  console.log(`Seed project: ${project.id}; design: demo-kitchen; module: ${definition.id}`);
}

main()
  .catch(error => {
    console.error('No se pudo ejecutar el seed de SIMBO.', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
