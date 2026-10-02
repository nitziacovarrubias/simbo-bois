import {
  addPartToAssembly,
  createId,
  createPanel,
  identityTransform,
  normalizeHex,
  touchDesign,
  type ApplianceDefinition,
  type ApplianceInstance,
  type ClearanceZone,
  type Countertop,
  type CountertopOutline,
  type Cutout,
  type DesignDocument,
  type FunctionalZone,
  type FunctionalZoneType,
  type Id,
  type Part,
  type PlanningRule,
  type PlanningRuleProfile,
  type PlanningRuleSource,
  type ServicePoint,
  type ServicePointType,
  type Transform,
  type Vec3
} from '../../design-domain/src/index.ts';
import { createHardwareDefinition, createHardwareInstance } from '../../hardware-engine/src/index.ts';

const DEMO_DISCLAIMER='DEMO / GENÉRICO. Medidas configurables; no representan estándar BOIS, norma local ni dato oficial de fabricante.';
const demoMeta=()=>({sourceType:'DEMO',disclaimer:DEMO_DISCLAIMER});

export const DEMO_APPLIANCE_IDS={
  REFRIGERATOR:'demo-appliance-refrigerator',
  OVEN:'demo-appliance-oven',
  DISHWASHER:'demo-appliance-dishwasher',
  COOKTOP:'demo-appliance-cooktop',
  HOOD:'demo-appliance-hood',
  MICROWAVE:'demo-appliance-microwave',
  SINK:'demo-fixture-sink'
} as const;

function clearance(id:string,name:string,type:ClearanceZone['type'],dimensions:{widthMm:number;heightMm:number;depthMm:number},transform:Transform,description:string):ApplianceDefinition['clearanceZones'][number]{
  return {id,name,type,shape:'BOX',dimensions,transform,severity:'WARNING',description,metadata:demoMeta()};
}
function requirement(serviceType:ServicePointType,maxDistanceMm?:number,required=true):ApplianceDefinition['serviceRequirements'][number]{
  return {serviceType,required,...(maxDistanceMm!==undefined?{maxDistanceMm}:{}),metadata:demoMeta()};
}

