import {
  cloneDesign,
  createAssembly,
  createId,
  deserializeDesign,
  findAssembly,
  findPart,
  getPartWorldTransform,
  getWorldTransform,
  localToWorld,
  parseAngleDeg,
  parseLengthToMm,
  rotateVectorByEuler,
  serializeDesign,
  setAssemblyWorldTransform,
  setModuleInstanceWorldTransform,
  setPartWorldTransform,
  touchDesign,
  worldToLocal,
  type Assembly,
  type CameraState,
  type DesignDocument,
  type DisplayMode,
  type Euler3,
  type Id,
  type Part,
  type SceneDefinition,
  type ScenePresentationSnapshot,
  type SectionPlane,
  type SectionScope,
  type VisibilityTagState,
  type SnapDefinition,
  type Transform,
  type Vec3
} from '../../design-domain/src/index.ts';
import {
  add,
  centerOfAabb,
  dot,
  length,
  normalize,
  partWorldAabb,
  roomAabb,
  rotateVector,
  sub,
  type Aabb
} from '../../geometry-engine/src/index.ts';

export type Axis = 'x' | 'y' | 'z';

export function dragThresholdExceeded(start: ScreenPoint, current: ScreenPoint, thresholdPx = 5): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= thresholdPx;
}
export type ToolId = 'SELECT' | 'PART_PLACEMENT' | 'MOVE' | 'ROTATE' | 'MEASURE' | 'GUIDE' | 'PROTRACTOR' | 'WALK' | 'LOOK' | 'MIRROR' | 'AXES' | 'ZOOM_WINDOW' | 'SECTION';
export type ToolPhase =
  | 'IDLE'
  | 'PICK_REFERENCE'
  | 'MOVING'
  | 'PICK_PIVOT'
  | 'ROTATING'
  | 'PICK_FIRST_POINT'
  | 'PICK_SECOND_POINT'
  | 'COMMITTED'
  | 'CANCELLED';

export interface MeasurementInput {
  raw: string;
  value: number;
  kind: 'LENGTH' | 'ANGLE';
  unit: string;
}

export function parseMeasurement(raw: string, kind: 'LENGTH' | 'ANGLE'): MeasurementInput {
  return kind === 'LENGTH'
    ? { raw, value: parseLengthToMm(raw), kind, unit: 'mm' }
    : { raw, value: parseAngleDeg(raw), kind, unit: 'deg' };
}

export function parseRelativeCoordinates(raw: string): Vec3 {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) throw new Error('Coordenadas relativas: <x,y,z>');
  const pieces = trimmed.slice(1, -1).split(',').map(value => value.trim());
  if (pieces.length !== 3) throw new Error('Coordenadas relativas: <x,y,z>');
  const values = pieces.map(value => parseLengthToMm(value));
  if (values.some(value => !Number.isFinite(value))) throw new Error('Coordenadas relativas: <x,y,z>');
  return { x: values[0]!, y: values[1]!, z: values[2]! };
}

export interface MeasurementBufferSnapshot {
  raw: string;
  normalized: string;
  error?: string;
}

/** Keyboard-fed CAD measurements buffer. It is deliberately independent from DOM focus. */
export class MeasurementsBuffer {
  private value = '';
  private lastError: string | undefined;

  get raw(): string { return this.value; }
  clear(): void { this.value = ''; this.lastError = undefined; }
  set(raw: string): void { this.value = raw; this.lastError = undefined; }

  acceptsKey(key: string): boolean {
    return /^[0-9]$/.test(key) || ['.', ',', '-', '+', '<', '>', 'm', 'M', 'c', 'C', 'd', 'D', 'e', 'E', 'g', 'G', '°', ' '].includes(key);
  }

  feedKey(key: string): boolean {
    if (key === 'Backspace') { this.value = this.value.slice(0, -1); this.lastError = undefined; return true; }
    if (!this.acceptsKey(key)) return false;
    this.value += key;
    this.lastError = undefined;
    return true;
  }

  snapshot(kind: 'LENGTH' | 'ANGLE' | 'COORDINATE' | 'NONE'): MeasurementBufferSnapshot {
    if (!this.value || kind === 'NONE') return { raw: this.value, normalized: this.value };
    try {
      if (kind === 'COORDINATE' || this.value.trim().startsWith('<')) {
        const v = parseRelativeCoordinates(this.value);
        return { raw: this.value, normalized: `<${v.x}, ${v.y}, ${v.z}> mm` };
      }
      const parsed = parseMeasurement(this.value, kind === 'ANGLE' ? 'ANGLE' : 'LENGTH');
      return { raw: this.value, normalized: `${parsed.value} ${parsed.unit}` };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return { raw: this.value, normalized: this.value, error: this.lastError };
    }
  }
}

export interface InferenceCandidate {
  id: string;
  kind: 'ENDPOINT' | 'MIDPOINT' | 'CENTER' | 'FACE' | 'EDGE' | 'AXIS' | 'PARALLEL' | 'PERPENDICULAR' | 'ANCHOR';
  entityId?: Id;
  point: Vec3;
  direction?: Vec3;
  normal?: Vec3;
  score: number;
  label: string;
}

export interface InferenceSettings {
  enabled: boolean;
  disabledKinds: Set<InferenceCandidate['kind']>;
  lockedCandidateId?: string;
  toleranceMm: number;
  typePriority?: Partial<Record<InferenceCandidate['kind'], number>>;
  contextEntityIds?: Set<Id>;
  /** Optional active-context axes. These are additive to global World axes. */
  localAxes?: { origin: Vec3; rotation: Euler3; label?: string };
}

export const defaultInferenceSettings = (): InferenceSettings => ({
  enabled: true,
  disabledKinds: new Set(),
  toleranceMm: 80,
  typePriority: {
    ENDPOINT: 0,
    ANCHOR: 2,
    MIDPOINT: 4,
    CENTER: 6,
    EDGE: 8,
    FACE: 10,
    AXIS: 12,
    PARALLEL: 15,
    PERPENDICULAR: 15
  }
});

function dist(a: Vec3, b: Vec3): number { return length(sub(a, b)); }

function rotateAroundAxis(vector: Vec3, axis: Axis, angle: number): Vec3 {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  if (axis === 'x') return { x: vector.x, y: vector.y * c - vector.z * sn, z: vector.y * sn + vector.z * c };
  if (axis === 'y') return { x: vector.x * c + vector.z * sn, y: vector.y, z: -vector.x * sn + vector.z * c };
  return { x: vector.x * c - vector.y * sn, y: vector.x * sn + vector.y * c, z: vector.z };
}

function transformRotatedAboutPivot(original: Transform, pivot: Vec3 | undefined, axis: Axis, angle: number): Transform {
  const rotation = structuredClone(original.rotation);
  rotation[axis] += angle;
  if (!pivot) return { ...structuredClone(original), rotation };
  const offset = sub(original.position, pivot);
  const position = add(pivot, rotateAroundAxis(offset, axis, angle));
  return { ...structuredClone(original), position, rotation };
}
function aabbPoints(aabb: Aabb): { corners: Vec3[]; centers: Vec3[] } {
  const xs = [aabb.min.x, aabb.max.x];
  const ys = [aabb.min.y, aabb.max.y];
  const zs = [aabb.min.z, aabb.max.z];
  const corners: Vec3[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) corners.push({ x, y, z });
  const c = centerOfAabb(aabb);
  return {
    corners,
    centers: [
      { x: aabb.min.x, y: c.y, z: c.z }, { x: aabb.max.x, y: c.y, z: c.z },
      { x: c.x, y: aabb.min.y, z: c.z }, { x: c.x, y: aabb.max.y, z: c.z },
      { x: c.x, y: c.y, z: aabb.min.z }, { x: c.x, y: c.y, z: aabb.max.z }
    ]
  };
}

function inferenceRank(candidate: InferenceCandidate, settings: InferenceSettings): number {
  const typeBias = settings.typePriority?.[candidate.kind] ?? 20;
  const contextBias = candidate.entityId && settings.contextEntityIds?.has(candidate.entityId) ? -8 : 0;
  return candidate.score + typeBias + contextBias;
}

export function infer(
  design: DesignDocument,
  pointer: Vec3,
  settings: InferenceSettings = defaultInferenceSettings(),
  excludeIds: Id[] = []
): InferenceCandidate[] {
  if (!settings.enabled) return [];
  const out: InferenceCandidate[] = [];
  const excluded = new Set(excludeIds);
  const push = (candidate: InferenceCandidate): void => {
    if (!settings.disabledKinds.has(candidate.kind) && candidate.score <= settings.toleranceMm) out.push(candidate);
  };

  for (const part of design.parts) {
    if (excluded.has(part.id) || part.hidden) continue;
    const world = getPartWorldTransform(design, part.id);
    const aabb = partWorldAabb(design, part);
    const points = aabbPoints(aabb);
    const center = centerOfAabb(aabb);
    push({ id: `center:${part.id}`, kind: 'CENTER', entityId: part.id, point: center, score: dist(pointer, center), label: `Centro · ${part.name}` });
    points.corners.forEach((point, index) => push({ id: `endpoint:${part.id}:${index}`, kind: 'ENDPOINT', entityId: part.id, point, score: dist(pointer, point), label: `Extremo · ${part.name}` }));
    points.centers.forEach((point, index) => {
      const normals: Vec3[] = [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }];
      push({ id: `face:${part.id}:${index}`, kind: 'FACE', entityId: part.id, point, normal: normals[index], score: dist(pointer, point), label: `En cara · ${part.name}` });
    });
    const mids = [
      { x: (aabb.min.x + aabb.max.x) / 2, y: aabb.min.y, z: aabb.min.z },
      { x: (aabb.min.x + aabb.max.x) / 2, y: aabb.max.y, z: aabb.max.z },
      { x: aabb.min.x, y: (aabb.min.y + aabb.max.y) / 2, z: aabb.min.z },
      { x: aabb.max.x, y: (aabb.min.y + aabb.max.y) / 2, z: aabb.max.z }
    ];
    mids.forEach((point, index) => push({ id: `mid:${part.id}:${index}`, kind: 'MIDPOINT', entityId: part.id, point, score: dist(pointer, point), label: `Punto medio · ${part.name}` }));
    const edges = [
      { point: { x: aabb.min.x, y: aabb.min.y, z: center.z }, direction: { x: 0, y: 0, z: 1 } },
      { point: { x: aabb.max.x, y: center.y, z: aabb.max.z }, direction: { x: 0, y: 1, z: 0 } }
    ];
    edges.forEach((edge, index) => push({ id: `edge:${part.id}:${index}`, kind: 'EDGE', entityId: part.id, point: edge.point, direction: edge.direction, score: dist(pointer, edge.point), label: `En arista · ${part.name}` }));
    const localX = rotateVector({ x: 1, y: 0, z: 0 }, world.rotation);
    const localY = rotateVector({ x: 0, y: 1, z: 0 }, world.rotation);
    push({ id: `parallel:${part.id}`, kind: 'PARALLEL', entityId: part.id, point: center, direction: localX, score: dist(pointer, center), label: `Paralelo · ${part.name}` });
    push({ id: `perpendicular:${part.id}`, kind: 'PERPENDICULAR', entityId: part.id, point: center, direction: localY, score: dist(pointer, center), label: `Perpendicular · ${part.name}` });
    const anchors = Array.isArray(part.metadata.anchors) ? part.metadata.anchors as Array<{ name?: string; position?: Vec3 }> : [];
    anchors.forEach((anchor, index) => {
      if (!anchor.position) return;
      const point = localToWorld(world, anchor.position);
      push({ id: `anchor:${part.id}:${index}`, kind: 'ANCHOR', entityId: part.id, point, score: dist(pointer, point), label: `Anchor ${anchor.name ?? index + 1} · ${part.name}` });
    });
  }

  const axes: [Axis, Vec3][] = [['x', { x: 1, y: 0, z: 0 }], ['y', { x: 0, y: 1, z: 0 }], ['z', { x: 0, y: 0, z: 1 }]];
  for (const [axis, direction] of axes) {
    const point = { ...pointer, [axis]: 0 };
    push({ id: `axis:${axis}`, kind: 'AXIS', point, direction, score: Math.abs(pointer[axis]), label: `Eje ${axis.toUpperCase()}` });
  }
  if (settings.localAxes) {
    for (const [axis, unit] of axes) {
      const direction = normalize(rotateVectorByEuler(unit, settings.localAxes.rotation));
      const delta = sub(pointer, settings.localAxes.origin);
      const amount = dot(delta, direction);
      const point = add(settings.localAxes.origin, { x: direction.x * amount, y: direction.y * amount, z: direction.z * amount });
      const score = dist(pointer, point);
      push({ id: `local-axis:${axis}`, kind: 'AXIS', point, direction, score, label: `${settings.localAxes.label ?? 'Local'} ${axis.toUpperCase()}` });
    }
  }

  if (settings.lockedCandidateId) {
    const locked = out.find(candidate => candidate.id === settings.lockedCandidateId);
    return locked ? [locked] : [];
  }
  return out.sort((a, b) => inferenceRank(a, settings) - inferenceRank(b, settings));
}

