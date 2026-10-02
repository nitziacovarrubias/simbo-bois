import test from 'node:test';
import assert from 'node:assert/strict';
import { addPartToAssembly, createEmptyDesign, createPanel, deserializeDesign, serializeDesign, type Binding, type ParameterDefinition } from '../packages/design-domain/src/index.ts';
import { ToolManager, applySnap, duplicateArray, groupParts, snapFaceToFace } from '../packages/editor-engine/src/index.ts';
import { createModuleDefinitionFromAssembly, instantiateModule, updateModuleInstanceParameters } from '../packages/module-engine/src/index.ts';
import { createHingeJoint, createScrewJoint } from '../packages/joinery-engine/src/index.ts';
import { collectManufacturingData } from '../packages/manufacturing-engine/src/index.ts';

test('DEMO PRINCIPAL completo sobre dominio: room -> panel -> move/snap -> array -> módulo -> catálogo -> override -> reload',()=>{
 const d=createEmptyDesign('Demo principal');d.room.widthMm=3600;d.room.depthMm=3000;d.room.heightMm=2500;
 const base=createPanel({name:'Base',semanticRole:'BOTTOM',materialId:d.materials[0]!.id,dimensions:{widthMm:700,heightMm:500,thicknessMm:18},transform:{position:{x:0,y:9,z:0},rotation:{x:Math.PI/2,y:0,z:0}}});
 const side=createPanel({name:'Lateral',semanticRole:'LEFT_SIDE',materialId:d.materials[0]!.id,dimensions:{widthMm:700,heightMm:500,thicknessMm:18},transform:{position:{x:900,y:250,z:0},rotation:{x:0,y:0,z:0}}});
 addPartToAssembly(d,base);addPartToAssembly(d,side);
 const tool=new ToolManager();tool.beginMove(side,{x:-350,y:-250,z:-9},'x');tool.exactMove(200);const moved=tool.commit(d);assert.notEqual(moved.parts.find(p=>p.id===side.id)!.transform.position.x,side.transform.position.x);
 const moving=moved.parts.find(p=>p.id===side.id)!;applySnap(moved,moving.id,snapFaceToFace(moved,moving,base,'LEFT','RIGHT'));
 const shelves=duplicateArray(moved,base.id,3,300,'y');assert.equal(shelves.length,3);
 const modulePartIds=[base.id,moving.id,...shelves];const group=groupParts(moved,modulePartIds,'Módulo demo');
 const param:ParameterDefinition={id:'width-def',key:'width',label:'Ancho',type:'NUMBER',defaultValue:700,unit:'mm',min:200,max:1800,step:1,ui:'INPUT'};
 const binding:Binding={id:'width-bind',targetPath:`entities.${base.id}.dimensions.widthMm`,enabled:true,expression:{type:'Reference',path:'params.width'}};
 const {definition}=createModuleDefinitionFromAssembly(moved,group.id,{name:'Módulo demo',parameters:[param],parameterBindings:[binding]});
 const instance=instantiateModule(moved,definition.id,{position:{x:1200,y:0,z:700}});updateModuleInstanceParameters(moved,instance.id,{width:950});
 const instanceBase=moved.parts.find(p=>p.metadata.sourceModuleEntityId===base.id)!;assert.equal(instanceBase.dimensions.widthMm,950);assert.equal(moved.parts.find(p=>p.id===base.id)!.dimensions.widthMm,700);
 const reload=deserializeDesign(serializeDesign(moved));assert.equal(reload.room.widthMm,3600);assert.ok(reload.moduleDefinitions.some(v=>v.id===definition.id));assert.ok(reload.moduleInstances.some(v=>v.id===instance.id));assert.equal(reload.parts.find(p=>p.id===instanceBase.id)!.dimensions.widthMm,950);
});

test('DEMO UNIONES + MANUFACTURA conserva screw hardware/machining tras reload',()=>{
 const d=createEmptyDesign('Joinery demo');const a=createPanel({name:'A',materialId:d.materials[0]!.id});const b=createPanel({name:'B',materialId:d.materials[0]!.id,transform:{position:{x:700,y:0,z:0},rotation:{x:0,y:0,z:0}}});addPartToAssembly(d,a);addPartToAssembly(d,b);
 createScrewJoint(d,a.id,b.id,{diameterMm:4,lengthMm:50,quantity:3,spacingMm:150,startOffsetMm:50,head:'COUNTERSUNK',orientation:'AUTO',generatePilotHole:true});
 const reload=deserializeDesign(serializeDesign(d));const data=collectManufacturingData(reload);assert.equal(data.hardware.reduce((n,h)=>n+h.quantity,0),3);assert.equal(data.machiningFeatures.length,3);assert.equal(reload.joints[0]!.type,'SCREW');
});

test('DEMO BISAGRA genera hinge hardware/machining/kinematics persistentes',()=>{
 const d=createEmptyDesign('Hinge demo');const side=createPanel({name:'Lateral',semanticRole:'LEFT_SIDE',materialId:d.materials[0]!.id,dimensions:{widthMm:600,heightMm:720,thicknessMm:18},transform:{position:{x:0,y:360,z:0},rotation:{x:0,y:0,z:0}}});const door=createPanel({name:'Puerta',semanticRole:'DOOR',materialId:d.materials[0]!.id,dimensions:{widthMm:400,heightMm:700,thicknessMm:18},transform:{position:{x:220,y:360,z:0},rotation:{x:0,y:0,z:0}}});addPartToAssembly(d,side);addPartToAssembly(d,door);
 const joint=createHingeJoint(d,door.id,side.id,{quantity:2,verticalOffsetMm:100,spacingMm:500,openingAngleDeg:105,cupDiameterMm:35,cupDepthMm:12,mountingHoleDiameterMm:5});const re=deserializeDesign(serializeDesign(d));assert.equal(re.joints.find(j=>j.id===joint.id)!.hardwareInstanceIds.length,2);assert.equal(re.joints.find(j=>j.id===joint.id)!.machiningFeatureIds.length,4);assert.equal(re.kinematics.find(k=>k.jointId===joint.id)!.maxValue,105);
});