export function demoApplianceDefinitions():ApplianceDefinition[]{
  const definitions:ApplianceDefinition[]=[
    {id:DEMO_APPLIANCE_IDS.REFRIGERATOR,name:'Refrigerador genérico',category:'REFRIGERATOR',dimensions:{widthMm:900,heightMm:1800,depthMm:700},clearanceZones:[clearance('demo-ref-access','Acceso refrigerador','DOOR_SWING',{widthMm:1000,heightMm:1700,depthMm:800},{position:{x:0,y:0,z:700},rotation:{x:0,y:0,z:0}},'Volumen demo para acceso de puertas.')],serviceRequirements:[requirement('ELECTRICAL',1800)],doorMotion:{type:'REVOLUTE',axis:{x:0,y:1,z:0},pivot:{x:-450,y:0,z:350},minValue:0,maxValue:100,accessEnvelope:{widthMm:900,heightMm:1800,depthMm:900},metadata:demoMeta()},installationMetadata:{sourceType:'DEMO'},colorHex:'#C9CDD0',metadata:demoMeta()},
    {id:DEMO_APPLIANCE_IDS.OVEN,name:'Horno genérico',category:'OVEN',dimensions:{widthMm:595,heightMm:595,depthMm:560},requiredOpening:{widthMm:600,heightMm:600,depthMm:570,metadata:demoMeta()},clearanceZones:[clearance('demo-oven-access','Acceso horno','DOOR_SWING',{widthMm:650,heightMm:650,depthMm:700},{position:{x:0,y:-100,z:560},rotation:{x:0,y:0,z:0}},'Envelope demo para apertura frontal.')],serviceRequirements:[requirement('ELECTRICAL',1800)],doorMotion:{type:'REVOLUTE',axis:{x:1,y:0,z:0},pivot:{x:0,y:-297,z:280},minValue:0,maxValue:90,metadata:demoMeta()},installationMetadata:{sourceType:'DEMO'},colorHex:'#3F4448',metadata:demoMeta()},
    {id:DEMO_APPLIANCE_IDS.DISHWASHER,name:'Lavavajillas genérico',category:'DISHWASHER',dimensions:{widthMm:600,heightMm:820,depthMm:580},requiredOpening:{widthMm:610,heightMm:830,depthMm:590,metadata:demoMeta()},clearanceZones:[clearance('demo-dw-access','Acceso lavavajillas','DOOR_SWING',{widthMm:650,heightMm:500,depthMm:800},{position:{x:0,y:-250,z:650},rotation:{x:0,y:0,z:0}},'Envelope demo de puerta abierta.')],serviceRequirements:[requirement('WATER_SUPPLY',1800),requirement('DRAIN',1800),requirement('ELECTRICAL',1800)],doorMotion:{type:'REVOLUTE',axis:{x:1,y:0,z:0},minValue:0,maxValue:90,metadata:demoMeta()},installationMetadata:{sourceType:'DEMO'},colorHex:'#B7BDC0',metadata:demoMeta()},
    {id:DEMO_APPLIANCE_IDS.COOKTOP,name:'Parrilla genérica',category:'COOKTOP',dimensions:{widthMm:580,heightMm:60,depthMm:500},requiredOpening:{widthMm:560,heightMm:60,depthMm:480,metadata:demoMeta()},clearanceZones:[clearance('demo-cook-safety','Zona parrilla demo','SAFETY',{widthMm:900,heightMm:700,depthMm:750},{position:{x:0,y:380,z:0},rotation:{x:0,y:0,z:0}},'Zona demo informativa; no normativa.')],serviceRequirements:[requirement('ELECTRICAL',1800)],installationMetadata:{sourceType:'DEMO'},colorHex:'#202427',metadata:demoMeta()},
    {id:DEMO_APPLIANCE_IDS.HOOD,name:'Campana genérica',category:'HOOD',dimensions:{widthMm:700,heightMm:300,depthMm:450},clearanceZones:[clearance('demo-hood-clearance','Espacio campana demo','VENTILATION',{widthMm:800,heightMm:800,depthMm:650},{position:{x:0,y:-500,z:0},rotation:{x:0,y:0,z:0}},'Zona demo de ventilación/espacio libre.')],serviceRequirements:[requirement('VENT',1800)],installationMetadata:{sourceType:'DEMO'},colorHex:'#A9AFB2',metadata:demoMeta()},
    {id:DEMO_APPLIANCE_IDS.MICROWAVE,name:'Microondas genérico',category:'MICROWAVE',dimensions:{widthMm:600,heightMm:380,depthMm:400},requiredOpening:{widthMm:610,heightMm:390,depthMm:420,metadata:demoMeta()},clearanceZones:[],serviceRequirements:[requirement('ELECTRICAL',1800)],installationMetadata:{sourceType:'DEMO'},colorHex:'#454A4E',metadata:demoMeta()},
    {id:DEMO_APPLIANCE_IDS.SINK,name:'Tarja genérica',category:'OTHER',dimensions:{widthMm:680,heightMm:220,depthMm:460},requiredOpening:{widthMm:660,heightMm:220,depthMm:440,metadata:demoMeta()},clearanceZones:[],serviceRequirements:[requirement('WATER_SUPPLY',1800),requirement('DRAIN',1800)],installationMetadata:{fixtureType:'SINK',sourceType:'DEMO'},colorHex:'#B7BEC1',metadata:{...demoMeta(),fixtureType:'SINK'}}
  ];
  return definitions.map(def=>structuredClone(def));
}

export function ensureDemoApplianceDefinitions(design:DesignDocument):ApplianceDefinition[]{
  const added:ApplianceDefinition[]=[];
  for(const def of demoApplianceDefinitions()) if(!design.applianceDefinitions.some(value=>value.id===def.id)){design.applianceDefinitions.push(def);added.push(def);}
  return added;
}

