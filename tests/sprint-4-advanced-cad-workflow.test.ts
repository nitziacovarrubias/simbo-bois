import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAssemblyToAssembly,
  addPartToAssembly,
  createAssembly,
  createEmptyDesign,
  createId,
  createPanel,
  getAssemblyWorldTransform,
  getPartWorldTransform,
  type CameraState,
  type MachiningFeature
} from '../packages/design-domain/src/index.ts';
import {
  alignViewToFace,
  CameraHistory,
  CommandRegistry,
  createGuideLine,
  createGuidePlane,
  detectShortcutConflicts,
  canPickEntity,
  entitySelectableByFilters,
  flipEntity,
  guideLineFromPoints,
  guidePointAtCoordinates,
  guidePointAtIntersection,
  hideWorkspaceIds,
  linearArrayOffsets,
  protractorAngle,
  radialArray,
  rebaseAssemblyOrigin,
  restrictSelectionToContext,
  tapeGuideFromDistance,
  tapeMeasure,
  walkCamera,
  lookAroundCamera,
  unhideWorkspaceIds,
  DEFAULT_SELECTION_FILTERS
} from '../packages/editor-engine/src/index.ts';
import {
  createModuleDefinitionFromAssembly,
  duplicateAssemblyTree,
  duplicateModuleInstance,
  instantiateModule,
  getModuleInstanceSnapDefinitions,
  makeModuleInstanceUnique,
  moduleOriginSnapDefinition,
  setModuleDefinitionOrigin
} from '../packages/module-engine/src/index.ts';

const camera:CameraState={projection:'PERSPECTIVE',position:{x:3000,y:1800,z:3000},target:{x:0,y:900,z:0},up:{x:0,y:1,z:0},fov:38,orthoScale:5000};

function nestedAssembly(){
  const design=createEmptyDesign('Sprint4');
  const part=createPanel({name:'Panel',materialId:design.materials[0]!.id,transform:{position:{x:120,y:40,z:30},rotation:{x:0,y:.2,z:0}}});
  design.parts.push(part);
  const assembly=createAssembly('Grupo',[{kind:'PART',id:part.id}]);
  assembly.transform.position={x:1000,y:200,z:-300};
  addAssemblyToAssembly(design,assembly);
  return {design,part,assembly};
}

test('GuidePoint supports direct coordinates and tape offset without entering DesignDocument',()=>{
  const point=guidePointAtCoordinates({x:10,y:20,z:30});
  const offset=tapeGuideFromDistance({x:0,y:0,z:0},{x:1,y:0,z:0},'500mm');
  assert.equal(point.type,'POINT');
  assert.deepEqual(point.origin,{x:10,y:20,z:30});
  assert.deepEqual(offset.origin,{x:500,y:0,z:0});
});

test('GuideLine can be created from two points and normalized',()=>{
  const line=guideLineFromPoints({x:0,y:0,z:0},{x:0,y:0,z:100});
  assert.equal(line.type,'LINE');
  assert.deepEqual(line.direction,{x:0,y:0,z:1});
});

test('GuidePoint intersection resolves crossing GuideLines',()=>{
  const a=createGuideLine({x:0,y:0,z:0},{x:1,y:0,z:0});
  const b=createGuideLine({x:50,y:-20,z:0},{x:0,y:1,z:0});
  assert.deepEqual(guidePointAtIntersection(a,b).origin,{x:50,y:0,z:0});
});

test('GuidePlane is a non-cutting construction primitive with normalized normal',()=>{
  const plane=createGuidePlane({x:0,y:0,z:600},{x:0,y:4,z:0});
  assert.equal(plane.type,'PLANE');
  assert.deepEqual(plane.normal,{x:0,y:1,z:0});
});

test('Tape Measure reports distance and XYZ deltas',()=>{
  const result=tapeMeasure({x:0,y:0,z:0},{x:300,y:400,z:120});
  assert.equal(result.distanceMm,Math.sqrt(300*300+400*400+120*120));
  assert.deepEqual(result.delta,{x:300,y:400,z:120});
  assert.match(result.formatted,/ΔX 300\.00/);
});

test('Protractor returns a signed 45 degree angle',()=>{
  const r=protractorAngle({x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:0,z:-1},{x:0,y:1,z:0});
  assert.ok(Math.abs(Math.abs(r.angleDeg)-45)<1e-9);
});

