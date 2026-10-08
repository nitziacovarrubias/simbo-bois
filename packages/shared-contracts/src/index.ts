import { z } from 'zod';

export const Vec3Schema = z.object({ x:z.number().finite(), y:z.number().finite(), z:z.number().finite() });
export const TransformSchema = z.object({ position:Vec3Schema, rotation:Vec3Schema });
const positiveMm = z.number().finite().positive();
const nonNegativeMm = z.number().finite().nonnegative();
const metadata = z.record(z.unknown());
const dimensions3 = z.object({widthMm:positiveMm,heightMm:positiveMm,depthMm:positiveMm});
const edgeSchema=z.object({mode:z.enum(['NONE','EDGE_BAND']),materialId:z.string().optional(),type:z.string().optional()}).passthrough();
const edgeBandingSchema=z.object({TOP:edgeSchema,BOTTOM:edgeSchema,LEFT:edgeSchema,RIGHT:edgeSchema}).passthrough();
const partSchema = z.object({
  id:z.string().min(1), name:z.string().min(1), shape:z.string(), semanticRole:z.string(),
  dimensions:z.object({widthMm:positiveMm,heightMm:positiveMm,thicknessMm:positiveMm}).passthrough(),
  transform:TransformSchema, materialId:z.string().optional(), grainDirection:z.string(), edgeBanding:edgeBandingSchema,
  manufacturable:z.boolean(), machiningFeatureIds:z.array(z.string()), metadata
}).passthrough();
const cutListOriginSchema = z.object({
  partId:z.string().min(1),partName:z.string().min(1),assemblyPath:z.array(z.object({id:z.string().min(1),name:z.string().min(1)})),
  moduleInstanceId:z.string().optional(),moduleInstanceName:z.string().optional(),moduleDefinitionId:z.string().optional(),moduleDefinitionName:z.string().optional(),
  moduleVersionId:z.string().optional(),sourceModuleEntityId:z.string().optional(),sourceModuleEntityName:z.string().optional()
});
export const CutListItemSchema = z.object({
  id:z.string().min(1),name:z.string().min(1),widthMm:positiveMm,heightMm:positiveMm,thicknessMm:positiveMm,
  materialName:z.string().optional(),grainDirection:z.string().min(1),quantity:z.number().int().positive(),origins:z.array(cutListOriginSchema)
});
export const CutListResultSchema = z.object({items:z.array(CutListItemSchema)});
export type CutListResult = z.infer<typeof CutListResultSchema>;

