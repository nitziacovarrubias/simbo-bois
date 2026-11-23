import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../apps/api/src/security.ts';

const database = process.env.TEST_DATABASE_URL;
if (!database) throw new Error('TEST_DATABASE_URL es obligatoria para pruebas de integración');
process.env.DATABASE_URL = database;

const prisma = new PrismaClient();
const users: string[] = [];
const projects: string[] = [];
const tokens: Record<string,string> = {};
let app: { listen:(port:number,host:string)=>Promise<unknown>; getUrl:()=>Promise<string>; close:()=>Promise<void> };
let base: string;
const password = 'Prueba de metadatos SIMBO';
const ids: Record<string,string> = {};

async function request(path:string, role:string, method:'GET'|'POST'|'PATCH'='GET', body?:unknown) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers:{'content-type':'application/json', authorization:`Bearer ${tokens[role]}`},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return {status:response.status,body:await response.json() as Record<string,unknown>};
}

before(async()=>{
  const { createApp } = await import(new URL('../../apps/api/dist/main.js',import.meta.url).href);
  app = await createApp();
  await app.listen(0,'127.0.0.1');
  base = await app.getUrl();
  for(const [id,role] of [['supervisor','SUPERVISOR'],['architect','ARCHITECT'],['other','ARCHITECT']] as const){
    const email=`simbo-project-${randomUUID()}@example.test`;
    const person=await prisma.user.create({data:{name:id,email,role,passwordHash:await hashPassword(password)}});
    users.push(person.id); ids[id]=person.id;
    const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
    assert.equal(response.status,201);
    tokens[id]=(await response.json()).token;
  }
});
after(async()=>{
  await prisma.project.deleteMany({where:{id:{in:projects}}});
  await prisma.user.deleteMany({where:{id:{in:users}}});
  await prisma.$disconnect();
  await app?.close();
});

test('crear, listar, editar datos y mantener intacto el diseño', async()=>{
  const created=await request('/projects','supervisor','POST',{
    name:'Cocina ejemplo',projectType:'KITCHEN',clientName:'Cliente de prueba',
    location:'Hermosillo',description:'Encimeras de prueba',responsibleId:ids.architect
  });
  assert.equal(created.status,201);
  const id=created.body.id as string;
  projects.push(id);
  assert.equal(created.body.projectType,'KITCHEN');
  assert.equal(created.body.responsibleId,ids.architect);
  const designerList=await request('/projects','architect');
  assert.equal(designerList.status,200);
  assert.ok((designerList.body as unknown as Array<{id:string}>).some(project=>project.id===id));
  const before=await request(`/projects/${id}/design`,'architect');
  assert.equal(before.status,200);
  const updated=await request(`/projects/${id}`,'architect','PATCH',{
    name:'Cocina renombrada',clientName:'Cliente nuevo',location:'Hermosillo, Sonora'
  });
  assert.equal(updated.status,200);
  assert.equal(updated.body.clientName,'Cliente nuevo');
  assert.equal(updated.body.responsibleId,ids.architect);
  const after=await request(`/projects/${id}/design`,'architect');
  assert.equal(after.status,200);
  assert.equal(after.body.revision,before.body.revision);
  assert.deepEqual(after.body.design,before.body.design);
  const stranger=await request(`/projects/${id}`,'other','PATCH',{name:'No permitido'});
  assert.equal(stranger.status,404);
});

test('no permite asignaciones no autorizadas ni datos fuera de contrato', async()=>{
  const forbidden=await request('/projects','architect','POST',{
    name:'Asignación ajena',projectType:'CLOSET',responsibleId:ids.other
  });
  assert.equal(forbidden.status,403);
  const invalid=await request('/projects','supervisor','POST',{name:'Invalido',projectType:'UNKNOWN'});
  assert.equal(invalid.status,400);
  const own=await request('/projects','architect','POST',{name:'Compatible con clientes anteriores'});
  assert.equal(own.status,201);
  projects.push(own.body.id as string);
  assert.equal(own.body.responsibleId,ids.architect);
});
