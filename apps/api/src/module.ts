import { Body, Controller, ConflictException, ForbiddenException, Get, NotFoundException, HttpCode, Inject, Module, Param, Patch, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';import { Prisma } from '@prisma/client';
import {
  CreateProjectRequestSchema, UpdateProjectRequestSchema, SetProjectCollaboratorsRequestSchema,
  CreateDesignChangeProposalRequestSchema, DesignChangeProposalParamsSchema,
  GenerateCuttingListParamsSchema, ModuleDefinitionSchema, ModuleVersionSchema,
  RevisionRequestSchema, SaveDesignRequestSchema
} from '@simbo/shared-contracts';
import type { DesignDocument } from '@simbo/design-domain';
import { z } from 'zod';
import { AuthController, AuthService, AuthGuard, CurrentUser, type Actor } from './auth.js';
import { PrismaService } from './prisma.service.js';
import { ProjectsService } from './projects.service.js';
import { assertMaterialTextures, assertPartAppearanceTextures } from './material-texture.guard.js';

const ModuleCatalogRequestSchema = z.object({ definitionId: z.string().min(1), name: z.string().min(1).max(160), definitionJson: ModuleDefinitionSchema, versionJson: ModuleVersionSchema }).strict();
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
@Controller('health')
class HealthController {
  @Get() health() { return { ok: true, service: 'simbo-api', time: new Date().toISOString() }; }
}
@UseGuards(AuthGuard)
@Controller('projects')
class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) { }
  @Get() list(@CurrentUser() actor: Actor) { return this.projects.list(actor); }
  @Get('assignees') assignees(@CurrentUser() actor: Actor) { return this.projects.assignees(actor); }
  @Get('available-collaborators') availableCollaborators(@CurrentUser() actor: Actor) {
    return this.projects.availableCollaborators(actor);
  }
  @Patch(':id/collaborators') setCollaborators(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    return this.projects.setCollaborators(actor, id, SetProjectCollaboratorsRequestSchema.parse(body).collaboratorIds);
  }
  @Post() create(@CurrentUser() actor: Actor, @Body() body: unknown) {
    return this.projects.create(actor, CreateProjectRequestSchema.parse(body));
  }
  @Patch(':id') update(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    return this.projects.update(actor, id, UpdateProjectRequestSchema.parse(body));
  }
  @Get(':id/design') design(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.projects.getDesign(actor, id); }
  @Post(':id/design') save(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const parsed = SaveDesignRequestSchema.parse(body); return this.projects.save(actor, id, parsed.design as unknown as DesignDocument, parsed.expectedRevision);
  }
  @Get(':id/versions') versions(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.projects.versions(actor, id); }
  @Get(':id/versions/:versionId') version(@CurrentUser() actor: Actor, @Param('id') id: string, @Param('versionId') versionId: string) { return this.projects.version(actor, id, versionId); }
  @Post(':id/versions') createVersion(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: unknown) { return this.projects.createVersion(actor, id, RevisionRequestSchema.parse(body).expectedRevision); }
  @Post(':id/versions/:versionId/approve') approve(@CurrentUser() actor: Actor, @Param('id') id: string, @Param('versionId') versionId: string, @Body() body: unknown) { return this.projects.approve(actor, id, versionId, RevisionRequestSchema.parse(body).expectedRevision); }
  @Post(':id/versions/:versionId/proposals')
  createProposal(@CurrentUser() actor:Actor,@Param('id') id:string,@Param('versionId') versionId:string,@Body() body:unknown) {
    const params=DesignChangeProposalParamsSchema.parse({projectId:id,versionId});
    const input=CreateDesignChangeProposalRequestSchema.parse(body);
    return this.projects.createProposal(actor,params.projectId,params.versionId,input);
  }
  @Get(':id/versions/:versionId/proposals')
  listProposals(@CurrentUser() actor:Actor,@Param('id') id:string,@Param('versionId') versionId:string) {
    const params=DesignChangeProposalParamsSchema.parse({projectId:id,versionId});
    return this.projects.listProposals(actor,params.projectId,params.versionId);
  }
  @Post(':id/versions/:versionId/cutting-list')
  cuttingList(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Param('versionId') versionId: string
  ) {
    const params = GenerateCuttingListParamsSchema.parse({
      projectId: id, designVersionId: versionId
    });
    return this.projects.cuttingList(
      actor, params.projectId, params.designVersionId
    );
  }