export const RequiredOpeningSchema = dimensions3.extend({
  offsets:z.object({leftMm:z.number().optional(),rightMm:z.number().optional(),topMm:z.number().optional(),bottomMm:z.number().optional(),frontMm:z.number().optional(),backMm:z.number().optional()}).optional(),
  metadata
});
export const ServicePointTypeSchema=z.enum(['ELECTRICAL','WATER_SUPPLY','DRAIN','GAS','VENT','LIGHTING','DATA','OTHER']);
export const ServiceRequirementSchema=z.object({
  serviceType:ServicePointTypeSchema,required:z.boolean(),maxDistanceMm:positiveMm.optional(),
  preferredRegion:z.object({offset:Vec3Schema,dimensions:dimensions3.optional()}).optional(),metadata
});
export const ClearanceZoneTemplateSchema=z.object({
  id:z.string().min(1),name:z.string().min(1),type:z.enum(['INSTALLATION','VENTILATION','DOOR_SWING','DRAWER_ACCESS','MAINTENANCE','SAFETY','USER_ACCESS','CUSTOM']),
  shape:z.enum(['BOX','CYLINDER']),dimensions:dimensions3,transform:TransformSchema,severity:z.enum(['INFO','WARNING']),description:z.string(),metadata
});
export const ClearanceZoneSchema=ClearanceZoneTemplateSchema.extend({ownerId:z.string().min(1),coordinateSpace:z.enum(['OWNER_LOCAL','WORLD']),hidden:z.boolean().optional()});
export const ApplianceDefinitionSchema=z.object({
  id:z.string().min(1),name:z.string().min(1),category:z.enum(['REFRIGERATOR','OVEN','MICROWAVE','DISHWASHER','COOKTOP','RANGE','HOOD','WASHER','DRYER','CUSTOM','OTHER']),
  manufacturer:z.string().optional(),model:z.string().optional(),dimensions:dimensions3,requiredOpening:RequiredOpeningSchema.optional(),
  clearanceZones:z.array(ClearanceZoneTemplateSchema),serviceRequirements:z.array(ServiceRequirementSchema),
  doorMotion:z.object({type:z.enum(['REVOLUTE','PRISMATIC']),axis:Vec3Schema,pivot:Vec3Schema.optional(),minValue:z.number().finite(),maxValue:z.number().finite(),accessEnvelope:dimensions3.optional(),metadata}).optional(),
  accessEnvelope:z.object({dimensions:dimensions3,transform:TransformSchema,metadata}).optional(),installationMetadata:metadata,manufacturable:z.boolean().optional(),
  colorHex:z.string().regex(/^#[0-9A-Fa-f]{6}$/),metadata
});
export const ApplianceInstanceSchema=z.object({
  id:z.string().min(1),definitionId:z.string().min(1),name:z.string().min(1),transform:TransformSchema,dimensionsOverride:dimensions3.partial().optional(),
  availableOpening:RequiredOpeningSchema.optional(),installedInAssemblyId:z.string().optional(),installedInModuleInstanceId:z.string().optional(),linkedCutoutId:z.string().optional(),hidden:z.boolean().optional(),metadata
});
export const ServicePointSchema=z.object({
  id:z.string().min(1),name:z.string().min(1),type:ServicePointTypeSchema,position:Vec3Schema,orientation:Vec3Schema.optional(),diameterMm:positiveMm.optional(),
  size:z.object({widthMm:positiveMm.optional(),heightMm:positiveMm.optional(),depthMm:positiveMm.optional()}).optional(),hidden:z.boolean().optional(),metadata
});
export const CountertopOutlineSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('RECTANGULAR'),widthMm:positiveMm,depthMm:positiveMm}),
  z.object({type:z.literal('L_SHAPE'),widthMm:positiveMm,depthMm:positiveMm,returnWidthMm:positiveMm,returnDepthMm:positiveMm,returnSide:z.enum(['LEFT','RIGHT'])}),
  z.object({type:z.literal('CUSTOM_POLYGON'),points:z.array(z.object({xMm:z.number().finite(),yMm:z.number().finite()})).min(3)})
]);
export const CountertopSchema=z.object({
  id:z.string().min(1),name:z.string().min(1),outline:CountertopOutlineSchema,thicknessMm:positiveMm,heightMm:nonNegativeMm,materialDefinitionId:z.string().optional(),
  colorHex:z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),roughness:z.number().min(0).max(1).optional(),metalness:z.number().min(0).max(1).optional(),
  edgeProfile:z.enum(['SQUARE','BEVEL','ROUNDED','CUSTOM']).optional(),transform:TransformSchema,cutoutIds:z.array(z.string()),hidden:z.boolean().optional(),metadata
});
export const CutoutSchema=z.object({
  id:z.string().min(1),countertopId:z.string().min(1),type:z.enum(['SINK','COOKTOP','FAUCET','SOCKET','CUSTOM']),position2D:z.object({xMm:z.number().finite(),yMm:z.number().finite()}),
  widthMm:positiveMm,depthMm:positiveMm,radiusMm:nonNegativeMm.optional(),rotation:z.number().finite(),linkedApplianceInstanceId:z.string().optional(),metadata
});
export const FunctionalZoneSchema=z.object({
  id:z.string().min(1),name:z.string().min(1),type:z.enum(['STORAGE','HANGING','DRAWERS','APPLIANCE','SINK','COOKING','PREP','CUSTOM']),dimensions:dimensions3,transform:TransformSchema,hidden:z.boolean().optional(),metadata
});
export const PlanningRuleProfileSchema=z.object({
  id:z.string().min(1),name:z.string().min(1),enabled:z.boolean(),source:z.enum(['DEMO','REFERENCE','BOIS','MANUFACTURER','LOCAL_CODE','CUSTOM']),sourceLabel:z.string().optional(),jurisdiction:z.string().optional(),
  rules:z.array(z.object({id:z.string().min(1),type:z.string().min(1),enabled:z.boolean(),parameters:z.record(z.union([z.number(),z.string(),z.boolean()])),message:z.string().optional(),suggestedAction:z.string().optional(),metadata})),metadata
}).passthrough();

