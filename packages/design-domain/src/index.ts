/** SIMBO domain model. No React, Three.js, Prisma, or browser APIs are imported here. */
export type Id = string;
export type Vec3 = { x: number; y: number; z: number };
export type Euler3 = { x: number; y: number; z: number };
export type Transform = { position: Vec3; rotation: Euler3 };
export type HexColor = string;

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const euler3 = (x = 0, y = 0, z = 0): Euler3 => ({ x, y, z });
export const identityTransform = (): Transform => ({ position: vec3(), rotation: euler3() });

let idCounter = 0;
export function createId(prefix = 'id'): Id {
  idCounter += 1;
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${random}`;
}

export type PartShape = 'RECTANGULAR_PANEL' | 'POLYGON_PANEL' | 'PROFILE_EXTRUSION' | 'CYLINDER' | 'CUSTOM_PROFILE';
export type SemanticRole =
  | 'GENERIC_PANEL' | 'LEFT_SIDE' | 'RIGHT_SIDE' | 'BOTTOM' | 'TOP' | 'SHELF' | 'BACK' | 'DOOR'
  | 'DRAWER_FRONT' | 'DRAWER_SIDE' | 'DRAWER_BACK' | 'DRAWER_BOTTOM' | 'FILLER' | 'END_PANEL'
  | 'TOE_KICK' | 'COUNTERTOP' | 'BACKSPLASH' | 'DECORATIVE_PANEL' | 'DIVIDER' | 'BACK_PANEL' | 'SHOE_SHELF';
export type GrainDirection = 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'CUSTOM';
export type EdgeBandingMode = 'NONE' | 'EDGE_BAND';
export type EdgeName = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
export type EdgeBanding = Record<EdgeName, { mode: EdgeBandingMode; materialId?: Id; type?: string }>;
export type RectangularPanelDimensions = { widthMm: number; heightMm: number; thicknessMm: number };
export type PolygonPoint = { xMm: number; yMm: number };
export type PartDimensions = RectangularPanelDimensions & { polygon?: PolygonPoint[]; radiusMm?: number; lengthMm?: number };

export interface Part {
  id: Id;
  name: string;
  shape: PartShape;
  semanticRole: SemanticRole;
  dimensions: PartDimensions;
  transform: Transform;
  materialId?: Id;
  grainDirection: GrainDirection;
  edgeBanding: EdgeBanding;
  manufacturable: boolean;
  machiningFeatureIds: Id[];
  hidden?: boolean;
  locked?: boolean;
  tags?: string[];
  metadata: Record<string, unknown>;
}

export type AssemblyChild = { kind: 'PART' | 'ASSEMBLY'; id: Id };
export interface Assembly {
  id: Id;
  name: string;
  children: AssemblyChild[];
  transform: Transform;
  hidden?: boolean;
  locked?: boolean;
  tags?: string[];
  metadata: Record<string, unknown>;
}

export type ParameterType = 'NUMBER' | 'SELECT' | 'BOOLEAN' | 'COLOR';
export interface ParameterDefinition {
  id: Id;
  key: string;
  label: string;
  type: ParameterType;
  unit?: 'mm' | 'deg' | 'none';
  defaultValue: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number }>;
  ui?: 'INPUT' | 'SLIDER' | 'SELECT' | 'TOGGLE' | 'COLOR';
  description?: string;
}

export type BindingExpression =
  | { type: 'Literal'; value: number | string | boolean }
  | { type: 'Reference'; path: string }
  | { type: 'Add' | 'Subtract' | 'Multiply' | 'Divide' | 'Min' | 'Max'; left: BindingExpression; right: BindingExpression }
  | { type: 'Clamp'; value: BindingExpression; min: BindingExpression; max: BindingExpression };

export interface Binding {
  id: Id;
  targetPath: string;
  expression: BindingExpression;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export type ConstraintType = 'FACE_COINCIDENT' | 'FACE_OFFSET' | 'AXIS_ALIGN' | 'CENTER' | 'DISTANCE' | 'EQUAL_DIMENSION' | 'PARALLEL' | 'PERPENDICULAR' | 'LOCK_AXIS' | 'DIMENSION_BINDING' | 'BOUNDARY';
export interface Constraint {
  id: Id;
  type: ConstraintType;
  entityIds: Id[];
  parameters: Record<string, number | string | boolean>;
  enabled: boolean;
  bindingId?: Id;
  metadata?: Record<string, unknown>;
}

export type AnchorKind = 'POINT' | 'EDGE' | 'FACE' | 'AXIS' | 'CENTER' | 'CUSTOM';
export interface Anchor {
  kind: AnchorKind;
  position: Vec3;
  normal?: Vec3;
  axis?: Vec3;
  name?: string;
}

export interface SnapDefinition {
  id: Id;
  name: string;
  entityId?: Id;
  position: Vec3;
  normal?: Vec3;
  orientation?: Euler3;
  compatibleTypes: string[];
  metadata: Record<string, unknown>;
}

export type JointType = 'SCREW' | 'DOWEL' | 'CAM_CONNECTOR' | 'HINGE' | 'DRAWER_SLIDE' | 'SHELF_SUPPORT' | 'BRACKET' | 'ANGLE_BRACKET' | 'WALL_HANGER' | 'LEG' | 'TOE_KICK_CLIP' | 'HANDLE' | 'PULL' | 'GENERIC_FASTENER';
export interface Joint {
  id: Id;
  type: JointType;
  partAId: Id;
  partBId: Id;
  anchorA: Anchor;
  anchorB: Anchor;
  hardwareInstanceIds: Id[];
  machiningFeatureIds: Id[];
  parameters: Record<string, number | string | boolean | Vec3>;
  metadata: Record<string, unknown>;
}

export type HardwareCategory = 'SCREW' | 'DOWEL' | 'HINGE' | 'DRAWER_SLIDE' | 'SHELF_SUPPORT' | 'BRACKET' | 'HANGER' | 'LEG' | 'HANDLE' | 'ACCESSORY' | 'GENERIC';
export interface MountingHoleDefinition {
  offset: Vec3;
  diameterMm: number;
  depthMm?: number;
  type?: 'BORE' | 'THROUGH_HOLE' | 'COUNTERSINK' | 'COUNTERBORE';
}
export interface HardwareDefinition {
  id: Id;
  name: string;
  category: HardwareCategory;
  manufacturer?: string;
  productCode?: string;
  dimensions: Record<string, number>;
  mountingPattern: MountingHoleDefinition[];
  compatibilityRules?: Record<string, unknown>;
  kinematics?: { type: 'REVOLUTE' | 'PRISMATIC'; axis: Vec3; maxAngleDeg?: number; maxDistanceMm?: number };
  colorHex: HexColor;
  metadata: Record<string, unknown>;
}
export interface HardwareInstance {
  id: Id;
  definitionId: Id;
  position: Vec3;
  orientation: Euler3;
  parameters: Record<string, number | string | boolean>;
  connectedPartIds: Id[];
  jointId?: Id;
  hidden?: boolean;
  metadata: Record<string, unknown>;
}

export type MachiningType = 'BORE' | 'THROUGH_HOLE' | 'COUNTERSINK' | 'COUNTERBORE' | 'SLOT' | 'GROOVE' | 'POCKET' | 'CUTOUT';
export interface MachiningFeature {
  id: Id;
  partId: Id;
  type: MachiningType;
  position: Vec3;
  orientation: Euler3;
  diameterMm?: number;
  depthMm?: number;
  widthMm?: number;
  heightMm?: number;
  radiusMm?: number;
  parameters: Record<string, number | string | boolean>;
  jointId?: Id;
  metadata: Record<string, unknown>;
}

export interface DrillingPatternDefinition { id:Id; name:string; diameterMm:number; spacingMm:number; startOffsetMm:number; endOffsetMm:number; referenceEdge:EdgeName; depthMm:number; repeatCount:number; metadata:Record<string,unknown>; }
export interface AssemblyStep { id:Id; order:number; partIds:Id[]; jointIds:Id[]; description:string; metadata:Record<string,unknown>; }
export interface DimensionAnnotation { id:Id; pointA:Vec3; pointB:Vec3; label?:string; persistent:boolean; metadata:Record<string,unknown>; }
export interface FabricationRuleProfile { id:Id; name:string; minimumCornerRadiusMm?:number; rules:Record<string,number|string|boolean>; metadata:Record<string,unknown>; }
export type PlanningRuleSource = 'DEMO'|'REFERENCE'|'BOIS'|'MANUFACTURER'|'LOCAL_CODE'|'CUSTOM';
export interface PlanningRule { id:Id; type:string; enabled:boolean; parameters:Record<string,number|string|boolean>; message?:string; suggestedAction?:string; metadata:Record<string,unknown>; }
export interface PlanningRuleProfile { id:Id; name:string; enabled:boolean; source:PlanningRuleSource; sourceLabel?:string; jurisdiction?:string; rules:PlanningRule[]; metadata:Record<string,unknown>; }
export interface PlanningIssue { severity:'INFO'|'WARNING'|'ERROR'; ruleId:string; entityIds:Id[]; message:string; source:string; suggestedAction?:string; metadata?:Record<string,unknown>; }

export interface MaterialDefinition {
  id: Id;
  name: string;
  category: string;
  colorHex: HexColor;
  thicknessMm?: number;
  roughness?: number;
  metalness?: number;
  metadata: Record<string, unknown>;
}

export type RoomElementType = 'WALL' | 'DOOR' | 'WINDOW' | 'COLUMN' | 'BEAM' | 'OBSTACLE';
export interface RoomOpening { id: Id; type: 'DOOR' | 'WINDOW'; wall: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'; offsetMm: number; widthMm: number; heightMm: number; sillHeightMm?: number; openingDirection?: 'LEFT' | 'RIGHT' | 'IN' | 'OUT'; }
export interface RoomObstacle { id: Id; type: 'COLUMN' | 'BEAM' | 'OBSTACLE'; dimensions: RectangularPanelDimensions; transform: Transform; }
export interface Room {
  id: Id;
  shape: 'RECTANGULAR';
  widthMm: number;
  depthMm: number;
  heightMm: number;
  wallThicknessMm: number;
  openings: RoomOpening[];
  obstacles: RoomObstacle[];
}

export type Dimensions3 = { widthMm:number; heightMm:number; depthMm:number };
export type ServicePointType = 'ELECTRICAL' | 'WATER_SUPPLY' | 'DRAIN' | 'GAS' | 'VENT' | 'LIGHTING' | 'DATA' | 'OTHER';
export interface ServicePoint {
  id:Id; name:string; type:ServicePointType; position:Vec3; orientation?:Euler3; diameterMm?:number;
  size?:{widthMm?:number;heightMm?:number;depthMm?:number}; hidden?:boolean; metadata:Record<string,unknown>;
}
export interface ServiceRequirement {
  serviceType:ServicePointType; required:boolean; maxDistanceMm?:number;
  preferredRegion?:{offset:Vec3;dimensions?:Dimensions3}; metadata:Record<string,unknown>;
}
export interface RequiredOpening {
  widthMm:number; heightMm:number; depthMm:number;
  offsets?:{leftMm?:number;rightMm?:number;topMm?:number;bottomMm?:number;frontMm?:number;backMm?:number};
  metadata:Record<string,unknown>;
}
export type ClearanceZoneType='INSTALLATION'|'VENTILATION'|'DOOR_SWING'|'DRAWER_ACCESS'|'MAINTENANCE'|'SAFETY'|'USER_ACCESS'|'CUSTOM';
export type ClearanceShape='BOX'|'CYLINDER';
export interface ClearanceZoneTemplate {
  id:Id; name:string; type:ClearanceZoneType; shape:ClearanceShape; dimensions:Dimensions3; transform:Transform;
  severity:'INFO'|'WARNING'; description:string; metadata:Record<string,unknown>;
}
export interface ClearanceZone extends ClearanceZoneTemplate { ownerId:Id; coordinateSpace:'OWNER_LOCAL'|'WORLD'; hidden?:boolean; }
export type ApplianceCategory='REFRIGERATOR'|'OVEN'|'MICROWAVE'|'DISHWASHER'|'COOKTOP'|'RANGE'|'HOOD'|'WASHER'|'DRYER'|'CUSTOM'|'OTHER';
export interface ApplianceDoorMotion {
  type:'REVOLUTE'|'PRISMATIC'; axis:Vec3; pivot?:Vec3; minValue:number; maxValue:number; accessEnvelope?:Dimensions3; metadata:Record<string,unknown>;
}
export interface ApplianceDefinition {
  id:Id; name:string; category:ApplianceCategory; manufacturer?:string; model?:string; dimensions:Dimensions3;
  requiredOpening?:RequiredOpening; clearanceZones:ClearanceZoneTemplate[]; serviceRequirements:ServiceRequirement[];
  doorMotion?:ApplianceDoorMotion; accessEnvelope?:{dimensions:Dimensions3;transform:Transform;metadata:Record<string,unknown>};
  installationMetadata:Record<string,unknown>; manufacturable?:boolean; colorHex:HexColor; metadata:Record<string,unknown>;
}
export interface ApplianceInstance {
  id:Id; definitionId:Id; name:string; transform:Transform; dimensionsOverride?:Partial<Dimensions3>; availableOpening?:RequiredOpening;
  installedInAssemblyId?:Id; installedInModuleInstanceId?:Id; linkedCutoutId?:Id; hidden?:boolean; metadata:Record<string,unknown>;
}
export type CountertopOutline =
  | {type:'RECTANGULAR';widthMm:number;depthMm:number}
  | {type:'L_SHAPE';widthMm:number;depthMm:number;returnWidthMm:number;returnDepthMm:number;returnSide:'LEFT'|'RIGHT'}
  | {type:'CUSTOM_POLYGON';points:Array<{xMm:number;yMm:number}>};
export type CountertopEdgeProfile='SQUARE'|'BEVEL'|'ROUNDED'|'CUSTOM';
export interface Countertop {
  id:Id; name:string; outline:CountertopOutline; thicknessMm:number; heightMm:number; materialDefinitionId?:Id; colorHex?:HexColor;
  roughness?:number; metalness?:number; edgeProfile?:CountertopEdgeProfile; transform:Transform; cutoutIds:Id[]; hidden?:boolean; metadata:Record<string,unknown>;
}
export interface Cutout {
  id:Id; countertopId:Id; type:'SINK'|'COOKTOP'|'FAUCET'|'SOCKET'|'CUSTOM'; position2D:{xMm:number;yMm:number};
  widthMm:number; depthMm:number; radiusMm?:number; rotation:number; linkedApplianceInstanceId?:Id; metadata:Record<string,unknown>;
}
export type FunctionalZoneType='STORAGE'|'HANGING'|'DRAWERS'|'APPLIANCE'|'SINK'|'COOKING'|'PREP'|'CUSTOM';
export interface FunctionalZone { id:Id; name:string; type:FunctionalZoneType; dimensions:Dimensions3; transform:Transform; hidden?:boolean; metadata:Record<string,unknown>; }
/** Legacy carrier retained only so v1 documents can be migrated. New sinks are ApplianceDefinitions/Instances. */
export interface Sink { id:Id; name:string; dimensions:Dimensions3; requiredCutout:Record<string,unknown>; serviceRequirements:ServicePointType[]; transform:Transform; metadata:Record<string,unknown>; }

export interface KinematicRelation {
  id: Id;
  type: 'REVOLUTE' | 'PRISMATIC';
  movingEntityId: Id;
  referenceEntityId: Id;
  jointId: Id;
  axis: Vec3;
  pivot: Vec3;
  minValue: number;
  maxValue: number;
  currentValue: number;
  metadata: Record<string, unknown>;
}

export type DisplayMode = 'TECHNICAL' | 'PRESENTATION' | 'XRAY' | 'HIDDEN_LINE' | 'WIREFRAME' | 'MONOCHROME' | 'MANUFACTURING' | 'SHADED';
export interface CameraState { projection: 'PERSPECTIVE'|'ORTHOGRAPHIC'; position: Vec3; target: Vec3; up: Vec3; fov: number; orthoScale: number; }

export type SectionScope = 'ALL' | 'PARTS' | 'ROOM' | 'HARDWARE';
/**
 * Sección visual no destructiva. Position es un punto world-space sobre el plano.
 * La geometría de Part no se reescribe. constantMm se conserva por compatibilidad
 * con documentos schemaVersion 1 y refleja dot(normal, position).
 */
export interface SectionPlane {
  id: Id;
  name: string;
  position: Vec3;
  normal: Vec3;
  enabled: boolean;
  inverted: boolean;
  scope?: SectionScope;
  constantMm: number;
}

export type SceneWallsMode = 'VISIBLE' | 'TRANSPARENT' | 'HIDDEN' | 'AUTO';
export type SceneQuality = 'PERFORMANCE' | 'BALANCED' | 'QUALITY';
export type VisibilityTag = 'ROOM' | 'PARTS' | 'MODULES' | 'HARDWARE' | 'MACHINING' | 'GUIDES' | 'SECTIONS' | 'DIMENSIONS' | 'APPLIANCES' | 'COUNTERTOPS' | 'CLEARANCES' | 'SERVICES' | 'FUNCTIONAL_ZONES';
export type VisibilityTagState = Record<VisibilityTag, boolean>;
export interface ScenePresentationSnapshot {
  quality: SceneQuality;
  wallsMode: SceneWallsMode;
  gridVisible: boolean;
  visibility: VisibilityTagState;
  activeSectionId?: Id;
  sectionVisibility: boolean;
  guidesVisibility: boolean;
  technicalOverlays: boolean;
}
export interface SceneDefinition {
  id: Id;
  name: string;
  camera: CameraState;
  /** Legacy entity visibility fields kept for schemaVersion 1 compatibility. Workspace isolation does not write these. */
  visibleEntityIds: Id[] | null;
  hiddenEntityIds: Id[];
  displayMode: DisplayMode;
  sectionPlaneIds: Id[];
  presentation: ScenePresentationSnapshot;
  order: number;
  metadata: Record<string,unknown>;
}

export interface ModuleSnapshot {
  rootAssemblyId: Id;
  parts: Part[];
  assemblies: Assembly[];
  constraints: Constraint[];
  bindings: Binding[];
  joints: Joint[];
  hardwareDefinitions: HardwareDefinition[];
  hardwareInstances: HardwareInstance[];
  machiningFeatures: MachiningFeature[];
  kinematics: KinematicRelation[];
  materials: MaterialDefinition[];
  snapDefinitions: SnapDefinition[];
  parameterBindings: Binding[];
}
export interface ModuleDefinition {
  id: Id;
  name: string;
  description?: string;
  parameterDefinitions: ParameterDefinition[];
  snapDefinitions: SnapDefinition[];
  /** Explicit insertion/reference origin in module-local coordinates. */
  origin: Transform;
  versionIds: Id[];
  currentVersionId: Id;
  tags: string[];
  metadata: Record<string,unknown>;
}
export interface ModuleVersion { id: Id; definitionId: Id; version: number; createdAt: string; snapshot: ModuleSnapshot; immutable: true; notes?: string; }
export interface ModuleInstance { id: Id; definitionId: Id; versionId: Id; rootAssemblyId: Id; name: string; transform: Transform; parameterValues: Record<string, number|string|boolean>; detached: boolean; metadata: Record<string,unknown>; }

export interface DesignMetadata { projectId?: Id; name: string; author?: string; createdAt: string; updatedAt: string; draftRevision: number; notes?: string; }
export interface DesignDocument {
  schemaVersion: 2;
  id: Id;
  room: Room;
  parts: Part[];
  assemblies: Assembly[];
  rootAssemblyId: Id;
  materials: MaterialDefinition[];
  constraints: Constraint[];
  bindings: Binding[];
  joints: Joint[];
  hardwareDefinitions: HardwareDefinition[];
  hardwareInstances: HardwareInstance[];
  machiningFeatures: MachiningFeature[];
  moduleDefinitions: ModuleDefinition[];
  moduleVersions: ModuleVersion[];
  moduleInstances: ModuleInstance[];
  servicePoints: ServicePoint[];
  clearanceZones: ClearanceZone[];
  applianceDefinitions: ApplianceDefinition[];
  applianceInstances: ApplianceInstance[];
  countertops: Countertop[];
  cutouts: Cutout[];
  functionalZones: FunctionalZone[];
  sinks: Sink[];
  drillingPatternDefinitions: DrillingPatternDefinition[];
  assemblySteps: AssemblyStep[];
  dimensionAnnotations: DimensionAnnotation[];
  fabricationRuleProfiles: FabricationRuleProfile[];
  planningRuleProfiles: PlanningRuleProfile[];
  kinematics: KinematicRelation[];
  sectionPlanes: SectionPlane[];
  scenes: SceneDefinition[];
  activeSceneId?: Id;
  metadata: DesignMetadata;
}

export interface ValidationIssue { code: string; severity: 'ERROR'|'WARNING'|'INFO'; entityId?: Id; message: string; metadata?: Record<string,unknown>; }

export function defaultEdgeBanding(): EdgeBanding {
  return {
    TOP: { mode: 'NONE' }, BOTTOM: { mode: 'NONE' }, LEFT: { mode: 'NONE' }, RIGHT: { mode: 'NONE' }
  };
}

export function createPanel(input: Partial<Part> & { name?: string; dimensions?: Partial<RectangularPanelDimensions> } = {}): Part {
  const dims: Partial<RectangularPanelDimensions> = input.dimensions ?? {};
  return {
    id: input.id ?? createId('part'),
    name: input.name ?? 'Panel',
    shape: input.shape ?? 'RECTANGULAR_PANEL',
    semanticRole: input.semanticRole ?? 'GENERIC_PANEL',
    dimensions: {
      widthMm: dims.widthMm ?? 700,
      heightMm: dims.heightMm ?? 500,
      thicknessMm: dims.thicknessMm ?? 18,
      ...(input.dimensions?.polygon ? { polygon: input.dimensions.polygon } : {})
    },
    transform: structuredClone(input.transform ?? identityTransform()),
    materialId: input.materialId,
    grainDirection: input.grainDirection ?? 'NONE',
    edgeBanding: structuredClone(input.edgeBanding ?? defaultEdgeBanding()),
    manufacturable: input.manufacturable ?? true,
    machiningFeatureIds: [...(input.machiningFeatureIds ?? [])],
    hidden: input.hidden ?? false,
    locked: input.locked ?? false,
    tags: [...(input.tags ?? [])],
    metadata: structuredClone(input.metadata ?? {})
  };
}

export function createAssembly(name = 'Assembly', children: AssemblyChild[] = []): Assembly {
  return { id: createId('assembly'), name, children: structuredClone(children), transform: identityTransform(), hidden: false, locked: false, tags: [], metadata: {} };
}

export function createMaterial(name = 'Blanco demo', colorHex = '#FFFFFF'): MaterialDefinition {
  return { id: createId('material'), name, category: 'BOARD', colorHex: normalizeHex(colorHex), roughness: 0.62, metalness: 0, metadata: { demo: true } };
}

export function createRoom(widthMm = 3400, depthMm = 2800, heightMm = 2400): Room {
  return { id: createId('room'), shape: 'RECTANGULAR', widthMm, depthMm, heightMm, wallThicknessMm: 100, openings: [], obstacles: [] };
}

export function createDefaultCamera(): CameraState {
  return { projection: 'PERSPECTIVE', position: { x: 4200, y: 3200, z: 4200 }, target: { x: 0, y: 900, z: 0 }, up: { x: 0, y: 1, z: 0 }, fov: 45, orthoScale: 5000 };
}

export function createEmptyDesign(name = 'Proyecto SIMBO'): DesignDocument {
  const material = createMaterial();
  const root = createAssembly('Diseño');
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: createId('design'),
    room: createRoom(),
    parts: [],
    assemblies: [root],
    rootAssemblyId: root.id,
    materials: [material],
    constraints: [],
    bindings: [],
    joints: [],
    hardwareDefinitions: [],
    hardwareInstances: [],
    machiningFeatures: [],
    moduleDefinitions: [],
    moduleVersions: [],
    moduleInstances: [],
    servicePoints: [],
    clearanceZones: [],
    applianceDefinitions: [],
    applianceInstances: [],
    countertops: [],
    cutouts: [],
    functionalZones: [],
    sinks: [],
    drillingPatternDefinitions: [],
    assemblySteps: [],
    dimensionAnnotations: [],
    fabricationRuleProfiles: [],
    planningRuleProfiles: [],
    kinematics: [],
    sectionPlanes: [],
    scenes: [],
    metadata: { name, createdAt: now, updatedAt: now, draftRevision: 0 }
  };
}

export function cloneDesign(design: DesignDocument): DesignDocument { return structuredClone(design); }
export function serializeDesign(design: DesignDocument): string { return JSON.stringify(design); }
export function deserializeDesign(json: string): DesignDocument {
  const raw = JSON.parse(json) as unknown;
  return migrateDesign(raw);
}

export function migrateDesign(raw: unknown): DesignDocument {
  if (!raw || typeof raw !== 'object') throw new Error('DesignDocument inválido');
  const candidate = structuredClone(raw) as Record<string, unknown>;
  const version = candidate.schemaVersion;
  if (version !== 1 && version !== 2) throw new Error(`schemaVersion no soportado: ${String(version)}`);

  const design = candidate as unknown as DesignDocument;
  const arrayDefaults = [
    'parts','assemblies','materials','constraints','bindings','joints','hardwareDefinitions','hardwareInstances','machiningFeatures',
    'moduleDefinitions','moduleVersions','moduleInstances','servicePoints','clearanceZones','applianceDefinitions','applianceInstances',
    'countertops','cutouts','functionalZones','sinks','drillingPatternDefinitions','assemblySteps','dimensionAnnotations','fabricationRuleProfiles',
    'planningRuleProfiles','kinematics','sectionPlanes','scenes'
  ] as const;
  for (const key of arrayDefaults) if (!Array.isArray((design as unknown as Record<string,unknown>)[key])) (design as unknown as Record<string,unknown>)[key] = [];

  if (version === 1) {
    const legacy = design as unknown as Record<string, unknown>;
    legacy.applianceDefinitions = (legacy.applianceDefinitions as Array<Record<string,unknown>>).map(def => ({
      id:String(def.id),
      name:String(def.name ?? 'Appliance'),
      category:(def.category ?? def.type ?? 'OTHER') as ApplianceCategory,
      manufacturer:typeof def.manufacturer === 'string' ? def.manufacturer : undefined,
      model:typeof def.model === 'string' ? def.model : undefined,
      dimensions:structuredClone(def.dimensions as Dimensions3),
      requiredOpening:(def.requiredOpening ?? def.installationOpening) ? {
        ...(structuredClone((def.requiredOpening ?? def.installationOpening) as Dimensions3)), metadata:{}
      } : undefined,
      clearanceZones:Array.isArray(def.clearanceZones) ? (def.clearanceZones as Array<Record<string,unknown>>).map((zone,index) => ({
        id:String(zone.id ?? `legacy-clearance-${index}`), name:String(zone.name ?? 'Clearance'),
        type:(zone.type ?? 'CUSTOM') as ClearanceZoneType, shape:(zone.shape ?? 'BOX') as ClearanceShape,
        dimensions:structuredClone(zone.dimensions as Dimensions3), transform:structuredClone((zone.transform ?? identityTransform()) as Transform),
        severity:(zone.severity ?? 'WARNING') as 'INFO'|'WARNING', description:String(zone.description ?? ''), metadata:structuredClone((zone.metadata ?? {}) as Record<string,unknown>)
      })) : [],
      serviceRequirements:Array.isArray(def.serviceRequirements) ? (def.serviceRequirements as unknown[]).map(item => typeof item === 'string'
        ? { serviceType:item as ServicePointType, required:true, metadata:{} }
        : { ...(structuredClone(item) as ServiceRequirement), metadata:structuredClone(((item as Record<string,unknown>).metadata ?? {}) as Record<string,unknown>) }) : [],
      doorMotion:def.doorMotion ? {
        type:((def.doorMotion as Record<string,unknown>).type ?? 'REVOLUTE') as 'REVOLUTE'|'PRISMATIC',
        axis:structuredClone(((def.doorMotion as Record<string,unknown>).axis ?? {x:0,y:1,z:0}) as Vec3),
        minValue:Number((def.doorMotion as Record<string,unknown>).minValue ?? 0),
        maxValue:Number((def.doorMotion as Record<string,unknown>).maxValue ?? (def.doorMotion as Record<string,unknown>).maxAngleDeg ?? 90),
        metadata:{}
      } : undefined,
      installationMetadata:structuredClone((def.installationMetadata ?? {}) as Record<string,unknown>),
      colorHex:typeof def.colorHex === 'string' ? def.colorHex : '#7F8589',
      metadata:structuredClone((def.metadata ?? {}) as Record<string,unknown>)
    }));
    legacy.applianceInstances = (legacy.applianceInstances as Array<Record<string,unknown>>).map(instance => ({
      id:String(instance.id), definitionId:String(instance.definitionId), name:String(instance.name ?? 'Appliance'),
      transform:structuredClone((instance.transform ?? identityTransform()) as Transform),
      dimensionsOverride:instance.dimensionsOverride ? structuredClone(instance.dimensionsOverride) : undefined,
      hidden:Boolean(instance.hidden), metadata:structuredClone((instance.metadata ?? {}) as Record<string,unknown>)
    }));
    legacy.servicePoints = (legacy.servicePoints as Array<Record<string,unknown>>).map(point => ({
      id:String(point.id), name:String(point.name ?? point.type ?? 'Servicio'), type:(point.type ?? 'OTHER') as ServicePointType,
      position:structuredClone((point.position ?? vec3()) as Vec3), orientation:point.orientation ? structuredClone(point.orientation) : undefined,
      diameterMm:typeof point.diameterMm === 'number' ? point.diameterMm : undefined,
      size:point.size ?? point.zone, hidden:Boolean(point.hidden), metadata:structuredClone((point.metadata ?? {}) as Record<string,unknown>)
    }));
    legacy.clearanceZones = (legacy.clearanceZones as Array<Record<string,unknown>>).map(zone => ({
      id:String(zone.id), ownerId:String(zone.ownerId), name:String(zone.name ?? 'Clearance'), type:(zone.type ?? 'CUSTOM') as ClearanceZoneType,
      shape:(zone.shape ?? 'BOX') as ClearanceShape, dimensions:structuredClone(zone.dimensions as Dimensions3),
      transform:structuredClone((zone.transform ?? identityTransform()) as Transform), severity:(zone.severity ?? 'WARNING') as 'INFO'|'WARNING',
      description:String(zone.description ?? ''), coordinateSpace:(zone.coordinateSpace ?? 'OWNER_LOCAL') as 'OWNER_LOCAL'|'WORLD', hidden:Boolean(zone.hidden),
      metadata:structuredClone((zone.metadata ?? {}) as Record<string,unknown>)
    }));
    const migratedCutouts: Cutout[] = [];
    legacy.countertops = (legacy.countertops as Array<Record<string,unknown>>).map((countertop,index) => {
      const part = typeof countertop.partId === 'string' ? design.parts.find(p=>p.id===countertop.partId) : undefined;
      const legacyCutouts = Array.isArray(countertop.cutouts) ? countertop.cutouts as Array<Record<string,unknown>> : [];
      const counterId = String(countertop.id ?? `legacy-countertop-${index}`);
      for (const [cutIndex, cut] of legacyCutouts.entries()) migratedCutouts.push({
        id:String(cut.id ?? `${counterId}-cutout-${cutIndex}`), countertopId:counterId, type:(cut.type ?? 'CUSTOM') as Cutout['type'],
        position2D:{xMm:Number((cut.position as Record<string,unknown> | undefined)?.x ?? 0),yMm:Number((cut.position as Record<string,unknown> | undefined)?.z ?? 0)},
        widthMm:Number(cut.widthMm ?? 1), depthMm:Number(cut.depthMm ?? 1), radiusMm:typeof cut.cornerRadiusMm === 'number' ? cut.cornerRadiusMm : undefined,
        rotation:Number(cut.rotation ?? 0), metadata:structuredClone((cut.metadata ?? {}) as Record<string,unknown>)
      });
      const thicknessMm=part?.dimensions.thicknessMm ?? 20;
      const transform=part ? {
        position:{x:part.transform.position.x,y:0,z:part.transform.position.z},
        rotation:{x:0,y:part.transform.rotation.y,z:0}
      } : identityTransform();
      const heightMm=part ? Math.max(0,part.transform.position.y-thicknessMm/2) : 900;
      if(part){
        part.hidden=true;
        part.manufacturable=false;
        part.metadata={...part.metadata,migratedToCountertopId:counterId,migrationNote:'Legacy countertop carrier Part retained only for reference.'};
      }
      return {
        id:counterId, name:String(countertop.name ?? part?.name ?? 'Cubierta'),
        outline:{type:'RECTANGULAR' as const,widthMm:part?.dimensions.widthMm ?? 1000,depthMm:part?.dimensions.heightMm ?? 600},
        thicknessMm, heightMm,
        materialDefinitionId:part?.materialId, transform,
        cutoutIds:legacyCutouts.map((cut,cutIndex)=>String(cut.id ?? `${counterId}-cutout-${cutIndex}`)),
        metadata:{...structuredClone((countertop.metadata ?? {}) as Record<string,unknown>),migratedFromV1:true,legacyPartId:part?.id}
      } satisfies Countertop;
    });
    legacy.cutouts = migratedCutouts;
    legacy.functionalZones = [];
    legacy.schemaVersion = 2;
  }

  design.schemaVersion = 2;
  for (const def of design.moduleDefinitions) {
    if (!Array.isArray(def.snapDefinitions)) def.snapDefinitions = [];
    if (!def.origin) def.origin = identityTransform();
  }
  for (const profile of design.planningRuleProfiles) {
    const legacyRules = profile.rules as unknown;
    profile.source = profile.source ?? 'CUSTOM';
    if (!Array.isArray(legacyRules)) {
      const record = (legacyRules && typeof legacyRules === 'object') ? legacyRules as Record<string,number|string|boolean> : {};
      profile.rules = Object.entries(record).map(([key,value]) => ({ id:`legacy-${key}`, type:key, enabled:true, parameters:{value}, metadata:{migratedFromV1:true} }));
    }
    profile.metadata = profile.metadata ?? {};
  }

  const visibilityDefaults: VisibilityTagState = {
    ROOM:true, PARTS:true, MODULES:true, HARDWARE:true, MACHINING:true, GUIDES:true, SECTIONS:true, DIMENSIONS:true,
    APPLIANCES:true, COUNTERTOPS:true, CLEARANCES:false, SERVICES:true, FUNCTIONAL_ZONES:false
  };
  for (const section of design.sectionPlanes) {
    const normalLength = Math.hypot(section.normal?.x ?? 0, section.normal?.y ?? 0, section.normal?.z ?? 0) || 1;
    section.normal = { x:(section.normal?.x ?? 1)/normalLength, y:(section.normal?.y ?? 0)/normalLength, z:(section.normal?.z ?? 0)/normalLength };
    const legacyConstant = Number.isFinite(section.constantMm) ? section.constantMm : 0;
    if (!section.position) section.position = { x:section.normal.x * legacyConstant, y:section.normal.y * legacyConstant, z:section.normal.z * legacyConstant };
    if (typeof section.inverted !== 'boolean') section.inverted = false;
    if (!section.scope) section.scope = 'ALL';
    section.constantMm = section.normal.x*section.position.x + section.normal.y*section.position.y + section.normal.z*section.position.z;
  }
  for (const scene of design.scenes) {
    if (!Array.isArray(scene.hiddenEntityIds)) scene.hiddenEntityIds = [];
    if (!Array.isArray(scene.sectionPlaneIds)) scene.sectionPlaneIds = [];
    if (!scene.presentation) scene.presentation = {
      quality:'BALANCED', wallsMode:'TRANSPARENT', gridVisible:true, visibility:{...visibilityDefaults},
      activeSectionId:scene.sectionPlaneIds[0], sectionVisibility:true, guidesVisibility:true, technicalOverlays:true
    };
    else {
      scene.presentation.visibility = { ...visibilityDefaults, ...(scene.presentation.visibility ?? {}) };
      scene.presentation.quality = scene.presentation.quality ?? 'BALANCED';
      scene.presentation.wallsMode = scene.presentation.wallsMode ?? 'TRANSPARENT';
      scene.presentation.gridVisible = scene.presentation.gridVisible !== false;
      scene.presentation.sectionVisibility = scene.presentation.sectionVisibility !== false;
      scene.presentation.guidesVisibility = scene.presentation.guidesVisibility !== false;
      scene.presentation.technicalOverlays = scene.presentation.technicalOverlays !== false;
    }
  }
  const issues = validateDesignStructural(design);
  const errors = issues.filter(i => i.severity === 'ERROR');
  if (errors.length) throw new Error(errors.map(e => e.message).join('; '));
  return design;
}

export const migrateDesignDocument = migrateDesign;

export function normalizeHex(value: string, fallback = '#B58A63'): HexColor {
  const v = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(v) ? v : fallback;
}

export function parseLengthToMm(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Medida no finita');
    return input;
  }
  const m = input.trim().toLowerCase().replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m)?$/);
  if (!m) throw new Error(`Medida inválida: ${input}`);
  const value = Number(m[1]);
  const unit = m[2] ?? 'mm';
  return value * (unit === 'm' ? 1000 : unit === 'cm' ? 10 : 1);
}

export function parseAngleDeg(input: string | number): number {
  if (typeof input === 'number') return input;
  const m = input.trim().toLowerCase().replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*(deg|°)?$/);
  if (!m) throw new Error(`Ángulo inválido: ${input}`);
  return Number(m[1]);
}

export function validateDesignStructural(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (code: string, entityId: Id | undefined, message: string) => issues.push({ code, severity: 'ERROR', entityId, message });
  if (design.schemaVersion !== 2) fail('SCHEMA_VERSION', design.id, 'schemaVersion debe ser 2');
  const ids = new Set<string>();
  const register = (id: string, kind: string) => { if (!id) fail('MISSING_ID', undefined, `${kind} sin id`); else if (ids.has(id)) fail('DUPLICATE_ID', id, `ID duplicado ${id}`); else ids.add(id); };
  register(design.id, 'DesignDocument'); register(design.room.id, 'Room');
  for (const p of design.parts) {
    register(p.id, 'Part');
    const d = p.dimensions;
    if (![d.widthMm,d.heightMm,d.thicknessMm].every(Number.isFinite) || d.widthMm <= 0 || d.heightMm <= 0 || d.thicknessMm <= 0) fail('INVALID_DIMENSIONS', p.id, `${p.name}: dimensiones deben ser > 0 y finitas`);
  }
  for (const a of design.assemblies) register(a.id, 'Assembly');
  for (const j of design.joints) register(j.id, 'Joint');
  for (const h of design.hardwareDefinitions) register(h.id, 'HardwareDefinition');
  for (const h of design.hardwareInstances) register(h.id, 'HardwareInstance');
  for (const m of design.machiningFeatures) register(m.id, 'MachiningFeature');
  for (const c of design.constraints) register(c.id, 'Constraint');
  for (const b of design.bindings) register(b.id, 'Binding');
  for (const d of design.moduleDefinitions) register(d.id, 'ModuleDefinition');
  for (const v of design.moduleVersions) register(v.id, 'ModuleVersion');
  for (const i of design.moduleInstances) register(i.id, 'ModuleInstance');
  for (const p of design.servicePoints) register(p.id, 'ServicePoint');
  for (const z of design.clearanceZones) register(z.id, 'ClearanceZone');
  for (const d of design.applianceDefinitions) register(d.id, 'ApplianceDefinition');
  for (const i of design.applianceInstances) register(i.id, 'ApplianceInstance');
  for (const c of design.countertops) register(c.id, 'Countertop');
  for (const c of design.cutouts) register(c.id, 'Cutout');
  for (const z of design.functionalZones) register(z.id, 'FunctionalZone');
  for (const p of design.planningRuleProfiles) register(p.id, 'PlanningRuleProfile');
  if (!design.assemblies.some(a => a.id === design.rootAssemblyId)) fail('ROOT_ASSEMBLY_MISSING', design.rootAssemblyId, 'Root Assembly inexistente');
  const partIds = new Set(design.parts.map(p => p.id));
  const assemblyIds = new Set(design.assemblies.map(a => a.id));
  const hardwareDefinitionIds = new Set(design.hardwareDefinitions.map(h => h.id));
  const jointIds = new Set(design.joints.map(j => j.id));
  for (const a of design.assemblies) for (const child of a.children) {
    if (child.kind === 'PART' && !partIds.has(child.id)) fail('ASSEMBLY_PART_REF', a.id, `Assembly ${a.name} referencia Part inexistente ${child.id}`);
    if (child.kind === 'ASSEMBLY' && !assemblyIds.has(child.id)) fail('ASSEMBLY_CHILD_REF', a.id, `Assembly ${a.name} referencia Assembly inexistente ${child.id}`);
  }
  for (const j of design.joints) {
    if (!partIds.has(j.partAId)) fail('JOINT_PART_A', j.id, `Joint referencia Part A inexistente ${j.partAId}`);
    if (!partIds.has(j.partBId)) fail('JOINT_PART_B', j.id, `Joint referencia Part B inexistente ${j.partBId}`);
  }
  for (const h of design.hardwareInstances) {
    if (!hardwareDefinitionIds.has(h.definitionId)) fail('HARDWARE_DEF_REF', h.id, `HardwareInstance referencia definición inexistente ${h.definitionId}`);
    if (h.jointId && !jointIds.has(h.jointId)) fail('HARDWARE_JOINT_REF', h.id, `HardwareInstance referencia Joint inexistente ${h.jointId}`);
  }
  for (const m of design.machiningFeatures) {
    if (!partIds.has(m.partId)) fail('MACHINING_PART_REF', m.id, `MachiningFeature referencia Part inexistente ${m.partId}`);
    if (m.jointId && !jointIds.has(m.jointId)) fail('MACHINING_JOINT_REF', m.id, `MachiningFeature referencia Joint inexistente ${m.jointId}`);
  }
  return issues;
}

export function findPart(design: DesignDocument, id: Id): Part {
  const part = design.parts.find(p => p.id === id); if (!part) throw new Error(`Part no encontrada: ${id}`); return part;
}
export function findAssembly(design: DesignDocument, id: Id): Assembly {
  const a = design.assemblies.find(v => v.id === id); if (!a) throw new Error(`Assembly no encontrado: ${id}`); return a;
}
export function touchDesign(design: DesignDocument): void { design.metadata.updatedAt = new Date().toISOString(); design.metadata.draftRevision += 1; }

export function addPartToAssembly(design: DesignDocument, part: Part, assemblyId = design.rootAssemblyId): void {
  if (design.parts.some(p => p.id === part.id)) throw new Error(`Part id duplicado ${part.id}`);
  design.parts.push(part);
  findAssembly(design, assemblyId).children.push({ kind: 'PART', id: part.id });
  touchDesign(design);
}

export function addAssemblyToAssembly(design: DesignDocument, assembly: Assembly, parentId = design.rootAssemblyId): void {
  design.assemblies.push(assembly);
  findAssembly(design, parentId).children.push({ kind: 'ASSEMBLY', id: assembly.id });
  touchDesign(design);
}


export {
  cloneTransform,
  composeTransforms,
  getApplianceWorldTransform,
  getAssemblyWorldTransform,
  getClearanceZoneWorldTransform,
  getCountertopWorldTransform,
  getHardwareWorldTransform,
  getJointAnchorWorld,
  getMachiningFeatureWorldTransform,
  getModuleInstanceForRootAssembly,
  getModuleInstanceWorldTransform,
  getParentAssemblyId,
  getPartWorldTransform,
  getServicePointWorldPosition,
  getServicePointWorldTransform,
  getWorldTransform,
  invertTransform,
  localToWorld,
  rotateVectorByEuler,
  setApplianceWorldTransform,
  setAssemblyWorldTransform,
  setCountertopWorldTransform,
  setModuleInstanceWorldTransform,
  setPartWorldTransform,
  setServicePointWorldTransform,
  worldToLocal,
  worldTransformToPartLocal
} from './spatial.ts';
