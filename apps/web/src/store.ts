import { create } from 'zustand';
import { apiClient } from './apiClient';
import {
  addPartToAssembly,
  cloneDesign,
  createEmptyDesign,
  createPanel,
  deserializeDesign,
  findPart,
  getAssemblyWorldTransform,
  getPartWorldTransform,
  getWorldTransform,
  serializeDesign,
  setPartWorldTransform,
  setApplianceWorldTransform,
  setCountertopWorldTransform,
  setServicePointWorldTransform,
  touchDesign,
  worldToLocal,
  type ApplianceInstance,
  type Binding,
  type CameraState,
  type Countertop,
  type Cutout,
  type DesignDocument,
  type DisplayMode,
  type Id,
  type ParameterDefinition,
  type ScenePresentationSnapshot,
  type SectionPlane,
  type ServicePointType,
  type Transform,
  type Vec3,
  type VisibilityTag,
  type VisibilityTagState,
} from '@simbo/design-domain';
import {
  InferenceEngine,
  InputManager,
  MeasurementsBuffer,
  CameraHistory,
  SnapEngine,
  ShortcutManager,
  ToolManager,
  alignParts,
  alignPartsPreview,
  alignViewToFace,
  axesTransformFromPoints,
  cameraPreset,
  captureScene,
  createGuidePoint,
  createGuideLine,
  createGuidePlane,
  createAngularGuide,
  createScene,
  createSectionPlane,
  duplicateScene,
  deleteScene as deleteSceneDefinition,
  defaultInferenceSettings,
  distributeParts,
  distributePartsAdvanced,
  dragThresholdExceeded,
  duplicateArray,
  linearArray,
  linearArrayPreviewTransforms,
  radialArray,
  radialArrayPreviewTransforms,
  flipEntity,
  fitAllCamera,
  fitRoomCamera,
  focusCamera,
  invertSection,
  lookAtSectionCamera,
  groupParts,
  measureDetailed,
  tapeGuideFromDistance,
  protractorAngle,
  movePartExact,
  reorderScenes,
  rebaseAssemblyOrigin,
  restrictSelectionToContext,
  selectSameMaterial,
  selectSameSemanticRole,
  selectSameModuleDefinition,
  entitySelectableByFilters,
  DEFAULT_SELECTION_FILTERS,
  restoreScenePresentation,
  resolveIsolationPartIds,
  rotateSection,
  nextSelection,
  resizePartExact,
  rotatePartExact,
  sectionPresetNormal,
  setSectionOrientation,
  setSectionPosition,
  synchronizeCameraState,
  zoomWindowCamera,
  ungroupAssembly,
  type Axis,
  type Guide,
  type GuideKind,
  type InferenceCandidate,
  type KeyboardInput,
  type MeasurementResult,
  type PointerInput,
  type ScreenPoint,
  type SelectionFilters,
  type SnapResult,
  type ToolId,
  type ToolPhase,
} from '@simbo/editor-engine';
import {
  createModuleDefinitionFromAssembly,
  detachModuleInstance,
  duplicateAssemblyTree,
  duplicateModuleInstance,
  instantiateModule,
  makeModuleInstanceUnique,
  setModuleDefinitionOrigin,
  updateModuleInstanceParameters,
} from '@simbo/module-engine';
import {
  createCountertop,
  createCutout,
  createServicePoint,
  demoApplianceDefinitions,
  duplicateAppliance,
  insertAppliance,
  linkApplianceToCutout,
} from '@simbo/kitchen-engine';
import {
  createDowelJoint,
  createDrawerSlideJoint,
  createHingeJoint,
  createScrewJoint,
  type DowelJointInput,
  type DrawerSlideInput,
  type HingeJointInput,
  type ScrewJointInput,
} from '@simbo/joinery-engine';
import { collectManufacturingData } from '@simbo/manufacturing-engine';
import {
  applianceWorldAabb,
  boxAabbAtTransform,
  clearanceZoneWorldAabb,
  countertopWorldAabb,
  cutoutWorldCenter,
  partWorldAabb,
  type Aabb,
} from '@simbo/geometry-engine';
import { modelHealth, planningIssues } from '@simbo/validation-engine';
import {
  DEFAULT_VISIBILITY_TAGS,
  DEFAULT_WORKSPACE_PREFERENCES,
  normalizeVisibilityTags,
  normalizeWorkspacePreferences,
  type QualityPreset,
  type WallsMode,
  type WorkspacePreferences,
} from './cadVisualSystem';
import { editorCommands, SHORTCUT_ACTION_COMMAND } from './commands';
import { editorEvents } from './editorEvents';
import { commandUnavailableReason, publishEditorFeedback } from './editorCommandFeedback';

const STORAGE = 'simbo.design.v1';
const WORKSPACE_STORAGE = 'simbo.workspace.sprint2.v1';
function initialWorkspace(): WorkspacePreferences {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE);
    if (raw) return normalizeWorkspacePreferences(JSON.parse(raw) as Partial<WorkspacePreferences>);
  } catch {
    /* localStorage puede no estar disponible */
  }
  return DEFAULT_WORKSPACE_PREFERENCES;
}
function persistWorkspace(preferences: WorkspacePreferences): void {
  try {
    localStorage.setItem(WORKSPACE_STORAGE, JSON.stringify(preferences));
  } catch {
    /* localStorage puede no estar disponible */
  }
}
function initialDesign(): DesignDocument {
  let design: DesignDocument;
  try {
    const raw = localStorage.getItem(STORAGE);
    design = raw ? deserializeDesign(raw) : createEmptyDesign('Proyecto nuevo');
  } catch {
    design = createEmptyDesign('Proyecto nuevo');
  }
  for (const definition of demoApplianceDefinitions())
    if (!design.applianceDefinitions.some((existing) => existing.id === definition.id))
      design.applianceDefinitions.push(structuredClone(definition));
  return design;
}

export type SaveStatus = 'GUARDADO' | 'GUARDANDO' | 'PENDIENTE' | 'ERROR';
export interface SelectionDrag {
  start: ScreenPoint;
  end: ScreenPoint;
  mode: 'WINDOW' | 'CROSSING';
}
export interface CameraTransition {
  from: CameraState;
  to: CameraState;
  startedAt: number;
  durationMs: number;
}
interface DirectMoveGesture {
  entityId: Id;
  originTool: 'SELECT' | 'MOVE';
  startScreen: ScreenPoint;
  startPoint: Vec3;
  dragging: boolean;
}

const toolManager = new ToolManager();
const inferenceEngine = new InferenceEngine();
const snapEngine = new SnapEngine();
const measurementBuffer = new MeasurementsBuffer();
const shortcutManager = new ShortcutManager();
const cameraHistory = new CameraHistory(20);

export interface RemoteProject {
  projectId: string;
  userId: string;
  connectionId: string;
  revision: number;
  savedDesign: string;
  persisted: boolean;
  approvedVersionId: string | null;
}
function projectCache(context: RemoteProject): string {
  return `simbo.project.${context.userId}.${context.projectId}`;
}
function cacheRemote(context: RemoteProject, design: DesignDocument): void {
  localStorage.setItem(
    projectCache(context),
    JSON.stringify({ design: JSON.parse(serializeDesign(design)), revision: context.revision }),
  );
}

interface EditorState {
  design: DesignDocument;
  selectedIds: Id[];
  hoveredId?: Id;
  activeTool: ToolId;
  toolPhase: ToolPhase;
  toolPreview?: Transform;
  toolPreviewEntityId?: Id;
  toolOriginal?: Transform;
  toolPivot?: Vec3;
  toolReferenceWorld?: Vec3;
  axisLock?: Axis;
  copyMode: boolean;
  angularSnapDeg: 1 | 5 | 15;
  displayMode: DisplayMode;
  camera: CameraState;
  previousCamera?: CameraState;
  isolatedIds: Id[] | null;
  workspaceHiddenIds: Id[];
  hiddenHistory: Id[][];
  editContextId?: Id;
  editContextPath: Id[];
  selectionFilters: SelectionFilters;
  visibilityTags: VisibilityTagState;
  gridVisible: boolean;
  sectionGizmosVisible: boolean;
  technicalOverlays: boolean;
  activeSectionId?: Id;
  activeSceneId?: Id;
  selectedSectionId?: Id;
  sectionDraft?: SectionPlane;
  cleanMode: boolean;
  presentationMode: boolean;
  commandPaletteOpen: boolean;
  presentationPlaying: boolean;
  presentationAllowNavigation: boolean;
  cameraTransition?: CameraTransition;
  saveStatus: SaveStatus;
  projectId?: string;
  remoteProject?: RemoteProject;
  saveError?: string;
  activePanel:
    'INSPECTOR' | 'MODULE' | 'JOINERY' | 'MANUFACTURING' | 'SCENES' | 'HEALTH' | 'LIBRARY';
  workspace: WorkspacePreferences;
  kinematicValues: Record<Id, number>;
  exploded: boolean;
  inferenceEnabled: boolean;
  inferenceCandidate?: InferenceCandidate;
  inferenceLockedId?: string;
  pendingSnap?: { partId: Id; result: SnapResult };
  measurementRaw: string;
  measurementNormalized: string;
  measurementError?: string;
  measurePointA?: Vec3;
  measureResult?: MeasurementResult;
  guides: Guide[];
  selectedGuideId?: Id;
  guideMode: GuideKind;
  guidePointA?: Vec3;
  guidePointer?: Vec3;
  protractorCenter?: Vec3;
  protractorReference?: Vec3;
  protractorResult?: ReturnType<typeof protractorAngle>;
  axesOrigin?: Vec3;
  axesXPoint?: Vec3;
  orbitPivot?: Vec3;
  contextMenu?: { x: number; y: number; entityId: Id };
  transformGhosts: Array<{ entityId: Id; transform: Transform }>;
  selectionDrag?: SelectionDrag;
  directMoveGesture?: DirectMoveGesture;
  undoStack: string[];
  redoStack: string[];

