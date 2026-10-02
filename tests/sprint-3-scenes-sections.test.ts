import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssembly,
  createEmptyDesign,
  createId,
  createPanel,
  identityTransform,
  serializeDesign,
  type CameraState,
  type ScenePresentationSnapshot
} from '../packages/design-domain/src/index.ts';
import { roomSegments, roomWallSegments } from '../packages/geometry-engine/src/index.ts';
import {
  createScene,
  createSectionPlane,
  deleteScene,
  duplicateScene,
  fitRoomCamera,
  invertSection,
  reorderScenes,
  resolveIsolationPartIds,
  restoreScenePresentation,
  sectionClippingDescriptor,
  setSectionPosition
} from '../packages/editor-engine/src/index.ts';
import { DEFAULT_VISIBILITY_TAGS, normalizeVisibilityTags } from '../apps/web/src/cadVisualSystem.ts';

const camera: CameraState = {
  projection:'PERSPECTIVE',
  position:{x:4200,y:3200,z:4200},
  target:{x:0,y:900,z:0},
  up:{x:0,y:1,z:0},
  fov:38,
  orthoScale:5000
};

function presentation(overrides:Partial<ScenePresentationSnapshot> = {}):ScenePresentationSnapshot {
  return {
    quality:'BALANCED',
    wallsMode:'TRANSPARENT',
    gridVisible:true,
    visibility:{...DEFAULT_VISIBILITY_TAGS},
    activeSectionId:undefined,
    sectionVisibility:true,
    guidesVisibility:true,
    technicalOverlays:true,
    ...overrides
  };
}

test('Room wall segmentation produces four complete physical walls without openings', () => {
  const design=createEmptyDesign('Room segmentation');
  const segments=roomSegments(design.room);
  assert.equal(segments.length,4);
  assert.deepEqual(segments.map(segment=>segment.wall).sort(),['EAST','NORTH','SOUTH','WEST']);
  const north=segments.find(segment=>segment.wall==='NORTH')!;
  const east=segments.find(segment=>segment.wall==='EAST')!;
  assert.deepEqual(north.dimensionsMm,{x:3400,y:2400,z:100});
  assert.deepEqual(east.dimensionsMm,{x:100,y:2400,z:2800});
});

test('Door opening segments a wall into left, right and upper pieces with real millimeter limits', () => {
  const design=createEmptyDesign('Door');
  design.room.openings.push({id:createId('door'),type:'DOOR',wall:'NORTH',offsetMm:600,widthMm:900,heightMm:2100,sillHeightMm:250});
  const segments=roomWallSegments(design.room,'NORTH');
  assert.equal(segments.length,3);
  assert.ok(segments.some(segment=>segment.uStartMm===0 && segment.uEndMm===600 && segment.vStartMm===0 && segment.vEndMm===2400));
  assert.ok(segments.some(segment=>segment.uStartMm===1500 && segment.uEndMm===3400 && segment.vStartMm===0 && segment.vEndMm===2400));
  assert.ok(segments.some(segment=>segment.uStartMm===600 && segment.uEndMm===1500 && segment.vStartMm===2100 && segment.vEndMm===2400));
  assert.ok(!segments.some(segment=>segment.uStartMm===600 && segment.uEndMm===1500 && segment.vStartMm===0));
});

test('Window opening segments a wall into left, right, lower and upper pieces', () => {
  const design=createEmptyDesign('Window');
  design.room.openings.push({id:createId('window'),type:'WINDOW',wall:'SOUTH',offsetMm:1000,widthMm:1200,heightMm:900,sillHeightMm:950});
  const segments=roomWallSegments(design.room,'SOUTH');
  assert.equal(segments.length,4);
  assert.ok(segments.some(segment=>segment.uStartMm===1000 && segment.uEndMm===2200 && segment.vStartMm===0 && segment.vEndMm===950));
  assert.ok(segments.some(segment=>segment.uStartMm===1000 && segment.uEndMm===2200 && segment.vStartMm===1850 && segment.vEndMm===2400));
});

test('Section clipping descriptor maps a world-space point and normal to a Three.js plane equation', () => {
  const section=createSectionPlane('Vertical X',{x:1,y:0,z:0},100,'ALL');
  const descriptor=sectionClippingDescriptor(section);
  assert.deepEqual(descriptor.normal,{x:1,y:0,z:0});
  assert.deepEqual(descriptor.point,{x:100,y:0,z:0});
  assert.equal(descriptor.planeConstant,-100);
  assert.equal(descriptor.scope,'ALL');
});