test('rebase Assembly origin preserves descendant world transforms',()=>{
  const {design,part,assembly}=nestedAssembly();
  const before=getPartWorldTransform(design,part.id);
  const next={position:{x:1500,y:500,z:200},rotation:{x:0,y:.6,z:0}};
  rebaseAssemblyOrigin(design,assembly.id,next);
  assert.deepEqual(getAssemblyWorldTransform(design,assembly.id),next);
  const after=getPartWorldTransform(design,part.id);
  assert.ok(Math.abs(after.position.x-before.position.x)<1e-8);
  assert.ok(Math.abs(after.position.y-before.position.y)<1e-8);
  assert.ok(Math.abs(after.position.z-before.position.z)<1e-8);
});

test('Module origin is explicit and used as insertion reference',()=>{
  const {design,assembly}=nestedAssembly();
  const {definition}=createModuleDefinitionFromAssembly(design,assembly.id,{name:'Modulo'});
  setModuleDefinitionOrigin(design,definition.id,{position:{x:100,y:0,z:0},rotation:{x:0,y:0,z:0}});
  const snap=moduleOriginSnapDefinition(definition);
  assert.deepEqual(snap.position,{x:100,y:0,z:0});
  const instance=instantiateModule(design,definition.id,{position:{x:2000,y:0,z:0}});
  assert.equal(instance.transform.position.x,1900);
  const resolved=getModuleInstanceSnapDefinitions(design,instance.id).find(candidate=>candidate.metadata?.kind==='MODULE_ORIGIN');
  assert.ok(resolved);
});

test('Make Unique creates a private module definition without moving instance geometry',()=>{
  const {design,assembly}=nestedAssembly();
  const {definition}=createModuleDefinitionFromAssembly(design,assembly.id,{name:'Modulo'});
  const instance=instantiateModule(design,definition.id,{position:{x:2100,y:0,z:0}});
  const before={...instance.transform.position};
  const unique=makeModuleInstanceUnique(design,instance.id);
  assert.notEqual(unique.id,definition.id);
  assert.equal(instance.definitionId,unique.id);
  assert.deepEqual(instance.transform.position,before);
});

test('Flip Part preserves positive dimensions and swaps manufacturing edge semantics',()=>{
  const design=createEmptyDesign('flip part');
  const part=createPanel({materialId:design.materials[0]!.id,transform:{position:{x:300,y:0,z:0},rotation:{x:0,y:.3,z:0}}});
  part.edgeBanding.LEFT={mode:'EDGE_BAND',type:'L'};part.edgeBanding.RIGHT={mode:'EDGE_BAND',type:'R'};
  addPartToAssembly(design,part);
  flipEntity(design,part.id,'x',0);
  assert.ok(part.dimensions.widthMm>0&&part.dimensions.heightMm>0&&part.dimensions.thicknessMm>0);
  assert.equal(getPartWorldTransform(design,part.id).position.x,-300);
  assert.equal(part.edgeBanding.LEFT.type,'R');
  assert.equal(part.edgeBanding.RIGHT.type,'L');
});

test('Machining in PART_LOCAL space follows Part flip',()=>{
  const design=createEmptyDesign('flip machining');
  const part=createPanel({materialId:design.materials[0]!.id});addPartToAssembly(design,part);
  const feature:MachiningFeature={id:createId('mach'),partId:part.id,type:'BORE',position:{x:45,y:10,z:2},orientation:{x:0,y:0,z:0},diameterMm:5,depthMm:10,parameters:{},metadata:{coordinateSpace:'PART_LOCAL'}};
  design.machiningFeatures.push(feature);part.machiningFeatureIds.push(feature.id);
  flipEntity(design,part.id,'x');
  assert.equal(feature.position.x,-45);
  assert.equal(feature.position.y,10);
});

test('Flip Assembly mirrors child layout and keeps physical dimensions positive',()=>{
  const {design,part,assembly}=nestedAssembly();
  const before=getPartWorldTransform(design,part.id).position.x;
  flipEntity(design,assembly.id,'x',0);
  assert.ok(part.dimensions.widthMm>0);
  assert.ok(Math.abs(getPartWorldTransform(design,part.id).position.x+before)<1e-7);
});

