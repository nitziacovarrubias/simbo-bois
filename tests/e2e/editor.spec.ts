import { test, expect } from '@playwright/test';

test('demo principal: proyecto -> room -> panel exacto -> módulo -> guardar -> reload',async({page})=>{
 await page.goto('/');
 page.on('dialog',d=>d.accept('Proyecto E2E'));
 await page.getByTitle('Nuevo proyecto').click();
 await expect(page.getByText('Proyecto E2E')).toBeVisible();
 const room=page.locator('.room-mini');
 await room.getByLabel('Ancho mm').fill('3600');
 await room.getByLabel('Prof. mm').fill('3000');
 await room.getByLabel('Alto mm').fill('2500');
 await page.getByTitle('Panel').click();
 const inspector=page.locator('.inspector');
 await inspector.getByLabel('Ancho mm').fill('700');
 await inspector.getByLabel('Alto mm').fill('500');
 await inspector.getByLabel('Grosor mm').fill('18');
 await page.getByTitle('Duplicate').click();
 await page.getByTitle('Module Builder').click();
 await expect(page.getByText('Module Builder')).toBeVisible();
 await page.getByText('Guardar módulo + versión').click();
 await expect(page.locator('.catalog-item')).toHaveCount(1);
 await page.locator('.catalog-item').click();
 await page.getByRole('button',{name:'Guardar'}).click();
 await page.reload();
 await expect(page.getByText('Proyecto E2E')).toBeVisible();
 expect(await page.locator('.tree-row').count()).toBeGreaterThan(1);
});

test('persistencia de unión: screw hardware + machining',async({page})=>{
 await page.goto('/');
 await page.getByTitle('Panel').click();
 await page.getByTitle('Duplicate').click();
 const rows=page.locator('.tree-row').filter({has:page.locator('.role-dot')});
 const count=await rows.count();
 await rows.nth(Math.max(0,count-2)).click();
 await rows.nth(Math.max(0,count-1)).click({modifiers:['Control']});
 await page.getByTitle('Uniones').click();
 await page.getByLabel('Método').selectOption('SCREW');
 await page.getByLabel('Diámetro mm').fill('4');
 await page.getByLabel('Longitud mm').fill('50');
 await page.getByLabel('Cantidad').fill('3');
 await page.getByLabel('Separación mm').fill('150');
 await page.getByRole('button',{name:'Crear unión y confirmar preview'}).click();
 await expect(page.getByText(/3 herrajes · 3 mecanizados/)).toBeVisible();
 await page.getByRole('button',{name:'Guardar'}).click();
 await page.reload();
 await page.getByTitle('Manufactura').click();
 await expect(page.getByText('Manufacturing Data')).toBeVisible();
});