  setDesign: (d: DesignDocument, history?: boolean) => void;
  mutate: (fn: (d: DesignDocument) => void) => void;
  select: (id: Id, multi?: boolean) => void;
  selectWithModifiers: (
    id: Id,
    modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean },
  ) => void;
  selectMany: (ids: Id[], mode?: 'REPLACE' | 'ADD' | 'TOGGLE') => void;
  clearSelection: () => void;
  setHovered: (id?: Id) => void;
  setTool: (t: ToolId) => void;
  cancelToolOperation: () => void;
  commitToolOperation: () => void;
  setDisplayMode: (m: DisplayMode) => void;
  setActivePanel: (p: EditorState['activePanel']) => void;
  setQualityPreset: (preset: QualityPreset) => void;
  setWallsMode: (mode: WallsMode) => void;
  setSceneTransitionEnabled: (enabled: boolean) => void;
  setVisibilityTag: (tag: VisibilityTag, visible: boolean) => void;
  setGridVisible: (visible: boolean) => void;
  setSectionGizmosVisible: (visible: boolean) => void;
  setTechnicalOverlays: (visible: boolean) => void;
  toggleCleanMode: () => void;
  setPanelCollapsed: (side: 'left' | 'right', collapsed: boolean) => void;
  setPanelWidth: (side: 'left' | 'right', width: number) => void;
  setAxisLock: (axis?: Axis) => void;
  toggleCopyMode: () => void;
  setAngularSnap: (degrees: 1 | 5 | 15) => void;
  handleKeyboard: (event: KeyboardInput) => void;
  handlePointerDown: (event: PointerInput) => void;
  handlePointerMove: (event: PointerInput) => void;
  handlePointerUp: (event: PointerInput) => void;
  beginSelectionDrag: (start: ScreenPoint) => void;
  updateSelectionDrag: (end: ScreenPoint) => void;
  endSelectionDrag: () => void;

  addPanel: () => void;
  insertApplianceDefinition: (definitionId: Id) => void;
  createCountertopRect: (input?: {
    widthMm?: number;
    depthMm?: number;
    thicknessMm?: number;
    heightMm?: number;
  }) => void;
  createService: (type?: ServicePointType) => void;
  createCutoutForSelectedCountertop: (type?: Cutout['type']) => void;
  linkApplianceCutout: (applianceId: Id, cutoutId: Id, linkPosition?: boolean) => void;
  toggleClearances: (ownerId?: Id, visible?: boolean) => void;
  validatePlanning: () => ReturnType<typeof planningIssues>;
  deleteSelected: () => void;
  updatePart: (id: Id, patch: Partial<ReturnType<typeof createPanel>>) => void;
  setPartDimensions: (id: Id, w: number, h: number, t: number) => void;
  moveExact: (id: Id, axis: Axis, mm: number) => void;
  rotateExact: (id: Id, axis: Axis, deg: number) => void;
  commitTransform: (id: Id, position: Vec3, rotation: Vec3) => void;
  previewSnapSelectedTo: (targetId: Id) => void;
  confirmSnap: () => void;
  cancelSnap: () => void;
  snapSelectedTo: (targetId: Id) => void;
  gridSnapSelected: (grid?: number) => void;
  duplicateSelected: () => void;
  arraySelected: (count: number, spacing: number, axis: Axis) => void;
  groupSelected: (name?: string) => Id | undefined;
  ungroupSelected: () => void;
  alignSelected: (axis: Axis, mode: 'MIN' | 'MAX' | 'CENTER') => void;
  distributeSelected: (axis: Axis) => void;
  hide: (id: Id, value: boolean) => void;
  lock: (id: Id, value: boolean) => void;
  rename: (id: Id, name: string) => void;
  isolateSelected: () => void;
  showAll: () => void;
  hideSelectedTemp: () => void;
  hideRestTemp: () => void;
  unhideLast: () => void;
  unhideAll: () => void;
  enterEditContext: (id: Id) => void;
  exitEditContext: () => void;
  setSelectionFilter: (kind: keyof SelectionFilters, enabled: boolean) => void;
  selectAllVisible: () => void;
  invertSelection: () => void;
  selectSameMaterial: () => void;
  selectSameSemanticRole: () => void;
  selectSameModuleDefinition: () => void;
  flipSelected: (axis: Axis) => void;
  linearArraySelected: (options: Parameters<typeof linearArray>[2]) => void;
  radialArraySelected: (options: Parameters<typeof radialArray>[2]) => void;
  distributeSelectedAdvanced: (axis: Axis, mode: 'CENTERS' | 'GAPS') => void;
  previewLinearArray: (options: Parameters<typeof linearArray>[2]) => void;
  previewRadialArray: (options: Parameters<typeof radialArray>[2]) => void;
  previewAlign: (axis: Axis, mode: 'MIN' | 'CENTER' | 'MAX') => void;
  clearTransformGhosts: () => void;

  saveSelectionAsModule: (
    name: string,
    defs: ParameterDefinition[],
    bindings: Binding[],
  ) => Id | undefined;
  saveAssemblyAsModule: (assemblyId?: Id, name?: string) => Id | undefined;
  insertModule: (definitionId: Id) => void;
  setInstanceParameters: (id: Id, values: Record<string, number | string | boolean>) => void;
  detachInstance: (id: Id) => void;
  makeUnique: (id: Id) => void;
  setModuleOrigin: (definitionId: Id, origin: Transform) => void;
  setSelectedModuleOriginFromInference: () => void;
  screw: (input: ScrewJointInput) => void;
  dowel: (input: DowelJointInput) => void;
  hinge: (input: HingeJointInput) => void;
  slide: (input: DrawerSlideInput) => void;
  setKinematic: (id: Id, value: number) => void;
  setExploded: (value: boolean) => void;
  updateInference: (point: Vec3) => void;
  toggleInference: () => void;
  lockInference: () => void;
  addGuideAtMeasurePoint: () => void;
  setGuideMode: (mode: GuideKind) => void;
  deleteSelectedGuide: () => void;
  clearGuides: () => void;
  setSelectedGuide: (id?: Id) => void;
  setWalkSettings: (
    patch: Partial<Pick<WorkspacePreferences, 'eyeHeightMm' | 'walkSpeed' | 'walkCollision'>>,
  ) => void;

  setCamera: (c: CameraState) => void;
  syncCameraFromViewport: (view: {
    position: Vec3;
    target: Vec3;
    up?: Vec3;
    fov?: number;
    orthoScale?: number;
  }) => void;
  fitAll: () => void;
  fitRoom: () => void;
  focusSelected: () => void;
  setView: (preset: 'FRONT' | 'BACK' | 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'ISOMETRIC') => void;
  previousView: () => void;
  nextView: () => void;
  alignViewToInferenceFace: (orthographic?: boolean) => void;
  zoomWindow: (screenFraction: number, centerOffset: { x: number; y: number }) => void;
  setOrbitPivot: (point?: Vec3) => void;
  setContextMenu: (menu?: { x: number; y: number; entityId: Id }) => void;
  toggleProjection: () => void;
  setFov: (fov: number) => void;
  addSection: () => void;
  beginSectionPlacement: (preset: 'X' | 'Y' | 'Z') => void;
  selectSection: (id?: Id) => void;
  toggleSection: (id: Id) => void;
  setSectionPosition: (id: Id, position: Vec3) => void;
  setSectionNormal: (id: Id, normal: Vec3) => void;
  rotateSection: (id: Id, axis: Axis, degrees: number) => void;
  invertSection: (id: Id) => void;
  deleteSection: (id: Id) => void;
  lookAtSection: (id: Id) => void;
  addScene: (name: string) => void;
  updateScene: (id: Id) => void;
  renameScene: (id: Id, name: string) => void;
  duplicateScene: (id: Id) => void;
  moveScene: (id: Id, direction: -1 | 1) => void;
  deleteScene: (id: Id) => void;
  activateScene: (id: Id, instant?: boolean) => void;
  nextScene: () => void;
  previousScene: () => void;
  enterPresentation: () => void;
  exitPresentation: () => void;
  setPresentationPlaying: (playing: boolean) => void;
  setPresentationAllowNavigation: (allow: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  cancelCameraTransition: (view?: {
    position: Vec3;
    target: Vec3;
    up?: Vec3;
    fov?: number;
    orthoScale?: number;
  }) => void;
  finishCameraTransition: () => void;
  undo: () => void;
  redo: () => void;
  saveLocal: () => void;
  reloadLocal: () => void;
  createProject: (name: string) => void;
  createVersion: () => Promise<void>;
  manufacturing: () => ReturnType<typeof collectManufacturingData>;
  health: () => ReturnType<typeof modelHealth>;
}

const bootDesign = initialDesign();
const cam = cameraPreset(
  'ISOMETRIC',
  { x: 0, y: bootDesign.room.heightMm * 0.42, z: 0 },
  Math.max(bootDesign.room.widthMm, bootDesign.room.depthMm) * 1.45,
);
const bootWorkspace = initialWorkspace();
cameraHistory.push(cam);

function toolUiSnapshot() {
  return {
    toolPhase: toolManager.session?.phase ?? ('IDLE' as ToolPhase),
    toolPreview: toolManager.preview(),
    toolPreviewEntityId: toolManager.session?.entityId,
    toolOriginal: toolManager.session?.original
      ? structuredClone(toolManager.session.original)
      : undefined,
    toolPivot: toolManager.session?.pivotWorld
      ? structuredClone(toolManager.session.pivotWorld)
      : undefined,
    toolReferenceWorld: toolManager.session?.referenceWorld
      ? structuredClone(toolManager.session.referenceWorld)
      : toolManager.session?.rotateReferenceWorld
        ? structuredClone(toolManager.session.rotateReferenceWorld)
        : undefined,
    axisLock: toolManager.session?.axisLock,
    copyMode: Boolean(toolManager.session?.copyMode),
  };
}

function partIsModuleDescendant(design: DesignDocument, partId: Id): boolean {
  let parentId = design.assemblies.find((assembly) =>
    assembly.children.some((child) => child.id === partId),
  )?.id;
  const visited = new Set<Id>();
  while (parentId && !visited.has(parentId)) {
    if (
      design.moduleInstances.some(
        (instance) => !instance.detached && instance.rootAssemblyId === parentId,
      )
    )
      return true;
    visited.add(parentId);
    parentId = design.assemblies.find((assembly) =>
      assembly.children.some((child) => child.kind === 'ASSEMBLY' && child.id === parentId),
    )?.id;
  }
  return false;
}

function isDirectMoveEntity(design: DesignDocument, id: Id): boolean {
  return (
    design.parts.some((part) => part.id === id) ||
    design.assemblies.some(
      (assembly) => assembly.id === id && assembly.id !== design.rootAssemblyId,
    ) ||
    design.moduleInstances.some((instance) => instance.id === id)
  );
}

function expectedMeasurementKind(tool: ToolId): 'LENGTH' | 'ANGLE' | 'COORDINATE' | 'NONE' {
  if (tool === 'MOVE')
    return measurementBuffer.raw.trim().startsWith('<') ? 'COORDINATE' : 'LENGTH';
  if (tool === 'ROTATE') return 'ANGLE';
  if (tool === 'MEASURE' || tool === 'GUIDE') return 'LENGTH';
  if (tool === 'PROTRACTOR') return 'ANGLE';
  return 'NONE';
}

function selectableIdsForState(
  state: Pick<
    EditorState,
    'design' | 'selectionFilters' | 'editContextId' | 'workspaceHiddenIds' | 'isolatedIds'
  >,
): Id[] {
  const ids: Id[] = [
    ...state.design.parts.map((part) => part.id),
    ...state.design.assemblies
      .filter((assembly) => assembly.id !== state.design.rootAssemblyId)
      .map((assembly) => assembly.id),
    ...state.design.moduleInstances.map((instance) => instance.id),
    ...state.design.hardwareInstances.map((instance) => instance.id),
    ...state.design.applianceInstances.map((instance) => instance.id),
    ...state.design.countertops.map((countertop) => countertop.id),
    ...state.design.cutouts.map((cutout) => cutout.id),
    ...state.design.servicePoints.map((point) => point.id),
    ...state.design.clearanceZones.map((zone) => zone.id),
    ...state.design.functionalZones.map((zone) => zone.id),
    ...state.design.sectionPlanes.map((section) => section.id),
    state.design.room.id,
  ].filter((id) => entitySelectableByFilters(state.design, id, state.selectionFilters));
  const contextRestricted = restrictSelectionToContext(state.design, ids, state.editContextId);
  const hidden = new Set(state.workspaceHiddenIds);
  const isolated = state.isolatedIds
    ? resolveIsolationPartIds(state.design, state.isolatedIds)
    : undefined;
  return contextRestricted.filter((id) => {
    if (hidden.has(id)) return false;
    if (!isolated) return true;
    if (state.design.parts.some((part) => part.id === id)) return isolated.has(id);
    return true;
  });
}

function entityPartIds(design: DesignDocument, entityId: Id): Id[] {
  if (design.parts.some((part) => part.id === entityId)) return [entityId];
  const instance = design.moduleInstances.find((candidate) => candidate.id === entityId);
  const assemblyId =
    instance?.rootAssemblyId ??
    (design.assemblies.some((assembly) => assembly.id === entityId) ? entityId : undefined);
  if (!assemblyId) return [];
  const result: Id[] = [];
  const visit = (id: Id): void => {
    const assembly = design.assemblies.find((candidate) => candidate.id === id);
    if (!assembly) return;
    for (const child of assembly.children) {
      if (child.kind === 'PART') result.push(child.id);
      else visit(child.id);
    }
  };
  visit(assemblyId);
  return result;
}