test('Flip ModuleInstance mirrors module geometry without negative dimensions',()=>{
  const {design,assembly}=nestedAssembly();
  const {definition}=createModuleDefinitionFromAssembly(design,assembly.id,{name:'Modulo'});
  const instance=instantiateModule(design,definition.id,{position:{x:1800,y:0,z:0}});
  const modulePartIds=design.assemblies.find(a=>a.id===instance.rootAssemblyId)!.children.filter(c=>c.kind==='PART').map(c=>c.id);
  flipEntity(design,instance.id,'x',0);
  assert.ok(design.parts.filter(p=>modulePartIds.includes(p.id)).every(p=>p.dimensions.widthMm>0&&p.dimensions.heightMm>0&&p.dimensions.thicknessMm>0));
});

test('Linear Array COUNT computes copy offsets',()=>{
  assert.deepEqual(linearArrayOffsets({mode:'COUNT',axis:'x',count:4,spacingMm:300}),[300,600,900,1200]);
});

test('Linear Array SPACING fills available distance by spacing',()=>{
  assert.deepEqual(linearArrayOffsets({mode:'SPACING',axis:'y',spacingMm:300,fillMm:1000}),[300,600,900]);
});

test('Linear Array FILL distributes requested total elements over length',()=>{
  assert.deepEqual(linearArrayOffsets({mode:'FILL',axis:'z',count:5,fillMm:1200}),[300,600,900,1200]);
});

test('Radial array creates world-space copies around pivot',()=>{
  const design=createEmptyDesign('radial');
  const part=createPanel({materialId:design.materials[0]!.id,transform:{position:{x:1000,y:0,z:0},rotation:{x:0,y:0,z:0}}});addPartToAssembly(design,part);
  const ids=radialArray(design,part.id,{pivot:{x:0,y:0,z:0},axis:'y',angleDeg:360,count:4});
  assert.equal(ids.length,3);
  const positions=ids.map(id=>getPartWorldTransform(design,id).position);
  assert.ok(positions.every(position=>Math.abs(Math.hypot(position.x,position.z)-1000)<1e-6));
  assert.ok(Math.abs(positions.at(-1)!.x-1000)<1e-6 && Math.abs(positions.at(-1)!.z)<1e-6);
});

test('Edit context restricts selection to Assembly descendants',()=>{
  const design=createEmptyDesign('context');
  const inside=createPanel({materialId:design.materials[0]!.id});const outside=createPanel({materialId:design.materials[0]!.id});design.parts.push(inside,outside);
  const group=createAssembly('Context',[{kind:'PART',id:inside.id}]);addAssemblyToAssembly(design,group);design.assemblies.find(a=>a.id===design.rootAssemblyId)!.children.push({kind:'PART',id:outside.id});
  assert.deepEqual(restrictSelectionToContext(design,[inside.id,outside.id],group.id),[inside.id]);
});

test('Workspace hide/unhide is temporary ID state and does not touch Part.hidden',()=>{
  const design=createEmptyDesign('hide');const a=createPanel(),b=createPanel();design.parts.push(a,b);
  let hidden=hideWorkspaceIds([], [a.id,b.id]);hidden=unhideWorkspaceIds(hidden,[a.id]);
  assert.deepEqual(hidden,[b.id]);
  assert.equal(a.hidden,false);assert.equal(b.hidden,false);
});

test('Selection filters block entity categories independently',()=>{
  const design=createEmptyDesign('filters');const part=createPanel();design.parts.push(part);
  assert.equal(entitySelectableByFilters(design,part.id,{...DEFAULT_SELECTION_FILTERS,PARTS:false}),false);
  assert.equal(entitySelectableByFilters(design,part.id,{...DEFAULT_SELECTION_FILTERS,PARTS:true}),true);
});

test('CommandRegistry routes one command and honors canExecute',()=>{
  const registry=new CommandRegistry<{selected:boolean;ran:number}>();
  registry.register({id:'x',label:'Mover',keywords:['move'],canExecute:c=>c.selected,execute:c=>{c.ran+=1;}});
  const off={selected:false,ran:0};const on={selected:true,ran:0};
  assert.equal(registry.canExecute('x',off),false);assert.equal(registry.canExecute('x',on),true);
  assert.throws(()=>registry.execute('x',off),/deshabilitado/);registry.execute('x',on);assert.equal(on.ran,1);
  assert.equal(registry.search('move',on)[0]!.id,'x');
});

test('Shortcut conflict detection normalizes Ctrl/Cmd into Mod',()=>{
  const conflicts=detectShortcutConflicts({a:'Ctrl+K',b:'Cmd+K',c:'W'});
  assert.equal(conflicts.length,1);assert.deepEqual(new Set(conflicts[0]!.commandIds),new Set(['a','b']));
});