export function insertAppliance(design:DesignDocument,definitionId:Id,input:Partial<ApplianceInstance>={}):ApplianceInstance{
  const definition=design.applianceDefinitions.find(value=>value.id===definitionId);if(!definition)throw new Error(`ApplianceDefinition no encontrada: ${definitionId}`);
  const instance:ApplianceInstance={id:input.id??createId('appliance'),definitionId,name:input.name??definition.name,transform:structuredClone(input.transform??identityTransform()),dimensionsOverride:input.dimensionsOverride?structuredClone(input.dimensionsOverride):undefined,availableOpening:input.availableOpening?structuredClone(input.availableOpening):undefined,installedInAssemblyId:input.installedInAssemblyId,installedInModuleInstanceId:input.installedInModuleInstanceId,linkedCutoutId:input.linkedCutoutId,hidden:input.hidden??false,metadata:structuredClone(input.metadata??{})};
  design.applianceInstances.push(instance);
  for(const template of definition.clearanceZones){const zone:ClearanceZone={...structuredClone(template),id:createId('clearance'),ownerId:instance.id,coordinateSpace:'OWNER_LOCAL',hidden:true};design.clearanceZones.push(zone);}
  touchDesign(design);return instance;
}
export function duplicateAppliance(design:DesignDocument,id:Id):ApplianceInstance{const source=design.applianceInstances.find(v=>v.id===id);if(!source)throw new Error(`ApplianceInstance no encontrada: ${id}`);const clone=insertAppliance(design,source.definitionId,{...structuredClone(source),id:createId('appliance'),name:`${source.name} copia`,transform:{position:{...source.transform.position,x:source.transform.position.x+100},rotation:{...source.transform.rotation}},linkedCutoutId:undefined});return clone;}
export function deleteAppliance(design:DesignDocument,id:Id):void{design.applianceInstances=design.applianceInstances.filter(v=>v.id!==id);design.clearanceZones=design.clearanceZones.filter(v=>v.ownerId!==id);for(const cutout of design.cutouts)if(cutout.linkedApplianceInstanceId===id)cutout.linkedApplianceInstanceId=undefined;touchDesign(design);}

export function createCountertop(design:DesignDocument,input:{name?:string;outline:CountertopOutline;thicknessMm:number;heightMm:number;materialDefinitionId?:Id;colorHex?:string;roughness?:number;metalness?:number;edgeProfile?:Countertop['edgeProfile'];transform?:Transform;metadata?:Record<string,unknown>}):Countertop{
  const countertop:Countertop={id:createId('countertop'),name:input.name??'Cubierta',outline:structuredClone(input.outline),thicknessMm:input.thicknessMm,heightMm:input.heightMm,materialDefinitionId:input.materialDefinitionId,colorHex:input.colorHex?normalizeHex(input.colorHex):undefined,roughness:input.roughness,metalness:input.metalness,edgeProfile:input.edgeProfile,transform:structuredClone(input.transform??identityTransform()),cutoutIds:[],hidden:false,metadata:structuredClone(input.metadata??{})};design.countertops.push(countertop);touchDesign(design);return countertop;
}
export function createCutout(design:DesignDocument,input:{countertopId:Id;type:Cutout['type'];position2D:{xMm:number;yMm:number};widthMm:number;depthMm:number;radiusMm?:number;rotation?:number;linkedApplianceInstanceId?:Id;metadata?:Record<string,unknown>}):Cutout{
  const countertop=design.countertops.find(v=>v.id===input.countertopId);if(!countertop)throw new Error(`Countertop no encontrado: ${input.countertopId}`);
  const cutout:Cutout={id:createId('cutout'),countertopId:input.countertopId,type:input.type,position2D:{...input.position2D},widthMm:input.widthMm,depthMm:input.depthMm,radiusMm:input.radiusMm,rotation:input.rotation??0,linkedApplianceInstanceId:input.linkedApplianceInstanceId,metadata:structuredClone(input.metadata??{})};design.cutouts.push(cutout);countertop.cutoutIds.push(cutout.id);touchDesign(design);return cutout;
}
export function deleteCutout(design:DesignDocument,id:Id):void{const cutout=design.cutouts.find(v=>v.id===id);if(!cutout)return;design.cutouts=design.cutouts.filter(v=>v.id!==id);for(const countertop of design.countertops)countertop.cutoutIds=countertop.cutoutIds.filter(v=>v!==id);for(const appliance of design.applianceInstances)if(appliance.linkedCutoutId===id)appliance.linkedCutoutId=undefined;touchDesign(design);}
export function linkApplianceToCutout(design:DesignDocument,applianceId:Id,cutoutId:Id,linkPosition=false):void{const appliance=design.applianceInstances.find(v=>v.id===applianceId);const cutout=design.cutouts.find(v=>v.id===cutoutId);if(!appliance||!cutout)throw new Error('Appliance/Cutout no encontrado');appliance.linkedCutoutId=cutout.id;cutout.linkedApplianceInstanceId=appliance.id;if(linkPosition)appliance.metadata={...appliance.metadata,positionBinding:{type:'CUTOUT_POSITION',cutoutId:cutout.id,explicit:true}};touchDesign(design);}