function entityWorldAabb(design: DesignDocument, entityId: Id): Aabb | undefined {
  const appliance = design.applianceInstances.find((value) => value.id === entityId);
  if (appliance) return applianceWorldAabb(design, appliance);
  const countertop = design.countertops.find((value) => value.id === entityId);
  if (countertop) return countertopWorldAabb(design, countertop);
  const clearance = design.clearanceZones.find((value) => value.id === entityId);
  if (clearance) return clearanceZoneWorldAabb(design, clearance);
  const service = design.servicePoints.find((value) => value.id === entityId);
  if (service)
    return boxAabbAtTransform(
      { x: 80, y: 80, z: 80 },
      { position: { ...service.position }, rotation: { x: 0, y: 0, z: 0 } },
    );
  const cutout = design.cutouts.find((value) => value.id === entityId);
  if (cutout) {
    const center = cutoutWorldCenter(design, cutout.id);
    return center
      ? boxAabbAtTransform(
          { x: cutout.widthMm, y: 20, z: cutout.depthMm },
          { position: center, rotation: { x: 0, y: cutout.rotation, z: 0 } },
        )
      : undefined;
  }
  const zone = design.functionalZones.find((value) => value.id === entityId);
  if (zone)
    return boxAabbAtTransform(
      { x: zone.dimensions.widthMm, y: zone.dimensions.heightMm, z: zone.dimensions.depthMm },
      zone.transform,
    );
  const parts = entityPartIds(design, entityId)
    .map((id) => design.parts.find((part) => part.id === id))
    .filter((part): part is NonNullable<typeof part> => Boolean(part));
  if (!parts.length) return undefined;
  const boxes = parts.map((part) => partWorldAabb(design, part));
  return boxes.slice(1).reduce(
    (acc, box) => ({
      min: {
        x: Math.min(acc.min.x, box.min.x),
        y: Math.min(acc.min.y, box.min.y),
        z: Math.min(acc.min.z, box.min.z),
      },
      max: {
        x: Math.max(acc.max.x, box.max.x),
        y: Math.max(acc.max.y, box.max.y),
        z: Math.max(acc.max.z, box.max.z),
      },
    }),
    structuredClone(boxes[0]!),
  );
}

function scenePresentationFromState(state: EditorState): ScenePresentationSnapshot {
  return {
    quality: state.workspace.qualityPreset,
    wallsMode: state.workspace.wallsMode,
    gridVisible: state.gridVisible,
    visibility: structuredClone(state.visibilityTags),
    activeSectionId: state.activeSectionId,
    sectionVisibility: state.sectionGizmosVisible,
    guidesVisibility: state.visibilityTags.GUIDES,
    technicalOverlays: state.technicalOverlays,
  };
}

