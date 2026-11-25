import { readFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_ID = 'demo-cocina-l-cu07';
const PROJECT_NAME = 'Cocina en L';

const RESET = process.argv.includes('--reset');

async function main(): Promise<void> {
  const existing = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
  });

  // Evitar duplicados por defecto.
  if (existing && !RESET) {
    console.log(`El proyecto "${existing.name}" ya existe.`);
    console.log('Utiliza --reset para eliminarlo y crearlo de nuevo.');
    return;
  }

  // Cargar el diseño de ejemplo.
  const file = new URL('../examples/demo-kitchen.design.json', import.meta.url);

  const design = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;

  // Validar versión del documento.
  if (design.schemaVersion !== 2) {
    throw new Error('El diseño debe utilizar schemaVersion=2');
  }

  // Actualizar metadatos.
  const metadata = design.metadata;

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('El diseño no contiene metadatos válidos.');
  }

  const designMetadata = metadata as Record<string, unknown>;

  designMetadata.projectId = PROJECT_ID;
  designMetadata.name = PROJECT_NAME;
  designMetadata.draftRevision = 1;

  const revision = 1;

  // Transacción: eliminar y recrear de forma atómica.
  await prisma.$transaction(async (tx) => {
    if (existing && RESET) {
      console.log('Eliminando demo anterior...');

      // Primero eliminar las versiones asociadas.
      await tx.designVersion.deleteMany({
        where: { projectId: PROJECT_ID },
      });

      // Después eliminar el borrador.
      await tx.designDraft.deleteMany({
        where: { projectId: PROJECT_ID },
      });

      // Finalmente eliminar el proyecto.
      await tx.project.delete({
        where: { id: PROJECT_ID },
      });
    }

    // Crear proyecto.
    await tx.project.create({
      data: {
        id: PROJECT_ID,
        name: PROJECT_NAME,
      },
    });

    // Crear borrador.
    await tx.designDraft.create({
      data: {
        projectId: PROJECT_ID,
        schemaVersion: 2,
        revision,
        designJson: design as Prisma.InputJsonValue,
      },
    });

    // Crear versión para aprobación.
    await tx.designVersion.create({
      data: {
        projectId: PROJECT_ID,
        schemaVersion: 2,
        revision,
        approvalStatus: 'DRAFT',
        designJson: design as Prisma.InputJsonValue,
      },
    });
  });

  console.log('');
  console.log('Proyecto creado correctamente.');
  console.log(`Nombre: ${PROJECT_NAME}`);
  console.log(`ID: ${PROJECT_ID}`);
  console.log(`Revisión: ${revision}`);
  console.log('Estado: DRAFT');
  console.log('');
  console.log('Abre Proyectos > Revisar versiones.');
  console.log('Inicia sesión como Supervisor para aprobar la revisión 1.');
}

main()
  .catch((error) => {
    console.error('No fue posible crear la demo:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