export type SnapType = 'GRID' | 'FACE' | 'CENTER' | 'ANCHOR' | 'CUSTOM_MODULE';
export interface SnapResult {
  type: SnapType;
  position: Vec3;
  rotation?: Transform['rotation'];
  sourcePoint: Vec3;
  targetPoint: Vec3;
  targetEntityId?: Id;
  label: string;
}

export function gridSnap(point: Vec3, gridMm = 50): SnapResult {
  const target = { x: Math.round(point.x / gridMm) * gridMm, y: Math.round(point.y / gridMm) * gridMm, z: Math.round(point.z / gridMm) * gridMm };
  return { type: 'GRID', sourcePoint: point, targetPoint: target, position: target, label: `Grid ${gridMm} mm` };
}

export function snapReferencePoint(design: DesignDocument, part: Part, referenceLocal: Vec3, target: InferenceCandidate, orient = true): SnapResult {
  const world = getPartWorldTransform(design, part.id);
  const worldRef = localToWorld(world, referenceLocal);
  const delta = sub(target.point, worldRef);
  const rotation = structuredClone(world.rotation);
  if (orient && target.normal) {
    const n = normalize(target.normal);
    if (Math.abs(n.x) > 0.9) rotation.y = Math.PI / 2;
    else if (Math.abs(n.z) > 0.9) rotation.y = 0;
  }
  return {
    type: target.kind === 'FACE' ? 'FACE' : target.kind === 'ANCHOR' ? 'ANCHOR' : 'CENTER',
    sourcePoint: worldRef,
    targetPoint: target.point,
    targetEntityId: target.entityId,
    position: add(world.position, delta),
    rotation,
    label: `${target.kind}: ${target.label}`
  };
}

export function snapFaceToFace(
  design: DesignDocument,
  moving: Part,
  target: Part,
  movingFace: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK' = 'RIGHT',
  targetFace: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK' = 'LEFT'
): SnapResult {
  const movingWorld = getPartWorldTransform(design, moving.id);
  const movingAabb = partWorldAabb(design, moving);
  const targetAabb = partWorldAabb(design, target);
  const movingCenter = centerOfAabb(movingAabb);
  const targetCenter = centerOfAabb(targetAabb);
  const facePoint = (aabb: Aabb, center: Vec3, face: string): Vec3 => face === 'LEFT' ? { x: aabb.min.x, y: center.y, z: center.z }
    : face === 'RIGHT' ? { x: aabb.max.x, y: center.y, z: center.z }
      : face === 'BOTTOM' ? { x: center.x, y: aabb.min.y, z: center.z }
        : face === 'TOP' ? { x: center.x, y: aabb.max.y, z: center.z }
          : face === 'FRONT' ? { x: center.x, y: center.y, z: aabb.max.z }
            : { x: center.x, y: center.y, z: aabb.min.z };
  const source = facePoint(movingAabb, movingCenter, movingFace);
  const destination = facePoint(targetAabb, targetCenter, targetFace);
  const delta = sub(destination, source);
  const normals: Record<string, Vec3> = { LEFT: { x: -1, y: 0, z: 0 }, RIGHT: { x: 1, y: 0, z: 0 }, BOTTOM: { x: 0, y: -1, z: 0 }, TOP: { x: 0, y: 1, z: 0 }, FRONT: { x: 0, y: 0, z: 1 }, BACK: { x: 0, y: 0, z: -1 } };
  const sourceNormal = normals[movingFace]!;
  const targetNormal = normals[targetFace]!;
  const rotation = structuredClone(movingWorld.rotation);
  if (Math.abs(dot(sourceNormal, targetNormal) + 1) > 0.001) {
    if (Math.abs(targetNormal.x) > 0.9) rotation.y = Math.PI / 2;
    else if (Math.abs(targetNormal.z) > 0.9) rotation.y = 0;
  }
  return { type: 'FACE', sourcePoint: source, targetPoint: destination, targetEntityId: target.id, position: add(movingWorld.position, delta), rotation, label: `Cara ${movingFace} → ${target.name}.${targetFace}` };
}

export function bestFaceSnap(design: DesignDocument, moving: Part, target: Part): SnapResult {
  type Face = 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK';
  const pairs: Array<[Face, Face]> = [
    ['LEFT', 'RIGHT'], ['RIGHT', 'LEFT'],
    ['BOTTOM', 'TOP'], ['TOP', 'BOTTOM'],
    ['BACK', 'FRONT'], ['FRONT', 'BACK']
  ];
  const origin = getPartWorldTransform(design, moving.id).position;
  let best: SnapResult | undefined;
  let bestDistance = Infinity;
  for (const [sourceFace, targetFace] of pairs) {
    const candidate = snapFaceToFace(design, moving, target, sourceFace, targetFace);
    const displacement = dist(origin, candidate.position);
    if (displacement < bestDistance) { best = candidate; bestDistance = displacement; }
  }
  if (!best) throw new Error('No se pudo calcular snap de cara');
  return best;
}

export function snapAnchorToAnchor(design: DesignDocument, moving: Part, sourceLocal: Vec3, targetWorld: Vec3, targetEntityId?: Id, targetDirection?: Vec3): SnapResult {
  const movingWorld = getPartWorldTransform(design, moving.id);
  const sourceWorld = localToWorld(movingWorld, sourceLocal);
  const delta = sub(targetWorld, sourceWorld);
  const rotation = structuredClone(movingWorld.rotation);
  if (targetDirection) {
    const n = normalize(targetDirection);
    rotation.y = Math.atan2(n.x, n.z);
  }
  return { type: 'CUSTOM_MODULE', sourcePoint: sourceWorld, targetPoint: targetWorld, targetEntityId, position: add(movingWorld.position, delta), rotation, label: 'Custom module anchor snap' };
}

export interface WorldSnapDefinition extends SnapDefinition {
  ownerEntityId: Id;
  position: Vec3;
  normal?: Vec3;
  orientation?: Euler3;
}

export function resolveSnapDefinitionWorld(design: DesignDocument, ownerEntityId: Id, snap: SnapDefinition): WorldSnapDefinition {
  const owner = getWorldTransform(design, ownerEntityId);
  return {
    ...structuredClone(snap),
    ownerEntityId,
    position: localToWorld(owner, snap.position),
    normal: snap.normal ? rotateVectorByEuler(snap.normal, owner.rotation) : undefined,
    orientation: snap.orientation ? {
      x: owner.rotation.x + snap.orientation.x,
      y: owner.rotation.y + snap.orientation.y,
      z: owner.rotation.z + snap.orientation.z
    } : undefined
  };
}

/** Generic custom snap: no RIGHT→LEFT assumption. Compatibility is data-driven. */
export function snapDefinitionToDefinition(
  design: DesignDocument,
  movingEntityId: Id,
  sourceSnap: WorldSnapDefinition,
  targetSnap: WorldSnapDefinition,
  orient = true
): SnapResult {
  const compatible = sourceSnap.compatibleTypes.length === 0 || targetSnap.compatibleTypes.length === 0
    || sourceSnap.compatibleTypes.some(value => targetSnap.compatibleTypes.includes(value));
  if (!compatible) throw new Error(`Snaps incompatibles: ${sourceSnap.name} / ${targetSnap.name}`);
  const original = getWorldTransform(design, movingEntityId);
  const delta = sub(targetSnap.position, sourceSnap.position);
  let rotation = structuredClone(original.rotation);
  if (orient) {
    if (targetSnap.orientation) rotation = structuredClone(targetSnap.orientation);
    else if (targetSnap.normal) {
      const n = normalize(targetSnap.normal);
      rotation.y = Math.atan2(n.x, n.z);
    }
  }
  return {
    type: 'CUSTOM_MODULE', sourcePoint: sourceSnap.position, targetPoint: targetSnap.position,
    targetEntityId: targetSnap.ownerEntityId, position: add(original.position, delta), rotation,
    label: `${sourceSnap.name} → ${targetSnap.name}`
  };
}

export class InferenceEngine {
  candidates(design: DesignDocument, pointer: Vec3, settings: InferenceSettings = defaultInferenceSettings(), excludeIds: Id[] = []): InferenceCandidate[] {
    return infer(design, pointer, settings, excludeIds);
  }
  best(design: DesignDocument, pointer: Vec3, settings: InferenceSettings = defaultInferenceSettings(), excludeIds: Id[] = []): InferenceCandidate | undefined {
    return this.candidates(design, pointer, settings, excludeIds)[0];
  }
}

export class SnapEngine {
  grid(position: Vec3, gridMm = 50): SnapResult { return gridSnap(position, gridMm); }
  face(design: DesignDocument, moving: Part, target: Part): SnapResult { return bestFaceSnap(design, moving, target); }
  reference(design: DesignDocument, moving: Part, sourceLocal: Vec3, target: InferenceCandidate, orient = true): SnapResult {
    return snapReferencePoint(design, moving, sourceLocal, target, orient);
  }
  definition(design: DesignDocument, movingEntityId: Id, source: WorldSnapDefinition, target: WorldSnapDefinition): SnapResult {
    return snapDefinitionToDefinition(design, movingEntityId, source, target);
  }
  apply(design: DesignDocument, entityId: Id, result: SnapResult): void { applySnap(design, entityId, result); }
}

export function applySnap(design: DesignDocument, entityId: Id, snap: SnapResult): void {
  const current = getWorldTransform(design, entityId);
  const world: Transform = { position: structuredClone(snap.position), rotation: structuredClone(snap.rotation ?? current.rotation) };
  if (design.parts.some(part => part.id === entityId)) setPartWorldTransform(design, entityId, world);
  else if (design.assemblies.some(assembly => assembly.id === entityId)) setAssemblyWorldTransform(design, entityId, world);
  else if (design.moduleInstances.some(instance => instance.id === entityId)) setModuleInstanceWorldTransform(design, entityId, world);
  else throw new Error(`Entidad no encontrada: ${entityId}`);
  touchDesign(design);
}