test('Camera history supports Previous and Next without frame spam',()=>{
  const history=new CameraHistory(20);history.push(camera);history.push({...camera,position:{x:4000,y:1800,z:3000}});history.push({...camera,position:{x:5000,y:1800,z:3000}});
  assert.equal(history.size,3);assert.equal(history.previous()!.position.x,4000);assert.equal(history.previous()!.position.x,3000);assert.equal(history.next()!.position.x,4000);
});

test('Align View to Face positions camera perpendicular to the picked face',()=>{
  const aligned=alignViewToFace(camera,{x:100,y:200,z:300},{x:0,y:0,z:1},1200,true);
  assert.equal(aligned.projection,'ORTHOGRAPHIC');assert.deepEqual(aligned.target,{x:100,y:200,z:300});assert.deepEqual(aligned.position,{x:100,y:200,z:1500});
});


test('Walk keeps eye height in workspace camera state and optional collision blocks forward penetration',()=>{
  const base={...camera,position:{x:0,y:1650,z:100},target:{x:0,y:1650,z:0}};
  const free=walkCamera(base,{forward:1,strafe:0},.1,{eyeHeightMm:1650,walkSpeed:1000,collision:false});
  assert.equal(free.position.y,1650);assert.equal(free.position.z,0);
  const blocked=walkCamera(base,{forward:1,strafe:0},.1,{eyeHeightMm:1650,walkSpeed:1000,collision:true,radiusMm:0},[{min:{x:-10,y:0,z:-10},max:{x:10,y:2400,z:10}}]);
  assert.equal(blocked.position.z,100);
});

test('Look Around changes target orientation while keeping camera position fixed',()=>{
  const looked=lookAroundCamera(camera,.2,-.1);
  assert.deepEqual(looked.position,camera.position);
  assert.notDeepEqual(looked.target,camera.target);
});


test('Duplicate Assembly deep-clones descendants, preserves local/world transforms and independent IDs',()=>{
  const design=createEmptyDesign('duplicate assembly');
  const leaf=createPanel({name:'Leaf',materialId:design.materials[0]!.id,transform:{position:{x:80,y:30,z:-20},rotation:{x:.1,y:.2,z:.3}}});
  const nestedPart=createPanel({name:'Nested',materialId:design.materials[0]!.id,transform:{position:{x:15,y:25,z:35},rotation:{x:0,y:.4,z:0}}});
  design.parts.push(leaf,nestedPart);
  const child=createAssembly('Child',[{kind:'PART',id:nestedPart.id}]);child.transform={position:{x:220,y:0,z:40},rotation:{x:0,y:.25,z:0}};
  const source=createAssembly('Source',[{kind:'PART',id:leaf.id},{kind:'ASSEMBLY',id:child.id}]);source.transform={position:{x:900,y:150,z:-300},rotation:{x:0,y:.5,z:0}};
  design.assemblies.push(child);addAssemblyToAssembly(design,source);
  const beforeLeaf=getPartWorldTransform(design,leaf.id),beforeNested=getPartWorldTransform(design,nestedPart.id);
  const duplicate=duplicateAssemblyTree(design,source.id);
  const copyRoot=design.assemblies.find(v=>v.id===duplicate.rootAssemblyId)!;
  const copyLeafId=duplicate.idMap.get(leaf.id)!,copyNestedId=duplicate.idMap.get(nestedPart.id)!,copyChildId=duplicate.idMap.get(child.id)!;
  assert.notEqual(copyRoot.id,source.id);assert.notEqual(copyLeafId,leaf.id);assert.notEqual(copyChildId,child.id);
  assert.deepEqual(copyRoot.transform,source.transform);
  assert.deepEqual(design.parts.find(v=>v.id===copyLeafId)!.transform,leaf.transform);
  assert.deepEqual(getPartWorldTransform(design,copyLeafId),beforeLeaf);
  assert.deepEqual(getPartWorldTransform(design,copyNestedId),beforeNested);
  design.parts.find(v=>v.id===copyLeafId)!.name='Independent copy';
  assert.equal(leaf.name,'Leaf');
});

