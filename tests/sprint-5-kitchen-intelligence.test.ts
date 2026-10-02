import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPartToAssembly,
  createDefaultCamera,
  createEmptyDesign,
  createPanel,
  deserializeDesign,
  getApplianceWorldTransform,
  getServicePointWorldPosition,
  identityTransform,
  migrateDesignDocument,
  serializeDesign,
  setApplianceWorldTransform,
  type ApplianceDefinition,
  type ScenePresentationSnapshot
} from '../packages/design-domain/src/index.ts';
import {
  DEMO_APPLIANCE_IDS,
  createBacksplash,
  createCountertop,
  createCutout,
  createEndPanel,
  createFiller,
  createHangingRod,
  createPlanningRuleProfile,
  createServicePoint,
  createToeKick,
  demoApplianceDefinitions,
  ensureDemoApplianceDefinitions,
  insertAppliance,
  linkApplianceToCutout
} from '../packages/kitchen-engine/src/index.ts';
import {
  applianceDescriptor,
  countertopDescriptor,
  isCutoutInsideCountertop
} from '../packages/geometry-engine/src/index.ts';
import {
  clearanceIssues,
  cutoutIssues,
  openingFits,
  planningIssues,
  requiredOpeningIssues,
  serviceRequirementIssues
} from '../packages/validation-engine/src/index.ts';
import { collectManufacturingData } from '../packages/manufacturing-engine/src/index.ts';
import {
  DEFAULT_SELECTION_FILTERS,
  DEFAULT_VISIBILITY_TAGS,
  activateScene,
  canPickEntity,
  createScene,
  createSectionPlane,
  sectionClippingDescriptor
} from '../packages/editor-engine/src/index.ts';

function seededDesign(name='Sprint 5') {
  const design=createEmptyDesign(name);
  ensureDemoApplianceDefinitions(design);
  return design;
}

