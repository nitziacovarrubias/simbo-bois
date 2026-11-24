import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addPartToAssembly, createEmptyDesign, createPanel, partAppearanceMaterial, updatePartAppearance
} from '../packages/design-domain/src/index.ts';
import {
  createModuleDefinitionFromAssembly, duplicateModuleInstance, installPortableModule,
  instantiateModule, prepareWorkshopModuleVersion, updateWorkshopModule
} from '../packages/module-engine/src/index.ts';

test('changing an individual piece finish does not mutate a shared material or another piece', () => {
  const design=createEmptyDesign('Demo');
  const sourceId=design.materials[0]!.id;
  const a=createPanel({name:'A',materialId:sourceId});
  const b=createPanel({name:'B',materialId:sourceId});
  addPartToAssembly(design,a);addPartToAssembly(design,b);
  updatePartAppearance(design,a.id,m=>{m.colorHex='#113355';m.metadata.textureDataUrl='data:image/png;base64,YWJj';});
  assert.equal(design.parts[0]?.materialId,sourceId,'visual finish must never change manufacturing material');
  assert.equal(design.parts[1]?.materialId,sourceId);
  assert.equal(design.materials.length,1,'visual finish must never change manufacturing BOM');
  assert.equal(design.materials.find(m=>m.id===sourceId)?.metadata.textureDataUrl,undefined);
  assert.equal(partAppearanceMaterial(design.parts[0],design.materials[0])?.metadata.textureDataUrl,'data:image/png;base64,YWJj');
  assert.equal(partAppearanceMaterial(design.parts[1],design.materials[0])?.metadata.textureDataUrl,undefined);
  updatePartAppearance(design,a.id,m=>{m.roughness=.3;});
  assert.equal(design.materials.length,1,'repeat edits must not introduce more manufacturing materials');
  assert.equal(partAppearanceMaterial(design.parts[0],design.materials[0])?.roughness,.3);
});

test('piece finish persists through JSON and removing it does not affect the base material', () => {
  const design=createEmptyDesign('Acabados');
  const part=createPanel({name:'Tablero',materialId:design.materials[0]!.id});
  addPartToAssembly(design,part);
  updatePartAppearance(design,part.id,m=>{m.metadata.textureDataUrl='data:image/png;base64,YWJj';m.metadata.textureScaleMm=450;});
  const loaded=JSON.parse(JSON.stringify(design)) as typeof design;
  assert.equal(partAppearanceMaterial(loaded.parts[0],loaded.materials[0])?.metadata.textureScaleMm,450);
  updatePartAppearance(loaded,part.id,m=>{delete m.metadata.textureDataUrl;});
  assert.equal(partAppearanceMaterial(loaded.parts[0],loaded.materials[0])?.metadata.textureDataUrl,undefined);
  assert.equal(loaded.parts[0]?.materialId,design.materials[0]?.id);
  assert.equal(loaded.materials[0]?.metadata.textureDataUrl,undefined);
});

test('workshop update affects every linked module, preserves local overrides and old version', () => {
  const standalone=createEmptyDesign('Gabinete');
  const original=createPanel({name:'Lateral',materialId:standalone.materials[0]!.id});
  addPartToAssembly(standalone,original);
  const {definition,version}=createModuleDefinitionFromAssembly(standalone,standalone.rootAssemblyId,{name:'Gabinete',tags:['WORKSHOP']});
  const design=createEmptyDesign('Cocina');
  installPortableModule(design,definition,version);
  const first=instantiateModule(design,definition.id,{position:{x:250,y:0,z:0}});
  const second=instantiateModule(design,definition.id,{position:{x:1050,y:0,z:0}});
  const third=duplicateModuleInstance(design,first.id);
  const firstRoot=design.assemblies.find(a=>a.id===first.rootAssemblyId)!;
  const firstPartId=firstRoot.children[0]!.id;
  updatePartAppearance(design,firstPartId,m=>{m.colorHex='#FF0000';});
  const edited=structuredClone(version);
  edited.id='version-new';edited.version=2;edited.createdAt=new Date().toISOString();
  edited.snapshot.materials[0]!.colorHex='#112233';
  edited.snapshot.parts[0]!.dimensions.widthMm=800;
  const next=prepareWorkshopModuleVersion(edited);
  const updated={...structuredClone(definition),currentVersionId:next.id,versionIds:[version.id,next.id]};
  updateWorkshopModule(design,updated,next);
  assert.equal(design.moduleVersions.find(v=>v.id===version.id)?.snapshot.parts[0]?.dimensions.widthMm,700,'old snapshot remains immutable');
  for(const instance of [first,second,third]){
    const current=design.moduleInstances.find(v=>v.id===instance.id)!;
    assert.equal(current.versionId,next.id);
    const root=design.assemblies.find(a=>a.id===current.rootAssemblyId)!;
    const part=design.parts.find(v=>v.id===root.children[0]?.id)!;
    assert.equal(part.dimensions.widthMm,800);
    const base=design.materials.find(m=>m.id===part.materialId);
    assert.equal(base?.colorHex,'#112233');
    assert.equal(partAppearanceMaterial(part,base)?.colorHex, instance.id===first.id?'#FF0000':'#112233');
  }
  assert.equal(design.moduleDefinitions.find(v=>v.id===definition.id)?.currentVersionId,next.id);
});

test('updating a workshop definition does not touch unrelated parts', () => {
  const design=createEmptyDesign();
  const free=createPanel({name:'Pieza independiente',materialId:design.materials[0]?.id});
  addPartToAssembly(design,free);
  const before=structuredClone(design.parts[0]);
  assert.throws(()=>updateWorkshopModule(design, {id:'missing'} as never, {definitionId:'missing'} as never),/Solo se pueden editar/);
  assert.deepEqual(design.parts[0],before);
});

test('workshop versions can add and remove simple panels without changing unrelated geometry', () => {
  const draft=createEmptyDesign('Taller');
  const original=createPanel({name:'Lateral',materialId:draft.materials[0]!.id});
  addPartToAssembly(draft,original);
  const {definition,version}=createModuleDefinitionFromAssembly(draft,draft.rootAssemblyId,{name:'Módulo de prueba',tags:['WORKSHOP']});
  const target=createEmptyDesign('Proyecto');
  const independent=createPanel({name:'Pieza libre',materialId:target.materials[0]!.id});
  addPartToAssembly(target,independent);
  installPortableModule(target,definition,version);
  const instance=instantiateModule(target,definition.id);
  const next=structuredClone(version);
  next.id='next-v2';next.version=2;
  next.snapshot.parts=[createPanel({name:'Panel nuevo',materialId:next.snapshot.materials[0]!.id})];
  next.snapshot.assemblies[0]!.children=[{kind:'PART',id:next.snapshot.parts[0]!.id}];
  updateWorkshopModule(target,{...definition,name:'Nuevo módulo'},prepareWorkshopModuleVersion(next));
  const root=target.assemblies.find(a=>a.id===instance.rootAssemblyId)!;
  assert.equal(root.children.length,1);
  assert.equal(target.parts.find(p=>p.id===root.children[0]!.id)?.name,'Panel nuevo');
  assert.equal(target.parts.filter(p=>p.name==='Lateral').length,0);
  assert.deepEqual(target.parts.find(p=>p.id===independent.id),independent);
});
