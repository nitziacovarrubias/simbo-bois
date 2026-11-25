import { readFile } from 'node:fs/promises';
import { hashPassword } from '../apps/api/src/security.ts';
import { Prisma, PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

async function main(): Promise<void> {
  const project = await prisma.project.upsert({
    where: { id: 'demo-project' },
    create: { id: 'demo-project', name: 'SIMBO Demo — Baseline 1.0' },
    update: {},
  });

  const demoRaw = await readFile(
    new URL('../examples/demo-kitchen.design.json', import.meta.url),
    'utf8',
  );
  const demoDesign = JSON.parse(demoRaw) as Record<string, unknown>;
  const metadata = demoDesign.metadata as Record<string, unknown>;
  metadata.projectId = project.id;
  await prisma.designDraft.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      schemaVersion: Number(demoDesign.schemaVersion),
      revision: Number(metadata.draftRevision ?? 0),
      designJson: demoDesign as Prisma.InputJsonValue,
    },
    update: {},
  });

  const definitions = demoDesign.moduleDefinitions as Array<Prisma.InputJsonObject>;
  const versions = demoDesign.moduleVersions as Array<Prisma.InputJsonObject>;
  const definition = definitions[0]!;
  const version = versions.find((value) => value.id === definition.currentVersionId)!;
  await prisma.moduleCatalogEntry.upsert({
    where: { definitionId: String(definition.id) },
    create: {
      definitionId: String(definition.id),
      name: String(definition.name),
      definitionJson: definition,
      versionJson: version,
    },
    update: {},
  });

  for (const role of ['SUPERVISOR', 'ARCHITECT', 'COLLABORATOR'] as const) {
    const email = process.env[`BOOTSTRAP_${role}_EMAIL`]?.trim().toLowerCase();
    const password = process.env[`BOOTSTRAP_${role}_PASSWORD`];
    if (!email && !password) continue;
    if (!email || !password) throw new Error(`Completa correo y contraseña de BOOTSTRAP_${role}`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error(`Correo BOOTSTRAP_${role} inválido`);
    if (await prisma.user.findUnique({ where: { email } })) continue;
    await prisma.user.create({
      data: {
        email,
        name: process.env[`BOOTSTRAP_${role}_NAME`]?.trim() || role,
        role,
        passwordHash: await hashPassword(password),
      },
    });
  }

  console.log(`Seed project: ${project.id}; design: demo-kitchen; module: ${definition.id}`);
}

main()
  .catch((error) => {
    console.error('No se pudo ejecutar el seed de SIMBO.', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
