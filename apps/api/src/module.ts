import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Inject, Module, Param, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';import { Prisma } from '@prisma/client';
import { CreateDesignChangeProposalRequestSchema, CreateProjectRequestSchema, DesignChangeProposalParamsSchema, GenerateCuttingListParamsSchema, ModuleDefinitionSchema, ModuleVersionSchema, RevisionRequestSchema, SaveDesignRequestSchema, QuotationGenerationRequestSchema } from '@simbo/shared-contracts';
import type { DesignDocument } from '@simbo/design-domain';
import { z } from 'zod';
import { AuthController, AuthService, AuthGuard, CurrentUser, type Actor } from './auth.js';
import { PrismaService } from './prisma.service.js';
import { ProjectsService } from './projects.service.js';

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
  @Post() create(@CurrentUser() actor: Actor, @Body() body: unknown) { return this.projects.create(actor, CreateProjectRequestSchema.parse(body).name); }
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

  @Post(':id/versions/:versionId/quotations')
  @HttpCode(201)
  createQuotation(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown
  ){
    const parsed = QuotationGenerationRequestSchema.safeParse(body)
    if (!parsed.success){
      throw new BadRequestException(parsed.error.flatten())
    }

    return this.projects.createQuotation(user, id, versionId, parsed.data)
  }

@Get(':id/quotations')
  listQuotations(
    @CurrentUser() user: Actor,
    @Param('id') id: string
  ) {
    return this.projects.listQuotations(user, id);
  }

  @Get(':id/quotations/:quotationId')
  getQuotation(
    @CurrentUser() user: Actor,
    @Param('id') id: string,
    @Param('quotationId') quotationId: string
  ) {
    return this.projects.getQuotation(user, id, quotationId);
  }


}
@UseGuards(AuthGuard)
@Controller('modules')
class ModulesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) { }
  @Get() list() { return this.prisma.moduleCatalogEntry.findMany({ orderBy: { updatedAt: 'desc' } }); }
  @Post() create(@CurrentUser() actor: Actor, @Body() body: unknown) {
    if (actor.role !== 'SUPERVISOR') throw new ForbiddenException('Sólo el Supervisor puede modificar el catálogo compartido');
    const parsed = ModuleCatalogRequestSchema.parse(body);
    if (parsed.definitionId !== parsed.definitionJson.id || parsed.versionJson.definitionId !== parsed.definitionId || parsed.definitionJson.currentVersionId !== parsed.versionJson.id) throw new UnprocessableEntityException('Definition/Version de catálogo incoherentes');
    const data = { name: parsed.name, definitionJson: json(parsed.definitionJson), versionJson: json(parsed.versionJson) };
    return this.prisma.moduleCatalogEntry.upsert({ where: { definitionId: parsed.definitionId }, create: { definitionId: parsed.definitionId, ...data }, update: data });
  }
}
@Module({ controllers: [HealthController, AuthController, ProjectsController, ModulesController], providers: [PrismaService, AuthService, AuthGuard, ProjectsService] })
export class AppModule { }
