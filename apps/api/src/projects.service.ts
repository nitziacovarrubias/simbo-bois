import { ConflictException, Inject, Injectable, NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createEmptyDesign, migrateDesign, validateDesignStructural, type DesignDocument } from '@simbo/design-domain';
import { DesignDocumentSchema } from '@simbo/shared-contracts';
import { isDeepStrictEqual } from 'node:util';
import type { Actor } from './auth.js';
import { PrismaService } from './prisma.service.js';

type Transaction = Prisma.TransactionClient;
function json(value:unknown):Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

@Injectable()
export class ProjectsService {
  constructor(@Inject(PrismaService) private readonly prisma:PrismaService) {}
  private async access(db:Transaction,actor:Actor,id:string) {
    const project=await db.project.findUnique({where:{id}});
    if (!project || (actor.role!=='SUPERVISOR' && project.ownerId!==actor.id)) throw new NotFoundException('Proyecto no encontrado');
    return project;
  }
  private async locked<T>(actor:Actor,id:string,work:(tx:Transaction)=>Promise<T>):Promise<T> {
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${id} FOR UPDATE`;
      await this.access(tx,actor,id); return work(tx);
    });
  }
  private document(input:unknown,projectId:string):DesignDocument {
    let design:DesignDocument;
    try {
      const raw=input as {schemaVersion?:unknown};
      const normalized=raw?.schemaVersion===1 ? migrateDesign(input) : input;
      design=DesignDocumentSchema.parse(normalized) as unknown as DesignDocument;
    } catch (error) {
      if (error instanceof Error && error.name==='ZodError') throw error;
      throw new UnprocessableEntityException('DesignDocument no puede migrarse');
    }
    if (design.metadata.projectId && design.metadata.projectId!==projectId) throw new UnprocessableEntityException('DesignDocument pertenece a otro proyecto');
    design.metadata.projectId=projectId;
    const errors=validateDesignStructural(design).filter(issue=>issue.severity==='ERROR');
    if (errors.length) throw new UnprocessableEntityException({message:'Diseño estructuralmente inválido',issues:errors});
    return design;
  }
  async list(actor:Actor) {
    return this.prisma.project.findMany({where:actor.role==='SUPERVISOR'?{}:{ownerId:actor.id},orderBy:{updatedAt:'desc'}});
  }
  async create(actor:Actor,name:string) {
    return this.prisma.$transaction(async tx=>{
      const project=await tx.project.create({data:{name,ownerId:actor.id}});
      const design=createEmptyDesign(name);design.metadata.projectId=project.id;
      await tx.designDraft.create({data:{projectId:project.id,schemaVersion:design.schemaVersion,revision:0,designJson:json(design)}});
      return project;
    });
  }
  async getDesign(actor:Actor,id:string) {
    const project=await this.access(this.prisma,actor,id);
    const draft=await this.prisma.designDraft.findUnique({where:{projectId:id}});
    const design=draft ? this.document(draft.designJson,id) : createEmptyDesign(project.name);
    design.metadata.projectId=id;
    const revision=draft?.revision??0;
    const versions=await this.prisma.designVersion.findMany({where:{projectId:id,revision,approvalStatus:'APPROVED'},orderBy:{createdAt:'desc'}});
    const approved=versions.find(version=>isDeepStrictEqual(this.document(version.designJson,id),design));
    return {design,revision,persisted:Boolean(draft),approvedVersionId:approved?.id??null};
  }
  async save(actor:Actor,id:string,design:DesignDocument,expectedRevision:number) {
    const parsed=this.document(design,id);
    return this.locked(actor,id,async tx=>{
      const draft=await tx.designDraft.findUnique({where:{projectId:id}});
      if ((draft?.revision??0)!==expectedRevision) throw new ConflictException('El diseño cambió en el servidor; vuelve a abrir el proyecto antes de guardar');
      if (draft && this.document(draft.designJson,id).id!==parsed.id) throw new UnprocessableEntityException('No se puede sustituir la identidad del diseño');
      if (draft && isDeepStrictEqual(this.document(draft.designJson,id),parsed)) return {revision:draft.revision};
      const revision=expectedRevision+1;
      await tx.designDraft.upsert({where:{projectId:id},create:{projectId:id,schemaVersion:parsed.schemaVersion,revision,designJson:json(parsed)},update:{schemaVersion:parsed.schemaVersion,revision,designJson:json(parsed)}});
      await tx.project.update({where:{id},data:{updatedAt:new Date()}});
      return {revision};
    });
  }
  async versions(actor:Actor,id:string) {
    await this.access(this.prisma,actor,id);
    const versions=await this.prisma.designVersion.findMany({where:{projectId:id},orderBy:{createdAt:'desc'}});
    const draft=await this.prisma.designDraft.findUnique({where:{projectId:id}});
    return versions.map(version=>({id:version.id,projectId:id,revision:version.revision,schemaVersion:version.schemaVersion,createdAt:version.createdAt,approvalStatus:version.approvalStatus,approvedAt:version.approvedAt,approvedById:version.approvedById,current:Boolean(draft&&version.revision===draft.revision&&isDeepStrictEqual(this.document(version.designJson,id),this.document(draft.designJson,id)))}));
  }
  async version(actor:Actor,id:string,versionId:string) {
    await this.access(this.prisma,actor,id);
    const version=await this.prisma.designVersion.findFirst({where:{id:versionId,projectId:id}});
    if (!version) throw new NotFoundException('Versión no encontrada');
    return {...version,design:this.document(version.designJson,id),designJson:undefined};
  }
  async createVersion(actor:Actor,id:string,expectedRevision:number) {
    return this.locked(actor,id,async tx=>{
      const draft=await tx.designDraft.findUnique({where:{projectId:id}});
      if (!draft) throw new UnprocessableEntityException('Guarda el diseño antes de crear una versión');
      if(draft.revision!==expectedRevision) throw new ConflictException('Revisión desactualizada');
      const design=this.document(draft.designJson,id);
      const version=await tx.designVersion.create({data:{projectId:id,schemaVersion:design.schemaVersion,revision:draft.revision,designJson:json(design)}});
      return {id:version.id,revision:version.revision,approvalStatus:version.approvalStatus};
    });
  }
  async approve(actor:Actor,id:string,versionId:string,expectedRevision:number) {
    if(actor.role!=='SUPERVISOR') throw new ForbiddenException('Sólo el Supervisor puede aprobar el diseño');
    return this.locked(actor,id,async tx=>{
      const version=await tx.designVersion.findFirst({where:{id:versionId,projectId:id}});
      if(!version) throw new NotFoundException('Versión no encontrada');
      const draft=await tx.designDraft.findUnique({where:{projectId:id}});
      if(!draft||draft.revision!==expectedRevision||version.revision!==draft.revision||!isDeepStrictEqual(this.document(version.designJson,id),this.document(draft.designJson,id))) throw new ConflictException('Sólo se puede aprobar una versión del borrador vigente');
      if(version.approvalStatus==='APPROVED') return {id:version.id,approvalStatus:version.approvalStatus,approvedAt:version.approvedAt,approvedById:version.approvedById};
      const approved=await tx.designVersion.update({where:{id:versionId},data:{approvalStatus:'APPROVED',approvedAt:new Date(),approvedById:actor.id}});
      return {id:approved.id,approvalStatus:approved.approvalStatus,approvedAt:approved.approvedAt,approvedById:approved.approvedById};
    });
  }
}
