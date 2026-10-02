import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CreateProjectRequestSchema, SaveDesignRequestSchema } from '@simbo/shared-contracts';
import { z } from 'zod';

const ModuleCatalogRequestSchema = z.object({
  definitionId: z.string().min(1),
  name: z.string().min(1).max(160),
  definitionJson: z.unknown(),
  versionJson: z.unknown()
});

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
class PrismaService extends PrismaClient {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true, service: 'simbo-api', time: new Date().toISOString() };
  }
}

@Controller('projects')
class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.project.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = CreateProjectRequestSchema.parse(body);
    return this.prisma.project.create({ data: { name: parsed.name } });
  }

  @Get(':id/design')
  async getDesign(@Param('id') id: string) {
    const draft = await this.prisma.designDraft.findUnique({ where: { projectId: id } });
    if (!draft) throw new NotFoundException('Diseño no encontrado');
    return draft.designJson;
  }

  @Post(':id/design')
  async saveDesign(@Param('id') id: string, @Body() body: unknown) {
    const parsed = SaveDesignRequestSchema.parse(body);
    const designJson = toPrismaJson(parsed.design);
    return this.prisma.designDraft.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        schemaVersion: parsed.design.schemaVersion,
        designJson,
        revision: parsed.design.metadata.draftRevision
      },
      update: {
        schemaVersion: parsed.design.schemaVersion,
        designJson,
        revision: parsed.design.metadata.draftRevision
      }
    });
  }

  @Post(':id/versions')
  async version(@Param('id') id: string, @Body() body: unknown) {
    const parsed = SaveDesignRequestSchema.parse(body);
    return this.prisma.designVersion.create({
      data: {
        projectId: id,
        schemaVersion: parsed.design.schemaVersion,
        designJson: toPrismaJson(parsed.design)
      }
    });
  }
}

@Controller('modules')
class ModulesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.moduleCatalogEntry.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  @Post()
  create(@Body() body: unknown) {
    const parsed = ModuleCatalogRequestSchema.parse(body);
    const definitionJson = toPrismaJson(parsed.definitionJson);
    const versionJson = toPrismaJson(parsed.versionJson);
    return this.prisma.moduleCatalogEntry.upsert({
      where: { definitionId: parsed.definitionId },
      create: {
        definitionId: parsed.definitionId,
        name: parsed.name,
        definitionJson,
        versionJson
      },
      update: {
        name: parsed.name,
        definitionJson,
        versionJson
      }
    });
  }
}

@Module({ controllers: [HealthController, ProjectsController, ModulesController], providers: [PrismaService] })
export class AppModule {}