export class DocumentHistory {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private current: DesignDocument;
  constructor(current: DesignDocument) { this.current = current; }
  get document(): DesignDocument { return this.current; }
  replace(doc: DesignDocument): void { this.current = doc; }
  commit(mutator: (draft: DesignDocument) => void): DesignDocument {
    this.undoStack.push(serializeDesign(this.current));
    this.redoStack = [];
    const next = cloneDesign(this.current);
    mutator(next);
    touchDesign(next);
    this.current = next;
    return next;
  }
  undo(): DesignDocument {
    const prev = this.undoStack.pop();
    if (!prev) return this.current;
    this.redoStack.push(serializeDesign(this.current));
    this.current = deserializeDesign(prev);
    return this.current;
  }
  redo(): DesignDocument {
    const next = this.redoStack.pop();
    if (!next) return this.current;
    this.undoStack.push(serializeDesign(this.current));
    this.current = deserializeDesign(next);
    return this.current;
  }
  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
}

export interface ToolSession {
  tool: ToolId;
  entityId?: Id;
  original?: Transform;
  preview?: Transform;
  referencePoint?: Vec3;
  referenceWorld?: Vec3;
  pivotWorld?: Vec3;
  rotateReferenceWorld?: Vec3;
  axisLock?: Axis;
  inferenceDirection?: Vec3;
  copyMode?: boolean;
  angularSnapDeg?: number;
  phase: ToolPhase;
  state: 'ACTIVE' | 'COMMITTED' | 'CANCELLED';
}

export interface EditorTool {
  readonly id: ToolId;
  activate(): void;
  pointerDown(point: Vec3): void;
  pointerMove(point: Vec3): void;
  pointerUp(point: Vec3): void;
  keyDown(key: string): void;
  preview(): Transform | undefined;
  commit(): void;
  cancel(): void;
  deactivate(): void;
}

export class ToolManager {
  session: ToolSession | null = null;
  activeTool: ToolId = 'SELECT';
  lastCommittedEntityId?: Id;

  activate(tool: ToolId): void { this.switchTool(tool); }
  deactivate(): void { this.cancel(); this.activeTool = 'SELECT'; }

  beginMove(part: Part, referencePoint: Vec3 = { x: 0, y: 0, z: 0 }, axisLock?: Axis, copyMode = false): ToolSession {
    // Compatibilidad para Parts de nivel raíz. El frontend debe usar beginMoveEntity().
    const original = structuredClone(part.transform);
    this.activeTool = 'MOVE';
    this.session = {
      tool: 'MOVE', entityId: part.id, original, preview: structuredClone(original), referencePoint,
      referenceWorld: localToWorld(original, referencePoint), axisLock, copyMode, phase: 'MOVING', state: 'ACTIVE'
    };
    return this.session;
  }

  beginMoveEntity(design: DesignDocument, entityId: Id, referencePoint: Vec3 = { x: 0, y: 0, z: 0 }, axisLock?: Axis, copyMode = false): ToolSession {
    const original = getWorldTransform(design, entityId);
    this.activeTool = 'MOVE';
    this.session = {
      tool: 'MOVE', entityId, original: structuredClone(original), preview: structuredClone(original), referencePoint,
      referenceWorld: localToWorld(original, referencePoint), axisLock, copyMode, phase: 'MOVING', state: 'ACTIVE'
    };
    return this.session;
  }

  beginMovePickReference(design: DesignDocument, entityId: Id, copyMode = false): ToolSession {
    const original = getWorldTransform(design, entityId);
    this.activeTool = 'MOVE';
    this.session = { tool: 'MOVE', entityId, original: structuredClone(original), preview: structuredClone(original), copyMode, phase: 'PICK_REFERENCE', state: 'ACTIVE' };
    return this.session;
  }

  pickMoveReferenceWorld(point: Vec3): ToolSession {
    if (!this.session || this.session.tool !== 'MOVE' || !this.session.original) throw new Error('Move no activo');
    this.session.referenceWorld = structuredClone(point);
    this.session.referencePoint = worldToLocal(this.session.original, point);
    this.session.phase = 'MOVING';
    return this.session;
  }

  setAxisLock(axis?: Axis): void {
    if (!this.session) return;
    this.session.axisLock = axis;
  }

  setInferenceDirection(direction?: Vec3): void {
    if (!this.session) return;
    this.session.inferenceDirection = direction ? normalize(direction) : undefined;
  }

  toggleCopyMode(force?: boolean): boolean {
    if (!this.session || this.session.tool !== 'MOVE') return false;
    this.session.copyMode = force ?? !this.session.copyMode;
    return Boolean(this.session.copyMode);
  }

  setPreview(transform: Transform): Transform {
    if (!this.session) throw new Error('Herramienta no activa');
    this.session.preview = structuredClone(transform);
    return this.session.preview;
  }

  updateMove(destination: Vec3): Transform {
    if (!this.session || this.session.tool !== 'MOVE' || !this.session.original || !this.session.referenceWorld) throw new Error('Move no activo');
    let delta = sub(destination, this.session.referenceWorld);
    if (this.session.axisLock) {
      const axis = this.session.axisLock;
      delta = { x: axis === 'x' ? delta.x : 0, y: axis === 'y' ? delta.y : 0, z: axis === 'z' ? delta.z : 0 };
    } else if (this.session.inferenceDirection) {
      const direction = normalize(this.session.inferenceDirection);
      const amount = dot(delta, direction);
      delta = { x: direction.x * amount, y: direction.y * amount, z: direction.z * amount };
    }
    this.session.preview = { ...structuredClone(this.session.original), position: add(this.session.original.position, delta) };
    this.session.phase = 'MOVING';
    return this.session.preview;
  }

  exactMove(distanceInput: string | number): Transform {
    if (!this.session || this.session.tool !== 'MOVE' || !this.session.original) throw new Error('Move no activo');
    const distanceMm = typeof distanceInput === 'number' ? distanceInput : parseLengthToMm(distanceInput);
    let direction: Vec3;
    if (this.session.axisLock) direction = this.session.axisLock === 'x' ? { x: 1, y: 0, z: 0 } : this.session.axisLock === 'y' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    else if (this.session.inferenceDirection) direction = normalize(this.session.inferenceDirection);
    else if (this.session.preview && length(sub(this.session.preview.position, this.session.original.position)) > 1e-9) direction = normalize(sub(this.session.preview.position, this.session.original.position));
    else direction = { x: 1, y: 0, z: 0 };
    this.session.preview = { ...structuredClone(this.session.original), position: add(this.session.original.position, { x: direction.x * distanceMm, y: direction.y * distanceMm, z: direction.z * distanceMm }) };
    return this.session.preview;
  }

  relativeMove(input: string): Transform {
    if (!this.session || this.session.tool !== 'MOVE' || !this.session.original) throw new Error('Move no activo');
    const delta = parseRelativeCoordinates(input);
    this.session.preview = { ...structuredClone(this.session.original), position: add(this.session.original.position, delta) };
    return this.session.preview;
  }

  beginRotate(part: Part): ToolSession {
    const original = structuredClone(part.transform);
    this.activeTool = 'ROTATE';
    this.session = { tool: 'ROTATE', entityId: part.id, original, preview: structuredClone(original), phase: 'PICK_PIVOT', state: 'ACTIVE', angularSnapDeg: 15 };
    return this.session;
  }

  beginRotateEntity(design: DesignDocument, entityId: Id, angularSnapDeg = 15): ToolSession {
    const original = getWorldTransform(design, entityId);
    this.activeTool = 'ROTATE';
    this.session = { tool: 'ROTATE', entityId, original: structuredClone(original), preview: structuredClone(original), phase: 'PICK_PIVOT', state: 'ACTIVE', angularSnapDeg };
    return this.session;
  }

  pickRotatePivot(point: Vec3): ToolSession {
    if (!this.session || this.session.tool !== 'ROTATE') throw new Error('Rotate no activo');
    this.session.pivotWorld = structuredClone(point);
    this.session.phase = 'PICK_REFERENCE';
    return this.session;
  }

  pickRotateReference(point: Vec3): ToolSession {
    if (!this.session || this.session.tool !== 'ROTATE' || !this.session.pivotWorld) throw new Error('Selecciona primero el pivote');
    this.session.rotateReferenceWorld = structuredClone(point);
    this.session.phase = 'ROTATING';
    return this.session;
  }

  setAngularSnap(degrees: number): void {
    if (![1, 5, 15].includes(degrees) && (!Number.isFinite(degrees) || degrees <= 0)) throw new Error('Snap angular inválido');
    if (this.session?.tool === 'ROTATE') this.session.angularSnapDeg = degrees;
  }

  updateRotate(pointer: Vec3, axis: Axis = 'y', useSnap = true): Transform {
    if (!this.session || this.session.tool !== 'ROTATE' || !this.session.original || !this.session.pivotWorld || !this.session.rotateReferenceWorld) throw new Error('Rotate incompleto');
    const project = (v: Vec3): [number, number] => axis === 'x' ? [v.y, v.z] : axis === 'y' ? [v.x, v.z] : [v.x, v.y];
    const a = sub(this.session.rotateReferenceWorld, this.session.pivotWorld);
    const b = sub(pointer, this.session.pivotWorld);
    const [ax, ay] = project(a), [bx, by] = project(b);
    let angle = Math.atan2(bx * ay - by * ax, ax * bx + ay * by);
    if (useSnap && this.session.angularSnapDeg) {
      const step = this.session.angularSnapDeg * Math.PI / 180;
      angle = Math.round(angle / step) * step;
    }
    this.session.preview = transformRotatedAboutPivot(this.session.original, this.session.pivotWorld, axis, angle);
    this.session.phase = 'ROTATING';
    return this.session.preview;
  }

  exactRotate(degrees: string | number, axis: Axis = 'y'): Transform {
    if (!this.session || this.session.tool !== 'ROTATE' || !this.session.original) throw new Error('Rotate no activo');
    const deg = typeof degrees === 'number' ? degrees : parseAngleDeg(degrees);
    const angle = deg * Math.PI / 180;
    this.session.preview = transformRotatedAboutPivot(this.session.original, this.session.pivotWorld, axis, angle);
    this.session.phase = 'ROTATING';
    return this.session.preview;
  }

  preview(): Transform | undefined { return this.session?.preview ? structuredClone(this.session.preview) : undefined; }

  commit(design: DesignDocument): DesignDocument {
    if (!this.session || !this.session.entityId || !this.session.preview) throw new Error('Herramienta sin preview');
    const out = cloneDesign(design);
    const entityId = this.session.entityId;
    const part = out.parts.find(candidate => candidate.id === entityId);
    const assembly = out.assemblies.find(candidate => candidate.id === entityId);
    const moduleInstance = out.moduleInstances.find(candidate => candidate.id === entityId);
    if (this.session.copyMode) {
      if (!part) throw new Error('Copy mode soporta Part en Sprint 1');
      const copy = structuredClone(part);
      copy.id = createId('part');
      copy.name = `${part.name} copia`;
      out.parts.push(copy);
      const parent = out.assemblies.find(candidate => candidate.children.some(child => child.kind === 'PART' && child.id === part.id)) ?? findAssembly(out, out.rootAssemblyId);
      parent.children.push({ kind: 'PART', id: copy.id });
      setPartWorldTransform(out, copy.id, this.session.preview);
      this.lastCommittedEntityId = copy.id;
    } else if (part) {
      setPartWorldTransform(out, entityId, this.session.preview);
      this.lastCommittedEntityId = entityId;
    } else if (assembly) {
      setAssemblyWorldTransform(out, entityId, this.session.preview);
      this.lastCommittedEntityId = entityId;
    } else if (moduleInstance) {
      setModuleInstanceWorldTransform(out, entityId, this.session.preview);
      this.lastCommittedEntityId = entityId;
    } else throw new Error(`Entidad no encontrada: ${entityId}`);
    this.session.phase = 'COMMITTED';
    this.session.state = 'COMMITTED';
    touchDesign(out);
    return out;
  }

