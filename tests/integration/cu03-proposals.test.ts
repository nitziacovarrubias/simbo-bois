import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type UserRole } from '@prisma/client';
import { hashPassword } from '../../apps/api/src/security.ts';

const database=process.env.TEST_DATABASE_URL;
if(!database) throw new Error('TEST_DATABASE_URL es obligatoria: prepara y migra una base exclusiva para pruebas');
process.env.DATABASE_URL=database;
const prisma=new PrismaClient();
const users:string[]=[];
const projects:string[]=[];
let app:{listen:(port:number,host:string)=>Promise<unknown>;getUrl:()=>Promise<string>;close:()=>Promise<void>};
let base:string;
const tokens:Record<string,string>={};
const password='Contraseña exclusiva de integración';

async function request(path:string,actor?:string,body?:unknown) {
  const response=await fetch(base+'/api'+path,{
    method:body===undefined?'GET':'POST',
    headers:{'content-type':'application/json',...(actor?{authorization:'Bearer '+tokens[actor]}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return {status:response.status,body:await response.json()};
}

async function project(actor='architect') {
  const response=await request('/projects',actor,{name:'CU03 '+randomUUID()});
  assert.equal(response.status,201);
  projects.push(response.body.id);
  return response.body.id as string;
}

async function version(projectId:string) {
  const response=await request(`/projects/${projectId}/versions`,'architect',{expectedRevision:0});
  assert.equal(response.status,201);
  return response.body.id as string;
}

before(async()=>{
  const compiled=new URL('../../apps/api/dist/main.js',import.meta.url).href;
  const {createApp}=await import(compiled);
  app=await createApp();
  await app.listen(0,'127.0.0.1');
  base=await app.getUrl();
  for(const [key,role] of [['architect','ARCHITECT'],['other','ARCHITECT'],['supervisor','SUPERVISOR']] as const) {
    const user=await prisma.user.create({
      data:{
        email:`cu03-${randomUUID()}@example.test`,
        name:key,
        role:role as UserRole,
        passwordHash:await hashPassword(password)
      }
    });
    users.push(user.id);
    const login=await request('/auth/login',undefined,{email:user.email,password});
    assert.equal(login.status,201);
    tokens[key]=login.body.token;
  }
});

after(async()=>{
  await prisma.project.deleteMany({where:{id:{in:projects}}});
  await prisma.user.deleteMany({where:{id:{in:users}}});
  await prisma.$disconnect();
  await app?.close();
});

test('registra, lista y protege propuestas sin alterar la versión',async()=>{
  const projectId=await project();
  const versionId=await version(projectId);
  const snapshot=await prisma.designVersion.findUniqueOrThrow({where:{id:versionId}});

  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/proposals`)).status,401);
  const emptyList=await request(`/projects/${projectId}/versions/${versionId}/proposals`,'architect');
  assert.equal(emptyList.status,200);
  assert.deepEqual(emptyList.body,[]);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/proposals`,'architect',{observation:'   '})).status,400);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/proposals`,'architect',{observation:' válida ',extra:true})).status,400);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/proposals`,'other',{observation:'Sin acceso'})).status,404);
  assert.equal(await prisma.designChangeProposal.count({where:{projectId,versionId}}),0);

  const first=await request(`/projects/${projectId}/versions/${versionId}/proposals`,'architect',{observation:'  Ajustar el ancho del gabinete.  '});
  assert.equal(first.status,201);
  assert.deepEqual(Object.keys(first.body).sort(),['author','createdAt','id','observation','projectId','versionId']);
  assert.equal(first.body.projectId,projectId);
  assert.equal(first.body.versionId,versionId);
  assert.equal(first.body.observation,'Ajustar el ancho del gabinete.');
  assert.deepEqual(first.body.author,{id:users[0],name:'architect'});
  assert.equal(typeof first.body.createdAt,'string');
  assert.equal(Number.isNaN(Date.parse(first.body.createdAt)),false);
  assert.deepEqual(Object.keys(first.body.author).sort(),['id','name']);
  assert.equal(first.body.author.passwordHash,undefined);

  await new Promise(resolve=>setTimeout(resolve,5));
  const second=await request(`/projects/${projectId}/versions/${versionId}/proposals`,'architect',{observation:'Revisar el módulo lateral.'});
  assert.equal(second.status,201);

  const listed=await request(`/projects/${projectId}/versions/${versionId}/proposals`,'supervisor');
  assert.equal(listed.status,200);
  assert.deepEqual(listed.body.map((proposal:{id:string})=>proposal.id),[second.body.id,first.body.id]);
  assert.deepEqual(Object.keys(listed.body[0]).sort(),['author','createdAt','id','observation','projectId','versionId']);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/proposals`,'other')).status,404);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/proposals`,'supervisor',{observation:'No permitido'})).status,403);

  const afterProposal=await prisma.designVersion.findUniqueOrThrow({where:{id:versionId}});
  assert.deepEqual(afterProposal.designJson,snapshot.designJson);
  assert.equal(afterProposal.approvalStatus,snapshot.approvalStatus);
  assert.equal(await prisma.designChangeProposal.count({where:{projectId,versionId}}),2);
});

test('rechaza versiones ajenas, históricas y aprobadas al registrar propuestas',async()=>{
  const projectId=await project();
  const otherProjectId=await project();
  const historicalVersionId=await version(projectId);
  assert.equal((await request(`/projects/${otherProjectId}/versions/${historicalVersionId}/proposals`,'architect',{observation:'No corresponde'})).status,404);

  const current=await request(`/projects/${projectId}/design`,'architect');
  const changedDesign=structuredClone(current.body.design);
  changedDesign.metadata.notes='Nueva revisión para invalidar la versión anterior';
  const saved=await request(`/projects/${projectId}/design`,'architect',{design:changedDesign,expectedRevision:0});
  assert.equal(saved.status,201);
  assert.equal((await request(`/projects/${projectId}/versions/${historicalVersionId}/proposals`,'architect',{observation:'Versión histórica'})).status,409);

  const currentVersionId=await request(`/projects/${projectId}/versions`,'architect',{expectedRevision:1});
  assert.equal(currentVersionId.status,201);
  const snapshot=await prisma.designVersion.findUniqueOrThrow({where:{id:currentVersionId.body.id}});
  const approved=await request(`/projects/${projectId}/versions/${currentVersionId.body.id}/approve`,'supervisor',{expectedRevision:1});
  assert.equal(approved.status,201);
  assert.equal((await request(`/projects/${projectId}/versions/${currentVersionId.body.id}/proposals`,'architect',{observation:'No alterar aprobación'})).status,409);
  const approvedVersionProposals=await request(`/projects/${projectId}/versions/${currentVersionId.body.id}/proposals`,'architect');
  assert.equal(approvedVersionProposals.status,200);
  assert.deepEqual(approvedVersionProposals.body,[]);
  const afterAttempt=await prisma.designVersion.findUniqueOrThrow({where:{id:currentVersionId.body.id}});
  assert.deepEqual(afterAttempt.designJson,snapshot.designJson);
  assert.equal(afterAttempt.approvalStatus,'APPROVED');
  assert.equal(await prisma.designChangeProposal.count({where:{projectId}}),0);
});