test('Duplicate ModuleInstance preserves world pose and creates independent instantiated entity IDs',()=>{
  const {design,assembly}=nestedAssembly();
  const {definition}=createModuleDefinitionFromAssembly(design,assembly.id,{name:'Duplicable'});
  const source=instantiateModule(design,definition.id,{position:{x:1800,y:0,z:400}});
  const sourceRoot=design.assemblies.find(v=>v.id===source.rootAssemblyId)!;
  const sourcePartId=sourceRoot.children.find(v=>v.kind==='PART')!.id;
  const sourceWorld=getPartWorldTransform(design,sourcePartId);
  const copy=duplicateModuleInstance(design,source.id);
  const copyRoot=design.assemblies.find(v=>v.id===copy.rootAssemblyId)!;
  const copyPartId=copyRoot.children.find(v=>v.kind==='PART')!.id;
  assert.notEqual(copy.id,source.id);assert.notEqual(copy.rootAssemblyId,source.rootAssemblyId);assert.notEqual(copyPartId,sourcePartId);
  assert.equal(copy.definitionId,source.definitionId);assert.equal(copy.versionId,source.versionId);
  assert.deepEqual(getPartWorldTransform(design,copyPartId),sourceWorld);
});

test('Guardar Assembly como módulo uses ModuleDefinition/Version snapshot and reinserts equivalent independent geometry',()=>{
  const design=createEmptyDesign('save module');
  const a=createPanel({name:'A',materialId:design.materials[0]!.id,transform:{position:{x:-120,y:200,z:0},rotation:{x:0,y:0,z:0}}});
  const b=createPanel({name:'B',materialId:design.materials[0]!.id,transform:{position:{x:180,y:450,z:30},rotation:{x:0,y:.15,z:0}}});
  design.parts.push(a,b);
  const assembly=createAssembly('Catálogo local',[{kind:'PART',id:a.id},{kind:'PART',id:b.id}]);assembly.transform.position={x:600,y:0,z:-250};addAssemblyToAssembly(design,assembly);
  const before=[getPartWorldTransform(design,a.id),getPartWorldTransform(design,b.id)];
  const {definition,version}=createModuleDefinitionFromAssembly(design,assembly.id,{name:assembly.name,tags:['USER']});
  const instance=instantiateModule(design,definition.id);
  const root=design.assemblies.find(v=>v.id===instance.rootAssemblyId)!;
  const insertedIds=root.children.filter(v=>v.kind==='PART').map(v=>v.id);
  assert.equal(definition.currentVersionId,version.id);assert.equal(version.snapshot.parts.length,2);assert.equal(insertedIds.length,2);
  assert.ok(insertedIds.every(id=>id!==a.id&&id!==b.id));
  assert.deepEqual(insertedIds.map(id=>getPartWorldTransform(design,id)),before);
});

test('canPickEntity covers PARTS, ASSEMBLIES, MODULES, HARDWARE, GUIDES, SECTIONS and ROOM independently',()=>{
  const design=createEmptyDesign('all picking filters');
  const part=createPanel({materialId:design.materials[0]!.id});design.parts.push(part);
  const assembly=createAssembly('Pick assembly',[{kind:'PART',id:part.id}]);addAssemblyToAssembly(design,assembly);
  const {definition}=createModuleDefinitionFromAssembly(design,assembly.id,{name:'Pick module'});
  const module=instantiateModule(design,definition.id,{position:{x:1000,y:0,z:0}});
  const hardwareId=createId('hardware');design.hardwareInstances.push({id:hardwareId,definitionId:createId('hardwaredef'),position:{x:0,y:0,z:0},orientation:{x:0,y:0,z:0},parameters:{},connectedPartIds:[],metadata:{}});
  const sectionId=createId('section');design.sectionPlanes.push({id:sectionId,name:'Pick section',position:{x:0,y:0,z:0},normal:{x:1,y:0,z:0},enabled:true,inverted:false,constantMm:0});
  const guideId=createId('guide');
  const cases:Array<[keyof typeof DEFAULT_SELECTION_FILTERS,string]>=[['PARTS',part.id],['ASSEMBLIES',assembly.id],['MODULES',module.id],['HARDWARE',hardwareId],['GUIDES',guideId],['SECTIONS',sectionId],['ROOM',design.room.id]];
  for(const [kind,id] of cases){
    const off={...DEFAULT_SELECTION_FILTERS,[kind]:false};
    assert.equal(canPickEntity(design,id,off,[guideId]),false,`${kind} disabled`);
    assert.equal(canPickEntity(design,id,{...off,[kind]:true},[guideId]),true,`${kind} enabled`);
  }
});