  cancel(): void {
    if (this.session) { this.session.phase = 'CANCELLED'; this.session.state = 'CANCELLED'; }
    this.session = null;
  }

  switchTool(next: ToolId): void {
    this.cancel();
    this.activeTool = next;
    this.session = { tool: next, phase: 'IDLE', state: 'ACTIVE' };
  }
}

export interface PointerInput {
  entityId?: Id;
  point?: Vec3;
  screen?: { x: number; y: number };
  button: number;
  buttons?: number;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
}
export interface KeyboardInput { key: string; shift: boolean; ctrl: boolean; meta: boolean; alt: boolean; repeat?: boolean; }
export interface InputSink {
  pointerDown?(event: PointerInput): void;
  pointerMove?(event: PointerInput): void;
  pointerUp?(event: PointerInput): void;
  wheel?(deltaY: number, event: Omit<PointerInput, 'button'>): void;
  keyDown?(event: KeyboardInput): void;
}

/** One normalized input gateway used by the React shell and viewport. */
export class InputManager {
  private readonly sink: InputSink;
  constructor(sink: InputSink) { this.sink = sink; }
  pointerDown(event: PointerInput): void { this.sink.pointerDown?.(event); }
  pointerMove(event: PointerInput): void { this.sink.pointerMove?.(event); }
  pointerUp(event: PointerInput): void { this.sink.pointerUp?.(event); }
  wheel(deltaY: number, event: Omit<PointerInput, 'button'>): void { this.sink.wheel?.(deltaY, event); }
  keyDown(event: KeyboardInput): void { this.sink.keyDown?.(event); }
}

export type ShortcutAction = 'SELECT' | 'MOVE' | 'ROTATE' | 'MEASURE' | 'GUIDE' | 'PROTRACTOR' | 'WALK' | 'LOOK' | 'PART' | 'SECTION' | 'PRESENTATION' | 'PALETTE' | 'DELETE' | 'UNDO' | 'REDO' | 'FOCUS' | 'PREVIOUS_VIEW' | 'NEXT_VIEW' | 'CANCEL';
export const CAD_SHORTCUTS: Readonly<Record<ShortcutAction, string>> = Object.freeze({
  SELECT: 's', MOVE: 'm', ROTATE: 'r', MEASURE: 't', GUIDE:'g', PROTRACTOR:'shift+t', WALK:'w', LOOK:'shift+w', PART: 'p', SECTION: 'shift+s', PRESENTATION:'mod+shift+p', PALETTE:'mod+k', DELETE: 'delete', UNDO: 'mod+z', REDO: 'mod+shift+z', FOCUS: 'f', PREVIOUS_VIEW:'alt+left', NEXT_VIEW:'alt+right', CANCEL: 'escape'
});

export class ShortcutManager {
  resolve(event: KeyboardInput): ShortcutAction | undefined {
    const key = event.key.toLowerCase();
    const mod = event.ctrl || event.meta;
    if (mod && event.shift && key === 'z') return 'REDO';
    if (mod && event.shift && key === 'p') return 'PRESENTATION';
    if (mod && key === 'k') return 'PALETTE';
    if (mod && key === 'z') return 'UNDO';
    if (!mod && event.shift && key === 's') return 'SECTION';
    if (!mod && event.shift && key === 't') return 'PROTRACTOR';
    if (!mod && event.shift && key === 'w') return 'LOOK';
    if (!mod && event.alt && key === 'arrowleft') return 'PREVIOUS_VIEW';
    if (!mod && event.alt && key === 'arrowright') return 'NEXT_VIEW';
    if (key === 'escape') return 'CANCEL';
    if (key === 'delete' || key === 'backspace') return 'DELETE';
    if (!mod && !event.alt) {
      if (key === 's') return 'SELECT'; if (key === 'm') return 'MOVE'; if (key === 'r') return 'ROTATE';
      if (key === 't') return 'MEASURE'; if (key === 'g') return 'GUIDE'; if (key === 'w') return 'WALK'; if (key === 'p') return 'PART'; if (key === 'f') return 'FOCUS';
    }
    return undefined;
  }
}

export interface ScreenPoint { x: number; y: number; }
export interface ScreenRect { left: number; top: number; right: number; bottom: number; }
export interface SelectionScreenBounds { id: Id; bounds: ScreenRect; selectable?: boolean; }
export type SelectionBoxMode = 'WINDOW' | 'CROSSING';
export function selectionModeFromDrag(start: ScreenPoint, end: ScreenPoint): SelectionBoxMode { return end.x >= start.x ? 'WINDOW' : 'CROSSING'; }
export function normalizeScreenRect(start: ScreenPoint, end: ScreenPoint): ScreenRect { return { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), right: Math.max(start.x, end.x), bottom: Math.max(start.y, end.y) }; }
function containsRect(outer: ScreenRect, inner: ScreenRect): boolean { return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom; }
function intersectsRect(a: ScreenRect, b: ScreenRect): boolean { return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top; }
export function selectByScreenRectangle(candidates: SelectionScreenBounds[], start: ScreenPoint, end: ScreenPoint): Id[] {
  const rect = normalizeScreenRect(start, end);
  const mode = selectionModeFromDrag(start, end);
  return candidates.filter(candidate => candidate.selectable !== false && (mode === 'WINDOW' ? containsRect(rect, candidate.bounds) : intersectsRect(rect, candidate.bounds))).map(candidate => candidate.id);
}

/** Ctrl/Cmd toggles; Shift only adds. */
export function nextSelection(current: Id[], id: Id, modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean }): Id[] {
  const toggle = Boolean(modifiers.ctrl || modifiers.meta);
  if (toggle) return current.includes(id) ? current.filter(value => value !== id) : [...current, id];
  if (modifiers.shift) return current.includes(id) ? current : [...current, id];
  return [id];
}

