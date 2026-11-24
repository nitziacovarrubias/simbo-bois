import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../apps/api/src/security.ts';

const db=process.env.TEST_DATABASE_URL;
if(!db)throw new Error('TEST_DATABASE_URL es obligatoria para pruebas de integración');
process.env.DATABASE_URL=db;

const prisma=new PrismaClient();
const userIds:string[]=[];
const projectIds:string[]=[];
const tokens:Record<string,string>={};
const ids:Record<string,string>={};
const password='SIMBO colaborador de prueba';
let app:{listen:(port:number,host:string)=>Promise<unknown>;getUrl:()=>Promise<string>;close:()=>Promise<void>};
let base:string;

async function request(path:string, key:string, method:'GET'|'POST'|'PATCH'='GET', body?:unknown){
  const response=await fetch(base+'/api'+path,{
    method,headers:{'content-type':'application/json',authorization:`Bearer ${tokens[key]}`},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const result=await response.json() as Record<string,unknown>;
  return {status:response.status,body:result};
}

before(async()=>{
  const {createApp}=await import(new URL('../../apps/api/dist/main.js',import.meta.url).href);
  app=await createApp();
  await app.listen(0,'127.0.0.1');base=await app.getUrl();
  for(const [key,role] of [
    ['supervisor','SUPERVISOR'],['architect','ARCHITECT'],['collaborator','COLLABORATOR'],['outsider','COLLABORATOR']
  ] as const){
    const email=`simbo-collaborator-${randomUUID()}@example.test`;
    const person=await prisma.user.create({data:{name:key,email,role,passwordHash:await hashPassword(password)}});
    userIds.push(person.id);ids[key]=person.id;
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
    assert.equal(login.status,201);
    tokens[key]=(await login.json() as {token:string}).token;
  }
});
after(async()=>{
  await prisma.project.deleteMany({where:{id:{in:projectIds}}});
  await prisma.user.deleteMany({where:{id:{in:userIds}}});
  await prisma.$disconnect();await app?.close();
});

test('supervisor asigna colaboradores y el acceso se limita a proyectos asignados',async()=>{
  const created=await request('/projects','supervisor','POST',{name:'Cocina de prueba',responsibleId:ids.architect});
  assert.equal(created.status,201);
  const projectId=created.body.id as string;projectIds.push(projectId);
  const outsiders=await request('/projects','outsider');
  assert.equal(outsiders.status,200);assert.equal((outsiders.body as unknown as unknown[]).length,0);
  const noAccess=await request(`/projects/${projectId}/design`,'collaborator');
  assert.equal(noAccess.status,404);
  const denied=await request(`/projects/${projectId}/collaborators`,'architect','PATCH',{collaboratorIds:[ids.collaborator]});
  assert.equal(denied.status,403);
  const invalid=await request(`/projects/${projectId}/collaborators`,'supervisor','PATCH',{collaboratorIds:[ids.architect]});
  assert.equal(invalid.status,422);
  const duplicate=await request(`/projects/${projectId}/collaborators`,'supervisor','PATCH',{collaboratorIds:[ids.collaborator,ids.collaborator]});
  assert.equal(duplicate.status,400);
  const assigned=await request(`/projects/${projectId}/collaborators`,'supervisor','PATCH',{collaboratorIds:[ids.collaborator]});
  assert.equal(assigned.status,200);
  const membership=assigned.body.collaborators as Array<{userId:string}>;
  assert.equal(membership.length,1);assert.equal(membership[0]?.userId,ids.collaborator);
  const visible=await request('/projects','collaborator');
  assert.equal((visible.body as unknown as Array<{id:string}>).some(p=>p.id===projectId),true);
  assert.equal((await request(`/projects/${projectId}/design`,'collaborator')).status,200);
  assert.equal((await request(`/projects/${projectId}/versions`,'collaborator')).status,200);
  assert.equal((await request(`/projects/${projectId}/design`,'outsider')).status,404);
  assert.equal((await request('/projects/available-collaborators','collaborator')).status,403);
  assert.equal((await request('/projects/assignees','collaborator')).status,403);
  assert.equal((await request('/projects','collaborator','POST',{name:'Invalido'})).status,403);
  assert.equal((await request(`/projects/${projectId}`,'collaborator','PATCH',{name:'No'})).status,403);
  const design=(await request(`/projects/${projectId}/design`,'collaborator')).body;
  assert.equal((await request(`/projects/${projectId}/design`,'collaborator','POST',{
    design:design.design,expectedRevision:design.revision
  })).status,403);
  assert.equal((await request(`/projects/${projectId}/versions`,'collaborator','POST',{expectedRevision:0})).status,403);
  const createdVersion=await request(`/projects/${projectId}/versions`,'architect','POST',{expectedRevision:0});
  assert.equal(createdVersion.status,201);
  const versionId=createdVersion.body.id as string;
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}`,'collaborator')).status,200);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/proposals`,'collaborator')).status,200);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/proposals`,'collaborator','POST',{observation:'No permitido'})).status,403);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/approve`,'collaborator','POST',{expectedRevision:0})).status,403);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/cutting-list`,'collaborator','POST',{})).status,403);
  assert.equal((await request(`/projects/${projectId}/versions/${versionId}/cutting-list/authorize`,'collaborator','POST',{expectedRevision:0})).status,403);
  assert.equal((await request('/modules','collaborator','POST',{definitionId:'x'})).status,403);
  const revoked=await request(`/projects/${projectId}/collaborators`,'supervisor','PATCH',{collaboratorIds:[]});
  assert.equal(revoked.status,200);
  assert.equal((await request(`/projects/${projectId}/design`,'collaborator')).status,404);
  const remaining=await request('/projects','collaborator');
  assert.equal((remaining.body as unknown as Array<{id:string}>).some(p=>p.id===projectId),false);
});