function presentation(overrides:Partial<ScenePresentationSnapshot>={}):ScenePresentationSnapshot {
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

test('ApplianceDefinition demo is data-driven, explicitly labelled DEMO and survives serialization', () => {
  const design=seededDesign('Appliance definition serialization');
  const refrigerator=design.applianceDefinitions.find(def=>def.id===DEMO_APPLIANCE_IDS.REFRIGERATOR)!;
  assert.equal(refrigerator.category,'REFRIGERATOR');
  assert.equal(refrigerator.metadata.sourceType,'DEMO');
  assert.match(String(refrigerator.metadata.disclaimer),/DEMO \/ GENÉRICO/);
  const roundtrip=deserializeDesign(serializeDesign(design));
  assert.deepEqual(roundtrip.applianceDefinitions.find(def=>def.id===refrigerator.id),refrigerator);
});

test('ApplianceInstance uses an explicit world transform and can be moved without a parallel mesh position', () => {
  const design=seededDesign('Appliance world transform');
  const appliance=insertAppliance(design,DEMO_APPLIANCE_IDS.OVEN);
  setApplianceWorldTransform(design,appliance.id,{position:{x:410,y:725,z:-310},rotation:{x:0,y:Math.PI/2,z:0}});
  assert.deepEqual(getApplianceWorldTransform(design,appliance.id),{position:{x:410,y:725,z:-310},rotation:{x:0,y:Math.PI/2,z:0}});
  assert.deepEqual(appliance.transform,getApplianceWorldTransform(design,appliance.id));
});

test('RequiredOpening compares complete domain dimensions and produces a WARNING when insufficient', () => {
  const design=seededDesign('Required opening');
  const oven=insertAppliance(design,DEMO_APPLIANCE_IDS.OVEN);
  const required=design.applianceDefinitions.find(def=>def.id===DEMO_APPLIANCE_IDS.OVEN)!.requiredOpening!;
  assert.equal(openingFits(required,{widthMm:required.widthMm,heightMm:required.heightMm,depthMm:required.depthMm,metadata:{}}),true);
  oven.availableOpening={widthMm:required.widthMm-1,heightMm:required.heightMm,depthMm:required.depthMm,metadata:{sourceType:'MEASURED'}};
  const issue=requiredOpeningIssues(design).find(candidate=>candidate.entityId===oven.id);
  assert.equal(issue?.code,'REQUIRED_OPENING_INSUFFICIENT');
  assert.equal(issue?.severity,'WARNING');
});

test('ClearanceZone collision is evaluated from domain AABBs', () => {
  const design=seededDesign('Clearance collision');
  const refrigerator=insertAppliance(design,DEMO_APPLIANCE_IDS.REFRIGERATOR,{transform:{position:{x:0,y:900,z:-700},rotation:{x:0,y:0,z:0}}});
  const zone=design.clearanceZones.find(candidate=>candidate.ownerId===refrigerator.id)!;
  const blocker=createPanel({name:'Bloqueador',dimensions:{widthMm:250,heightMm:500,thicknessMm:250},transform:{position:{x:0,y:900,z:0},rotation:{x:0,y:0,z:0}}});
  addPartToAssembly(design,blocker);
  const issue=clearanceIssues(design).find(candidate=>candidate.entityId===zone.id&&candidate.code==='CLEARANCE_INTERFERENCE');
  assert.equal(issue?.severity,'WARNING');
  assert.equal(issue?.metadata?.otherId,blocker.id);
});

test('Missing required appliance service produces a non-blocking WARNING', () => {
  const design=seededDesign('Missing service');
  const dishwasher=insertAppliance(design,DEMO_APPLIANCE_IDS.DISHWASHER);
  const issues=serviceRequirementIssues(design).filter(issue=>issue.entityId===dishwasher.id);
  assert.ok(issues.some(issue=>issue.code==='SERVICE_REQUIRED_MISSING'&&issue.metadata?.serviceType==='WATER_SUPPLY'));
  assert.ok(issues.every(issue=>issue.severity==='WARNING'));
});

test('Service maxDistance is evaluated in world-space only when definition supplies it', () => {
  const design=seededDesign('Service distance');
  const cooktop=insertAppliance(design,DEMO_APPLIANCE_IDS.COOKTOP,{transform:{position:{x:-1500,y:900,z:0},rotation:{x:0,y:0,z:0}}});
  const point=createServicePoint(design,{name:'Contacto lejano',type:'ELECTRICAL',position:{x:1500,y:900,z:0}});
  const issue=serviceRequirementIssues(design).find(candidate=>candidate.entityId===cooktop.id&&candidate.code==='SERVICE_TOO_FAR');
  assert.equal(issue?.metadata?.servicePointId,point.id);
  assert.ok(Number(issue?.metadata?.distanceMm)>1800);
});

test('Countertop is a serialized domain entity independent from panel Parts', () => {
  const design=seededDesign('Countertop serialization');
  const countertop=createCountertop(design,{name:'Cubierta principal',outline:{type:'RECTANGULAR',widthMm:2100,depthMm:650},thicknessMm:25,heightMm:900,colorHex:'#E5E0D8',roughness:.7,metalness:0});
  const roundtrip=deserializeDesign(serializeDesign(design));
  const restored=roundtrip.countertops.find(candidate=>candidate.id===countertop.id)!;
  assert.equal(restored.name,countertop.name);
  assert.deepEqual(restored.outline,countertop.outline);
  assert.equal(restored.thicknessMm,countertop.thicknessMm);
  assert.equal(restored.heightMm,countertop.heightMm);
  assert.equal(restored.colorHex,countertop.colorHex);
  assert.equal(roundtrip.parts.some(part=>part.id===countertop.id),false);
});

test('Cutout inside Countertop validates in the domain plane', () => {
  const design=seededDesign('Cutout inside');
  const countertop=createCountertop(design,{outline:{type:'RECTANGULAR',widthMm:2000,depthMm:650},thicknessMm:25,heightMm:900});
  const cutout=createCutout(design,{countertopId:countertop.id,type:'SINK',position2D:{xMm:0,yMm:0},widthMm:700,depthMm:450});
  assert.equal(isCutoutInsideCountertop(countertop,cutout),true);
  assert.equal(cutoutIssues(design).some(issue=>issue.entityId===cutout.id),false);
});

test('Cutout outside Countertop produces a WARNING without modifying the countertop', () => {
  const design=seededDesign('Cutout outside');
  const countertop=createCountertop(design,{outline:{type:'RECTANGULAR',widthMm:1200,depthMm:600},thicknessMm:25,heightMm:900});
  const before=structuredClone(countertop);
  const cutout=createCutout(design,{countertopId:countertop.id,type:'COOKTOP',position2D:{xMm:550,yMm:0},widthMm:400,depthMm:450});
  const issue=cutoutIssues(design).find(candidate=>candidate.entityId===cutout.id);
  assert.equal(issue?.code,'CUTOUT_OUTSIDE_COUNTERTOP');
  assert.equal(issue?.severity,'WARNING');
  assert.deepEqual({...countertop,cutoutIds:[]},before);
});

test('Sink fixture links explicitly to its Cutout in both domain directions', () => {
  const design=seededDesign('Sink link');
  const countertop=createCountertop(design,{outline:{type:'RECTANGULAR',widthMm:1800,depthMm:650},thicknessMm:25,heightMm:900});
  const sink=insertAppliance(design,DEMO_APPLIANCE_IDS.SINK);
  const cutout=createCutout(design,{countertopId:countertop.id,type:'SINK',position2D:{xMm:0,yMm:0},widthMm:660,depthMm:440});
  linkApplianceToCutout(design,sink.id,cutout.id,true);
  assert.equal(sink.linkedCutoutId,cutout.id);
  assert.equal(cutout.linkedApplianceInstanceId,sink.id);
  assert.deepEqual(sink.metadata.positionBinding,{type:'CUTOUT_POSITION',cutoutId:cutout.id,explicit:true});
});

test('Cooktop service requirements stay definition-driven and validate compatible service points', () => {
  const design=seededDesign('Cooktop services');
  const cooktop=insertAppliance(design,DEMO_APPLIANCE_IDS.COOKTOP,{transform:{position:{x:0,y:900,z:0},rotation:{x:0,y:0,z:0}}});
  const definition=design.applianceDefinitions.find(def=>def.id===cooktop.definitionId)!;
  assert.deepEqual(definition.serviceRequirements.map(req=>req.serviceType),['ELECTRICAL']);
  createServicePoint(design,{name:'Contacto parrilla',type:'ELECTRICAL',position:{x:500,y:900,z:0}});
  assert.equal(serviceRequirementIssues(design).some(issue=>issue.entityId===cooktop.id),false);
});

test('ServicePoint world position comes from its domain position and survives roundtrip', () => {
  const design=seededDesign('Service point world');
  const service=createServicePoint(design,{name:'Agua fregadero',type:'WATER_SUPPLY',position:{x:320,y:450,z:-610},orientation:{x:0,y:Math.PI/2,z:0},diameterMm:20});
  assert.deepEqual(getServicePointWorldPosition(design,service.id),{x:320,y:450,z:-610});
  const roundtrip=deserializeDesign(serializeDesign(design));
  assert.deepEqual(getServicePointWorldPosition(roundtrip,service.id),{x:320,y:450,z:-610});
});

test('Filler remains a manufacturable semantic Part', () => {
  const design=seededDesign('Filler');
  const filler=createFiller(design,{name:'Filler lateral',widthMm:80,heightMm:720,thicknessMm:18});
  assert.equal(filler.semanticRole,'FILLER');
  assert.equal(filler.manufacturable,true);
  assert.ok(design.parts.some(part=>part.id===filler.id));
});

test('End panel remains a Part and may carry an independent material assignment', () => {
  const design=seededDesign('End panel');
  const endPanel=createEndPanel(design,{name:'End panel',widthMm:600,heightMm:760,thicknessMm:19,materialId:design.materials[0]!.id});
  assert.equal(endPanel.semanticRole,'END_PANEL');
  assert.equal(endPanel.materialId,design.materials[0]!.id);
});

test('ToeKick parameters are configurable data, not a universal formula', () => {
  const design=seededDesign('Toe kick');
  const toe=createToeKick(design,{widthMm:1750,heightMm:137,depthMm:22,offsetMm:-63,position:{x:0,y:68.5,z:0}});
  assert.equal(toe.semanticRole,'TOE_KICK');
  assert.equal(toe.dimensions.heightMm,137);
  assert.equal(toe.dimensions.thicknessMm,22);
  assert.deepEqual(toe.metadata.toeKick,{heightMm:137,depthMm:22,offsetMm:-63});
});

test('Backsplash is a material-capable manufacturable semantic Part', () => {
  const design=seededDesign('Backsplash');
  const backsplash=createBacksplash(design,{name:'Backsplash',widthMm:1800,heightMm:420,thicknessMm:12,materialId:design.materials[0]!.id});
  assert.equal(backsplash.semanticRole,'BACKSPLASH');
  assert.equal(backsplash.manufacturable,true);
  assert.equal(backsplash.materialId,design.materials[0]!.id);
});

test('HangingRod reuses HardwareDefinition/HardwareInstance instead of a redundant geometry subsystem', () => {
  const design=seededDesign('Hanging rod');
  const rod=createHangingRod(design,{name:'Tubo colgador',lengthMm:937,diameterMm:27,position:{x:0,y:1500,z:0},colorHex:'#777777'});
  assert.equal(rod.definition.category,'ACCESSORY');
  assert.equal(rod.definition.metadata.accessoryType,'HANGING_ROD');
  assert.equal(rod.instance.parameters.lengthMm,937);
  assert.equal(design.parts.length,0);
});

test('Sprint 5 visibility tags and selection filters include auxiliary kitchen entities', () => {
  assert.equal(DEFAULT_VISIBILITY_TAGS.APPLIANCES,true);
  assert.equal(DEFAULT_VISIBILITY_TAGS.COUNTERTOPS,true);
  assert.equal(DEFAULT_VISIBILITY_TAGS.CLEARANCES,false);
  assert.equal(DEFAULT_VISIBILITY_TAGS.SERVICES,true);
  assert.equal(DEFAULT_SELECTION_FILTERS.APPLIANCES,true);
  assert.equal(DEFAULT_SELECTION_FILTERS.CUTOUTS,true);
  assert.equal(DEFAULT_SELECTION_FILTERS.SERVICES,true);
  assert.equal(DEFAULT_SELECTION_FILTERS.CLEARANCES,true);
});

test('Scene capture/activation restores hidden state for Appliance, Countertop and ServicePoint', () => {
  const design=seededDesign('Scene entity visibility');
  const appliance=insertAppliance(design,DEMO_APPLIANCE_IDS.MICROWAVE);
  const countertop=createCountertop(design,{outline:{type:'RECTANGULAR',widthMm:1000,depthMm:600},thicknessMm:20,heightMm:900});
  const service=createServicePoint(design,{name:'Data',type:'DATA',position:{x:0,y:300,z:0}});
  appliance.hidden=true;countertop.hidden=true;service.hidden=true;
  const scene=createScene('Instalaciones',createDefaultCamera(),'TECHNICAL',design,presentation({visibility:{...DEFAULT_VISIBILITY_TAGS,SERVICES:true,CLEARANCES:true}}));
  design.scenes.push(scene);
  appliance.hidden=false;countertop.hidden=false;service.hidden=false;
  activateScene(design,scene.id);
  assert.equal(appliance.hidden,true);
  assert.equal(countertop.hidden,true);
  assert.equal(service.hidden,true);
  assert.equal(scene.presentation.visibility.CLEARANCES,true);
});

test('SectionPlane descriptor and domain render descriptors cover Appliance and Countertop without mesh introspection', () => {
  const design=seededDesign('Section descriptors');
  const appliance=insertAppliance(design,DEMO_APPLIANCE_IDS.REFRIGERATOR,{transform:{position:{x:300,y:900,z:0},rotation:{x:0,y:0,z:0}}});
  const countertop=createCountertop(design,{outline:{type:'RECTANGULAR',widthMm:1400,depthMm:650},thicknessMm:25,heightMm:900});
  const section=createSectionPlane('Corte X',{x:1,y:0,z:0},125,'ALL');
  const clipping=sectionClippingDescriptor(section);
  assert.equal(clipping.scope,'ALL');
  assert.equal(clipping.planeConstant,-125);
  assert.deepEqual(applianceDescriptor(design,appliance).transform,getApplianceWorldTransform(design,appliance.id));
  assert.equal(countertopDescriptor(design,countertop).semanticRole,'COUNTERTOP');
});

test('PlanningRuleProfile always carries an explicit source and PlanningIssue exposes its source', () => {
  const design=seededDesign('Planning source');
  const profile=createPlanningRuleProfile(design,{name:'Referencia demostrativa',source:'REFERENCE',sourceLabel:'Fuente de referencia no normativa',rules:[{id:'r1',type:'EXAMPLE',enabled:true,parameters:{distanceMm:999},message:'Ejemplo',metadata:{}}]});
  assert.equal(profile.source,'REFERENCE');
  const appliance=insertAppliance(design,DEMO_APPLIANCE_IDS.MICROWAVE,{transform:{position:{x:5000,y:500,z:0},rotation:{x:0,y:0,z:0}}});
  const issue=planningIssues(design).find(candidate=>candidate.entityIds.includes(appliance.id));
  assert.equal(issue?.source,'SIMBO_GEOMETRIC');
  assert.equal(issue?.severity,'WARNING');
});

test('DesignDocument migration accepts schema v1 and produces schema v2 kitchen collections', () => {
  const legacy=createEmptyDesign('Legacy') as unknown as Record<string,unknown>;
  legacy.schemaVersion=1;
  legacy.applianceDefinitions=[{
    id:'legacy-oven',name:'Legacy Oven',type:'OVEN',dimensions:{widthMm:590,heightMm:600,depthMm:560},
    installationOpening:{widthMm:600,heightMm:610,depthMm:570},serviceRequirements:['ELECTRICAL'],colorHex:'#444444',metadata:{legacy:true}
  }];
  legacy.applianceInstances=[{id:'legacy-oven-i',definitionId:'legacy-oven',name:'Legacy Oven',transform:identityTransform(),metadata:{}}];
  delete legacy.cutouts;
  delete legacy.functionalZones;
  const migrated=migrateDesignDocument(legacy);
  assert.equal(migrated.schemaVersion,2);
  assert.equal(migrated.applianceDefinitions[0]!.requiredOpening?.widthMm,600);
  assert.equal(migrated.applianceDefinitions[0]!.serviceRequirements[0]!.serviceType,'ELECTRICAL');
  assert.deepEqual(migrated.cutouts,[]);
  assert.deepEqual(migrated.functionalZones,[]);
});

test('Legacy v1 Countertop carrier Part migrates without duplicate manufacturing or vertical offset', () => {
  const legacy=createEmptyDesign('Legacy countertop') as unknown as Record<string,unknown>;
  legacy.schemaVersion=1;
  const typed=legacy as unknown as ReturnType<typeof createEmptyDesign>;
  const carrier=createPanel({id:'legacy-countertop-part',name:'Legacy slab',dimensions:{widthMm:1800,heightMm:650,thicknessMm:30},transform:{position:{x:140,y:915,z:-800},rotation:{x:Math.PI/2,y:.25,z:0}}});
  addPartToAssembly(typed,carrier);
  legacy.countertops=[{id:'legacy-countertop',partId:carrier.id,cutouts:[{id:'legacy-sink-cutout',type:'SINK',position:{x:0,y:0,z:0},widthMm:600,depthMm:420,shape:'RECTANGLE',metadata:{}}],metadata:{}}];
  const migrated=migrateDesignDocument(legacy);
  const countertop=migrated.countertops[0]!;
  assert.equal(countertop.heightMm,900);
  assert.equal(countertop.transform.position.y,0);
  assert.equal(countertop.transform.position.x,140);
  assert.equal(countertop.transform.position.z,-800);
  assert.equal(countertop.transform.rotation.x,0);
  assert.equal(countertop.transform.rotation.y,.25);
  const migratedCarrier=migrated.parts.find(part=>part.id===carrier.id)!;
  assert.equal(migratedCarrier.hidden,true);
  assert.equal(migratedCarrier.manufacturable,false);
  const manufacturing=collectManufacturingData(migrated);
  assert.equal(manufacturing.parts.some(part=>part.id===carrier.id),false);
  assert.equal(manufacturing.countertops[0]!.id,countertop.id);
  assert.equal(migrated.cutouts[0]!.countertopId,countertop.id);
});

test('Manufacturing excludes Appliances/Services/Clearances from panel parts', () => {
  const design=seededDesign('Manufacturing boundary');
  const appliance=insertAppliance(design,DEMO_APPLIANCE_IDS.REFRIGERATOR);
  createServicePoint(design,{name:'Contacto',type:'ELECTRICAL',position:{x:0,y:300,z:0}});
  const filler=createFiller(design,{name:'Filler',widthMm:70,heightMm:700,thicknessMm:18});
  const data=collectManufacturingData(design);
  assert.ok(data.parts.some(part=>part.id===filler.id));
  assert.equal(data.parts.some(part=>part.id===appliance.id),false);
  assert.equal(data.parts.length,1);
});

test('Manufacturing exposes Countertops as a separate category rather than panel Parts', () => {
  const design=seededDesign('Countertop manufacturing');
  const countertop=createCountertop(design,{name:'Piedra',outline:{type:'RECTANGULAR',widthMm:1900,depthMm:650},thicknessMm:30,heightMm:900,colorHex:'#ECE8DF'});
  const cutout=createCutout(design,{countertopId:countertop.id,type:'SINK',position2D:{xMm:0,yMm:0},widthMm:650,depthMm:430});
  const data=collectManufacturingData(design);
  assert.equal(data.parts.some(part=>part.id===countertop.id),false);
  assert.equal(data.countertops.length,1);
  assert.equal(data.countertops[0]!.id,countertop.id);
  assert.equal(data.countertops[0]!.cutouts[0]!.id,cutout.id);
});

test('Selection filters independently gate Appliance, Countertop, Cutout, Service and Clearance entities', () => {
  const design=seededDesign('Selection filters');
  const appliance=insertAppliance(design,DEMO_APPLIANCE_IDS.OVEN);
  const countertop=createCountertop(design,{outline:{type:'RECTANGULAR',widthMm:1200,depthMm:600},thicknessMm:20,heightMm:900});
  const cutout=createCutout(design,{countertopId:countertop.id,type:'CUSTOM',position2D:{xMm:0,yMm:0},widthMm:100,depthMm:100});
  const service=createServicePoint(design,{name:'Data',type:'DATA',position:{x:0,y:200,z:0}});
  const clearance=design.clearanceZones.find(zone=>zone.ownerId===appliance.id)!;
  for(const [id,key] of [[appliance.id,'APPLIANCES'],[countertop.id,'COUNTERTOPS'],[cutout.id,'CUTOUTS'],[service.id,'SERVICES'],[clearance.id,'CLEARANCES']] as const) {
    assert.equal(canPickEntity(design,id,{...DEFAULT_SELECTION_FILTERS,[key]:false}),false);
    assert.equal(canPickEntity(design,id,DEFAULT_SELECTION_FILTERS),true);
  }
});

test('Acceptance kitchen roundtrip keeps semantic entities, scenes, services and manufacturing boundary', () => {
  const design=seededDesign('Aceptación Sprint 5');
  assert.deepEqual([design.room.widthMm,design.room.depthMm,design.room.heightMm],[3400,2800,2400]);

  const refrigerator=insertAppliance(design,DEMO_APPLIANCE_IDS.REFRIGERATOR,{transform:{position:{x:-1250,y:900,z:-950},rotation:{x:0,y:0,z:0}}});
  createServicePoint(design,{name:'Eléctrico refrigerador',type:'ELECTRICAL',position:{x:-1200,y:350,z:-1200}});

  const dishwasher=insertAppliance(design,DEMO_APPLIANCE_IDS.DISHWASHER,{transform:{position:{x:-400,y:410,z:-950},rotation:{x:0,y:0,z:0}}});
  createServicePoint(design,{name:'Agua lavavajillas',type:'WATER_SUPPLY',position:{x:-300,y:350,z:-1100}});
  createServicePoint(design,{name:'Dren lavavajillas',type:'DRAIN',position:{x:-250,y:250,z:-1100}});
  createServicePoint(design,{name:'Eléctrico lavavajillas',type:'ELECTRICAL',position:{x:-200,y:350,z:-1100}});

  const countertop=createCountertop(design,{name:'Cubierta principal',outline:{type:'RECTANGULAR',widthMm:2200,depthMm:650},thicknessMm:25,heightMm:900,transform:{position:{x:350,y:0,z:-950},rotation:{x:0,y:0,z:0}}});
  const sink=insertAppliance(design,DEMO_APPLIANCE_IDS.SINK,{transform:{position:{x:0,y:900,z:-950},rotation:{x:0,y:0,z:0}}});
  const sinkCutout=createCutout(design,{countertopId:countertop.id,type:'SINK',position2D:{xMm:-350,yMm:0},widthMm:660,depthMm:440});
  linkApplianceToCutout(design,sink.id,sinkCutout.id,true);
  createServicePoint(design,{name:'Agua tarja',type:'WATER_SUPPLY',position:{x:0,y:350,z:-1100}});
  createServicePoint(design,{name:'Dren tarja',type:'DRAIN',position:{x:50,y:250,z:-1100}});

  const cooktop=insertAppliance(design,DEMO_APPLIANCE_IDS.COOKTOP,{transform:{position:{x:700,y:930,z:-950},rotation:{x:0,y:0,z:0}}});
  const cooktopCutout=createCutout(design,{countertopId:countertop.id,type:'COOKTOP',position2D:{xMm:350,yMm:0},widthMm:560,depthMm:480});
  linkApplianceToCutout(design,cooktop.id,cooktopCutout.id,false);
  createServicePoint(design,{name:'Eléctrico parrilla',type:'ELECTRICAL',position:{x:700,y:500,z:-1100}});

  const hood=insertAppliance(design,DEMO_APPLIANCE_IDS.HOOD,{transform:{position:{x:700,y:1850,z:-1100},rotation:{x:0,y:0,z:0}}});
  createServicePoint(design,{name:'Vent campana',type:'VENT',position:{x:700,y:2200,z:-1200}});

  const toe=createToeKick(design,{widthMm:2100,heightMm:120,depthMm:18,offsetMm:-55});
  const filler=createFiller(design,{name:'Filler',widthMm:70,heightMm:720,thicknessMm:18});
  const endPanel=createEndPanel(design,{name:'EndPanel',widthMm:600,heightMm:760,thicknessMm:18});
  const backsplash=createBacksplash(design,{name:'Backsplash',widthMm:2200,heightMm:400,thicknessMm:12});

  const presentationScene=createScene('Presentación cocina',createDefaultCamera(),'PRESENTATION',design,presentation({visibility:{...DEFAULT_VISIBILITY_TAGS,CLEARANCES:false,SERVICES:false}}));
  const servicesScene=createScene('Instalaciones',createDefaultCamera(),'TECHNICAL',design,presentation({visibility:{...DEFAULT_VISIBILITY_TAGS,CLEARANCES:true,SERVICES:true}}));
  design.scenes.push(presentationScene,servicesScene);
  const section=createSectionPlane('Sección cocina',{x:1,y:0,z:0},0,'ALL');
  design.sectionPlanes.push(section);

  assert.equal(serviceRequirementIssues(design).length,0);
  assert.equal(cutoutIssues(design).length,0);

  const reloaded=deserializeDesign(serializeDesign(design));
  assert.equal(reloaded.schemaVersion,2);
  assert.equal(reloaded.applianceInstances.length,5);
  assert.equal(reloaded.countertops.length,1);
  assert.equal(reloaded.cutouts.length,2);
  assert.equal(reloaded.scenes.length,2);
  assert.equal(reloaded.sectionPlanes.length,1);
  assert.ok(reloaded.applianceInstances.some(item=>item.id===refrigerator.id));
  assert.ok(reloaded.applianceInstances.some(item=>item.id===dishwasher.id));
  assert.ok(reloaded.applianceInstances.some(item=>item.id===hood.id));
  assert.ok(reloaded.parts.some(item=>item.id===toe.id));
  assert.ok(reloaded.parts.some(item=>item.id===filler.id));
  assert.ok(reloaded.parts.some(item=>item.id===endPanel.id));
  assert.ok(reloaded.parts.some(item=>item.id===backsplash.id));

  const manufacturing=collectManufacturingData(reloaded);
  assert.equal(manufacturing.parts.some(part=>reloaded.applianceInstances.some(appliance=>appliance.id===part.id)),false);
  assert.equal(manufacturing.countertops.length,1);
  assert.equal(manufacturing.parts.length,4);
});

// El demo cubre las categorías iniciales sin crear clases rígidas de gabinetes.
test('Local DEMO library covers the initial appliance examples as definitions', () => {
  const definitions=demoApplianceDefinitions();
  const categories=new Set(definitions.map((definition:ApplianceDefinition)=>definition.category));
  for(const category of ['REFRIGERATOR','OVEN','DISHWASHER','COOKTOP','HOOD','MICROWAVE'] as const) assert.ok(categories.has(category));
  assert.ok(definitions.every(definition=>definition.metadata.sourceType==='DEMO'));
});
