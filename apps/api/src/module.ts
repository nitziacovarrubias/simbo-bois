import { Body, Controller, Get, Inject, Module, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateProjectRequestSchema, SaveDesignRequestSchema } from '@simbo/shared-contracts';
import { z } from 'zod';
import { PrismaService } from './prisma.service.js';
import { AuthController, AuthService, AuthGuard } from './auth.js';

const ModuleCatalogRequestSchema = z.object({
  definitionId: z.string().min(1),
  name: z.string().min(1).max(160),
  definitionJson: z.unknown(),
  versionJson: z.unknown()
});

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true, service: 'simbo-api', time: new Date().toISOString() };
  }
}

@UseGuards(AuthGuard)
@Controller('projects')
class ProjectsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

@UseGuards(AuthGuard)
@Controller('modules')
class ModulesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

@Module({ controllers: [HealthController, AuthController, ProjectsController, ModulesController], providers: [PrismaService, AuthService, AuthGuard] })
export class AppModule {}