function reducedMotionPreferred(): boolean {
  try {
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  design: bootDesign,
  projectId: bootDesign.metadata.projectId,
  selectedIds: [],
  activeTool: 'SELECT',
  toolPhase: 'IDLE',
  copyMode: false,
  angularSnapDeg: 15,
  displayMode: 'TECHNICAL',
  camera: cam,
  isolatedIds: null,
  workspaceHiddenIds: [],
  hiddenHistory: [],
  editContextPath: [],
  selectionFilters: { ...DEFAULT_SELECTION_FILTERS },
  visibilityTags: { ...DEFAULT_VISIBILITY_TAGS },
  gridVisible: true,
  sectionGizmosVisible: true,
  technicalOverlays: true,
  activeSectionId: bootDesign.sectionPlanes.find((section) => section.enabled)?.id,
  activeSceneId: bootDesign.activeSceneId,
  cleanMode: false,
  presentationMode: false,
  commandPaletteOpen: false,
  presentationPlaying: false,
  presentationAllowNavigation: true,
  saveStatus: 'GUARDADO',
  activePanel: 'INSPECTOR',
  workspace: bootWorkspace,
  kinematicValues: {},
  exploded: false,
  inferenceEnabled: true,
  measurementRaw: '',
  measurementNormalized: '',
  guides: [],
  guideMode: 'POINT',
  transformGhosts: [],
  undoStack: [],
  redoStack: [],

  setDesign: (design, history = true) =>
    set((state) => ({
      design,
      saveStatus: 'PENDIENTE',
      undoStack: history
        ? [...state.undoStack, serializeDesign(state.design)].slice(-100)
        : state.undoStack,
      redoStack: history ? [] : state.redoStack,
    })),
  mutate: (fn) => {
    const state = get();
    const design = cloneDesign(state.design);
    fn(design);
    touchDesign(design);
    set({
      design,
      saveStatus: 'PENDIENTE',
      undoStack: [...state.undoStack, serializeDesign(state.design)].slice(-100),
      redoStack: [],
    });
  },
  select: (id, multi = false) =>
    set((state) => {
      if (!selectableIdsForState(state).includes(id)) return {};
      return {
        selectedGuideId: undefined,
        selectedIds: multi
          ? state.selectedIds.includes(id)
            ? state.selectedIds.filter((value) => value !== id)
            : [...state.selectedIds, id]
          : [id],
      };
    }),
  selectWithModifiers: (id, modifiers) =>
    set((state) => {
      if (!selectableIdsForState(state).includes(id)) return {};
      return {
        selectedGuideId: undefined,
        selectedIds: nextSelection(state.selectedIds, id, modifiers),
      };
    }),
  selectMany: (ids, mode = 'REPLACE') =>
    set((state) => {
      ids = ids.filter((id) => selectableIdsForState(state).includes(id));
      if (mode === 'REPLACE') return { selectedIds: [...ids] };
      if (mode === 'ADD') return { selectedIds: [...new Set([...state.selectedIds, ...ids])] };
      let next = [...state.selectedIds];
      for (const id of ids)
        next = next.includes(id) ? next.filter((value) => value !== id) : [...next, id];
      return { selectedIds: next };
    }),
  clearSelection: () => set({ selectedIds: [], selectedGuideId: undefined }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setTool: (activeTool) => {
    toolManager.switchTool(activeTool);
    measurementBuffer.clear();
    const selected = get().selectedIds[0];
    if (selected && activeTool === 'MOVE')
      toolManager.beginMovePickReference(get().design, selected);
    if (selected && activeTool === 'ROTATE')
      toolManager.beginRotateEntity(get().design, selected, get().angularSnapDeg);
    const patch: Partial<EditorState> = {
      activeTool,
      sectionDraft: undefined,
      inferenceLockedId: undefined,
      measurementRaw: '',
      measurementNormalized: '',
      measurementError: undefined,
      guidePointA: undefined,
      guidePointer: undefined,
      protractorCenter: undefined,
      protractorReference: undefined,
      protractorResult: undefined,
      axesOrigin: undefined,
      axesXPoint: undefined,
      transformGhosts: [],
      pendingSnap: undefined,
      selectionDrag: undefined,
      directMoveGesture: undefined,
      ...toolUiSnapshot(),
    };
    if (activeTool === 'WALK' || activeTool === 'LOOK') {
      const camera = get().camera;
      patch.camera = {
        ...camera,
        projection: 'PERSPECTIVE',
        position: { ...camera.position, y: get().workspace.eyeHeightMm },
        target: { ...camera.target, y: get().workspace.eyeHeightMm },
      };
    }
    set(patch);
  },
  cancelToolOperation: () => {
    const activeTool = get().activeTool;
    toolManager.cancel();
    measurementBuffer.clear();
    const selected = get().selectedIds[0];
    if (selected && activeTool === 'MOVE')
      toolManager.beginMovePickReference(get().design, selected);
    if (selected && activeTool === 'ROTATE')
      toolManager.beginRotateEntity(get().design, selected, get().angularSnapDeg);
    set({
      activeTool: activeTool === 'SECTION' ? 'SELECT' : activeTool,
      pendingSnap: undefined,
      sectionDraft: undefined,
      measurementRaw: '',
      measurementNormalized: '',
      measurementError: undefined,
      inferenceLockedId: undefined,
      guidePointA: undefined,
      guidePointer: undefined,
      protractorCenter: undefined,
      protractorReference: undefined,
      protractorResult: undefined,
      axesOrigin: undefined,
      axesXPoint: undefined,
      transformGhosts: [],
      selectionDrag: undefined,
      directMoveGesture: undefined,
      ...toolUiSnapshot(),
    });
  },
  commitToolOperation: () => {
    if (!toolManager.session?.entityId || !toolManager.preview()) return;
    const previous = get().design;
    const directGesture = get().directMoveGesture;
    const committed = toolManager.commit(previous);
    const selectedId = toolManager.lastCommittedEntityId ?? toolManager.session?.entityId;
    if (directGesture?.originTool === 'SELECT') toolManager.switchTool('SELECT');
    set((state) => ({
      design: committed,
      selectedIds: selectedId ? [selectedId] : state.selectedIds,
      saveStatus: 'PENDIENTE',
      undoStack: [...state.undoStack, serializeDesign(previous)].slice(-100),
      redoStack: [],
      directMoveGesture: undefined,
      ...toolUiSnapshot(),
    }));
    measurementBuffer.clear();
    const activeTool = get().activeTool;
    if (selectedId && activeTool === 'MOVE')
      toolManager.beginMovePickReference(committed, selectedId);
    if (selectedId && activeTool === 'ROTATE')
      toolManager.beginRotateEntity(committed, selectedId, get().angularSnapDeg);
    set({
      measurementRaw: '',
      measurementNormalized: '',
      measurementError: undefined,
      ...toolUiSnapshot(),
    });
  },
  setDisplayMode: (displayMode) => set({ displayMode }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setQualityPreset: (qualityPreset) =>
    set((state) => {
      const workspace = normalizeWorkspacePreferences({ ...state.workspace, qualityPreset });
      persistWorkspace(workspace);
      return { workspace };
    }),
  setWallsMode: (wallsMode) =>
    set((state) => {
      const workspace = normalizeWorkspacePreferences({ ...state.workspace, wallsMode });
      persistWorkspace(workspace);
      return { workspace };
    }),
  setSceneTransitionEnabled: (sceneTransitionEnabled) =>
    set((state) => {
      const workspace = normalizeWorkspacePreferences({
        ...state.workspace,
        sceneTransitionEnabled,
      });
      persistWorkspace(workspace);
      return { workspace };
    }),
  setVisibilityTag: (tag, visible) =>
    set((state) => ({
      visibilityTags: normalizeVisibilityTags({ ...state.visibilityTags, [tag]: visible }),
    })),
  setGridVisible: (gridVisible) => set({ gridVisible }),
  setSectionGizmosVisible: (sectionGizmosVisible) => set({ sectionGizmosVisible }),
  setTechnicalOverlays: (technicalOverlays) => set({ technicalOverlays }),
  toggleCleanMode: () => set((state) => ({ cleanMode: !state.cleanMode })),
  setPanelCollapsed: (side, collapsed) =>
    set((state) => {
      const workspace = normalizeWorkspacePreferences({
        ...state.workspace,
        [side === 'left' ? 'leftPanelCollapsed' : 'rightPanelCollapsed']: collapsed,
      });
      persistWorkspace(workspace);
      return { workspace };
    }),
  setPanelWidth: (side, width) =>
    set((state) => {
      const workspace = normalizeWorkspacePreferences({
        ...state.workspace,
        [side === 'left' ? 'leftPanelWidth' : 'rightPanelWidth']: width,
      });
      persistWorkspace(workspace);
      return { workspace };
    }),
  setAxisLock: (axis) => {
    toolManager.setAxisLock(axis);
    set({ ...toolUiSnapshot() });
  },
  toggleCopyMode: () => {
    toolManager.toggleCopyMode();
    set({ ...toolUiSnapshot() });
  },
  setAngularSnap: (angularSnapDeg) => {
    toolManager.setAngularSnap(angularSnapDeg);
    set({ angularSnapDeg, ...toolUiSnapshot() });
  },

  handleKeyboard: (event) => {
    const state = get();
    if (
      (state.activeTool === 'WALK' || state.activeTool === 'LOOK') &&
      !event.ctrl &&
      !event.meta &&
      !event.alt &&
      ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
        event.key.toLowerCase(),
      ) &&
      !event.shift
    )
      return;
    const editingTool = state.activeTool === 'MOVE' || state.activeTool === 'ROTATE';
    const numericTool =
      editingTool ||
      state.activeTool === 'MEASURE' ||
      state.activeTool === 'GUIDE' ||
      state.activeTool === 'PROTRACTOR';
    if (event.key === 'Enter' && numericTool && measurementBuffer.raw) {
      try {
        if (state.activeTool === 'MOVE') {
          if (measurementBuffer.raw.trim().startsWith('<'))
            toolManager.relativeMove(measurementBuffer.raw);
          else toolManager.exactMove(measurementBuffer.raw);
          set({ ...toolUiSnapshot() });
          get().commitToolOperation();
        } else if (state.activeTool === 'ROTATE') {
          toolManager.exactRotate(measurementBuffer.raw, state.axisLock ?? 'y');
          set({ ...toolUiSnapshot() });
          get().commitToolOperation();
        } else if (state.activeTool === 'MEASURE' && state.measurePointA && state.guidePointer) {
          const guide = tapeGuideFromDistance(
            state.measurePointA,
            state.guidePointer,
            measurementBuffer.raw,
          );
          const result = measureDetailed(state.measurePointA, guide.origin);
          set((current) => ({
            guides: [...current.guides, guide],
            measureResult: result,
            measurePointA: undefined,
            guidePointer: undefined,
            toolPhase: 'PICK_FIRST_POINT',
          }));
        } else if (state.activeTool === 'GUIDE' && state.guidePointA && state.guidePointer) {
          const point = tapeGuideFromDistance(
            state.guidePointA,
            state.guidePointer,
            measurementBuffer.raw,
          );
          if (state.guideMode === 'POINT')
            set((current) => ({
              guides: [...current.guides, point],
              selectedGuideId: point.id,
              guidePointA: undefined,
              guidePointer: undefined,
            }));
          else if (state.guideMode === 'LINE') {
            const line = createGuideLine(
              point.origin,
              {
                x: state.guidePointer.x - state.guidePointA.x,
                y: state.guidePointer.y - state.guidePointA.y,
                z: state.guidePointer.z - state.guidePointA.z,
              },
              'Línea guía exacta',
              { mode: 'OFFSET' },
            );
            set((current) => ({
              guides: [...current.guides, line],
              selectedGuideId: line.id,
              guidePointA: undefined,
              guidePointer: undefined,
            }));
          } else {
            const plane = createGuidePlane(
              point.origin,
              {
                x: state.guidePointer.x - state.guidePointA.x,
                y: state.guidePointer.y - state.guidePointA.y,
                z: state.guidePointer.z - state.guidePointA.z,
              },
              'Plano guía exacto',
              { mode: 'OFFSET' },
            );
            set((current) => ({
              guides: [...current.guides, plane],
              selectedGuideId: plane.id,
              guidePointA: undefined,
              guidePointer: undefined,
            }));
          }
        } else if (
          state.activeTool === 'PROTRACTOR' &&
          state.protractorCenter &&
          state.protractorReference
        ) {
          const ref = {
            x: state.protractorReference.x - state.protractorCenter.x,
            y: state.protractorReference.y - state.protractorCenter.y,
            z: state.protractorReference.z - state.protractorCenter.z,
          };
          const guide = createAngularGuide(
            state.protractorCenter,
            ref,
            measurementBuffer.raw,
            state.axisLock === 'x'
              ? { x: 1, y: 0, z: 0 }
              : state.axisLock === 'z'
                ? { x: 0, y: 0, z: 1 }
                : { x: 0, y: 1, z: 0 },
          );
          set((current) => ({
            guides: [...current.guides, guide],
            selectedGuideId: guide.id,
            protractorCenter: undefined,
            protractorReference: undefined,
            protractorResult: undefined,
          }));
        }
        measurementBuffer.clear();
        set({ measurementRaw: '', measurementNormalized: '', measurementError: undefined });
      } catch (error) {
        set({ measurementError: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (numericTool && (measurementBuffer.feedKey(event.key) || event.key === 'Backspace')) {
      const snapshot = measurementBuffer.snapshot(expectedMeasurementKind(state.activeTool));
      set({
        measurementRaw: snapshot.raw,
        measurementNormalized: snapshot.normalized,
        measurementError: snapshot.error,
      });
      return;
    }
    if (state.activeTool === 'MOVE' && !event.repeat && event.key === 'Control') {
      get().toggleCopyMode();
      return;
    }
    if (event.key === 'ArrowRight') {
      get().setAxisLock(state.axisLock === 'x' ? undefined : 'x');
      return;
    }
    if (event.key === 'ArrowUp') {
      get().setAxisLock(state.axisLock === 'y' ? undefined : 'y');
      return;
    }
    if (event.key === 'ArrowLeft') {
      get().setAxisLock(state.axisLock === 'z' ? undefined : 'z');
      return;
    }
    if (event.key === 'Shift' && state.inferenceCandidate) {
      get().lockInference();
      return;
    }

    const action = shortcutManager.resolve(event);
    if (!action) return;
    if (action === 'CANCEL') {
      if (state.commandPaletteOpen) {
        get().setCommandPaletteOpen(false);
        return;
      }
      if (state.editContextId && state.activeTool === 'SELECT') get().exitEditContext();
      else if (state.activeTool === 'WALK' || state.activeTool === 'LOOK') get().setTool('SELECT');
      else get().cancelToolOperation();
      return;
    }
    const commandId = SHORTCUT_ACTION_COMMAND[action];
    if (commandId) {
      if (editorCommands.canExecute(commandId, get())) editorCommands.execute(commandId, get());
      else
        publishEditorFeedback(
          commandUnavailableReason(
            commandId,
            get().selectedIds.length,
            get().undoStack.length,
            get().redoStack.length,
          ),
        );
    }
  },

  handlePointerDown: (event) => {
    const state = get();
    if (event.button !== 0) return; // Los botones medio/derecho se reservan para navegación y contexto.
    if (state.activeTool === 'SECTION' && event.point && state.sectionDraft) {
      const section = structuredClone(state.sectionDraft);
      setSectionPosition(section, event.point);
      const design = cloneDesign(state.design);
      design.sectionPlanes.push(section);
      touchDesign(design);
      set({
        design,
        saveStatus: 'PENDIENTE',
        activeSectionId: section.id,
        selectedSectionId: section.id,
        sectionDraft: undefined,
        activeTool: 'SELECT',
        toolPhase: 'COMMITTED',
      });
      toolManager.switchTool('SELECT');
      return;
    }
    if (state.activeTool === 'GUIDE' && event.point) {
      if (!state.guidePointA) {
        set({
          guidePointA: structuredClone(event.point),
          guidePointer: structuredClone(event.point),
          toolPhase: 'PICK_SECOND_POINT',
        });
        return;
      }
      const first = state.guidePointA;
      try {
        const guide =
          state.guideMode === 'POINT'
            ? createGuidePoint(event.point, 'Punto guía', { mode: 'PICK' })
            : state.guideMode === 'LINE'
              ? createGuideLine(
                  first,
                  {
                    x: event.point.x - first.x,
                    y: event.point.y - first.y,
                    z: event.point.z - first.z,
                  },
                  'Línea guía',
                  { mode: 'TWO_POINTS' },
                )
              : createGuidePlane(
                  first,
                  {
                    x: event.point.x - first.x,
                    y: event.point.y - first.y,
                    z: event.point.z - first.z,
                  },
                  'Plano guía',
                  { mode: 'NORMAL_PICK' },
                );
        set((current) => ({
          guides: [...current.guides, guide],
          selectedGuideId: guide.id,
          guidePointA: undefined,
          guidePointer: undefined,
          toolPhase: 'PICK_FIRST_POINT',
        }));
      } catch {
        /* Referencia sin longitud; seguir seleccionando. */
      }
      return;
    }
    if (state.activeTool === 'PROTRACTOR' && event.point) {
      if (!state.protractorCenter) {
        set({ protractorCenter: structuredClone(event.point), toolPhase: 'PICK_REFERENCE' });
        return;
      }
      if (!state.protractorReference) {
        set({ protractorReference: structuredClone(event.point), toolPhase: 'PICK_SECOND_POINT' });
        return;
      }
      try {
        const normal =
          state.axisLock === 'x'
            ? { x: 1, y: 0, z: 0 }
            : state.axisLock === 'z'
              ? { x: 0, y: 0, z: 1 }
              : { x: 0, y: 1, z: 0 };
        set({
          protractorResult: protractorAngle(
            state.protractorCenter,
            state.protractorReference,
            event.point,
            normal,
          ),
          toolPhase: 'COMMITTED',
        });
      } catch {
        /* Selección inválida. */
      }
      return;
    }
    if (state.activeTool === 'AXES' && event.point) {
      const id = state.selectedIds[0];
      if (!id) return;
      const moduleInstance = state.design.moduleInstances.find(
        (instance) => instance.id === id && !instance.detached,
      );
      const assemblyId =
        moduleInstance?.rootAssemblyId ??
        (state.design.assemblies.some((a) => a.id === id) ? id : undefined);
      if (!assemblyId) return;
      if (!state.axesOrigin) {
        set({ axesOrigin: structuredClone(event.point), toolPhase: 'PICK_REFERENCE' });
        return;
      }
      if (!state.axesXPoint) {
        set({ axesXPoint: structuredClone(event.point), toolPhase: 'PICK_SECOND_POINT' });
        return;
      }
      try {
        const world = axesTransformFromPoints(state.axesOrigin, state.axesXPoint, event.point);
        get().mutate((design) => rebaseAssemblyOrigin(design, assemblyId, world));
        set({
          axesOrigin: undefined,
          axesXPoint: undefined,
          activeTool: 'SELECT',
          toolPhase: 'COMMITTED',
        });
      } catch {
        /* Mantener la sesión hasta tener una orientación Y válida. */
      }
      return;
    }
    if (state.activeTool === 'SELECT') {
      if (event.entityId) {
        get().selectWithModifiers(event.entityId, event);
        const hasModifier = Boolean(event.shift || event.ctrl || event.meta);
        if (
          !hasModifier &&
          event.point &&
          event.screen &&
          isDirectMoveEntity(state.design, event.entityId)
        ) {
          set({
            directMoveGesture: {
              entityId: event.entityId,
              originTool: 'SELECT',
              startScreen: structuredClone(event.screen),
              startPoint: structuredClone(event.point),
              dragging: false,
            },
          });
        }
      } else if (!event.shift && !event.ctrl && !event.meta) get().clearSelection();
      return;
    }
    if (state.activeTool === 'MOVE' && event.point) {
      let entityId = toolManager.session?.entityId;
      if (
        event.entityId &&
        isDirectMoveEntity(state.design, event.entityId) &&
        entityId !== event.entityId &&
        toolManager.session?.phase !== 'MOVING'
      ) {
        get().selectWithModifiers(event.entityId, {});
        toolManager.beginMovePickReference(state.design, event.entityId);
        entityId = event.entityId;
      }
      if (!entityId) {
        const id = state.selectedIds[0];
        if (!id || !isDirectMoveEntity(state.design, id)) return;
        toolManager.beginMovePickReference(state.design, id);
        entityId = id;
      }
      if (toolManager.session?.phase === 'PICK_REFERENCE') {
        toolManager.pickMoveReferenceWorld(event.point);
        if (event.screen && entityId)
          set({
            directMoveGesture: {
              entityId,
              originTool: 'MOVE',
              startScreen: structuredClone(event.screen),
              startPoint: structuredClone(event.point),
              dragging: false,
            },
          });
      } else if (toolManager.session?.phase === 'MOVING') get().commitToolOperation();
      set({ ...toolUiSnapshot() });
      return;
    }
    if (state.activeTool === 'ROTATE' && event.point) {
      if (toolManager.session?.phase === 'PICK_PIVOT') toolManager.pickRotatePivot(event.point);
      else if (toolManager.session?.phase === 'PICK_REFERENCE')
        toolManager.pickRotateReference(event.point);
      else if (toolManager.session?.phase === 'ROTATING') get().commitToolOperation();
      set({ ...toolUiSnapshot() });
      return;
    }
    if (state.activeTool === 'MEASURE' && event.point) {
      if (!state.measurePointA)
        set({
          measurePointA: structuredClone(event.point),
          guidePointer: structuredClone(event.point),
          measureResult: undefined,
          toolPhase: 'PICK_SECOND_POINT',
        });
      else
        set({
          measureResult: measureDetailed(state.measurePointA, event.point),
          measurePointA: undefined,
          guidePointer: undefined,
          toolPhase: 'PICK_FIRST_POINT',
        });
    }
  },
  handlePointerMove: (event) => {
    if (!event.point) return;
    const before = get();
    if (before.activeTool === 'SECTION' && before.sectionDraft) {
      const draft = structuredClone(before.sectionDraft);
      setSectionPosition(draft, event.point);
      set({ sectionDraft: draft, toolPhase: 'PICK_FIRST_POINT' });
      return;
    }
    get().updateInference(event.point);
    let state = get();
    if (
      (state.activeTool === 'MEASURE' || state.activeTool === 'GUIDE') &&
      (state.measurePointA || state.guidePointA)
    )
      set({ guidePointer: structuredClone(event.point) });
    if (state.activeTool === 'PROTRACTOR' && state.protractorCenter && state.protractorReference) {
      try {
        const normal =
          state.axisLock === 'x'
            ? { x: 1, y: 0, z: 0 }
            : state.axisLock === 'z'
              ? { x: 0, y: 0, z: 1 }
              : { x: 0, y: 1, z: 0 };
        set({
          protractorResult: protractorAngle(
            state.protractorCenter,
            state.protractorReference,
            event.point,
            normal,
          ),
        });
      } catch {
        /* Vista previa incompleta. */
      }
    }

    const gesture = state.directMoveGesture;
    if (gesture && event.screen) {
      let dragging = gesture.dragging;
      if (!dragging && dragThresholdExceeded(gesture.startScreen, event.screen)) {
        dragging = true;
        if (gesture.originTool === 'SELECT') {
          toolManager.beginMovePickReference(state.design, gesture.entityId);
          toolManager.pickMoveReferenceWorld(gesture.startPoint);
        }
        set({ directMoveGesture: { ...gesture, dragging: true }, ...toolUiSnapshot() });
        state = get();
      }
      if (dragging && toolManager.session?.phase === 'MOVING') {
        const target = state.inferenceLockedId
          ? state.inferenceCandidate?.point
          : (state.inferenceCandidate?.score ?? Infinity) < 45
            ? state.inferenceCandidate?.point
            : undefined;
        if (
          state.inferenceCandidate?.direction &&
          (state.inferenceCandidate.kind === 'AXIS' ||
            state.inferenceCandidate.kind === 'PARALLEL' ||
            state.inferenceCandidate.kind === 'PERPENDICULAR')
        )
          toolManager.setInferenceDirection(state.inferenceCandidate.direction);
        toolManager.updateMove(target ?? event.point);
        set({ ...toolUiSnapshot() });
      }
      return;
    }
    state = get();
    if (state.activeTool === 'MOVE' && toolManager.session?.phase === 'MOVING') {
      const target = state.inferenceLockedId
        ? state.inferenceCandidate?.point
        : (state.inferenceCandidate?.score ?? Infinity) < 45
          ? state.inferenceCandidate?.point
          : undefined;
      if (
        state.inferenceCandidate?.direction &&
        (state.inferenceCandidate.kind === 'AXIS' ||
          state.inferenceCandidate.kind === 'PARALLEL' ||
          state.inferenceCandidate.kind === 'PERPENDICULAR')
      )
        toolManager.setInferenceDirection(state.inferenceCandidate.direction);
      toolManager.updateMove(target ?? event.point);
      set({ ...toolUiSnapshot() });
    }
    if (state.activeTool === 'ROTATE' && toolManager.session?.phase === 'ROTATING') {
      try {
        toolManager.updateRotate(event.point, state.axisLock ?? 'y', true);
        set({ ...toolUiSnapshot() });
      } catch {
        /* Estado de rotación incompleto. */
      }
    }
  },
  handlePointerUp: () => {
    const gesture = get().directMoveGesture;
    if (!gesture) return;
    if (gesture.dragging) get().commitToolOperation();
    else set({ directMoveGesture: undefined });
  },
  beginSelectionDrag: (start) => set({ selectionDrag: { start, end: start, mode: 'WINDOW' } }),
  updateSelectionDrag: (end) =>
    set((state) =>
      state.selectionDrag
        ? {
            selectionDrag: {
              ...state.selectionDrag,
              end,
              mode: end.x >= state.selectionDrag.start.x ? 'WINDOW' : 'CROSSING',
            },
          }
        : {},
    ),
  endSelectionDrag: () => set({ selectionDrag: undefined }),

  addPanel: () =>
    get().mutate((design) => {
      const part = createPanel({
        materialId: design.materials[0]?.id,
        transform: { position: { x: 0, y: 250, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      });
      addPartToAssembly(design, part);
      setTimeout(() => set({ selectedIds: [part.id] }), 0);
    }),
  insertApplianceDefinition: (definitionId) => {
    let created: ApplianceInstance | undefined;
    get().mutate((design) => {
      created = insertAppliance(design, definitionId);
    });
    if (created) {
      set({ selectedIds: [created.id], activePanel: 'INSPECTOR' });
      get().setTool('MOVE');
    }
  },
  createCountertopRect: (input) => {
    let created: Countertop | undefined;
    get().mutate((design) => {
      const widthMm = input?.widthMm ?? Math.min(1200, Math.max(600, design.room.widthMm * 0.4));
      const depthMm = input?.depthMm ?? 600,
        thicknessMm = input?.thicknessMm ?? 30,
        heightMm = input?.heightMm ?? 900;
      created = createCountertop(design, {
        name: 'Cubierta',
        outline: { type: 'RECTANGULAR', widthMm, depthMm },
        thicknessMm,
        heightMm,
        colorHex: '#D7D3CC',
        roughness: 0.7,
        metalness: 0,
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        metadata: {
          sourceType: 'DEMO_DEFAULT',
          disclaimer: 'Dimensiones iniciales configurables; no representan un estándar.',
        },
      });
    });
    if (created) {
      set({ selectedIds: [created.id], activePanel: 'INSPECTOR' });
      get().setTool('MOVE');
    }
  },
  createService: (type: ServicePointType = 'ELECTRICAL') => {
    let id: Id | undefined;
    get().mutate((design) => {
      id = createServicePoint(design, {
        name: `Servicio ${type}`,
        type,
        position: { x: 0, y: 300, z: 0 },
        metadata: { sourceType: 'USER' },
      }).id;
    });
    if (id) set({ selectedIds: [id], activePanel: 'INSPECTOR' });
  },
  createCutoutForSelectedCountertop: (type: Cutout['type'] = 'CUSTOM') => {
    const countertopId = get().selectedIds.find((id) =>
      get().design.countertops.some((value) => value.id === id),
    );
    if (!countertopId) return;
    let id: Id | undefined;
    get().mutate((design) => {
      id = createCutout(design, {
        countertopId,
        type,
        position2D: { xMm: 0, yMm: 0 },
        widthMm: 300,
        depthMm: 300,
        metadata: { sourceType: 'USER' },
      }).id;
    });
    if (id) set({ selectedIds: [id], activePanel: 'INSPECTOR' });
  },
  linkApplianceCutout: (applianceId, cutoutId, linkPosition = false) =>
    get().mutate((design) => linkApplianceToCutout(design, applianceId, cutoutId, linkPosition)),
  toggleClearances: (ownerId, visible) =>
    get().mutate((design) => {
      for (const zone of design.clearanceZones)
        if (!ownerId || zone.ownerId === ownerId)
          zone.hidden = visible === undefined ? !zone.hidden : !visible;
    }),
  validatePlanning: () => planningIssues(get().design),
  deleteSelected: () => {
    const ids = new Set(get().selectedIds);
    if (!ids.size) return;
    get().mutate((design) => {
      design.parts = design.parts.filter((part) => !ids.has(part.id));
      design.applianceInstances = design.applianceInstances.filter((value) => !ids.has(value.id));
      design.countertops = design.countertops.filter((value) => !ids.has(value.id));
      design.cutouts = design.cutouts.filter(
        (value) => !ids.has(value.id) && !ids.has(value.countertopId),
      );
      design.servicePoints = design.servicePoints.filter((value) => !ids.has(value.id));
      design.clearanceZones = design.clearanceZones.filter(
        (value) => !ids.has(value.id) && !ids.has(value.ownerId),
      );
      design.functionalZones = design.functionalZones.filter((value) => !ids.has(value.id));
      for (const countertop of design.countertops)
        countertop.cutoutIds = countertop.cutoutIds.filter((id) => !ids.has(id));
      for (const appliance of design.applianceInstances)
        if (appliance.linkedCutoutId && ids.has(appliance.linkedCutoutId))
          appliance.linkedCutoutId = undefined;
      design.assemblies = design.assemblies.filter(
        (assembly) => assembly.id === design.rootAssemblyId || !ids.has(assembly.id),
      );
      design.moduleInstances = design.moduleInstances.filter((instance) => !ids.has(instance.id));
      for (const assembly of design.assemblies)
        assembly.children = assembly.children.filter((child) => !ids.has(child.id));
      design.joints = design.joints.filter(
        (joint) => !ids.has(joint.partAId) && !ids.has(joint.partBId),
      );
      design.hardwareInstances = design.hardwareInstances.filter((instance) =>
        instance.connectedPartIds.every((id) => !ids.has(id)),
      );
      design.machiningFeatures = design.machiningFeatures.filter(
        (feature) => !ids.has(feature.partId),
      );
    });
    set({ selectedIds: [] });
  },
  updatePart: (id, patch) =>
    get().mutate((design) => Object.assign(findPart(design, id), structuredClone(patch))),
  setPartDimensions: (id, width, height, thickness) =>
    get().mutate((design) =>
      resizePartExact(design, id, { widthMm: width, heightMm: height, thicknessMm: thickness }),
    ),
  moveExact: (id, axis, mm) => get().mutate((design) => movePartExact(design, id, mm, axis)),
  rotateExact: (id, axis, deg) => get().mutate((design) => rotatePartExact(design, id, deg, axis)),
  commitTransform: (id, position, rotation) =>
    get().mutate((design) => {
      const transform = { position: { ...position }, rotation: { ...rotation } };
      if (design.parts.some((value) => value.id === id))
        setPartWorldTransform(design, id, transform);
      else if (design.applianceInstances.some((value) => value.id === id))
        setApplianceWorldTransform(design, id, transform);
      else if (design.countertops.some((value) => value.id === id))
        setCountertopWorldTransform(design, id, transform);
      else if (design.servicePoints.some((value) => value.id === id))
        setServicePointWorldTransform(design, id, transform);
    }),
  previewSnapSelectedTo: (targetId) => {
    const id = get().selectedIds[0];
    if (!id || id === targetId) return;
    const design = get().design;
    if (
      !design.parts.some((part) => part.id === id) ||
      !design.parts.some((part) => part.id === targetId)
    )
      return;
    set({
      pendingSnap: {
        partId: id,
        result: snapEngine.face(design, findPart(design, id), findPart(design, targetId)),
      },
    });
  },
  confirmSnap: () => {
    const pending = get().pendingSnap;
    if (!pending) return;
    get().mutate((design) => snapEngine.apply(design, pending.partId, pending.result));
    set({ pendingSnap: undefined });
  },
  cancelSnap: () => set({ pendingSnap: undefined }),
  snapSelectedTo: (targetId) => {
    const id = get().selectedIds[0];
    if (!id || id === targetId) return;
    get().mutate((design) =>
      snapEngine.apply(
        design,
        id,
        snapEngine.face(design, findPart(design, id), findPart(design, targetId)),
      ),
    );
  },
  gridSnapSelected: (grid = 50) => {
    const id = get().selectedIds[0];
    if (!id || !get().design.parts.some((part) => part.id === id)) return;
    get().mutate((design) =>
      snapEngine.apply(
        design,
        id,
        snapEngine.grid(getPartWorldTransform(design, id).position, grid),
      ),
    );
  },
  duplicateSelected: () => {
    const id = get().selectedIds[0];
    if (!id) return;
    let created: Id | undefined;
    get().mutate((design) => {
      if (design.applianceInstances.some((value) => value.id === id))
        created = duplicateAppliance(design, id).id;
      else if (design.countertops.some((value) => value.id === id)) {
        const source = design.countertops.find((value) => value.id === id)!;
        const clone = structuredClone(source);
        clone.id = `countertop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        clone.name = `${source.name} copia`;
        clone.transform.position.x += 100;
        clone.cutoutIds = [];
        design.countertops.push(clone);
        created = clone.id;
      } else if (design.parts.some((part) => part.id === id))
        created = duplicateArray(design, id, 1, 100, 'x')[0];
      else if (design.moduleInstances.some((instance) => instance.id === id && !instance.detached))
        created = duplicateModuleInstance(design, id).id;
      else if (
        design.assemblies.some(
          (assembly) => assembly.id === id && assembly.id !== design.rootAssemblyId,
        )
      )
        created = duplicateAssemblyTree(design, id).rootAssemblyId;
    });
    if (created) set({ selectedIds: [created] });
  },
  arraySelected: (count, spacing, axis) => {
    const id = get().selectedIds[0];
    if (!id || !get().design.parts.some((part) => part.id === id)) return;
    get().mutate((design) => duplicateArray(design, id, count, spacing, axis));
  },
  linearArraySelected: (options) => {
    set({ transformGhosts: [] });
    const id = get().selectedIds[0];
    if (!id || !get().design.parts.some((part) => part.id === id)) return;
    let created: Id[] = [];
    get().mutate((design) => {
      created = linearArray(design, id, options);
    });
    set({ selectedIds: created });
  },
  radialArraySelected: (options) => {
    set({ transformGhosts: [] });
    const id = get().selectedIds[0];
    if (!id || !get().design.parts.some((part) => part.id === id)) return;
    let created: Id[] = [];
    get().mutate((design) => {
      created = radialArray(design, id, options);
    });
    set({ selectedIds: created });
  },
  groupSelected: (name = 'Módulo') => {
    const ids = get().selectedIds.filter((id) => get().design.parts.some((part) => part.id === id));
    if (!ids.length) return;
    let out: Id | undefined;
    get().mutate((design) => {
      out = groupParts(design, ids, name).id;
      setTimeout(() => set({ selectedIds: out ? [out] : [] }), 0);
    });
    return out;
  },
  ungroupSelected: () => {
    const id = get().selectedIds[0];
    if (!id || !get().design.assemblies.some((assembly) => assembly.id === id)) return;
    get().mutate((design) => ungroupAssembly(design, id));
    set({ selectedIds: [] });
  },
  alignSelected: (axis, mode) => {
    set({ transformGhosts: [] });
    get().mutate((design) =>
      alignParts(
        design,
        get().selectedIds.filter((id) => design.parts.some((part) => part.id === id)),
        axis,
        mode,
      ),
    );
  },
  distributeSelected: (axis) =>
    get().mutate((design) =>
      distributeParts(
        design,
        get().selectedIds.filter((id) => design.parts.some((part) => part.id === id)),
        axis,
      ),
    ),
  distributeSelectedAdvanced: (axis, mode) => {
    set({ transformGhosts: [] });
    get().mutate((design) =>
      distributePartsAdvanced(
        design,
        get().selectedIds.filter((id) => design.parts.some((part) => part.id === id)),
        axis,
        mode,
      ),
    );
  },
  previewLinearArray: (options) =>
    set((state) => {
      const id = state.selectedIds[0];
      if (!id || !state.design.parts.some((part) => part.id === id)) return { transformGhosts: [] };
      try {
        return {
          transformGhosts: linearArrayPreviewTransforms(state.design, id, options).map(
            (transform) => ({ entityId: id, transform }),
          ),
        };
      } catch {
        return { transformGhosts: [] };
      }
    }),
  previewRadialArray: (options) =>
    set((state) => {
      const id = state.selectedIds[0];
      if (!id || !state.design.parts.some((part) => part.id === id)) return { transformGhosts: [] };
      try {
        return {
          transformGhosts: radialArrayPreviewTransforms(state.design, id, options).map(
            (transform) => ({ entityId: id, transform }),
          ),
        };
      } catch {
        return { transformGhosts: [] };
      }
    }),
  previewAlign: (axis, mode) =>
    set((state) => ({
      transformGhosts: alignPartsPreview(
        state.design,
        state.selectedIds.filter((id) => state.design.parts.some((part) => part.id === id)),
        axis,
        mode,
      ),
    })),
  clearTransformGhosts: () => set({ transformGhosts: [] }),
  hide: (id, value) =>
    get().mutate((design) => {
      const direct =
        design.applianceInstances.find((v) => v.id === id) ??
        design.countertops.find((v) => v.id === id) ??
        design.servicePoints.find((v) => v.id === id) ??
        design.clearanceZones.find((v) => v.id === id) ??
        design.functionalZones.find((v) => v.id === id);
      if (direct) {
        direct.hidden = value;
        return;
      }
      const visit = (entityId: Id): void => {
        const part = design.parts.find((candidate) => candidate.id === entityId);
        if (part) {
          part.hidden = value;
          return;
        }
        const assembly = design.assemblies.find((candidate) => candidate.id === entityId);
        if (assembly) {
          assembly.hidden = value;
          assembly.children.forEach((child) => visit(child.id));
        }
      };
      visit(id);
    }),
  lock: (id, value) =>
    get().mutate((design) => {
      const visit = (entityId: Id): void => {
        const part = design.parts.find((candidate) => candidate.id === entityId);
        if (part) {
          part.locked = value;
          return;
        }
        const assembly = design.assemblies.find((candidate) => candidate.id === entityId);
        if (assembly) {
          assembly.locked = value;
          assembly.children.forEach((child) => visit(child.id));
        }
      };
      visit(id);
    }),
  rename: (id, name) =>
    get().mutate((design) => {
      const entity =
        design.parts.find((candidate) => candidate.id === id) ??
        design.assemblies.find((candidate) => candidate.id === id) ??
        design.moduleInstances.find((candidate) => candidate.id === id) ??
        design.applianceInstances.find((candidate) => candidate.id === id) ??
        design.countertops.find((candidate) => candidate.id === id) ??
        design.servicePoints.find((candidate) => candidate.id === id) ??
        design.functionalZones.find((candidate) => candidate.id === id);
      if (entity) entity.name = name;
    }),
  isolateSelected: () => {
    const ids = get().selectedIds;
    if (ids.length) set({ isolatedIds: [...ids] });
  },
  showAll: () => set({ isolatedIds: null, workspaceHiddenIds: [], hiddenHistory: [] }),
  hideSelectedTemp: () =>
    set((state) => {
      if (!state.selectedIds.length) return {};
      const next = [...new Set([...state.workspaceHiddenIds, ...state.selectedIds])];
      return {
        workspaceHiddenIds: next,
        hiddenHistory: [...state.hiddenHistory, state.selectedIds].slice(-20),
        selectedIds: [],
      };
    }),
  hideRestTemp: () =>
    set((state) => {
      const keep = new Set(state.selectedIds.flatMap((id) => entityPartIds(state.design, id)));
      const toHide = state.design.parts.filter((part) => !keep.has(part.id)).map((part) => part.id);
      return {
        workspaceHiddenIds: [...new Set([...state.workspaceHiddenIds, ...toHide])],
        hiddenHistory: [...state.hiddenHistory, toHide].slice(-20),
      };
    }),
  unhideLast: () =>
    set((state) => {
      const last = state.hiddenHistory.at(-1);
      if (!last) return {};
      const restore = new Set(last);
      return {
        workspaceHiddenIds: state.workspaceHiddenIds.filter((id) => !restore.has(id)),
        hiddenHistory: state.hiddenHistory.slice(0, -1),
      };
    }),
  unhideAll: () => set({ workspaceHiddenIds: [], hiddenHistory: [], isolatedIds: null }),
  enterEditContext: (id) => {
    const state = get();
    const valid =
      state.design.assemblies.some((a) => a.id === id) ||
      state.design.moduleInstances.some((i) => i.id === id);
    if (!valid) return;
    toolManager.cancel();
    measurementBuffer.clear();
    const path = [...state.editContextPath, id];
    set({
      editContextId: id,
      editContextPath: path,
      selectedIds: [],
      isolatedIds: null,
      activeTool: 'SELECT',
      pendingSnap: undefined,
      sectionDraft: undefined,
      measurePointA: undefined,
      measureResult: undefined,
      guidePointA: undefined,
      guidePointer: undefined,
      protractorCenter: undefined,
      protractorReference: undefined,
      protractorResult: undefined,
      axesOrigin: undefined,
      axesXPoint: undefined,
      transformGhosts: [],
      selectionDrag: undefined,
      measurementRaw: '',
      measurementNormalized: '',
      measurementError: undefined,
      ...toolUiSnapshot(),
    });
  },
  exitEditContext: () => {
    const state = get();
    toolManager.cancel();
    measurementBuffer.clear();
    const path = state.editContextPath.slice(0, -1);
    set({
      editContextPath: path,
      editContextId: path.at(-1),
      selectedIds: [],
      activeTool: 'SELECT',
      pendingSnap: undefined,
      sectionDraft: undefined,
      measurePointA: undefined,
      measureResult: undefined,
      guidePointA: undefined,
      guidePointer: undefined,
      protractorCenter: undefined,
      protractorReference: undefined,
      protractorResult: undefined,
      axesOrigin: undefined,
      axesXPoint: undefined,
      transformGhosts: [],
      selectionDrag: undefined,
      measurementRaw: '',
      measurementNormalized: '',
      measurementError: undefined,
      ...toolUiSnapshot(),
    });
  },
  setSelectionFilter: (kind, enabled) =>
    set((state) => ({
      selectionFilters: { ...state.selectionFilters, [kind]: enabled },
      selectedIds: state.selectedIds.filter((id) =>
        entitySelectableByFilters(state.design, id, { ...state.selectionFilters, [kind]: enabled }),
      ),
    })),
  selectAllVisible: () => set((state) => ({ selectedIds: selectableIdsForState(state) })),
  invertSelection: () =>
    set((state) => {
      const allowed = selectableIdsForState(state),
        selected = new Set(state.selectedIds);
      return { selectedIds: allowed.filter((id) => !selected.has(id)) };
    }),
  selectSameMaterial: () =>
    set((state) => {
      const id = state.selectedIds.find((value) =>
        state.design.parts.some((part) => part.id === value),
      );
      return id
        ? {
            selectedIds: restrictSelectionToContext(
              state.design,
              selectSameMaterial(state.design, id),
              state.editContextId,
            ),
          }
        : {};
    }),
  selectSameSemanticRole: () =>
    set((state) => {
      const id = state.selectedIds.find((value) =>
        state.design.parts.some((part) => part.id === value),
      );
      return id
        ? {
            selectedIds: restrictSelectionToContext(
              state.design,
              selectSameSemanticRole(state.design, id),
              state.editContextId,
            ),
          }
        : {};
    }),
  selectSameModuleDefinition: () =>
    set((state) => {
      const id = state.selectedIds.find((value) =>
        state.design.moduleInstances.some((instance) => instance.id === value),
      );
      return id ? { selectedIds: selectSameModuleDefinition(state.design, id) } : {};
    }),
  flipSelected: (axis) => {
    const state = get();
    const ids = [...state.selectedIds];
    if (!ids.length) return;
    get().mutate((design) => {
      for (const id of ids) {
        const bounds = entityWorldAabb(design, id);
        const pivot = bounds
          ? axis === 'x'
            ? (bounds.min.x + bounds.max.x) / 2
            : axis === 'y'
              ? (bounds.min.y + bounds.max.y) / 2
              : (bounds.min.z + bounds.max.z) / 2
          : 0;
        flipEntity(design, id, axis, pivot);
      }
    });
  },

  saveSelectionAsModule: (name, defs, bindings) => {
    const partIds = get().selectedIds.filter((id) =>
      get().design.parts.some((part) => part.id === id),
    );
    if (!partIds.length) return;
    let defId: Id | undefined;
    get().mutate((design) => {
      const group = groupParts(design, partIds, name);
      const { definition } = createModuleDefinitionFromAssembly(design, group.id, {
        name,
        parameters: defs,
        parameterBindings: bindings,
        tags: ['USER'],
      });
      defId = definition.id;
    });
    return defId;
  },
  saveAssemblyAsModule: (assemblyId, name) => {
    const state = get();
    const id =
      assemblyId ??
      state.selectedIds.find((value) =>
        state.design.assemblies.some(
          (assembly) => assembly.id === value && assembly.id !== state.design.rootAssemblyId,
        ),
      );
    if (!id) return;
    const source = state.design.assemblies.find((assembly) => assembly.id === id);
    if (!source) return;
    let defId: Id | undefined;
    get().mutate((design) => {
      const { definition } = createModuleDefinitionFromAssembly(design, id, {
        name: name?.trim() || source.name,
        tags: ['USER'],
      });
      defId = definition.id;
    });
    if (defId) set({ activePanel: 'MODULE' });
    return defId;
  },
  insertModule: (definitionId) =>
    get().mutate((design) =>
      instantiateModule(design, definitionId, { position: { x: 500, y: 0, z: 500 } }),
    ),
  setInstanceParameters: (id, values) =>
    get().mutate((design) => updateModuleInstanceParameters(design, id, values)),
  detachInstance: (id) => get().mutate((design) => detachModuleInstance(design, id)),
  makeUnique: (id) => get().mutate((design) => makeModuleInstanceUnique(design, id)),
  setModuleOrigin: (definitionId, origin) =>
    get().mutate((design) => setModuleDefinitionOrigin(design, definitionId, origin)),
  setSelectedModuleOriginFromInference: () => {
    const state = get();
    const instanceId = state.selectedIds.find((id) =>
      state.design.moduleInstances.some((instance) => instance.id === id && !instance.detached),
    );
    const point = state.inferenceCandidate?.point;
    if (!instanceId || !point) return;
    const instance = state.design.moduleInstances.find((candidate) => candidate.id === instanceId)!;
    const rootWorld = getAssemblyWorldTransform(state.design, instance.rootAssemblyId);
    const localPoint = worldToLocal(rootWorld, point);
    const definition = state.design.moduleDefinitions.find(
      (candidate) => candidate.id === instance.definitionId,
    );
    if (!definition) return;
    get().mutate((design) =>
      setModuleDefinitionOrigin(design, definition.id, {
        position: localPoint,
        rotation: structuredClone(definition.origin.rotation),
      }),
    );
  },
  screw: (input) => {
    const [a, b] = get().selectedIds;
    if (a && b) get().mutate((design) => createScrewJoint(design, a, b, input));
  },
  dowel: (input) => {
    const [a, b] = get().selectedIds;
    if (a && b) get().mutate((design) => createDowelJoint(design, a, b, input));
  },
  hinge: (input) => {
    const [a, b] = get().selectedIds;
    if (a && b) get().mutate((design) => createHingeJoint(design, a, b, input));
  },
  slide: (input) => {
    const [a, b] = get().selectedIds;
    if (a && b) get().mutate((design) => createDrawerSlideJoint(design, a, b, input));
  },
  setKinematic: (id, value) =>
    set((state) => ({ kinematicValues: { ...state.kinematicValues, [id]: value } })),
  setExploded: (exploded) => set({ exploded }),
  updateInference: (point) => {
    const state = get();
    const settings = defaultInferenceSettings();
    settings.enabled = state.inferenceEnabled;
    settings.lockedCandidateId = state.inferenceLockedId;
    settings.contextEntityIds = new Set(state.selectedIds);
    if (state.editContextId) {
      try {
        const transform = getWorldTransform(state.design, state.editContextId);
        settings.localAxes = {
          origin: transform.position,
          rotation: transform.rotation,
          label: 'Local',
        };
      } catch {
        /* Contexto sin transform disponible. */
      }
    }
    const candidate = inferenceEngine.best(state.design, point, settings, state.selectedIds);
    set({ inferenceCandidate: candidate });
  },
  toggleInference: () =>
    set((state) => ({
      inferenceEnabled: !state.inferenceEnabled,
      inferenceCandidate: undefined,
      inferenceLockedId: undefined,
    })),
  lockInference: () =>
    set((state) => ({
      inferenceLockedId: state.inferenceLockedId ? undefined : state.inferenceCandidate?.id,
    })),
  addGuideAtMeasurePoint: () => {
    const point = get().measureResult?.pointB ?? get().measurePointA;
    if (!point) return;
    set((state) => ({ guides: [...state.guides, createGuidePoint(point, 'Guía')] }));
  },
  setGuideMode: (guideMode) => set({ guideMode, guidePointA: undefined, guidePointer: undefined }),
  deleteSelectedGuide: () =>
    set((state) =>
      state.selectedGuideId
        ? {
            guides: state.guides.filter((guide) => guide.id !== state.selectedGuideId),
            selectedGuideId: undefined,
          }
        : {},
    ),
  clearGuides: () => set({ guides: [], selectedGuideId: undefined }),
  setSelectedGuide: (selectedGuideId) => set({ selectedGuideId, selectedIds: [] }),
  setWalkSettings: (patch) =>
    set((state) => {
      const workspace = normalizeWorkspacePreferences({ ...state.workspace, ...patch });
      persistWorkspace(workspace);
      return { workspace };
    }),

  setCamera: (camera) =>
    set((state) => {
      cameraHistory.push(camera);
      return { previousCamera: state.camera, camera, cameraTransition: undefined };
    }),
  syncCameraFromViewport: (view) =>
    set((state) => {
      const camera = synchronizeCameraState(state.camera, view);
      cameraHistory.push(camera);
      return { camera, cameraTransition: undefined };
    }),
  fitAll: () =>
    set((state) => {
      const isolated = state.isolatedIds
        ? resolveIsolationPartIds(state.design, state.isolatedIds)
        : undefined;
      const hidden = new Set(state.workspaceHiddenIds);
      const parts = state.design.parts.filter(
        (part) =>
          !part.hidden &&
          !hidden.has(part.id) &&
          (!isolated || isolated.has(part.id)) &&
          (partIsModuleDescendant(state.design, part.id)
            ? state.visibilityTags.MODULES
            : state.visibilityTags.PARTS),
      );
      const camera = fitAllCamera(state.camera, state.design, parts);
      cameraHistory.push(camera);
      return { previousCamera: state.camera, camera, cameraTransition: undefined };
    }),
  fitRoom: () =>
    set((state) => {
      const camera = fitRoomCamera(state.camera, state.design);
      cameraHistory.push(camera);
      return { previousCamera: state.camera, camera, cameraTransition: undefined };
    }),
  focusSelected: () => {
    const state = get();
    const id = state.selectedIds[0];
    if (!id) return;
    const bounds = entityWorldAabb(state.design, id);
    if (bounds) {
      const camera = focusCamera(state.camera, bounds);
      cameraHistory.push(camera);
      set({
        previousCamera: state.camera,
        camera,
        orbitPivot: {
          x: (bounds.min.x + bounds.max.x) / 2,
          y: (bounds.min.y + bounds.max.y) / 2,
          z: (bounds.min.z + bounds.max.z) / 2,
        },
        cameraTransition: undefined,
      });
    }
  },
  setView: (preset) =>
    get().setCamera(
      cameraPreset(
        preset,
        { x: 0, y: get().design.room.heightMm / 2, z: 0 },
        Math.max(get().design.room.widthMm, get().design.room.depthMm) * 1.6,
      ),
    ),
  previousView: () => {
    const camera = cameraHistory.previous();
    if (camera) set({ camera, cameraTransition: undefined });
  },
  nextView: () => {
    const camera = cameraHistory.next();
    if (camera) set({ camera, cameraTransition: undefined });
  },
  toggleProjection: () =>
    set((state) => {
      const camera = {
        ...state.camera,
        projection:
          state.camera.projection === 'PERSPECTIVE'
            ? ('ORTHOGRAPHIC' as const)
            : ('PERSPECTIVE' as const),
      };
      cameraHistory.push(camera);
      return { camera, cameraTransition: undefined };
    }),
  setFov: (fov) =>
    set((state) => ({ camera: { ...state.camera, fov }, cameraTransition: undefined })),
  alignViewToInferenceFace: (orthographic = false) => {
    const state = get(),
      candidate = state.inferenceCandidate;
    if (!candidate?.normal) return;
    const camera = alignViewToFace(
      state.camera,
      candidate.point,
      candidate.normal,
      undefined,
      orthographic,
    );
    cameraHistory.push(camera);
    set({ camera, cameraTransition: undefined });
  },
  zoomWindow: (screenFraction, centerOffset) =>
    set((state) => {
      const camera = zoomWindowCamera(state.camera, screenFraction, centerOffset);
      cameraHistory.push(camera);
      return {
        camera,
        cameraTransition: undefined,
        activeTool: 'SELECT' as const,
        selectionDrag: undefined,
      };
    }),
  setOrbitPivot: (orbitPivot) =>
    set((state) => ({
      orbitPivot,
      camera: orbitPivot ? { ...state.camera, target: structuredClone(orbitPivot) } : state.camera,
    })),
  setContextMenu: (contextMenu) => set({ contextMenu }),

  addSection: () => {
    const state = get();
    const design = cloneDesign(state.design);
    const section = createSectionPlane(
      `Sección ${design.sectionPlanes.length + 1}`,
      { x: 1, y: 0, z: 0 },
      0,
    );
    design.sectionPlanes.push(section);
    touchDesign(design);
    set({
      design,
      saveStatus: 'PENDIENTE',
      activeSectionId: section.id,
      selectedSectionId: section.id,
    });
  },
  beginSectionPlacement: (preset) => {
    const state = get();
    const center = { x: 0, y: state.design.room.heightMm / 2, z: 0 };
    const draft = createSectionPlane(`Sección ${preset}`, sectionPresetNormal(preset), 0);
    setSectionPosition(draft, center);
    toolManager.switchTool('SECTION');
    set({
      activeTool: 'SECTION',
      toolPhase: 'PICK_FIRST_POINT',
      sectionDraft: draft,
      selectedSectionId: undefined,
    });
  },
  selectSection: (selectedSectionId) =>
    set({ selectedSectionId, selectedIds: selectedSectionId ? [] : get().selectedIds }),
  toggleSection: (id) => {
    const state = get();
    const design = cloneDesign(state.design);
    const section = design.sectionPlanes.find((candidate) => candidate.id === id);
    if (!section) return;
    section.enabled = !section.enabled;
    touchDesign(design);
    set({
      design,
      saveStatus: 'PENDIENTE',
      activeSectionId: section.enabled
        ? id
        : state.activeSectionId === id
          ? undefined
          : state.activeSectionId,
    });
  },
  setSectionPosition: (id, position) => {
    const state = get();
    const design = cloneDesign(state.design);
    const section = design.sectionPlanes.find((v) => v.id === id);
    if (!section) return;
    setSectionPosition(section, position);
    touchDesign(design);
    set({ design, saveStatus: 'PENDIENTE' });
  },
  setSectionNormal: (id, normal) => {
    const state = get();
    const design = cloneDesign(state.design);
    const section = design.sectionPlanes.find((v) => v.id === id);
    if (!section) return;
    try {
      setSectionOrientation(section, normal);
    } catch {
      return;
    }
    touchDesign(design);
    set({ design, saveStatus: 'PENDIENTE' });
  },
  rotateSection: (id, axis, degrees) => {
    const state = get();
    const design = cloneDesign(state.design);
    const section = design.sectionPlanes.find((v) => v.id === id);
    if (!section) return;
    rotateSection(section, axis, degrees);
    touchDesign(design);
    set({ design, saveStatus: 'PENDIENTE' });
  },
  invertSection: (id) => {
    const state = get();
    const design = cloneDesign(state.design);
    const section = design.sectionPlanes.find((v) => v.id === id);
    if (!section) return;
    invertSection(section);
    touchDesign(design);
    set({ design, saveStatus: 'PENDIENTE' });
  },
  deleteSection: (id) => {
    const state = get();
    const design = cloneDesign(state.design);
    design.sectionPlanes = design.sectionPlanes.filter((v) => v.id !== id);
    for (const scene of design.scenes) {
      scene.sectionPlaneIds = scene.sectionPlaneIds.filter((v) => v !== id);
      if (scene.presentation.activeSectionId === id) scene.presentation.activeSectionId = undefined;
    }
    touchDesign(design);
    set({
      design,
      saveStatus: 'PENDIENTE',
      activeSectionId: state.activeSectionId === id ? undefined : state.activeSectionId,
      selectedSectionId: state.selectedSectionId === id ? undefined : state.selectedSectionId,
    });
  },
  lookAtSection: (id) => {
    const state = get();
    const section = state.design.sectionPlanes.find((v) => v.id === id);
    if (section)
      set({
        previousCamera: state.camera,
        camera: lookAtSectionCamera(state.camera, section),
        cameraTransition: undefined,
      });
  },

  addScene: (name) => {
    const state = get();
    const design = cloneDesign(state.design);
    const scene = createScene(
      name || `Vista ${design.scenes.length + 1}`,
      state.camera,
      state.displayMode,
      design,
      scenePresentationFromState(state),
    );
    design.scenes.push(scene);
    touchDesign(design);
    set({ design, saveStatus: 'PENDIENTE', activeSceneId: scene.id });
  },
  updateScene: (id) => {
    const state = get();
    const design = cloneDesign(state.design);
    captureScene(design, id, state.camera, state.displayMode, scenePresentationFromState(state));
    set({ design, saveStatus: 'PENDIENTE' });
  },
  renameScene: (id, name) => {
    const state = get();
    const design = cloneDesign(state.design);
    const scene = design.scenes.find((v) => v.id === id);
    if (!scene) return;
    scene.name = name.trim() || scene.name;
    touchDesign(design);
    set({ design, saveStatus: 'PENDIENTE' });
  },
  duplicateScene: (id) => {
    const state = get();
    const design = cloneDesign(state.design);
    const copy = duplicateScene(design, id);
    set({ design, saveStatus: 'PENDIENTE', activeSceneId: copy.id });
  },
  moveScene: (id, direction) => {
    const state = get();
    const ordered = [...state.design.scenes].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((v) => v.id === id);
    const other = index + direction;
    if (index < 0 || other < 0 || other >= ordered.length) return;
    [ordered[index], ordered[other]] = [ordered[other]!, ordered[index]!];
    const design = cloneDesign(state.design);
    reorderScenes(
      design,
      ordered.map((v) => v.id),
    );
    set({ design, saveStatus: 'PENDIENTE' });
  },
  deleteScene: (id) => {
    const state = get();
    const design = cloneDesign(state.design);
    deleteSceneDefinition(design, id);
    set({
      design,
      saveStatus: 'PENDIENTE',
      activeSceneId: state.activeSceneId === id ? undefined : state.activeSceneId,
      presentationPlaying: design.scenes.length > 1 ? state.presentationPlaying : false,
    });
  },
  activateScene: (id, instant = false) => {
    const state = get();
    const scene = state.design.scenes.find((v) => v.id === id);
    if (!scene) return;
    const restored = restoreScenePresentation(scene);
    const workspace = normalizeWorkspacePreferences({
      ...state.workspace,
      qualityPreset: restored.presentation.quality,
      wallsMode: restored.presentation.wallsMode,
    });
    persistWorkspace(workspace);
    const smooth =
      workspace.sceneTransitionEnabled &&
      !instant &&
      !reducedMotionPreferred() &&
      state.camera.projection === restored.camera.projection;
    const transition = smooth
      ? {
          from: structuredClone(state.camera),
          to: structuredClone(restored.camera),
          startedAt: Date.now(),
          durationMs: 480,
        }
      : undefined;
    set({
      activeSceneId: id,
      previousCamera: state.camera,
      camera: smooth ? state.camera : restored.camera,
      cameraTransition: transition,
      displayMode: restored.displayMode,
      workspace,
      visibilityTags: normalizeVisibilityTags({
        ...restored.presentation.visibility,
        GUIDES: restored.presentation.guidesVisibility,
      }),
      gridVisible: restored.presentation.gridVisible,
      activeSectionId: restored.presentation.activeSectionId,
      sectionGizmosVisible: restored.presentation.sectionVisibility,
      technicalOverlays: restored.presentation.technicalOverlays,
      cleanMode: false,
    });
  },
  nextScene: () => {
    const state = get();
    const ordered = [...state.design.scenes].sort((a, b) => a.order - b.order);
    if (!ordered.length) return;
    const index = Math.max(
      0,
      ordered.findIndex((v) => v.id === state.activeSceneId),
    );
    get().activateScene(ordered[(index + 1) % ordered.length]!.id);
  },
  previousScene: () => {
    const state = get();
    const ordered = [...state.design.scenes].sort((a, b) => a.order - b.order);
    if (!ordered.length) return;
    const found = ordered.findIndex((v) => v.id === state.activeSceneId);
    const index = found < 0 ? 0 : found;
    get().activateScene(ordered[(index - 1 + ordered.length) % ordered.length]!.id);
  },
  enterPresentation: () => {
    const state = get();
    if (state.presentationMode) return;
    toolManager.cancel();
    measurementBuffer.clear();
    const first = [...state.design.scenes].sort((a, b) => a.order - b.order)[0];
    set({
      presentationMode: true,
      presentationPlaying: false,
      cleanMode: false,
      activeTool: 'SELECT',
      sectionDraft: undefined,
      hoveredId: undefined,
      inferenceCandidate: undefined,
      inferenceLockedId: undefined,
      pendingSnap: undefined,
      measurePointA: undefined,
      measureResult: undefined,
      ...toolUiSnapshot(),
    });
    if (!state.activeSceneId && first) get().activateScene(first.id, true);
  },
  exitPresentation: () =>
    set({ presentationMode: false, presentationPlaying: false, cameraTransition: undefined }),
  setPresentationPlaying: (presentationPlaying) => set({ presentationPlaying }),
  setPresentationAllowNavigation: (presentationAllowNavigation) =>
    set({ presentationAllowNavigation }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  cancelCameraTransition: (view) =>
    set((state) => ({
      cameraTransition: undefined,
      camera: view ? synchronizeCameraState(state.camera, view) : state.camera,
    })),
  finishCameraTransition: () =>
    set((state) =>
      state.cameraTransition
        ? { camera: structuredClone(state.cameraTransition.to), cameraTransition: undefined }
        : {},
    ),
  undo: () =>
    set((state) => {
      const raw = state.undoStack.at(-1);
      if (!raw) return {};
      toolManager.cancel();
      return {
        design: deserializeDesign(raw),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [serializeDesign(state.design), ...state.redoStack],
        saveStatus: 'PENDIENTE',
        toolPreview: undefined,
        toolPreviewEntityId: undefined,
      };
    }),
  redo: () =>
    set((state) => {
      const raw = state.redoStack[0];
      if (!raw) return {};
      toolManager.cancel();
      return {
        design: deserializeDesign(raw),
        undoStack: [...state.undoStack, serializeDesign(state.design)],
        redoStack: state.redoStack.slice(1),
        saveStatus: 'PENDIENTE',
        toolPreview: undefined,
        toolPreviewEntityId: undefined,
      };
    }),
  saveLocal: () => {
    const state = get();
    if (!state.remoteProject) set({ saveStatus: 'GUARDANDO', saveError: undefined });
    try {
      if (state.remoteProject) cacheRemote(state.remoteProject, state.design);
      else localStorage.setItem(STORAGE, serializeDesign(state.design));
      if (!state.remoteProject) set({ saveStatus: 'GUARDADO' });
      editorEvents.emit({ type: 'design.saved', designId: state.design.id, target: 'local' });
    } catch {
      set({ saveStatus: 'ERROR', saveError: 'No se pudo guardar la copia local' });
    }
  },
  reloadLocal: () => {
    const context = get().remoteProject;
    const raw = localStorage.getItem(context ? projectCache(context) : STORAGE);
    if (raw) {
      const cache = context
        ? (JSON.parse(raw) as { design: unknown; revision: number })
        : undefined;
      if (context && cache?.revision !== context.revision)
        throw new Error(
          'La copia local corresponde a otra revisión del servidor; conserva el conflicto antes de reemplazar el diseño',
        );
      const design = deserializeDesign(context ? JSON.stringify(cache?.design) : raw);
      if (
        context &&
        (design.metadata.projectId !== context.projectId || design.id !== get().design.id)
      )
        throw new Error('Copia local de otro proyecto');
      set({
        design,
        projectId: context?.projectId,
        selectedIds: [],
        isolatedIds: null,
        activeSectionId: design.sectionPlanes.find((section) => section.enabled)?.id,
        activeSceneId: design.activeSceneId,
        selectedSectionId: undefined,
        sectionDraft: undefined,
        undoStack: [],
        redoStack: [],
        saveStatus:
          context && serializeDesign(design) !== context.savedDesign ? 'PENDIENTE' : 'GUARDADO',
        saveError: undefined,
      });
      editorEvents.emit({ type: 'design.loaded', designId: design.id, source: 'local' });
    }
  },
  createProject: (name) => {
    toolManager.cancel();
    const design = createEmptyDesign(name);
    set({
      design,
      projectId: undefined,
      remoteProject: undefined,
      saveError: undefined,
      selectedIds: [],
      isolatedIds: null,
      workspaceHiddenIds: [],
      hiddenHistory: [],
      editContextId: undefined,
      editContextPath: [],
      guides: [],
      kinematicValues: {},
      activeSectionId: undefined,
      activeSceneId: undefined,
      selectedSectionId: undefined,
      sectionDraft: undefined,
      undoStack: [],
      redoStack: [],
      saveStatus: 'PENDIENTE',
    });
    get().setTool('SELECT');
    get().fitAll();
  },
  createVersion: async () => {
    const connection = get().remoteProject?.connectionId;
    await autosaveNow();
    const { design, remoteProject } = get();
    if (!connection) {
      const raw = localStorage.getItem('simbo.versions.v1');
      const versions = raw ? (JSON.parse(raw) as unknown[]) : [];
      versions.push({
        createdAt: new Date().toISOString(),
        design: JSON.parse(serializeDesign(design)),
      });
      localStorage.setItem('simbo.versions.v1', JSON.stringify(versions));
    } else {
      if (remoteProject?.connectionId !== connection) throw new Error('El proyecto activo cambió');
      if (serializeDesign(design) !== remoteProject.savedDesign)
        throw new Error('El diseño cambió durante el guardado; guarda de nuevo antes de versionar');
      await apiClient.createVersion(remoteProject.projectId, remoteProject.revision);
    }
    editorEvents.emit({ type: 'design.saved', designId: design.id, target: 'version' });
  },
  manufacturing: () => collectManufacturingData(get().design),
  health: () => modelHealth(get().design),
}));

export const editorInput = new InputManager({
  pointerDown: (event) => useEditor.getState().handlePointerDown(event),
  pointerMove: (event) => useEditor.getState().handlePointerMove(event),
  pointerUp: (event) => useEditor.getState().handlePointerUp(event),
  keyDown: (event) => useEditor.getState().handleKeyboard(event),
});

let saveQueue: Promise<void> = Promise.resolve();
/** Serializa escrituras y sólo confirma el documento reconocido por el servidor. */
export function autosaveNow(): Promise<void> {
  const connection = useEditor.getState().remoteProject?.connectionId;
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const state = useEditor.getState();
      if (state.remoteProject?.connectionId !== connection) return;
      if (!state.remoteProject) {
        state.saveLocal();
        if (useEditor.getState().saveStatus === 'ERROR')
          throw new Error(useEditor.getState().saveError);
        return;
      }
      const context = state.remoteProject;
      const snapshot = cloneDesign(state.design);
      const raw = serializeDesign(snapshot);
      try {
        cacheRemote(context, snapshot);
      } catch {
        /* La confirmación remota sigue siendo necesaria. */
      }
      if (context.persisted && raw === context.savedDesign) {
        useEditor.setState({ saveStatus: 'GUARDADO', saveError: undefined });
        return;
      }
      useEditor.setState({ saveStatus: 'GUARDANDO', saveError: undefined });
      try {
        const result = await apiClient.saveDesign(context.projectId, snapshot, context.revision);
        const current = useEditor.getState();
        if (current.remoteProject?.connectionId !== context.connectionId) return;
        const unchanged = serializeDesign(current.design) === raw;
        useEditor.setState({
          remoteProject: {
            ...context,
            revision: result.revision,
            savedDesign: raw,
            persisted: true,
            approvedVersionId:
              result.revision === context.revision ? context.approvedVersionId : null,
          },
          saveStatus: unchanged ? 'GUARDADO' : 'PENDIENTE',
          saveError: undefined,
        });
        try {
          cacheRemote(useEditor.getState().remoteProject!, current.design);
        } catch {
          /* copia local opcional */
        }
        editorEvents.emit({ type: 'design.saved', designId: snapshot.id, target: 'api' });
      } catch (error) {
        if (useEditor.getState().remoteProject?.connectionId === context.connectionId)
          useEditor.setState({
            saveStatus: 'ERROR',
            saveError: error instanceof Error ? error.message : 'No se pudo guardar el diseño',
          });
        throw error;
      }
    });
  return saveQueue;
}