const scalar = z.union([z.number().finite(), z.string(), z.boolean()]);
const assemblySchema = z.object({id:z.string().min(1),name:z.string(),children:z.array(z.object({kind:z.enum(['PART','ASSEMBLY']),id:z.string().min(1)}).passthrough()),transform:TransformSchema,metadata}).passthrough();
const materialSchema = z.object({id:z.string().min(1),name:z.string(),category:z.string(),colorHex:z.string().regex(/^#[0-9A-Fa-f]{6}$/)}).passthrough();
const bindingSchema = z.object({id:z.string().min(1),targetPath:z.string(),expression:z.object({type:z.string()}).passthrough(),enabled:z.boolean()}).passthrough();
const constraintSchema = z.object({id:z.string().min(1),type:z.string(),entityIds:z.array(z.string()),parameters:z.record(scalar),enabled:z.boolean()}).passthrough();
const jointSchema = z.object({id:z.string().min(1),partAId:z.string(),partBId:z.string(),hardwareInstanceIds:z.array(z.string()),machiningFeatureIds:z.array(z.string())}).passthrough();
const hardwareDefinitionSchema = z.object({id:z.string().min(1)}).passthrough();
const hardwareInstanceSchema = z.object({id:z.string().min(1),definitionId:z.string(),connectedPartIds:z.array(z.string()),jointId:z.string().optional()}).passthrough();
const machiningSchema = z.object({id:z.string().min(1),partId:z.string(),jointId:z.string().optional()}).passthrough();
export const ParameterDefinitionSchema = z.object({id:z.string().min(1),key:z.string().min(1),label:z.string(),type:z.enum(['NUMBER','SELECT','BOOLEAN','COLOR']),defaultValue:scalar,min:z.number().finite().optional(),max:z.number().finite().optional(),options:z.array(z.object({label:z.string(),value:z.union([z.string(),z.number().finite()])}).passthrough()).optional()}).passthrough();
export const ModuleDefinitionSchema = z.object({id:z.string().min(1),name:z.string(),parameterDefinitions:z.array(ParameterDefinitionSchema),snapDefinitions:z.array(z.unknown()),origin:TransformSchema,versionIds:z.array(z.string()),currentVersionId:z.string(),tags:z.array(z.string()),metadata}).passthrough();
export const ModuleVersionSchema = z.object({id:z.string().min(1),definitionId:z.string(),version:z.number().int().positive(),createdAt:z.string(),immutable:z.literal(true),snapshot:z.object({rootAssemblyId:z.string(),parts:z.array(partSchema),assemblies:z.array(assemblySchema),constraints:z.array(constraintSchema),bindings:z.array(bindingSchema),joints:z.array(jointSchema),hardwareDefinitions:z.array(hardwareDefinitionSchema),hardwareInstances:z.array(hardwareInstanceSchema),machiningFeatures:z.array(machiningSchema),kinematics:z.array(z.unknown()),materials:z.array(materialSchema),snapDefinitions:z.array(z.unknown()),parameterBindings:z.array(bindingSchema)}).passthrough()}).passthrough();
export const ModuleInstanceSchema = z.object({id:z.string().min(1),definitionId:z.string(),versionId:z.string(),rootAssemblyId:z.string(),name:z.string(),transform:TransformSchema,parameterValues:z.record(scalar),detached:z.boolean(),metadata}).passthrough();

const visibilitySchema=z.object({ROOM:z.boolean(),PARTS:z.boolean(),MODULES:z.boolean(),HARDWARE:z.boolean(),MACHINING:z.boolean(),GUIDES:z.boolean(),SECTIONS:z.boolean(),DIMENSIONS:z.boolean(),APPLIANCES:z.boolean(),COUNTERTOPS:z.boolean(),CLEARANCES:z.boolean(),SERVICES:z.boolean(),FUNCTIONAL_ZONES:z.boolean()});
export const DesignDocumentSchema = z.object({
  schemaVersion:z.literal(2), id:z.string().min(1),
  room:z.object({id:z.string(),shape:z.literal('RECTANGULAR'),widthMm:positiveMm,depthMm:positiveMm,heightMm:positiveMm}).passthrough(),
  parts:z.array(partSchema), assemblies:z.array(assemblySchema),
  rootAssemblyId:z.string(), materials:z.array(materialSchema),
  constraints:z.array(constraintSchema), bindings:z.array(bindingSchema), joints:z.array(jointSchema), hardwareDefinitions:z.array(hardwareDefinitionSchema), hardwareInstances:z.array(hardwareInstanceSchema), machiningFeatures:z.array(machiningSchema),
  moduleDefinitions:z.array(ModuleDefinitionSchema), moduleVersions:z.array(ModuleVersionSchema), moduleInstances:z.array(ModuleInstanceSchema),
  servicePoints:z.array(ServicePointSchema),clearanceZones:z.array(ClearanceZoneSchema),applianceDefinitions:z.array(ApplianceDefinitionSchema),applianceInstances:z.array(ApplianceInstanceSchema),
  countertops:z.array(CountertopSchema),cutouts:z.array(CutoutSchema),functionalZones:z.array(FunctionalZoneSchema),sinks:z.array(z.unknown()),
  drillingPatternDefinitions:z.array(z.unknown()),assemblySteps:z.array(z.unknown()),dimensionAnnotations:z.array(z.unknown()),fabricationRuleProfiles:z.array(z.unknown()),planningRuleProfiles:z.array(PlanningRuleProfileSchema),
  kinematics:z.array(z.unknown()),sectionPlanes:z.array(z.unknown()),scenes:z.array(z.object({presentation:z.object({visibility:visibilitySchema}).passthrough()}).passthrough()),activeSceneId:z.string().optional(),
  metadata:z.object({name:z.string(),createdAt:z.string(),updatedAt:z.string(),draftRevision:z.number()}).passthrough()
}).passthrough();
export const RevisionRequestSchema=z.object({expectedRevision:z.number().int().nonnegative()}).strict();
export const SaveDesignRequestSchema=z.object({design:DesignDocumentSchema,expectedRevision:z.number().int().nonnegative()}).strict();
export const CreateProjectRequestSchema=z.object({name:z.string().trim().min(1).max(120)});
export type SaveDesignRequest=z.infer<typeof SaveDesignRequestSchema>;