export function movePartExact(design: DesignDocument, partId: Id, distanceMm: number, axis: Axis): void {
  const world = getPartWorldTransform(design, partId);
  world.position[axis] += distanceMm;
  setPartWorldTransform(design, partId, world);
  touchDesign(design);
}
export function rotatePartExact(design: DesignDocument, partId: Id, degrees: number, axis: Axis = 'y'): void {
  const world = getPartWorldTransform(design, partId);
  world.rotation[axis] += degrees * Math.PI / 180;
  setPartWorldTransform(design, partId, world);
  touchDesign(design);
}
export function resizePartExact(design: DesignDocument, partId: Id, dimensions: { widthMm?: number; heightMm?: number; thicknessMm?: number }): void {
  const part = findPart(design, partId);
  for (const key of ['widthMm', 'heightMm', 'thicknessMm'] as const) {
    const value = dimensions[key];
    if (value !== undefined) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} inválido`);
      part.dimensions[key] = value;
    }
  }
  touchDesign(design);
}
export function duplicateArray(design: DesignDocument, partId: Id, count: number, spacingMm: number, axis: Axis = 'y'): Id[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('count debe ser >=1');
  const source = findPart(design, partId);
  const parent = design.assemblies.find(assembly => assembly.children.some(child => child.kind === 'PART' && child.id === partId)) ?? findAssembly(design, design.rootAssemblyId);
  const sourceWorld = getPartWorldTransform(design, partId);
  const ids: Id[] = [];
  for (let i = 1; i <= count; i += 1) {
    const part = structuredClone(source);
    part.id = createId('part');
    part.name = `${source.name} ${i + 1}`;
    design.parts.push(part);
    parent.children.push({ kind: 'PART', id: part.id });
    const world = structuredClone(sourceWorld);
    world.position[axis] += spacingMm * i;
    setPartWorldTransform(design, part.id, world);
    ids.push(part.id);
  }
  touchDesign(design);
  return ids;
}
export function groupParts(design: DesignDocument, partIds: Id[], name = 'Grupo'): Assembly {
  const selected = new Set(partIds);
  const group = createAssembly(name, partIds.map(id => ({ kind: 'PART' as const, id })));
  for (const assembly of design.assemblies) assembly.children = assembly.children.filter(child => !(child.kind === 'PART' && selected.has(child.id)));
  design.assemblies.push(group);
  findAssembly(design, design.rootAssemblyId).children.push({ kind: 'ASSEMBLY', id: group.id });
  touchDesign(design);
  return group;
}
export function ungroupAssembly(design: DesignDocument, assemblyId: Id): void {
  if (assemblyId === design.rootAssemblyId) throw new Error('No se puede desagrupar root');
  const assembly = findAssembly(design, assemblyId);
  const parent = design.assemblies.find(value => value.children.some(child => child.kind === 'ASSEMBLY' && child.id === assemblyId)) ?? findAssembly(design, design.rootAssemblyId);
  parent.children = parent.children.filter(child => !(child.kind === 'ASSEMBLY' && child.id === assemblyId));
  parent.children.push(...assembly.children);
  design.assemblies = design.assemblies.filter(value => value.id !== assemblyId);
  touchDesign(design);
}
export function alignParts(design: DesignDocument, ids: Id[], axis: Axis, mode: 'MIN' | 'MAX' | 'CENTER'): void {
  const parts = ids.map(id => findPart(design, id));
  if (!parts.length) return;
  const boxes = parts.map(part => partWorldAabb(design, part));
  const values = boxes.map(box => mode === 'MIN' ? box.min[axis] : mode === 'MAX' ? box.max[axis] : (box.min[axis] + box.max[axis]) / 2);
  const target = mode === 'MIN' ? Math.min(...values) : mode === 'MAX' ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
  parts.forEach((part, index) => {
    const world = getPartWorldTransform(design, part.id);
    world.position[axis] += target - values[index]!;
    setPartWorldTransform(design, part.id, world);
  });
  touchDesign(design);
}
export function distributeParts(design: DesignDocument, ids: Id[], axis: Axis): void {
  const entries = ids.map(id => ({ part: findPart(design, id), world: getPartWorldTransform(design, id) })).sort((a, b) => a.world.position[axis] - b.world.position[axis]);
  if (entries.length < 3) return;
  const start = entries[0]!.world.position[axis];
  const end = entries.at(-1)!.world.position[axis];
  const step = (end - start) / (entries.length - 1);
  entries.forEach((entry, index) => { entry.world.position[axis] = start + step * index; setPartWorldTransform(design, entry.part.id, entry.world); });
  touchDesign(design);
}

export interface MeasurementResult { distanceMm: number; delta: Vec3; pointA: Vec3; pointB: Vec3; }
export function measure(a: Vec3, b: Vec3): number { return length(sub(a, b)); }
export function measureDetailed(a: Vec3, b: Vec3): MeasurementResult { return { distanceMm: measure(a, b), delta: sub(b, a), pointA: structuredClone(a), pointB: structuredClone(b) }; }
export function measurePartsWorld(design: DesignDocument, partAId: Id, partBId: Id): MeasurementResult {
  const a = centerOfAabb(partWorldAabb(design, findPart(design, partAId)));
  const b = centerOfAabb(partWorldAabb(design, findPart(design, partBId)));
  return measureDetailed(a, b);
}

export type GuideKind = 'POINT' | 'LINE' | 'PLANE';
export interface GuideBase { id: Id; type: GuideKind; origin: Vec3; label?: string; metadata?: Record<string, unknown>; }
export interface GuidePoint extends GuideBase { type: 'POINT'; }
export interface GuideLine extends GuideBase { type: 'LINE'; direction: Vec3; }
export interface GuidePlane extends GuideBase { type: 'PLANE'; normal: Vec3; }
export type Guide = GuidePoint | GuideLine | GuidePlane;

export function createGuide(origin: Vec3, direction: Vec3, label?: string): GuideLine { return createGuideLine(origin, direction, label); }
export function createGuidePoint(origin: Vec3, label?: string, metadata:Record<string,unknown>={}): GuidePoint { return { id: createId('guide'), type: 'POINT', origin: structuredClone(origin), label, metadata:structuredClone(metadata) }; }
export function createGuideLine(origin: Vec3, direction: Vec3, label?: string, metadata:Record<string,unknown>={}): GuideLine {
  if (length(direction) < 1e-9) throw new Error('GuideLine requiere dirección');
  return { id: createId('guide'), type: 'LINE', origin: structuredClone(origin), direction: normalize(direction), label, metadata:structuredClone(metadata) };
}
export function createGuidePlane(origin: Vec3, normal: Vec3, label?: string, metadata:Record<string,unknown>={}): GuidePlane {
  if (length(normal) < 1e-9) throw new Error('GuidePlane requiere normal');
  return { id: createId('guide'), type: 'PLANE', origin: structuredClone(origin), normal: normalize(normal), label, metadata:structuredClone(metadata) };
}
export function offsetGuidePoint(origin:Vec3, direction:Vec3, distanceInput:number|string, label='Punto guía'):GuidePoint {
  const distanceMm=typeof distanceInput==='number'?distanceInput:parseLengthToMm(distanceInput);
  const dir=normalize(direction);
  return createGuidePoint(add(origin,{x:dir.x*distanceMm,y:dir.y*distanceMm,z:dir.z*distanceMm}),label,{mode:'OFFSET',distanceMm});
}
export function guidePointAtCoordinates(position:Vec3,label='Punto guía'):GuidePoint { return createGuidePoint(position,label,{mode:'COORDINATES'}); }
export function guidePointAtIntersection(a:GuideLine,b:GuideLine,toleranceMm=.5,label='Intersección guía'):GuidePoint {
  const cross=(u:Vec3,v:Vec3):Vec3=>({x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x});
  const n=cross(a.direction,b.direction),den=dot(n,n);
  if(den<1e-12)throw new Error('GuideLines paralelas');
  const delta=sub(b.origin,a.origin);
  const t=dot(cross(delta,b.direction),n)/den;
  const u=dot(cross(delta,a.direction),n)/den;
  const pa=add(a.origin,{x:a.direction.x*t,y:a.direction.y*t,z:a.direction.z*t});
  const pb=add(b.origin,{x:b.direction.x*u,y:b.direction.y*u,z:b.direction.z*u});
  if(dist(pa,pb)>toleranceMm)throw new Error('GuideLines no coplanares dentro de tolerancia');
  return createGuidePoint({x:(pa.x+pb.x)/2,y:(pa.y+pb.y)/2,z:(pa.z+pb.z)/2},label,{mode:'INTERSECTION',guideIds:[a.id,b.id]});
}
export function guideLineFromPoints(a:Vec3,b:Vec3,label='Línea guía'):GuideLine { return createGuideLine(a,sub(b,a),label,{mode:'TWO_POINTS'}); }
export function offsetGuideLine(line:GuideLine, offsetDirection:Vec3, distanceInput:number|string,label=line.label??'Línea guía offset'):GuideLine {
  const distanceMm=typeof distanceInput==='number'?distanceInput:parseLengthToMm(distanceInput);
  const dir=normalize(offsetDirection);
  return createGuideLine(add(line.origin,{x:dir.x*distanceMm,y:dir.y*distanceMm,z:dir.z*distanceMm}),line.direction,label,{...line.metadata,mode:'OFFSET',distanceMm});
}
export function offsetGuidePlane(plane:GuidePlane,distanceInput:number|string,label=plane.label??'Plano guía offset'):GuidePlane {
  const distanceMm=typeof distanceInput==='number'?distanceInput:parseLengthToMm(distanceInput);
  return createGuidePlane(add(plane.origin,{x:plane.normal.x*distanceMm,y:plane.normal.y*distanceMm,z:plane.normal.z*distanceMm}),plane.normal,label,{...plane.metadata,mode:'OFFSET',distanceMm});
}

export interface TapeMeasureResult extends MeasurementResult { formatted:string; }
export function tapeMeasure(a:Vec3,b:Vec3):TapeMeasureResult {
  const result=measureDetailed(a,b);
  return {...result,formatted:`${result.distanceMm.toFixed(2)} mm · ΔX ${result.delta.x.toFixed(2)} · ΔY ${result.delta.y.toFixed(2)} · ΔZ ${result.delta.z.toFixed(2)}`};
}
export function tapeGuideFromDistance(origin:Vec3,toward:Vec3,distanceInput:number|string):GuidePoint {
  const direction=sub(toward,origin);
  if(length(direction)<1e-9)throw new Error('Tape Measure requiere dirección');
  return offsetGuidePoint(origin,direction,distanceInput,'Guía de cinta');
}

export interface ProtractorResult { center:Vec3; referenceDirection:Vec3; measuredDirection:Vec3; angleDeg:number; angleRad:number; normal:Vec3; }
export function protractorAngle(center:Vec3,referencePoint:Vec3,measuredPoint:Vec3,normal:Vec3={x:0,y:1,z:0}):ProtractorResult {
  const ref=normalize(sub(referencePoint,center));
  const measured=normalize(sub(measuredPoint,center));
  if(length(ref)<1e-9||length(measured)<1e-9)throw new Error('Protractor requiere direcciones válidas');
  const n=normalize(normal);
  const cross={x:ref.y*measured.z-ref.z*measured.y,y:ref.z*measured.x-ref.x*measured.z,z:ref.x*measured.y-ref.y*measured.x};
  const signed=Math.atan2(dot(cross,n),Math.max(-1,Math.min(1,dot(ref,measured))));
  return {center:structuredClone(center),referenceDirection:ref,measuredDirection:measured,angleRad:signed,angleDeg:signed*180/Math.PI,normal:n};
}
function rodrigues(vector:Vec3,axis:Vec3,angle:number):Vec3 {
  const n=normalize(axis),c=Math.cos(angle),s=Math.sin(angle),d=dot(n,vector);
  const cross={x:n.y*vector.z-n.z*vector.y,y:n.z*vector.x-n.x*vector.z,z:n.x*vector.y-n.y*vector.x};
  return {x:vector.x*c+cross.x*s+n.x*d*(1-c),y:vector.y*c+cross.y*s+n.y*d*(1-c),z:vector.z*c+cross.z*s+n.z*d*(1-c)};
}
export function createAngularGuide(center:Vec3,referenceDirection:Vec3,angleInput:number|string,normal:Vec3={x:0,y:1,z:0}):GuideLine {
  const degrees=typeof angleInput==='number'?angleInput:parseAngleDeg(angleInput);
  const direction=rodrigues(normalize(referenceDirection),normal,degrees*Math.PI/180);
  return createGuideLine(center,direction,`Guía ${degrees}°`,{mode:'ANGULAR',angleDeg:degrees});
}

type Mat3=[number,number,number,number,number,number,number,number,number];
function matFromEuler(rotation:Euler3):Mat3 {
  const cx=Math.cos(rotation.x),sx=Math.sin(rotation.x),cy=Math.cos(rotation.y),sy=Math.sin(rotation.y),cz=Math.cos(rotation.z),sz=Math.sin(rotation.z);
  return [cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,-sy,cy*sx,cy*cx];
}
function matMul(a:Mat3,b:Mat3):Mat3 { const o=Array(9).fill(0);for(let r=0;r<3;r++)for(let c=0;c<3;c++)o[r*3+c]=a[r*3]! * b[c]! + a[r*3+1]! * b[c+3]! + a[r*3+2]! * b[c+6]!;return o as Mat3; }
function eulerFromMat(m:Mat3):Euler3 { const sy=Math.max(-1,Math.min(1,-m[6])),y=Math.asin(sy),cy=Math.cos(y);return Math.abs(cy)>1e-10?{x:Math.atan2(m[7],m[8]),y,z:Math.atan2(m[3],m[0])}:{x:Math.atan2(-m[5],m[4]),y,z:0}; }
function reflectionMatrix(axis:Axis):Mat3 { return axis==='x'?[-1,0,0,0,1,0,0,0,1]:axis==='y'?[1,0,0,0,-1,0,0,0,1]:[1,0,0,0,1,0,0,0,-1]; }
function mirrorRotation(rotation:Euler3,axis:Axis):Euler3 { const f=reflectionMatrix(axis);return eulerFromMat(matMul(matMul(f,matFromEuler(rotation)),f)); }
function mirrorLocalTransform(transform:Transform,axis:Axis):Transform { const position=structuredClone(transform.position);position[axis]*=-1;return {position,rotation:mirrorRotation(transform.rotation,axis)}; }
function mirrorWorldTransform(transform:Transform,axis:Axis,pivot:number):Transform { const position=structuredClone(transform.position);position[axis]=2*pivot-position[axis];return {position,rotation:mirrorRotation(transform.rotation,axis)}; }
function mirrorVectorLocal(vector:Vec3|undefined,axis:Axis):Vec3|undefined { if(!vector)return undefined;const out=structuredClone(vector);out[axis]*=-1;return out; }
function swapBanding(part:Part,axis:Axis):void {
  if(axis==='x'){const left=structuredClone(part.edgeBanding.LEFT);part.edgeBanding.LEFT=structuredClone(part.edgeBanding.RIGHT);part.edgeBanding.RIGHT=left;}
  if(axis==='y'){const top=structuredClone(part.edgeBanding.TOP);part.edgeBanding.TOP=structuredClone(part.edgeBanding.BOTTOM);part.edgeBanding.BOTTOM=top;}
}
function mirrorPartManufacturing(design:DesignDocument,part:Part,axis:Axis):void {
  swapBanding(part,axis);
  for(const feature of design.machiningFeatures.filter(candidate=>candidate.partId===part.id&&candidate.metadata.coordinateSpace==='PART_LOCAL')){feature.position=mirrorVectorLocal(feature.position,axis)!;feature.orientation=mirrorRotation(feature.orientation,axis);}
  for(const hardware of design.hardwareInstances.filter(candidate=>candidate.metadata.coordinateSpace==='PART_LOCAL'&&candidate.metadata.referencePartId===part.id)){hardware.position=mirrorVectorLocal(hardware.position,axis)!;hardware.orientation=mirrorRotation(hardware.orientation,axis);}
  for(const joint of design.joints){
    if(joint.metadata.anchorSpace!=='PART_LOCAL')continue;
    if(joint.partAId===part.id){joint.anchorA.position=mirrorVectorLocal(joint.anchorA.position,axis)!;joint.anchorA.normal=mirrorVectorLocal(joint.anchorA.normal,axis);joint.anchorA.axis=mirrorVectorLocal(joint.anchorA.axis,axis);}
    if(joint.partBId===part.id){joint.anchorB.position=mirrorVectorLocal(joint.anchorB.position,axis)!;joint.anchorB.normal=mirrorVectorLocal(joint.anchorB.normal,axis);joint.anchorB.axis=mirrorVectorLocal(joint.anchorB.axis,axis);}
  }
  part.metadata={...part.metadata,flipParity:{...(typeof part.metadata.flipParity==='object'&&part.metadata.flipParity?part.metadata.flipParity as Record<string,unknown>:{}),[axis]:!(part.metadata.flipParity as Record<string,unknown>|undefined)?.[axis]}};
}
function mirrorAssemblyChildrenLocal(design:DesignDocument,assemblyId:Id,axis:Axis):void {
  const assembly=findAssembly(design,assemblyId);
  for(const child of assembly.children){
    if(child.kind==='PART'){const part=findPart(design,child.id);part.transform=mirrorLocalTransform(part.transform,axis);mirrorPartManufacturing(design,part,axis);}
    else {const childAssembly=findAssembly(design,child.id);childAssembly.transform=mirrorLocalTransform(childAssembly.transform,axis);mirrorAssemblyChildrenLocal(design,child.id,axis);}
  }
}
/** Rigid-domain flip: no negative scale is persisted; dimensions remain positive. */
export function flipEntity(design:DesignDocument,entityId:Id,axis:Axis,pivot=0):void {
  const world=getWorldTransform(design,entityId);
  const reflected=mirrorWorldTransform(world,axis,pivot);
  const part=design.parts.find(candidate=>candidate.id===entityId);
  if(part){setPartWorldTransform(design,part.id,reflected);mirrorPartManufacturing(design,part,axis);touchDesign(design);return;}
  const assembly=design.assemblies.find(candidate=>candidate.id===entityId);
  if(assembly){setAssemblyWorldTransform(design,assembly.id,reflected);mirrorAssemblyChildrenLocal(design,assembly.id,axis);touchDesign(design);return;}
  const instance=design.moduleInstances.find(candidate=>candidate.id===entityId);
  if(instance){setModuleInstanceWorldTransform(design,instance.id,reflected);const root=findAssembly(design,instance.rootAssemblyId);root.transform=mirrorLocalTransform(root.transform,axis);mirrorAssemblyChildrenLocal(design,root.id,axis);touchDesign(design);return;}
  throw new Error('Entidad no compatible con Flip');
}

/** Changes an Assembly origin/axes and rebases direct children so every descendant keeps its world transform. */
export function rebaseAssemblyOrigin(design:DesignDocument,assemblyId:Id,newWorld:Transform):void {
  if(assemblyId===design.rootAssemblyId)throw new Error('No se redefine el origen raíz del diseño');
  const assembly=findAssembly(design,assemblyId);
  const children=assembly.children.map(child=>({child,world:getWorldTransform(design,child.id)}));
  setAssemblyWorldTransform(design,assemblyId,newWorld);
  for(const entry of children){
    if(entry.child.kind==='PART')setPartWorldTransform(design,entry.child.id,entry.world);
    else setAssemblyWorldTransform(design,entry.child.id,entry.world);
  }
  touchDesign(design);
}
export function axesTransformFromPoints(origin:Vec3,xPoint:Vec3,yPoint?:Vec3):Transform {
  const x=normalize(sub(xPoint,origin));if(length(x)<1e-9)throw new Error('Eje X inválido');
  const hint=yPoint?normalize(sub(yPoint,origin)):{x:0,y:1,z:0};
  let z=normalize({x:x.y*hint.z-x.z*hint.y,y:x.z*hint.x-x.x*hint.z,z:x.x*hint.y-x.y*hint.x});
  if(length(z)<1e-9)z=normalize({x:x.y,y:-x.x,z:0});
  const y={x:z.y*x.z-z.z*x.y,y:z.z*x.x-z.x*x.z,z:z.x*x.y-z.y*x.x};
  const matrix:[number,number,number,number,number,number,number,number,number]=[x.x,y.x,z.x,x.y,y.y,z.y,x.z,y.z,z.z];
  return {position:structuredClone(origin),rotation:eulerFromMat(matrix)};
}

export type LinearArrayMode='COUNT'|'SPACING'|'FILL';
export interface LinearArrayOptions { mode:LinearArrayMode; axis:Axis; count?:number; spacingMm?:number; fillMm?:number; }
export function linearArrayOffsets(options:LinearArrayOptions):number[]{
  const spacing=Number(options.spacingMm??0),fill=Number(options.fillMm??0),count=Math.floor(Number(options.count??0));
  if(options.mode==='COUNT'){if(count<1||!Number.isFinite(spacing))throw new Error('COUNT requiere count>=1 y spacing');return Array.from({length:count},(_,i)=>spacing*(i+1));}
  if(options.mode==='SPACING'){if(spacing<=0||fill<=0)throw new Error('SPACING requiere spacing y fill positivos');const copies=Math.floor(fill/spacing);return Array.from({length:copies},(_,i)=>spacing*(i+1));}
  if(count<2||fill<=0)throw new Error('FILL requiere count total>=2 y fill positivo');const step=fill/(count-1);return Array.from({length:count-1},(_,i)=>step*(i+1));
}
export function linearArrayPreviewTransforms(design:DesignDocument,partId:Id,options:LinearArrayOptions):Transform[]{
  const sourceWorld=getPartWorldTransform(design,partId);
  return linearArrayOffsets(options).map(offset=>{const world=structuredClone(sourceWorld);world.position[options.axis]+=offset;return world;});
}
export function linearArray(design:DesignDocument,partId:Id,options:LinearArrayOptions):Id[]{
  const offsets=linearArrayOffsets(options);const source=findPart(design,partId),parent=design.assemblies.find(a=>a.children.some(c=>c.kind==='PART'&&c.id===partId))??findAssembly(design,design.rootAssemblyId),sourceWorld=getPartWorldTransform(design,partId),ids:Id[]=[];
  offsets.forEach((offset,index)=>{const part=structuredClone(source);part.id=createId('part');part.name=`${source.name} ${index+2}`;part.machiningFeatureIds=[];part.metadata={...part.metadata,arraySourceId:source.id};design.parts.push(part);parent.children.push({kind:'PART',id:part.id});const world=structuredClone(sourceWorld);world.position[options.axis]+=offset;setPartWorldTransform(design,part.id,world);ids.push(part.id);});
  touchDesign(design);return ids;
}
export interface RadialArrayOptions { pivot:Vec3; axis:Axis; angleDeg:number; count:number; }
export function radialArrayPreviewTransforms(design:DesignDocument,partId:Id,options:RadialArrayOptions):Transform[]{
  if(!Number.isInteger(options.count)||options.count<2)throw new Error('Radial array requiere count>=2');
  const sourceWorld=getPartWorldTransform(design,partId),step=options.angleDeg*Math.PI/180/(options.count-1);
  return Array.from({length:options.count-1},(_,index)=>transformRotatedAboutPivot(sourceWorld,options.pivot,options.axis,step*(index+1)));
}
export function radialArray(design:DesignDocument,partId:Id,options:RadialArrayOptions):Id[]{
  if(!Number.isInteger(options.count)||options.count<2)throw new Error('Radial array requiere count>=2');
  const source=findPart(design,partId),parent=design.assemblies.find(a=>a.children.some(c=>c.kind==='PART'&&c.id===partId))??findAssembly(design,design.rootAssemblyId),sourceWorld=getPartWorldTransform(design,partId),ids:Id[]=[];
  const step=options.angleDeg*Math.PI/180/(options.count-1);
  for(let i=1;i<options.count;i++){const part=structuredClone(source);part.id=createId('part');part.name=`${source.name} radial ${i+1}`;part.machiningFeatureIds=[];design.parts.push(part);parent.children.push({kind:'PART',id:part.id});setPartWorldTransform(design,part.id,transformRotatedAboutPivot(sourceWorld,options.pivot,options.axis,step*i));ids.push(part.id);}
  touchDesign(design);return ids;
}

export function alignPartsPreview(design:DesignDocument,ids:Id[],axis:Axis,mode:'MIN'|'MAX'|'CENTER'):Array<{entityId:Id;transform:Transform}>{
  const entries=ids.map(id=>{const part=findPart(design,id),box=partWorldAabb(design,part);return{part,box,world:getPartWorldTransform(design,id)};});
  if(entries.length<2)return[];
  const value=(box:ReturnType<typeof partWorldAabb>)=>mode==='MIN'?box.min[axis]:mode==='MAX'?box.max[axis]:(box.min[axis]+box.max[axis])/2;
  const values=entries.map(entry=>value(entry.box));
  const target=mode==='MIN'?Math.min(...values):mode==='MAX'?Math.max(...values):values.reduce((sum,current)=>sum+current,0)/values.length;
  return entries.map((entry,index)=>{const transform=structuredClone(entry.world);transform.position[axis]+=target-values[index]!;return{entityId:entry.part.id,transform};});
}

export function distributePartsAdvanced(design:DesignDocument,ids:Id[],axis:Axis,mode:'CENTERS'|'GAPS'='CENTERS'):void {
  const entries=ids.map(id=>({part:findPart(design,id),box:partWorldAabb(design,findPart(design,id)),world:getPartWorldTransform(design,id)})).sort((a,b)=>((a.box.min[axis]+a.box.max[axis])/2)-((b.box.min[axis]+b.box.max[axis])/2));
  if(entries.length<3)return;
  if(mode==='CENTERS'){const start=(entries[0]!.box.min[axis]+entries[0]!.box.max[axis])/2,end=(entries.at(-1)!.box.min[axis]+entries.at(-1)!.box.max[axis])/2,step=(end-start)/(entries.length-1);entries.forEach((entry,index)=>{const center=(entry.box.min[axis]+entry.box.max[axis])/2;entry.world.position[axis]+=start+step*index-center;setPartWorldTransform(design,entry.part.id,entry.world);});}
  else {const outerMin=entries[0]!.box.min[axis],outerMax=entries.at(-1)!.box.max[axis],totalSize=entries.reduce((sum,e)=>sum+(e.box.max[axis]-e.box.min[axis]),0),gap=(outerMax-outerMin-totalSize)/(entries.length-1);let cursor=outerMin;entries.forEach((entry,index)=>{const size=entry.box.max[axis]-entry.box.min[axis];const delta=cursor-entry.box.min[axis];entry.world.position[axis]+=delta;setPartWorldTransform(design,entry.part.id,entry.world);cursor+=size+(index<entries.length-1?gap:0);});}
  touchDesign(design);
}

export type SelectionFilterKind='PARTS'|'ASSEMBLIES'|'MODULES'|'APPLIANCES'|'COUNTERTOPS'|'CUTOUTS'|'SERVICES'|'CLEARANCES'|'FUNCTIONAL_ZONES'|'HARDWARE'|'GUIDES'|'SECTIONS'|'ROOM';
export type SelectionFilters=Record<SelectionFilterKind,boolean>;
export const DEFAULT_SELECTION_FILTERS:SelectionFilters=Object.freeze({PARTS:true,ASSEMBLIES:true,MODULES:true,APPLIANCES:true,COUNTERTOPS:true,CUTOUTS:true,SERVICES:true,CLEARANCES:true,FUNCTIONAL_ZONES:true,HARDWARE:true,GUIDES:true,SECTIONS:true,ROOM:true});

/** Resolves the workspace picking category without coupling pointer code to entity collections. */
export function pickEntityKind(design:DesignDocument,id:Id,workspaceGuideIds:Iterable<Id>=[]):SelectionFilterKind|undefined {
  if(id===design.room.id)return 'ROOM';
  if(design.parts.some(v=>v.id===id))return 'PARTS';
  if(design.assemblies.some(v=>v.id===id))return 'ASSEMBLIES';
  if(design.moduleInstances.some(v=>v.id===id))return 'MODULES';
  if(design.applianceInstances.some(v=>v.id===id))return 'APPLIANCES';
  if(design.countertops.some(v=>v.id===id))return 'COUNTERTOPS';
  if(design.cutouts.some(v=>v.id===id))return 'CUTOUTS';
  if(design.servicePoints.some(v=>v.id===id))return 'SERVICES';
  if(design.clearanceZones.some(v=>v.id===id))return 'CLEARANCES';
  if(design.functionalZones.some(v=>v.id===id))return 'FUNCTIONAL_ZONES';
  if(design.hardwareInstances.some(v=>v.id===id))return 'HARDWARE';
  if(design.sectionPlanes.some(v=>v.id===id))return 'SECTIONS';
  for(const guideId of workspaceGuideIds)if(guideId===id)return 'GUIDES';
  return undefined;
}

export function canPickEntity(design:DesignDocument,id:Id,filters:SelectionFilters,workspaceGuideIds:Iterable<Id>=[]):boolean {
  const kind=pickEntityKind(design,id,workspaceGuideIds);
  return kind ? filters[kind] : false;
}

export function entitySelectableByFilters(design:DesignDocument,id:Id,filters:SelectionFilters):boolean {
  return canPickEntity(design,id,filters);
}
export function restrictSelectionToContext(design:DesignDocument,ids:Id[],contextId?:Id):Id[]{ if(!contextId)return ids;const allowed=new Set(resolveIsolationPartIds(design,[contextId]));const assemblyIds=new Set<Id>();const visit=(id:Id)=>{const a=design.assemblies.find(v=>v.id===id);if(!a)return;assemblyIds.add(id);for(const c of a.children)if(c.kind==='ASSEMBLY')visit(c.id);};const instance=design.moduleInstances.find(v=>v.id===contextId);visit(instance?.rootAssemblyId??contextId);return ids.filter(id=>allowed.has(id)||assemblyIds.has(id)||id===contextId); }
export function hideWorkspaceIds(current:Iterable<Id>,ids:Iterable<Id>):Id[]{const next=new Set(current);for(const id of ids)next.add(id);return [...next];}
export function unhideWorkspaceIds(current:Iterable<Id>,ids:Iterable<Id>):Id[]{const remove=new Set(ids);return [...current].filter(id=>!remove.has(id));}
export function selectSameMaterial(design:DesignDocument,partId:Id):Id[]{const part=findPart(design,partId);return design.parts.filter(v=>v.materialId===part.materialId).map(v=>v.id);}
export function selectSameSemanticRole(design:DesignDocument,partId:Id):Id[]{const part=findPart(design,partId);return design.parts.filter(v=>v.semanticRole===part.semanticRole).map(v=>v.id);}
export function selectSameModuleDefinition(design:DesignDocument,instanceId:Id):Id[]{const instance=design.moduleInstances.find(v=>v.id===instanceId);if(!instance)return[];return design.moduleInstances.filter(v=>v.definitionId===instance.definitionId).map(v=>v.id);}

export interface CommandDefinition<TContext=unknown>{id:string;label:string;keywords?:string[];aliases?:string[];shortcut?:string;canExecute?:(context:TContext)=>boolean;execute:(context:TContext)=>void|Promise<void>;}
export class CommandRegistry<TContext=unknown>{
  private commands=new Map<string,CommandDefinition<TContext>>();
  register(command:CommandDefinition<TContext>):this{if(this.commands.has(command.id))throw new Error(`Command duplicado: ${command.id}`);this.commands.set(command.id,command);return this;}
  get(id:string):CommandDefinition<TContext>|undefined{return this.commands.get(id);}
  list():CommandDefinition<TContext>[] {return [...this.commands.values()];}
  canExecute(id:string,context:TContext):boolean{const command=this.commands.get(id);return Boolean(command)&&(!command!.canExecute||command!.canExecute(context));}
  execute(id:string,context:TContext):void|Promise<void>{const command=this.commands.get(id);if(!command)throw new Error(`Command inexistente: ${id}`);if(command.canExecute&&!command.canExecute(context))throw new Error(`Command deshabilitado: ${id}`);return command.execute(context);}
  search(query:string,context:TContext):CommandDefinition<TContext>[] {const q=query.trim().toLocaleLowerCase('es');return this.list().filter(c=>{const hay=[c.label,...(c.aliases??[]),...(c.keywords??[])].join(' ').toLocaleLowerCase('es');return !q||hay.includes(q);}).sort((a,b)=>Number(this.canExecute(b.id,context))-Number(this.canExecute(a.id,context))||a.label.localeCompare(b.label,'es'));}
}
export function detectShortcutConflicts(bindings:Record<string,string>):Array<{shortcut:string;commandIds:string[]}>{const map=new Map<string,string[]>();for(const [id,shortcut] of Object.entries(bindings)){const key=shortcut.trim().toLowerCase().replace(/cmd|ctrl|meta/g,'mod').replace(/\s+/g,'');if(!key)continue;map.set(key,[...(map.get(key)??[]),id]);}return [...map].filter(([,ids])=>ids.length>1).map(([shortcut,commandIds])=>({shortcut,commandIds}));}

export class CameraHistory {
  private entries:CameraState[]=[];private index=-1;private readonly capacity:number;
  constructor(capacity=20){this.capacity=capacity;}
  push(camera:CameraState):void{const current=this.entries[this.index];if(current&&JSON.stringify(current)===JSON.stringify(camera))return;this.entries=this.entries.slice(0,this.index+1);this.entries.push(structuredClone(camera));if(this.entries.length>this.capacity)this.entries.shift();this.index=this.entries.length-1;}
  previous():CameraState|undefined{if(this.index<=0)return undefined;this.index-=1;return structuredClone(this.entries[this.index]!);}
  next():CameraState|undefined{if(this.index<0||this.index>=this.entries.length-1)return undefined;this.index+=1;return structuredClone(this.entries[this.index]!);}
  get size():number{return this.entries.length;}
}
export function alignViewToFace(camera:CameraState,facePoint:Vec3,faceNormal:Vec3,distance?:number,orthographic=false):CameraState {const n=normalize(faceNormal);if(length(n)<1e-9)throw new Error('Normal de cara inválida');const d=distance??Math.max(length(sub(camera.position,camera.target)),800);return {...structuredClone(camera),projection:orthographic?'ORTHOGRAPHIC':camera.projection,target:structuredClone(facePoint),position:add(facePoint,{x:n.x*d,y:n.y*d,z:n.z*d}),up:Math.abs(n.y)>.95?{x:0,y:0,z:-1}:{x:0,y:1,z:0}};}
export function zoomWindowCamera(camera:CameraState,screenFraction:number,centerOffset:{x:number;y:number}={x:0,y:0}):CameraState {const f=Math.max(.05,Math.min(1,screenFraction));const next=structuredClone(camera);next.orthoScale*=f;if(next.projection==='PERSPECTIVE'){const dir=normalize(sub(next.position,next.target));const distance=length(sub(next.position,next.target))*f;next.position=add(next.target,{x:dir.x*distance,y:dir.y*distance,z:dir.z*distance});}const right=normalize({x:next.position.z-next.target.z,y:0,z:-(next.position.x-next.target.x)});const up=normalize(next.up);const scale=next.orthoScale;next.target=add(next.target,{x:(right.x*centerOffset.x+up.x*centerOffset.y)*scale,y:(right.y*centerOffset.x+up.y*centerOffset.y)*scale,z:(right.z*centerOffset.x+up.z*centerOffset.y)*scale});return next;}

export interface WalkSettings {eyeHeightMm:number;walkSpeed:number;collision:boolean;radiusMm?:number;}
export interface WalkInput {forward:number;strafe:number;}
function pointInsideExpandedAabb(point:Vec3,box:Aabb,radius:number):boolean{return point.x>=box.min.x-radius&&point.x<=box.max.x+radius&&point.y>=box.min.y-radius&&point.y<=box.max.y+radius&&point.z>=box.min.z-radius&&point.z<=box.max.z+radius;}
export function walkCamera(camera:CameraState,input:WalkInput,deltaSeconds:number,settings:WalkSettings,collisionBoxes:Aabb[]=[]):CameraState {
  const forward3=normalize(sub(camera.target,camera.position));let forward=normalize({x:forward3.x,y:0,z:forward3.z});if(length(forward)<1e-9)forward={x:0,y:0,z:-1};const right={x:forward.z,y:0,z:-forward.x};const amount=settings.walkSpeed*Math.max(0,deltaSeconds);const delta={x:(forward.x*input.forward+right.x*input.strafe)*amount,y:0,z:(forward.z*input.forward+right.z*input.strafe)*amount};const nextPos=add(camera.position,delta);nextPos.y=settings.eyeHeightMm;if(settings.collision&&collisionBoxes.some(box=>pointInsideExpandedAabb(nextPos,box,settings.radiusMm??180)))return {...structuredClone(camera),position:{...camera.position,y:settings.eyeHeightMm},target:{...camera.target,y:settings.eyeHeightMm+forward3.y*1000}};const look=sub(camera.target,camera.position);return {...structuredClone(camera),position:nextPos,target:add(nextPos,look)};
}
export function lookAroundCamera(camera:CameraState,yawDelta:number,pitchDelta:number):CameraState {const direction=normalize(sub(camera.target,camera.position));let yaw=Math.atan2(direction.x,-direction.z)+yawDelta;let pitch=Math.asin(Math.max(-1,Math.min(1,direction.y)))+pitchDelta;pitch=Math.max(-Math.PI*.49,Math.min(Math.PI*.49,pitch));const dir={x:Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};const distance=Math.max(length(sub(camera.target,camera.position)),1000);return {...structuredClone(camera),target:add(camera.position,{x:dir.x*distance,y:dir.y*distance,z:dir.z*distance})};}

export interface CameraSystemState { current: CameraState; previous?: CameraState; }
export function cameraPreset(name: 'FRONT' | 'BACK' | 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'ISOMETRIC', roomCenter: Vec3 = { x: 0, y: 1200, z: 0 }, distance = 5000): CameraState {
  const positions: Record<string, Vec3> = { FRONT: { x: 0, y: roomCenter.y, z: distance }, BACK: { x: 0, y: roomCenter.y, z: -distance }, TOP: { x: 0, y: distance, z: 0 }, BOTTOM: { x: 0, y: -distance, z: 0 }, LEFT: { x: -distance, y: roomCenter.y, z: 0 }, RIGHT: { x: distance, y: roomCenter.y, z: 0 }, ISOMETRIC: { x: distance * .72, y: distance * .62, z: distance * .78 } };
  return { projection: name === 'ISOMETRIC' ? 'PERSPECTIVE' : 'ORTHOGRAPHIC', position: positions[name]!, target: roomCenter, up: name === 'TOP' ? { x: 0, y: 0, z: -1 } : name === 'BOTTOM' ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }, fov: name === 'ISOMETRIC' ? 38 : 42, orthoScale: distance * 1.08 };
}
export function synchronizeCameraState(current: CameraState, view: { position: Vec3; target: Vec3; up?: Vec3; fov?: number; orthoScale?: number }): CameraState {
  return { ...structuredClone(current), position: structuredClone(view.position), target: structuredClone(view.target), up: structuredClone(view.up ?? current.up), fov: view.fov ?? current.fov, orthoScale: view.orthoScale ?? current.orthoScale };
}
export function focusCamera(camera: CameraState, aabb: Aabb): CameraState {
  const center = centerOfAabb(aabb);
  const size = Math.max(aabb.max.x - aabb.min.x, aabb.max.y - aabb.min.y, aabb.max.z - aabb.min.z, 100);
  const direction = normalize(sub(camera.position, camera.target));
  const safeDistance = size * (camera.projection === 'PERSPECTIVE' ? 2.65 : 2.25);
  return { ...structuredClone(camera), target: center, position: add(center, { x: direction.x * safeDistance, y: direction.y * safeDistance, z: direction.z * safeDistance }), orthoScale: size * 1.72 };
}
export function fitAllCamera(camera: CameraState, design: DesignDocument, parts: Part[] = design.parts.filter(part => !part.hidden)): CameraState {
  if (!parts.length) return camera;
  const boxes = parts.map(part => partWorldAabb(design, part));
  const all = { min: { x: Math.min(...boxes.map(box => box.min.x)), y: Math.min(...boxes.map(box => box.min.y)), z: Math.min(...boxes.map(box => box.min.z)) }, max: { x: Math.max(...boxes.map(box => box.max.x)), y: Math.max(...boxes.map(box => box.max.y)), z: Math.max(...boxes.map(box => box.max.z)) } };
  return focusCamera(camera, all);
}

export const DEFAULT_VISIBILITY_TAGS: VisibilityTagState = Object.freeze({
  ROOM:true, PARTS:true, MODULES:true, APPLIANCES:true, COUNTERTOPS:true, HARDWARE:true, MACHINING:true, CLEARANCES:false, SERVICES:true, FUNCTIONAL_ZONES:false, GUIDES:true, SECTIONS:true, DIMENSIONS:true
});

export interface SectionClippingDescriptor {
  id: Id;
  enabled: boolean;
  normal: Vec3;
  point: Vec3;
  /** Three.js Plane equation constant: normal.dot(point) + constant = 0. */
  planeConstant: number;
  inverted: boolean;
  scope: SectionScope;
}

function sectionPoint(section: SectionPlane): Vec3 {
  if (section.position) return structuredClone(section.position);
  const n = normalize(section.normal);
  return {x:n.x*section.constantMm,y:n.y*section.constantMm,z:n.z*section.constantMm};
}

export function sectionClippingDescriptor(section: SectionPlane): SectionClippingDescriptor {
  const base = normalize(section.normal);
  const effective = section.inverted ? {x:-base.x,y:-base.y,z:-base.z} : base;
  const point = sectionPoint(section);
  return {
    id:section.id, enabled:section.enabled, normal:effective, point,
    planeConstant:-(effective.x*point.x + effective.y*point.y + effective.z*point.z),
    inverted:Boolean(section.inverted), scope:section.scope ?? 'ALL'
  };
}

export function createSectionPlane(name = 'Sección', normal: Vec3 = { x: 1, y: 0, z: 0 }, constantMm = 0, scope:SectionScope='ALL'): SectionPlane {
  const n = normalize(normal);
  return { id: createId('section'), name, position:{x:n.x*constantMm,y:n.y*constantMm,z:n.z*constantMm}, enabled: true, normal:n, inverted:false, scope, constantMm };
}

export function setSectionPosition(section:SectionPlane, position:Vec3): void {
  section.position = structuredClone(position);
  const n = normalize(section.normal);
  section.constantMm = n.x*position.x+n.y*position.y+n.z*position.z;
}

export function setSectionOrientation(section:SectionPlane, normal:Vec3): void {
  if (!Number.isFinite(normal.x)||!Number.isFinite(normal.y)||!Number.isFinite(normal.z)||length(normal)<1e-9) throw new Error('Normal de sección inválida');
  const n = normalize(normal);
  section.normal = n;
  section.constantMm = n.x*section.position.x+n.y*section.position.y+n.z*section.position.z;
}

export function sectionPresetNormal(preset:'X'|'Y'|'Z'):Vec3 {
  return preset === 'X' ? {x:1,y:0,z:0} : preset === 'Y' ? {x:0,y:1,z:0} : {x:0,y:0,z:1};
}

export function invertSection(section:SectionPlane): void { section.inverted = !section.inverted; }

export function rotateSection(section:SectionPlane, axis:Axis, degrees:number):void {
  if (!Number.isFinite(degrees)) throw new Error('Ángulo de sección inválido');
  const angle=degrees*Math.PI/180;
  const rotation:Euler3={x:axis==='x'?angle:0,y:axis==='y'?angle:0,z:axis==='z'?angle:0};
  setSectionOrientation(section, rotateVector(section.normal, rotation));
}

export function lookAtSectionCamera(camera:CameraState, section:SectionPlane, distance?:number):CameraState {
  const descriptor=sectionClippingDescriptor(section);
  const target=descriptor.point;
  const currentDistance=Math.max(length(sub(camera.position,camera.target)), 500);
  const d=distance ?? currentDistance;
  const n=descriptor.normal;
  const vertical=Math.abs(n.y)>.92;
  return {
    ...structuredClone(camera), target:structuredClone(target),
    position:{x:target.x+n.x*d,y:target.y+n.y*d,z:target.z+n.z*d},
    up:vertical ? {x:0,y:0,z:n.y>0?-1:1} : {x:0,y:1,z:0}
  };
}

export function fitRoomCamera(camera:CameraState, design:DesignDocument):CameraState {
  return focusCamera(camera, roomAabb(design.room));
}


/** Resolves temporary workspace isolation without writing Part.hidden or any manufacturing field. */
export function resolveIsolationPartIds(design:DesignDocument, entityIds:Id[]):Set<Id> {
  const result=new Set<Id>();
  const visit=(entityId:Id):void=>{
    if(design.parts.some(part=>part.id===entityId)){result.add(entityId);return;}
    const instance=design.moduleInstances.find(candidate=>candidate.id===entityId);
    const assemblyId=instance?.rootAssemblyId??(design.assemblies.some(assembly=>assembly.id===entityId)?entityId:undefined);
    if(!assemblyId)return;
    const assembly=design.assemblies.find(candidate=>candidate.id===assemblyId);if(!assembly)return;
    for(const child of assembly.children)visit(child.id);
  };
  for(const id of entityIds)visit(id);
  return result;
}

export function defaultScenePresentation(design:DesignDocument):ScenePresentationSnapshot {
  const activeSection=design.sectionPlanes.find(section=>section.enabled);
  return {
    quality:'BALANCED', wallsMode:'TRANSPARENT', gridVisible:true,
    visibility:{...DEFAULT_VISIBILITY_TAGS}, activeSectionId:activeSection?.id,
    sectionVisibility:true, guidesVisibility:true, technicalOverlays:true
  };
}

export function createScene(name: string, camera: CameraState, displayMode: DisplayMode, design: DesignDocument, presentation:ScenePresentationSnapshot=defaultScenePresentation(design)): SceneDefinition {
  return {
    id: createId('scene'), name, camera: structuredClone(camera), visibleEntityIds: null,
    hiddenEntityIds: [
      ...design.parts.filter(part=>part.hidden).map(part=>part.id),
      ...design.applianceInstances.filter(entity=>entity.hidden).map(entity=>entity.id),
      ...design.countertops.filter(entity=>entity.hidden).map(entity=>entity.id),
      ...design.servicePoints.filter(entity=>entity.hidden).map(entity=>entity.id),
      ...design.clearanceZones.filter(entity=>entity.hidden).map(entity=>entity.id),
      ...design.functionalZones.filter(entity=>entity.hidden).map(entity=>entity.id)
    ], displayMode,
    sectionPlaneIds: design.sectionPlanes.filter(section => section.enabled).map(section => section.id),
    presentation:structuredClone(presentation), order: design.scenes.length, metadata: {}
  };
}

export function captureScene(design: DesignDocument, sceneId: Id, camera: CameraState, displayMode: DisplayMode, presentation?:ScenePresentationSnapshot): void {
  const scene = design.scenes.find(candidate => candidate.id === sceneId);
  if (!scene) throw new Error('Scene inexistente');
  scene.camera = structuredClone(camera);
  scene.hiddenEntityIds = [
    ...design.parts.filter(part=>part.hidden).map(part=>part.id),
    ...design.applianceInstances.filter(entity=>entity.hidden).map(entity=>entity.id),
    ...design.countertops.filter(entity=>entity.hidden).map(entity=>entity.id),
    ...design.servicePoints.filter(entity=>entity.hidden).map(entity=>entity.id),
    ...design.clearanceZones.filter(entity=>entity.hidden).map(entity=>entity.id),
    ...design.functionalZones.filter(entity=>entity.hidden).map(entity=>entity.id)
  ];
  scene.displayMode = displayMode;
  scene.sectionPlaneIds = design.sectionPlanes.filter(section => section.enabled).map(section => section.id);
  if (presentation) scene.presentation=structuredClone(presentation);
  touchDesign(design);
}

/** Returns a Scene presentation snapshot without mutating geometry or persistent visibility. */
export function restoreScenePresentation(scene:SceneDefinition): {camera:CameraState;displayMode:DisplayMode;presentation:ScenePresentationSnapshot} {
  return {camera:structuredClone(scene.camera),displayMode:scene.displayMode,presentation:structuredClone(scene.presentation)};
}

/**
 * Helper legacy de schema v1 conservado por compatibilidad con pruebas y documentos.
 * El workspace web usa restoreScenePresentation() para no modificar Part.hidden al activar una Scene.
 */
export function activateScene(design: DesignDocument, sceneId: Id): { camera: CameraState; displayMode: DisplayMode } {
  const scene = design.scenes.find(candidate => candidate.id === sceneId);
  if (!scene) throw new Error('Scene inexistente');
  const hidden = new Set(scene.hiddenEntityIds);
  for (const part of design.parts) part.hidden = hidden.has(part.id);
  for (const entity of design.applianceInstances) entity.hidden=hidden.has(entity.id);
  for (const entity of design.countertops) entity.hidden=hidden.has(entity.id);
  for (const entity of design.servicePoints) entity.hidden=hidden.has(entity.id);
  for (const entity of design.clearanceZones) entity.hidden=hidden.has(entity.id);
  for (const entity of design.functionalZones) entity.hidden=hidden.has(entity.id);
  const active = new Set(scene.sectionPlaneIds);
  for (const section of design.sectionPlanes) section.enabled = active.has(section.id);
  design.activeSceneId = sceneId;
  return { camera: structuredClone(scene.camera), displayMode: scene.displayMode };
}

export function renameScene(design: DesignDocument, id: Id, name: string): void { const scene = design.scenes.find(candidate => candidate.id === id); if (!scene) throw new Error('Scene inexistente'); scene.name = name; touchDesign(design); }
export function duplicateScene(design: DesignDocument, id: Id): SceneDefinition { const scene = design.scenes.find(candidate => candidate.id === id); if (!scene) throw new Error('Scene inexistente'); const copy = { ...structuredClone(scene), id: createId('scene'), name: `${scene.name} copia`, order: design.scenes.length }; design.scenes.push(copy); touchDesign(design); return copy; }
export function reorderScenes(design: DesignDocument, orderedIds: Id[]): void { const order = new Map(orderedIds.map((id, index) => [id, index])); design.scenes.forEach((scene, index) => { scene.order = order.get(scene.id) ?? orderedIds.length + index; }); design.scenes.sort((a, b) => a.order - b.order); touchDesign(design); }
export function deleteScene(design:DesignDocument,id:Id):void { const before=design.scenes.length;design.scenes=design.scenes.filter(scene=>scene.id!==id);if(design.scenes.length===before)throw new Error('Scene inexistente');design.scenes.forEach((scene,index)=>scene.order=index);if(design.activeSceneId===id)design.activeSceneId=undefined;touchDesign(design); }
