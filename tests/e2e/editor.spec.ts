import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../apps/api/src/security.ts';

const prisma=new PrismaClient({datasourceUrl:process.env.TEST_DATABASE_URL});
const email=`precu07-e2e-${randomUUID()}@example.test`;
const password='Contraseña de E2E únicamente 2026';let userId:string;
test.beforeAll(async()=>{const user=await prisma.user.create({data:{email,name:'Supervisor E2E',role:'SUPERVISOR',passwordHash:await hashPassword(password)}});userId=user.id;});
test.afterAll(async()=>{if(userId){await prisma.project.deleteMany({where:{ownerId:userId}});await prisma.user.delete({where:{id:userId}});}await prisma.$disconnect();});

async function expandRoot(page:Page) {
  const expand=page.locator('.tree-row').first().getByRole('button',{name:'Expandir',exact:true});
  if(await expand.count())await expand.click();
}
async function localProject(page:Page,name:string) {
  await page.goto('/');await page.getByRole('button',{name:'Abrir editor local'}).click();
  await page.getByRole('button',{name:'Nuevo proyecto',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Nuevo proyecto'});await dialog.getByLabel('Nombre del proyecto').fill(name);await dialog.getByRole('button',{name:'Crear proyecto'}).click();
  await expect(page.locator('.project-name')).toContainText(name);await expandRoot(page);
}
async function duplicate(page:Page) {
  await page.getByTitle('Paleta de comandos',{exact:true}).click();
  const palette=page.getByRole('dialog',{name:'Paleta de comandos'});await palette.getByRole('textbox').fill('Duplicar');await palette.getByRole('button',{name:'Duplicar',exact:true}).click();
}
async function save(page:Page) {
  await page.getByRole('button',{name:'Guardar diseño',exact:true}).click();
  await expect(
    page.getByRole('banner').getByRole('status').filter({hasText:'Estado de guardado:'})
  ).toHaveText('Estado de guardado: GUARDADO');
}
async function signIn(page:Page) {
  await page.goto('/');await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByText('Supervisor E2E · Supervisor')).toBeVisible();
}
async function remoteProject(page:Page,name:string) {
  await signIn(page);await page.getByRole('button',{name:'Nuevo proyecto',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Nuevo proyecto'});await dialog.getByLabel('Nombre del proyecto').fill(name);await dialog.getByRole('button',{name:'Crear proyecto'}).click();
  await expect(page.locator('.project-name')).toContainText(name);await expandRoot(page);
}
function projectRow(page:Page,name:string) {return page.locator('.project-list article').filter({has:page.getByRole('heading',{name,exact:true})});}

test('demo principal: proyecto -> room -> panel exacto -> módulo -> guardar -> reload',async({page})=>{
 await localProject(page,'Proyecto E2E local');
 await page.getByRole('button',{name:'Manufactura',exact:true}).click();await expect(page.locator('.manufacturing-parts [role="status"]')).toHaveText('No hay piezas manufacturables en este diseño.');
 const room=page.locator('.room-mini');await room.getByRole('spinbutton',{name:'Ancho mm',exact:true}).fill('3600');await room.getByRole('spinbutton',{name:'Prof. mm',exact:true}).fill('3000');await room.getByRole('spinbutton',{name:'Alto mm',exact:true}).fill('2500');
 await page.getByRole('button',{name:'Panel',exact:true}).click();await page.getByRole('button',{name:'Propiedades',exact:true}).click();const inspector=page.locator('.inspector');
 for(const [name,value] of [['Ancho','700'],['Alto','500'],['Grosor','18']]){const field=inspector.locator(`[data-cad-field="${name}"]`);await field.fill(value!);await field.press('Enter');}
 await duplicate(page);await page.getByRole('button',{name:'Constructor de módulos',exact:true}).click();
 await page.getByRole('button',{name:'Guardar módulo',exact:true}).click();await expect(page.locator('.catalog-item')).toHaveCount(1);await page.locator('.catalog-item').click();await save(page);
 await page.reload();await page.getByRole('button',{name:'Abrir editor local'}).click();await expect(page.locator('.project-name')).toContainText('Proyecto E2E local');
 await page.getByRole('button',{name:'Manufactura',exact:true}).click();await expect(page.locator('.manufacturing-parts-table tbody tr')).toHaveCount(3);await expect(page.locator('.manufacturing-parts-table tbody')).toContainText('700 mm');await expect(page.locator('.manufacturing-parts-table tbody tr').first().locator('td').nth(6)).toHaveText('1');await expect(page.locator('.manufacturing-parts-table details summary').first()).toHaveText('Ver origen (1)');await page.locator('.manufacturing-parts-table details summary').first().click();await expect(page.locator('.manufacturing-parts-table tbody')).toContainText('Ruta de ensamblaje');
});
test('persistencia de unión: screw hardware + machining',async({page})=>{
 await localProject(page,'Unión E2E');await page.getByRole('button',{name:'Panel',exact:true}).click();await duplicate(page);
 const rows=page.locator('.outliner .tree-row.tree-part');await expect(rows).toHaveCount(2);await rows.nth(0).click();await rows.nth(1).click({modifiers:['Control']});
 await page.getByRole('button',{name:'Uniones',exact:true}).click();const panel=page.locator('.joinery-panel');await panel.getByRole('combobox',{name:'Método',exact:true}).selectOption('SCREW');
 for(const [name,value] of [['Diámetro mm','4'],['Longitud mm','50'],['Cantidad','3'],['Separación mm','150']])await panel.getByRole('spinbutton',{name,exact:true}).fill(value!);
 await panel.getByRole('button',{name:'Crear unión',exact:true}).click();await expect(panel.getByText('3 herrajes · 3 mecanizados')).toBeVisible();await save(page);
 await page.reload();await page.getByRole('button',{name:'Abrir editor local'}).click();await page.getByRole('button',{name:'Manufactura',exact:true}).click();
 await expect(page.getByText('Datos de manufactura',{exact:true})).toBeVisible();const stats=page.locator('.manufacturing .stats');await expect(stats.locator('div').nth(1).locator('b')).toHaveText('3');await expect(stats.locator('div').nth(2).locator('b')).toHaveText('3');
});
test('Supervisor: proyecto remoto, piezas, versión aprobada, reapertura e historia',async({page})=>{
 const name='Aprobación E2E '+randomUUID();await remoteProject(page,name);await page.getByRole('button',{name:'Panel',exact:true}).click();await page.getByRole('button',{name:'Constructor de módulos',exact:true}).click();await page.getByRole('button',{name:'Guardar módulo',exact:true}).click();await page.locator('.catalog-item').click();await save(page);
 await page.getByRole('button',{name:'Guardar nueva versión',exact:true}).click();await expect(page.getByText('Versión creada',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Volver a proyectos',exact:true}).click();
 await projectRow(page,name).getByRole('button',{name:'Revisar versiones'}).click();await page.getByRole('button',{name:'Aprobar diseño',exact:true}).click();await expect(page.getByText('Aprobada · Vigente',{exact:true})).toBeVisible();
 await page.reload();await projectRow(page,name).getByRole('button',{name:'Abrir diseño'}).click();await expect(page.getByText('Aprobación vigente',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Manufactura',exact:true}).click();await expect(page.locator('.manufacturing-parts-table tbody tr')).toHaveCount(2);
 await page.getByRole('button',{name:'Panel',exact:true}).click();await save(page);await expect(page.getByText('Sin aprobación vigente',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Volver a proyectos',exact:true}).click();await projectRow(page,name).getByRole('button',{name:'Revisar versiones'}).click();await expect(page.getByText('Aprobada · Histórica',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Login',exact:true})).toBeVisible();
});
test('fallo remoto visible y reintento: no se confirma una copia local como guardado servidor',async({page})=>{
 const name='Reintento E2E '+randomUUID();await remoteProject(page,name);
 await page.route('**/api/projects/*/design',async route=>{if(route.request().method()==='POST')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Fallo temporal de prueba'})});else await route.continue();});
 await page.getByRole('button',{name:'Panel',exact:true}).click();await page.getByRole('button',{name:'Guardar diseño',exact:true}).click();await expect(page.getByRole('banner').getByRole('status').filter({hasText:'Estado de guardado:'})).toHaveText('Estado de guardado: ERROR');await expect(page.getByText('Fallo temporal de prueba',{exact:true})).toBeVisible();await expect(page.locator('.project-name')).toContainText('servidor r0');
 await page.unroute('**/api/projects/*/design');await save(page);await expect(page.locator('.project-name')).toContainText('servidor r1');await page.getByRole('button',{name:'Volver a proyectos',exact:true}).click();await page.reload();await projectRow(page,name).getByRole('button',{name:'Abrir diseño'}).click();await page.getByRole('button',{name:'Manufactura',exact:true}).click();await expect(page.locator('.manufacturing-parts-table tbody tr')).toHaveCount(1);
});