@Post(':id/versions/:versionId/cutting-list/authorize')
  @HttpCode(200)
  authorizeCuttingList(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown
  ) {
    const params = GenerateCuttingListParamsSchema.parse({
      projectId: id,
      designVersionId: versionId
    });
    const parsedBody = RevisionRequestSchema.parse(body);
    return this.projects.authorizeCuttingList(
      actor,
      params.projectId,
      params.designVersionId,
      parsedBody.expectedRevision
    );
  }

  @Get(':id/versions/:versionId/cutting-list/authorization')
  getCuttingListAuthorization(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Param('versionId') versionId: string
  ) {
    const params = GenerateCuttingListParamsSchema.parse({
      projectId: id,
      designVersionId: versionId
    });
    return this.projects.getCuttingListAuthorization(
      actor,
      params.projectId,
      params.designVersionId
    );
  }
}
@UseGuards(AuthGuard)
@Controller('modules')
class ModulesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) { }
  @Get() list() { return this.prisma.moduleCatalogEntry.findMany({ orderBy: { updatedAt: 'desc' } }); }
  @Patch(':definitionId') async update(@CurrentUser() actor: Actor, @Param('definitionId') definitionId:string, @Body() body:unknown) {
    if(actor.role!=='SUPERVISOR')throw new ForbiddenException('Solo el Supervisor puede actualizar módulos compartidos');
    const parsed=ModuleCatalogRequestSchema.extend({expectedUpdatedAt:z.string().datetime()}).parse(body);
    if(parsed.definitionId!==definitionId || parsed.definitionJson.id!==definitionId || parsed.versionJson.definitionId!==definitionId || parsed.definitionJson.currentVersionId!==parsed.versionJson.id)
      throw new UnprocessableEntityException('Definición y versión incoherentes');
    assertMaterialTextures(parsed.versionJson.snapshot.materials);
    assertPartAppearanceTextures(parsed.versionJson.snapshot.parts);
    const existing=await this.prisma.moduleCatalogEntry.findUnique({where:{definitionId}});
    if(!existing)throw new NotFoundException('Módulo compartido no encontrado');
    if(existing.updatedAt.toISOString()!==parsed.expectedUpdatedAt)throw new ConflictException('El módulo se modificó en otra sesión. Actualiza la biblioteca.');
    const previous=(existing.versionJson as {version?:number}).version;
    if(!Number.isFinite(previous)||parsed.versionJson.version!==previous!+1)throw new ConflictException('La nueva versión debe continuar la versión publicada.');
    const result=await this.prisma.moduleCatalogEntry.updateMany({where:{definitionId,updatedAt:existing.updatedAt},data:{name:parsed.name,definitionJson:json(parsed.definitionJson),versionJson:json(parsed.versionJson)}});
    if(!result.count)throw new ConflictException('El módulo se modificó durante la operación.');
    return this.prisma.moduleCatalogEntry.findUnique({where:{definitionId}});
  }
  @Post() create(@CurrentUser() actor: Actor, @Body() body: unknown) {
    if (actor.role === 'COLLABORATOR') throw new ForbiddenException('El Colaborador no puede crear módulos compartidos');
    const parsed = ModuleCatalogRequestSchema.parse(body);
    if (parsed.definitionId !== parsed.definitionJson.id || parsed.versionJson.definitionId !== parsed.definitionId || parsed.definitionJson.currentVersionId !== parsed.versionJson.id) throw new UnprocessableEntityException('Definition/Version de catálogo incoherentes');
    assertMaterialTextures(parsed.versionJson.snapshot.materials);
    assertPartAppearanceTextures(parsed.versionJson.snapshot.parts);
    const data = { name: parsed.name, definitionJson: json(parsed.definitionJson), versionJson: json(parsed.versionJson) };
    if (actor.role === 'ARCHITECT') return this.prisma.moduleCatalogEntry.create({ data: { definitionId: parsed.definitionId, ...data } });
    return this.prisma.moduleCatalogEntry.upsert({ where: { definitionId: parsed.definitionId }, create: { definitionId: parsed.definitionId, ...data }, update: data });
  }
}
@Module({ controllers: [HealthController, AuthController, ProjectsController, ModulesController], providers: [PrismaService, AuthService, AuthGuard, ProjectsService] })
export class AppModule { }