test('Section invert flips clipping orientation without moving the section point', () => {
  const section=createSectionPlane('Invert',{x:1,y:0,z:0},100);
  setSectionPosition(section,{x:350,y:1200,z:0});
  invertSection(section);
  const descriptor=sectionClippingDescriptor(section);
  assert.deepEqual(descriptor.point,{x:350,y:1200,z:0});
  assert.equal(descriptor.normal.x,-1);
  assert.equal(Math.abs(descriptor.normal.y),0);
  assert.equal(Math.abs(descriptor.normal.z),0);
  assert.equal(descriptor.planeConstant,350);
  assert.equal(descriptor.inverted,true);
});

test('Scene captures camera as an explicit presentation bookmark', () => {
  const design=createEmptyDesign('Scene camera');
  const scene=createScene('Vista general',camera,'SHADED',design,presentation());
  assert.deepEqual(scene.camera,camera);
  assert.notEqual(scene.camera,camera);
});

test('Scene captures display mode through the centralized display-mode contract', () => {
  const design=createEmptyDesign('Scene display');
  const scene=createScene('Plano técnico',{...camera,projection:'ORTHOGRAPHIC'},'HIDDEN_LINE',design,presentation());
  assert.equal(scene.displayMode,'HIDDEN_LINE');
  assert.equal(scene.camera.projection,'ORTHOGRAPHIC');
});

test('Scene captures walls mode as presentation state', () => {
  const design=createEmptyDesign('Scene walls');
  const scene=createScene('General',camera,'PRESENTATION',design,presentation({wallsMode:'AUTO'}));
  assert.equal(scene.presentation.wallsMode,'AUTO');
});

test('Scene captures visibility tags without conflating them with hierarchy', () => {
  const design=createEmptyDesign('Scene visibility');
  const visibility={...DEFAULT_VISIBILITY_TAGS,HARDWARE:false,MACHINING:false,GUIDES:false};
  const scene=createScene('Cliente',camera,'PRESENTATION',design,presentation({visibility}));
  assert.deepEqual(scene.presentation.visibility,visibility);
  assert.equal(scene.visibleEntityIds,null);
});

test('Scene restore returns a detached workspace snapshot and does not mutate DesignDocument', () => {
  const design=createEmptyDesign('Scene restore');
  const section=createSectionPlane('S',{x:0,y:0,z:1},200);
  design.sectionPlanes.push(section);
  const scene=createScene('Sección módulo',camera,'TECHNICAL',design,presentation({activeSectionId:section.id,wallsMode:'HIDDEN'}));
  design.scenes.push(scene);
  const before=serializeDesign(design);
  const restored=restoreScenePresentation(scene);
  restored.camera.position.x=9999;
  restored.presentation.visibility.ROOM=false;
  assert.equal(serializeDesign(design),before);
  assert.equal(scene.camera.position.x,4200);
  assert.equal(scene.presentation.visibility.ROOM,true);
});

test('Scene duplicate creates an independent ordered snapshot', () => {
  const design=createEmptyDesign('Duplicate scene');
  const original=createScene('Frontal',camera,'HIDDEN_LINE',design,presentation({wallsMode:'HIDDEN'}));
  design.scenes.push(original);
  const copy=duplicateScene(design,original.id);
  assert.notEqual(copy.id,original.id);
  assert.equal(copy.name,'Frontal copia');
  assert.equal(copy.order,1);
  copy.presentation.visibility.ROOM=false;
  assert.equal(original.presentation.visibility.ROOM,true);
});

test('Scene reorder follows explicit order without touching camera content', () => {
  const design=createEmptyDesign('Reorder');
  const a=createScene('A',camera,'SHADED',design,presentation()); design.scenes.push(a);
  const b=createScene('B',{...camera,fov:55},'TECHNICAL',design,presentation()); design.scenes.push(b);
  const c=createScene('C',{...camera,fov:65},'PRESENTATION',design,presentation()); design.scenes.push(c);
  reorderScenes(design,[c.id,a.id,b.id]);
  assert.deepEqual(design.scenes.map(scene=>scene.name),['C','A','B']);
  assert.deepEqual(design.scenes.map(scene=>scene.order),[0,1,2]);
  assert.equal(design.scenes[0]!.camera.fov,65);
});

