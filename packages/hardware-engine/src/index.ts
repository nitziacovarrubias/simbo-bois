import { createId, normalizeHex, type DesignDocument, type HardwareCategory, type HardwareDefinition, type HardwareInstance, type Id } from '../../design-domain/src/index.ts';

export function createHardwareDefinition(input:{name:string;category:HardwareCategory;dimensions?:Record<string,number>;mountingPattern?:HardwareDefinition['mountingPattern'];kinematics?:HardwareDefinition['kinematics'];colorHex?:string;manufacturer?:string;productCode?:string;metadata?:Record<string,unknown>}):HardwareDefinition{return{id:createId('hardwaredef'),name:input.name,category:input.category,manufacturer:input.manufacturer,productCode:input.productCode,dimensions:{...(input.dimensions??{})},mountingPattern:structuredClone(input.mountingPattern??[]),kinematics:input.kinematics?structuredClone(input.kinematics):undefined,colorHex:normalizeHex(input.colorHex??'#777777','#777777'),metadata:{demo:true,...(input.metadata??{})}}}

export function ensureHardwareDefinition(design:DesignDocument,input:{name:string;category:HardwareCategory;dimensions?:Record<string,number>;mountingPattern?:HardwareDefinition['mountingPattern'];kinematics?:HardwareDefinition['kinematics'];colorHex?:string}):HardwareDefinition{const existing=design.hardwareDefinitions.find(d=>d.name===input.name&&d.category===input.category&&JSON.stringify(d.dimensions)===JSON.stringify(input.dimensions??{}));if(existing)return existing;const def=createHardwareDefinition(input);design.hardwareDefinitions.push(def);return def}

export function createHardwareInstance(definitionId:Id,connectedPartIds:Id[],input:Partial<HardwareInstance>={}):HardwareInstance{return{id:input.id??createId('hardware'),definitionId,position:structuredClone(input.position??{x:0,y:0,z:0}),orientation:structuredClone(input.orientation??{x:0,y:0,z:0}),parameters:{...(input.parameters??{})},connectedPartIds:[...connectedPartIds],jointId:input.jointId,hidden:input.hidden??false,metadata:{...(input.metadata??{})}}}

export interface HardwareRequirement { definitionId:Id; name:string; category:HardwareCategory; quantity:number; parameters:Record<string,number|string|boolean>; }
export function collectHardware(design:DesignDocument):HardwareRequirement[]{const defs=new Map(design.hardwareDefinitions.map(d=>[d.id,d]));const groups=new Map<string,HardwareRequirement>();for(const h of design.hardwareInstances){const d=defs.get(h.definitionId);if(!d)continue;const key=`${d.id}:${JSON.stringify(h.parameters)}`;const existing=groups.get(key);if(existing)existing.quantity++;else groups.set(key,{definitionId:d.id,name:d.name,category:d.category,quantity:1,parameters:{...h.parameters}})}return[...groups.values()]}

export function demoHardwareCatalog():HardwareDefinition[]{return[
 createHardwareDefinition({name:'Tornillo genérico demo',category:'SCREW',dimensions:{diameterMm:4,lengthMm:50},colorHex:'#777777'}),
 createHardwareDefinition({name:'Tarugo genérico demo',category:'DOWEL',dimensions:{diameterMm:8,lengthMm:30},colorHex:'#B58A63'}),
 createHardwareDefinition({name:'Bisagra genérica demo',category:'HINGE',dimensions:{cupDiameterMm:35,cupDepthMm:12},kinematics:{type:'REVOLUTE',axis:{x:0,y:1,z:0},maxAngleDeg:110},colorHex:'#8A8A8A'}),
 createHardwareDefinition({name:'Corredera genérica demo',category:'DRAWER_SLIDE',dimensions:{lengthMm:450,extensionDistanceMm:430},kinematics:{type:'PRISMATIC',axis:{x:0,y:0,z:1},maxDistanceMm:430},colorHex:'#777777'}),
 createHardwareDefinition({name:'Soporte repisa demo',category:'SHELF_SUPPORT',dimensions:{diameterMm:5,lengthMm:12},colorHex:'#777777'}),
 createHardwareDefinition({name:'Escuadra genérica demo',category:'BRACKET',dimensions:{widthMm:30,heightMm:30},colorHex:'#777777'}),
 createHardwareDefinition({name:'Pata genérica demo',category:'LEG',dimensions:{heightMm:100},colorHex:'#232323'}),
 createHardwareDefinition({name:'Tirador genérico demo',category:'HANDLE',dimensions:{lengthMm:160},colorHex:'#232323'})
]}