export function createServicePoint(design:DesignDocument,input:{name:string;type:ServicePointType;position:Vec3;orientation?:Vec3;diameterMm?:number;size?:ServicePoint['size'];metadata?:Record<string,unknown>}):ServicePoint{const point:ServicePoint={id:createId('service'),name:input.name,type:input.type,position:{...input.position},orientation:input.orientation?{...input.orientation}:undefined,diameterMm:input.diameterMm,size:input.size?{...input.size}:undefined,hidden:false,metadata:structuredClone(input.metadata??{})};design.servicePoints.push(point);touchDesign(design);return point;}
export function createFunctionalZone(design:DesignDocument,input:{name:string;type:FunctionalZoneType;dimensions:FunctionalZone['dimensions'];transform?:Transform;metadata?:Record<string,unknown>}):FunctionalZone{const zone:FunctionalZone={id:createId('functional-zone'),name:input.name,type:input.type,dimensions:{...input.dimensions},transform:structuredClone(input.transform??identityTransform()),hidden:false,metadata:structuredClone(input.metadata??{})};design.functionalZones.push(zone);touchDesign(design);return zone;}
export function createPlanningRuleProfile(design:DesignDocument,input:{name:string;source:PlanningRuleSource;sourceLabel?:string;jurisdiction?:string;rules?:PlanningRule[];metadata?:Record<string,unknown>}):PlanningRuleProfile{const profile:PlanningRuleProfile={id:createId('planning-profile'),name:input.name,enabled:true,source:input.source,sourceLabel:input.sourceLabel,jurisdiction:input.jurisdiction,rules:structuredClone(input.rules??[]),metadata:structuredClone(input.metadata??{})};design.planningRuleProfiles.push(profile);touchDesign(design);return profile;}

function semanticPanel(design:DesignDocument,role:Part['semanticRole'],input:{name?:string;widthMm:number;heightMm:number;thicknessMm:number;materialId?:Id;position?:Vec3;metadata?:Record<string,unknown>}):Part{const part=createPanel({name:input.name??role,semanticRole:role,dimensions:{widthMm:input.widthMm,heightMm:input.heightMm,thicknessMm:input.thicknessMm},materialId:input.materialId,transform:{position:{...(input.position??{x:0,y:0,z:0})},rotation:{x:0,y:0,z:0}},manufacturable:true,metadata:structuredClone(input.metadata??{})});addPartToAssembly(design,part);return part;}
export function createFiller(design:DesignDocument,input:{name?:string;widthMm:number;heightMm:number;thicknessMm:number;materialId?:Id;position?:Vec3}):Part{return semanticPanel(design,'FILLER',input);}
export function createEndPanel(design:DesignDocument,input:{name?:string;widthMm:number;heightMm:number;thicknessMm:number;materialId?:Id;position?:Vec3}):Part{return semanticPanel(design,'END_PANEL',input);}
export function createBacksplash(design:DesignDocument,input:{name?:string;widthMm:number;heightMm:number;thicknessMm:number;materialId?:Id;position?:Vec3}):Part{return semanticPanel(design,'BACKSPLASH',input);}
export function createToeKick(design:DesignDocument,input:{name?:string;widthMm:number;heightMm:number;depthMm:number;offsetMm:number;materialId?:Id;position?:Vec3}):Part{return semanticPanel(design,'TOE_KICK',{name:input.name??'Toe Kick',widthMm:input.widthMm,heightMm:input.heightMm,thicknessMm:input.depthMm,materialId:input.materialId,position:input.position,metadata:{toeKick:{heightMm:input.heightMm,depthMm:input.depthMm,offsetMm:input.offsetMm}}});}

export function createHangingRod(design:DesignDocument,input:{name?:string;lengthMm:number;diameterMm:number;position?:Vec3;colorHex?:string;mountingHardware?:Record<string,unknown>}):{definition:ReturnType<typeof createHardwareDefinition>;instance:ReturnType<typeof createHardwareInstance>}{
  const name=input.name??'Hanging Rod';
  let definition=design.hardwareDefinitions.find(v=>v.category==='ACCESSORY'&&v.metadata.accessoryType==='HANGING_ROD'&&v.dimensions.diameterMm===input.diameterMm);
  if(!definition){definition=createHardwareDefinition({name,category:'ACCESSORY',dimensions:{diameterMm:input.diameterMm},colorHex:input.colorHex??'#777777',metadata:{accessoryType:'HANGING_ROD',sourceType:'USER',mountingHardware:structuredClone(input.mountingHardware??{})}});design.hardwareDefinitions.push(definition);}
  const instance=createHardwareInstance(definition.id,[],{position:{...(input.position??{x:0,y:0,z:0})},parameters:{lengthMm:input.lengthMm,diameterMm:input.diameterMm}});design.hardwareInstances.push(instance);touchDesign(design);return {definition,instance};
}