test('Scene delete removes only the requested snapshot and normalizes order', () => {
  const design=createEmptyDesign('Delete scene');
  const a=createScene('A',camera,'SHADED',design,presentation()); design.scenes.push(a);
  const b=createScene('B',camera,'SHADED',design,presentation()); design.scenes.push(b);
  const c=createScene('C',camera,'SHADED',design,presentation()); design.scenes.push(c);
  deleteScene(design,b.id);
  assert.deepEqual(design.scenes.map(scene=>scene.name),['A','C']);
  assert.deepEqual(design.scenes.map(scene=>scene.order),[0,1]);
});

test('Presentation workspace state restore does not mutate DesignDocument or persistent Part.hidden', () => {
  const design=createEmptyDesign('Presentation no mutation');
  const part=createPanel({name:'Visible'}); design.parts.push(part);
  const scene=createScene('Presentación',camera,'PRESENTATION',design,presentation({gridVisible:false,technicalOverlays:false}));
  design.scenes.push(scene);
  const before=serializeDesign(design);
  const restored=restoreScenePresentation(scene);
  assert.equal(restored.presentation.gridVisible,false);
  assert.equal(restored.presentation.technicalOverlays,false);
  assert.equal(serializeDesign(design),before);
  assert.equal(part.hidden,false);
});

test('Isolation resolves Part, Assembly and ModuleInstance descendants as temporary workspace IDs', () => {
  const design=createEmptyDesign('Isolation');
  const raw=createPanel({name:'Raw'}); design.parts.push(raw);
  const nestedPart=createPanel({name:'Nested'}); design.parts.push(nestedPart);
  const assembly=createAssembly('Cabinet',[{kind:'PART',id:nestedPart.id}]);
  design.assemblies.push(assembly);
  design.assemblies.find(candidate=>candidate.id===design.rootAssemblyId)!.children.push({kind:'ASSEMBLY',id:assembly.id});
  const modulePart=createPanel({name:'Module part'}); design.parts.push(modulePart);
  const moduleAssembly=createAssembly('Module root',[{kind:'PART',id:modulePart.id}]); design.assemblies.push(moduleAssembly);
  const moduleId=createId('instance');
  design.moduleInstances.push({id:moduleId,definitionId:createId('def'),versionId:createId('version'),rootAssemblyId:moduleAssembly.id,name:'Module',transform:identityTransform(),parameterValues:{},detached:false,metadata:{}});
  const before=serializeDesign(design);
  assert.deepEqual([...resolveIsolationPartIds(design,[raw.id])],[raw.id]);
  assert.deepEqual([...resolveIsolationPartIds(design,[assembly.id])],[nestedPart.id]);
  assert.deepEqual([...resolveIsolationPartIds(design,[moduleId])],[modulePart.id]);
  assert.equal(serializeDesign(design),before);
  assert.equal(design.parts.every(part=>part.hidden===false),true);
});

test('Visibility tags normalize all required workspace categories independently', () => {
  const visibility=normalizeVisibilityTags({ROOM:false,SECTIONS:false,SERVICES:false});
  assert.equal(visibility.ROOM,false);
  assert.equal(visibility.SECTIONS,false);
  assert.equal(visibility.SERVICES,false);
  assert.equal(visibility.PARTS,true);
  assert.equal(visibility.MODULES,true);
  assert.deepEqual(Object.keys(visibility).sort(),['APPLIANCES','CLEARANCES','COUNTERTOPS','DIMENSIONS','FUNCTIONAL_ZONES','GUIDES','HARDWARE','MACHINING','MODULES','PARTS','ROOM','SECTIONS','SERVICES'].sort());
});

test('Fit Room frames the full 3400 × 2800 × 2400 room rather than current Parts', () => {
  const design=createEmptyDesign('Fit Room');
  design.parts.push(createPanel({name:'Tiny',dimensions:{widthMm:50,heightMm:50,thicknessMm:18}}));
  const fitted=fitRoomCamera(camera,design);
  assert.deepEqual(fitted.target,{x:0,y:1200,z:0});
  assert.ok(fitted.orthoScale>3400);
  assert.ok(Math.hypot(fitted.position.x,fitted.position.y-1200,fitted.position.z)>3400*2);
});
