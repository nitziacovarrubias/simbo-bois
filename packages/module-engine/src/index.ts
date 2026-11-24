import {
  createAssembly,
  createId,
  identityTransform,
  composeTransforms,
  invertTransform,
  getAssemblyWorldTransform,
  getPartWorldTransform,
  getParentAssemblyId,
  getModuleInstanceWorldTransform,
  localToWorld,
  rotateVectorByEuler,
  touchDesign,
  validateModuleParameters,
  type Assembly,
  type Binding,
  type Constraint,
  type DesignDocument,
  type HardwareDefinition,
  type Id,
  type MaterialDefinition,
  type ModuleDefinition,
  type ModuleInstance,
  type ModuleSnapshot,
  type ModuleVersion,
  type ParameterDefinition,
  type Part,
  type SnapDefinition
} from '../../design-domain/src/index.ts';
import {
  applyBindings,
  expressionReferences,
  remapBindingExpression,
  solveDesignRelations
} from '../../constraint-engine/src/index.ts';

function collectAssemblyTree(
  design: DesignDocument,
  rootAssemblyId: Id,
  clone = true
): { assemblies: Assembly[]; parts: Part[] } {
  const assemblies: Assembly[] = [];
  const parts: Part[] = [];
  const seen = new Set<Id>();
  const visit = (assemblyId: Id): void => {
    if (seen.has(assemblyId)) return;
    seen.add(assemblyId);
    const assembly = design.assemblies.find(candidate => candidate.id === assemblyId);
    if (!assembly) throw new Error(`Assembly inexistente ${assemblyId}`);
    assemblies.push(clone ? structuredClone(assembly) : assembly);
    for (const child of assembly.children) {
      if (child.kind === 'PART') {
        const part = design.parts.find(candidate => candidate.id === child.id);
        if (!part) throw new Error(`Part inexistente ${child.id}`);
        parts.push(clone ? structuredClone(part) : part);
      } else visit(child.id);
    }
  };
  visit(rootAssemblyId);
  return { assemblies, parts };
}

function extractEntityIdsFromBinding(binding: Binding): Id[] {
  const paths = [binding.targetPath, ...expressionReferences(binding.expression)];
  const ids: Id[] = [];
  for (const path of paths) {
    const tokens = path.split('.');
    const entityIndex = tokens.indexOf('entities');
    if (entityIndex >= 0 && tokens[entityIndex + 1]) ids.push(tokens[entityIndex + 1]!);
  }
  return ids;
}

function bindingBelongsToModule(
  binding: Binding,
  moduleIds: Set<Id>,
  knownIds: Set<Id>
): boolean {
  const ids = extractEntityIdsFromBinding(binding);
  if (!ids.length) return false;
  if (!ids.some(id => moduleIds.has(id))) return false;
  return ids.every(id => moduleIds.has(id) || !knownIds.has(id));
}

function constraintBelongsToModule(constraint: Constraint, moduleIds: Set<Id>): boolean {
  return constraint.entityIds.length > 0 && constraint.entityIds.every(id => moduleIds.has(id));
}

function buildSnapshot(
  design: DesignDocument,
  rootAssemblyId: Id,
  parameterBindings: Binding[],
  snapDefinitions: SnapDefinition[]
): ModuleSnapshot {
  const tree = collectAssemblyTree(design, rootAssemblyId, true);
  const partIds = new Set(tree.parts.map(part => part.id));
  const assemblyIds = new Set(tree.assemblies.map(assembly => assembly.id));
  const moduleIds = new Set<Id>([...partIds, ...assemblyIds]);
  const knownIds = new Set<Id>([
    ...design.parts.map(part => part.id),
    ...design.assemblies.map(assembly => assembly.id)
  ]);
  const joints = design.joints
    .filter(joint => partIds.has(joint.partAId) && partIds.has(joint.partBId))
    .map(joint => structuredClone(joint));
  const jointIds = new Set(joints.map(joint => joint.id));
  const hardwareInstanceIds = new Set(joints.flatMap(joint => joint.hardwareInstanceIds));
  const hardwareInstances = design.hardwareInstances
    .filter(instance => hardwareInstanceIds.has(instance.id) || instance.connectedPartIds.some(id => partIds.has(id)))
    .filter(instance => instance.connectedPartIds.every(id => partIds.has(id)))
    .map(instance => structuredClone(instance));
  const hardwareDefinitionIds = new Set(hardwareInstances.map(instance => instance.definitionId));
  const hardwareDefinitions = design.hardwareDefinitions
    .filter(definition => hardwareDefinitionIds.has(definition.id))
    .map(definition => structuredClone(definition));
  const machiningIds = new Set(joints.flatMap(joint => joint.machiningFeatureIds));
  const machiningFeatures = design.machiningFeatures
    .filter(feature => partIds.has(feature.partId) && (machiningIds.has(feature.id) || !feature.jointId || jointIds.has(feature.jointId)))
    .map(feature => structuredClone(feature));
  const kinematics = design.kinematics
    .filter(relation => moduleIds.has(relation.movingEntityId) && moduleIds.has(relation.referenceEntityId) && jointIds.has(relation.jointId))
    .map(relation => structuredClone(relation));
  const materialIds = new Set(tree.parts.map(part => part.materialId).filter((id): id is Id => Boolean(id)));
  const materials = design.materials
    .filter(material => materialIds.has(material.id))
    .map(material => structuredClone(material));
  const bindings = design.bindings
    .filter(binding => bindingBelongsToModule(binding, moduleIds, knownIds))
    .map(binding => structuredClone(binding));
  const constraints = design.constraints
    .filter(constraint => constraintBelongsToModule(constraint, moduleIds))
    .map(constraint => structuredClone(constraint));

  return {
    rootAssemblyId,
    parts: tree.parts,
    assemblies: tree.assemblies,
    constraints,
    bindings,
    joints,
    hardwareDefinitions,
    hardwareInstances,
    machiningFeatures,
    kinematics,
    materials,
    snapDefinitions: structuredClone(snapDefinitions),
    parameterBindings: structuredClone(parameterBindings)
  };
}


export interface DuplicateAssemblyResult {
  rootAssemblyId: Id;
  assemblyIds: Id[];
  partIds: Id[];
  idMap: Map<Id, Id>;
}

/**
 * Duplica un subárbol Assembly y las dependencias de modelado que pertenecen al snapshot.
 * Las definiciones compartidas de catálogo conservan su ID; las entidades propias reciben IDs nuevos.
 * Los transforms locales se copian sin cambio para conservar la pose world-space bajo el mismo padre.
 */
export function duplicateAssemblyTree(design: DesignDocument, rootAssemblyId: Id, name?: string): DuplicateAssemblyResult {
  if (rootAssemblyId === design.rootAssemblyId) throw new Error('No se puede duplicar el Assembly root');
  const sourceRoot = design.assemblies.find(candidate => candidate.id === rootAssemblyId);
  if (!sourceRoot) throw new Error('Assembly inexistente');
  const parentId = getParentAssemblyId(design, rootAssemblyId);
  const parent = parentId ? design.assemblies.find(candidate => candidate.id === parentId) : undefined;
  if (!parent) throw new Error('Assembly padre inexistente');

  const portable = buildSnapshot(design, rootAssemblyId, [], []);
  installSnapshotDependencies(design, portable);
  const { snapshot, idMap } = remapSnapshot(portable);
  const root = snapshot.assemblies.find(candidate => candidate.id === snapshot.rootAssemblyId);
  if (!root) throw new Error('Assembly duplicado inválido');
  root.name = name?.trim() || `${sourceRoot.name} copia`;

  design.parts.push(...snapshot.parts);
  design.assemblies.push(...snapshot.assemblies);
  design.constraints.push(...snapshot.constraints);
  design.bindings.push(...snapshot.bindings);
  design.joints.push(...snapshot.joints);
  design.hardwareInstances.push(...snapshot.hardwareInstances);
  design.machiningFeatures.push(...snapshot.machiningFeatures);
  design.kinematics.push(...snapshot.kinematics);
  parent.children.push({ kind: 'ASSEMBLY', id: root.id });
  touchDesign(design);
  return {
    rootAssemblyId: root.id,
    assemblyIds: snapshot.assemblies.map(value => value.id),
    partIds: snapshot.parts.map(value => value.id),
    idMap
  };
}

/** Deep-duplicates the instantiated geometry of a ModuleInstance while preserving its definition/version link. */
export function duplicateModuleInstance(design: DesignDocument, instanceId: Id, name?: string): ModuleInstance {
  const source = design.moduleInstances.find(candidate => candidate.id === instanceId);
  if (!source) throw new Error('ModuleInstance inexistente');
  if (source.detached) throw new Error('Una instancia detached debe duplicarse como Assembly');
  const sourceWorld = getModuleInstanceWorldTransform(design, source.id);
  const duplicated = duplicateAssemblyTree(design, source.rootAssemblyId, `${source.name} copia`);
  // Preserve the module-definition source IDs, not the previous instance's part IDs.
  for (const [oldId, newId] of duplicated.idMap) {
    const original = design.parts.find(part => part.id === oldId);
    const cloned = design.parts.find(part => part.id === newId);
    if (original && cloned && typeof original.metadata.sourceModuleEntityId === 'string')
      cloned.metadata.sourceModuleEntityId = original.metadata.sourceModuleEntityId;
  }
  const copy: ModuleInstance = {
    ...structuredClone(source),
    id: createId('moduleinst'),
    rootAssemblyId: duplicated.rootAssemblyId,
    name: name?.trim() || `${source.name} copia`,
    parameterValues: structuredClone(source.parameterValues),
    metadata: { ...structuredClone(source.metadata), duplicatedFromInstanceId: source.id }
  };
  design.moduleInstances.push(copy);
  // duplicateAssemblyTree ya copió el transform local raíz bajo el mismo padre.
  // El transform de la instancia se copia sin cambio para conservar world-space.
  const copyWorld = getModuleInstanceWorldTransform(design, copy.id);
  const eps = 1e-7;
  if (Math.abs(copyWorld.position.x-sourceWorld.position.x)>eps || Math.abs(copyWorld.position.y-sourceWorld.position.y)>eps || Math.abs(copyWorld.position.z-sourceWorld.position.z)>eps) {
    throw new Error('La duplicación de ModuleInstance no preservó world-space');
  }
  touchDesign(design);
  return copy;
}

export function createModuleDefinitionFromAssembly(
  design: DesignDocument,
  rootAssemblyId: Id,
  input: {
    name: string;
    description?: string;
    parameters?: ParameterDefinition[];
    parameterBindings?: Binding[];
    snaps?: SnapDefinition[];
    tags?: string[];
  }
): { definition: ModuleDefinition; version: ModuleVersion } {
  const definitionId = createId('moduledef');
  const versionId = createId('modulever');
  const snaps = structuredClone(input.snaps ?? []);
  const snapshot = buildSnapshot(design, rootAssemblyId, input.parameterBindings ?? [], snaps);
  const version: ModuleVersion = {
    id: versionId,
    definitionId,
    version: 1,
    createdAt: new Date().toISOString(),
    snapshot,
    immutable: true,
    notes: 'Versión inicial'
  };
  const definition: ModuleDefinition = {
    id: definitionId,
    name: input.name,
    description: input.description,
    parameterDefinitions: structuredClone(input.parameters ?? []),
    snapDefinitions: snaps,
    origin: identityTransform(),
    versionIds: [versionId],
    currentVersionId: versionId,
    tags: [...(input.tags ?? [])],
    metadata: { createdFromAssemblyId: rootAssemblyId }
  };
  design.moduleDefinitions.push(definition);
  design.moduleVersions.push(version);
  touchDesign(design);
  return { definition, version };
}

export function createModuleVersion(
  design: DesignDocument,
  definitionId: Id,
  sourceAssemblyId: Id,
  parameterBindings: Binding[] = []
): ModuleVersion {
  const definition = design.moduleDefinitions.find(candidate => candidate.id === definitionId);
  if (!definition) throw new Error('ModuleDefinition inexistente');
  const version: ModuleVersion = {
    id: createId('modulever'),
    definitionId,
    version: Math.max(0, ...design.moduleVersions.filter(candidate => candidate.definitionId === definitionId).map(candidate => candidate.version)) + 1,
    createdAt: new Date().toISOString(),
    snapshot: buildSnapshot(design, sourceAssemblyId, parameterBindings, definition.snapDefinitions),
    immutable: true
  };
  design.moduleVersions.push(version);
  definition.versionIds.push(version.id);
  definition.currentVersionId = version.id;
  touchDesign(design);
  return version;
}

function replaceIdsInPath(path: string, idMap: Map<Id, Id>): string {
  return path.split('.').map(token => idMap.get(token) ?? token).join('.');
}

export function remapBinding(binding: Binding, idMap: Map<Id, Id>, newId = createId('binding')): Binding {
  const remapPath = (path: string): string => replaceIdsInPath(path, idMap);
  return {
    ...structuredClone(binding),
    id: newId,
    targetPath: remapPath(binding.targetPath),
    expression: remapBindingExpression(binding.expression, remapPath)
  };
}

function remapSnapshot(source: ModuleSnapshot): { snapshot: ModuleSnapshot; idMap: Map<Id, Id> } {
  const idMap = new Map<Id, Id>();
  const mapAll = (ids: Id[], prefix: string): void => {
    for (const id of ids) if (!idMap.has(id)) idMap.set(id, createId(prefix));
  };
  mapAll(source.parts.map(part => part.id), 'part');
  mapAll(source.assemblies.map(assembly => assembly.id), 'assembly');
  mapAll(source.joints.map(joint => joint.id), 'joint');
  mapAll(source.hardwareInstances.map(instance => instance.id), 'hardware');
  mapAll(source.machiningFeatures.map(feature => feature.id), 'machining');
  mapAll(source.kinematics.map(relation => relation.id), 'kinematic');
  mapAll(source.bindings.map(binding => binding.id), 'binding');
  mapAll(source.parameterBindings.map(binding => binding.id), 'binding');
  mapAll(source.constraints.map(constraint => constraint.id), 'constraint');

  const parts = source.parts.map(part => ({
    ...structuredClone(part),
    id: idMap.get(part.id)!,
    machiningFeatureIds: part.machiningFeatureIds.map(id => idMap.get(id) ?? id),
    metadata: { ...structuredClone(part.metadata), sourceModuleEntityId: part.id }
  }));
  const assemblies = source.assemblies.map(assembly => ({
    ...structuredClone(assembly),
    id: idMap.get(assembly.id)!,
    children: assembly.children.map(child => ({ ...child, id: idMap.get(child.id) ?? child.id })),
    metadata: { ...structuredClone(assembly.metadata), sourceModuleEntityId: assembly.id }
  }));
  const bindings = source.bindings.map(binding => remapBinding(binding, idMap, idMap.get(binding.id)!));
  const parameterBindings = source.parameterBindings.map(binding => remapBinding(binding, idMap, idMap.get(binding.id)!));
  const constraints = source.constraints.map(constraint => ({
    ...structuredClone(constraint),
    id: idMap.get(constraint.id)!,
    entityIds: constraint.entityIds.map(id => idMap.get(id) ?? id),
    bindingId: constraint.bindingId ? idMap.get(constraint.bindingId) ?? constraint.bindingId : undefined
  }));
  const joints = source.joints.map(joint => ({
    ...structuredClone(joint),
    id: idMap.get(joint.id)!,
    partAId: idMap.get(joint.partAId)!,
    partBId: idMap.get(joint.partBId)!,
    hardwareInstanceIds: joint.hardwareInstanceIds.map(id => idMap.get(id) ?? id),
    machiningFeatureIds: joint.machiningFeatureIds.map(id => idMap.get(id) ?? id)
  }));
  const hardwareInstances = source.hardwareInstances.map(instance => {
    const metadata = structuredClone(instance.metadata);
    const referencePartId = typeof metadata.referencePartId === 'string' ? metadata.referencePartId : undefined;
    if (referencePartId) metadata.referencePartId = idMap.get(referencePartId) ?? referencePartId;
    return {
      ...structuredClone(instance),
      id: idMap.get(instance.id)!,
      connectedPartIds: instance.connectedPartIds.map(id => idMap.get(id) ?? id),
      jointId: instance.jointId ? idMap.get(instance.jointId) ?? instance.jointId : undefined,
      metadata
    };
  });
  const machiningFeatures = source.machiningFeatures.map(feature => ({
    ...structuredClone(feature),
    id: idMap.get(feature.id)!,
    partId: idMap.get(feature.partId)!,
    jointId: feature.jointId ? idMap.get(feature.jointId) ?? feature.jointId : undefined
  }));
  const kinematics = source.kinematics.map(relation => ({
    ...structuredClone(relation),
    id: idMap.get(relation.id)!,
    movingEntityId: idMap.get(relation.movingEntityId) ?? relation.movingEntityId,
    referenceEntityId: idMap.get(relation.referenceEntityId) ?? relation.referenceEntityId,
    jointId: idMap.get(relation.jointId) ?? relation.jointId
  }));
  const snapDefinitions = source.snapDefinitions.map(snap => ({
    ...structuredClone(snap),
    entityId: snap.entityId ? idMap.get(snap.entityId) ?? snap.entityId : undefined
  }));
  return {
    idMap,
    snapshot: {
      ...structuredClone(source),
      rootAssemblyId: idMap.get(source.rootAssemblyId)!,
      parts,
      assemblies,
      constraints,
      bindings,
      joints,
      hardwareDefinitions: structuredClone(source.hardwareDefinitions),
      hardwareInstances,
      machiningFeatures,
      kinematics,
      materials: structuredClone(source.materials),
      snapDefinitions,
      parameterBindings
    }
  };
}

function buildParameterContext(definition: ModuleDefinition, values: Record<string, number | string | boolean>) {
  const params: Record<string, number | string | boolean> = {};
  for (const parameter of definition.parameterDefinitions) params[parameter.key] = values[parameter.key] ?? parameter.defaultValue;
  return { params };
}

function applySnapshotParameters(snapshot: ModuleSnapshot, definition: ModuleDefinition, values: Record<string, number | string | boolean>): void {
  const entities: Record<string, Part | Assembly> = {};
  for (const part of snapshot.parts) entities[part.id] = part;
  for (const assembly of snapshot.assemblies) entities[assembly.id] = assembly;
  const model = { entities, params: buildParameterContext(definition, values).params };
  applyBindings(model, snapshot.parameterBindings, model);
}

function equalDependency(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeDependency<T extends { id: Id }>(target: T[], dependency: T, label: string): void {
  const existing = target.find(candidate => candidate.id === dependency.id);
  if (!existing) { target.push(structuredClone(dependency)); return; }
  if (!equalDependency(existing, dependency)) throw new Error(`${label} ${dependency.id} entra en conflicto con el catálogo destino`);
}

function installSnapshotDependencies(design: DesignDocument, snapshot: ModuleSnapshot): void {
  for (const definition of snapshot.hardwareDefinitions) mergeDependency<HardwareDefinition>(design.hardwareDefinitions, definition, 'HardwareDefinition');
  for (const material of snapshot.materials) mergeDependency<MaterialDefinition>(design.materials, material, 'MaterialDefinition');
}

export function installPortableModule(design: DesignDocument, definition: ModuleDefinition, version: ModuleVersion): void {
  if (version.definitionId !== definition.id) throw new Error('ModuleVersion no pertenece a ModuleDefinition');
  mergeDependency(design.moduleDefinitions, definition, 'ModuleDefinition');
  mergeDependency(design.moduleVersions, version, 'ModuleVersion');
}

export function instantiateModule(
  design: DesignDocument,
  definitionId: Id,
  options: {
    versionId?: Id;
    name?: string;
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    parameterValues?: Record<string, number | string | boolean>;
  } = {}
): ModuleInstance {
  const definition = design.moduleDefinitions.find(candidate => candidate.id === definitionId);
  if (!definition) throw new Error('ModuleDefinition inexistente');
  const version = design.moduleVersions.find(candidate => candidate.id === (options.versionId ?? definition.currentVersionId));
  if (!version) throw new Error('ModuleVersion inexistente');
  if (version.definitionId !== definition.id) throw new Error('ModuleVersion no pertenece a ModuleDefinition');
  const errors = validateModuleParameters(definition, options.parameterValues ?? {});
  if (errors.length) throw new Error(errors.join('; '));
  installSnapshotDependencies(design, version.snapshot);
  const { snapshot } = remapSnapshot(version.snapshot);
  applySnapshotParameters(snapshot, definition, options.parameterValues ?? {});
  design.parts.push(...snapshot.parts);
  design.assemblies.push(...snapshot.assemblies);
  design.constraints.push(...snapshot.constraints);
  design.bindings.push(...snapshot.bindings);
  design.joints.push(...snapshot.joints);
  design.hardwareInstances.push(...snapshot.hardwareInstances);
  design.machiningFeatures.push(...snapshot.machiningFeatures);
  design.kinematics.push(...snapshot.kinematics);
  const root = design.assemblies.find(assembly => assembly.id === snapshot.rootAssemblyId);
  if (!root) throw new Error('Root Assembly de módulo inexistente tras remapeo');
  const parent = design.assemblies.find(assembly => assembly.id === design.rootAssemblyId);
  if (!parent) throw new Error('Root Assembly del diseño inexistente');
  parent.children.push({ kind: 'ASSEMBLY', id: root.id });
  const parameterValues: Record<string, number | string | boolean> = {};
  for (const parameter of definition.parameterDefinitions) parameterValues[parameter.key] = options.parameterValues?.[parameter.key] ?? parameter.defaultValue;
  const instance: ModuleInstance = {
    id: createId('moduleinst'),
    definitionId: definition.id,
    versionId: version.id,
    rootAssemblyId: root.id,
    name: options.name ?? definition.name,
    transform: composeTransforms(
      {
        position: structuredClone(options.position ?? { x: 0, y: 0, z: 0 }),
        rotation: structuredClone(options.rotation ?? { x: 0, y: 0, z: 0 })
      },
      invertTransform(definition.origin ?? identityTransform())
    ),
    parameterValues,
    detached: false,
    metadata: {}
  };
  design.moduleInstances.push(instance);
  solveDesignRelations(design);
  touchDesign(design);
  return instance;
}

/** Changes only the insertion/reference origin of a module definition. Existing instances are untouched. */
export function setModuleDefinitionOrigin(design: DesignDocument, definitionId: Id, origin: ModuleDefinition['origin']): void {
  const definition = design.moduleDefinitions.find(candidate => candidate.id === definitionId);
  if (!definition) throw new Error('ModuleDefinition inexistente');
  definition.origin = structuredClone(origin);
  touchDesign(design);
}

export function moduleOriginSnapDefinition(definition: ModuleDefinition): SnapDefinition {
  return {
    id: `module-origin:${definition.id}`,
    name: 'Origen del módulo',
    position: structuredClone(definition.origin?.position ?? { x: 0, y: 0, z: 0 }),
    orientation: structuredClone(definition.origin?.rotation ?? { x: 0, y: 0, z: 0 }),
    compatibleTypes: ['MODULE_ORIGIN', 'PLACEMENT'],
    metadata: { kind: 'MODULE_ORIGIN', definitionId: definition.id }
  };
}

/**
 * Hace que una instancia apunte a una definición/versión privada sin cambiar su geometría instanciada.
 * Cambios posteriores de la definición original ya no afectan esta instancia.
 */
export function makeModuleInstanceUnique(design: DesignDocument, instanceId: Id): ModuleDefinition {
  const instance = design.moduleInstances.find(candidate => candidate.id === instanceId);
  if (!instance) throw new Error('ModuleInstance inexistente');
  const sourceDefinition = design.moduleDefinitions.find(candidate => candidate.id === instance.definitionId);
  const sourceVersion = design.moduleVersions.find(candidate => candidate.id === instance.versionId);
  if (!sourceDefinition || !sourceVersion) throw new Error('Definition/Version de instancia inexistente');

  const definitionId = createId('moduledef');
  const versionId = createId('modulever');
  const definition: ModuleDefinition = {
    ...structuredClone(sourceDefinition),
    id: definitionId,
    name: `${sourceDefinition.name} · independiente`,
    origin: structuredClone(sourceDefinition.origin ?? identityTransform()),
    versionIds: [versionId],
    currentVersionId: versionId,
    metadata: { ...structuredClone(sourceDefinition.metadata), madeUniqueFromDefinitionId: sourceDefinition.id }
  };
  const version: ModuleVersion = {
    ...structuredClone(sourceVersion),
    id: versionId,
    definitionId,
    version: 1,
    createdAt: new Date().toISOString(),
    notes: `Independiente de ${sourceDefinition.name}`
  };
  design.moduleDefinitions.push(definition);
  design.moduleVersions.push(version);
  instance.definitionId = definitionId;
  instance.versionId = versionId;
  instance.metadata.madeUniqueAt = new Date().toISOString();
  instance.metadata.sourceDefinitionId = sourceDefinition.id;
  touchDesign(design);
  return definition;
}

function findPartByLineage(design: DesignDocument, rootAssemblyId: Id, sourceId: Id): Part | undefined {
  const tree = collectAssemblyTree(design, rootAssemblyId, false);
  return tree.parts.find(part => part.metadata.sourceModuleEntityId === sourceId) ?? tree.parts.find(part => part.id === sourceId);
}
function findAssemblyByLineage(design: DesignDocument, rootAssemblyId: Id, sourceId: Id): Assembly | undefined {
  const tree = collectAssemblyTree(design, rootAssemblyId, false);
  return tree.assemblies.find(assembly => assembly.metadata.sourceModuleEntityId === sourceId) ?? tree.assemblies.find(assembly => assembly.id === sourceId);
}
function instanceSourceToCurrentMap(design: DesignDocument, instance: ModuleInstance, version: ModuleVersion): Map<Id, Id> {
  const map = new Map<Id, Id>();
  for (const source of version.snapshot.parts) { const current = findPartByLineage(design, instance.rootAssemblyId, source.id); if (current) map.set(source.id, current.id); }
  for (const source of version.snapshot.assemblies) { const current = findAssemblyByLineage(design, instance.rootAssemblyId, source.id); if (current) map.set(source.id, current.id); }
  return map;
}

export function updateModuleInstanceParameters(design: DesignDocument, instanceId: Id, values: Record<string, number | string | boolean>): void {
  const instance = design.moduleInstances.find(candidate => candidate.id === instanceId);
  if (!instance) throw new Error('ModuleInstance inexistente');
  if (instance.detached) throw new Error('Instancia detached no acepta overrides');
  const definition = design.moduleDefinitions.find(candidate => candidate.id === instance.definitionId);
  const version = design.moduleVersions.find(candidate => candidate.id === instance.versionId);
  if (!definition || !version) throw new Error('Definition/Version de instancia inexistente');
  const errors = validateModuleParameters(definition, { ...instance.parameterValues, ...values });
  if (errors.length) throw new Error(errors.join('; '));
  for (const source of version.snapshot.parts) {
    const current = findPartByLineage(design, instance.rootAssemblyId, source.id);
    if (!current) continue;
    current.dimensions = structuredClone(source.dimensions);
    current.transform = structuredClone(source.transform);
  }
  for (const source of version.snapshot.assemblies) {
    const current = findAssemblyByLineage(design, instance.rootAssemblyId, source.id);
    if (current) current.transform = structuredClone(source.transform);
  }
  instance.parameterValues = { ...instance.parameterValues, ...values };
  const idMap = instanceSourceToCurrentMap(design, instance, version);
  const translated = version.snapshot.parameterBindings.map(binding => remapBinding(binding, idMap));
  const tree = collectAssemblyTree(design, instance.rootAssemblyId, false);
  const entities: Record<string, Part | Assembly> = {};
  for (const part of tree.parts) entities[part.id] = part;
  for (const assembly of tree.assemblies) entities[assembly.id] = assembly;
  const model = { entities, params: buildParameterContext(definition, instance.parameterValues).params };
  applyBindings(model, translated, model);
  solveDesignRelations(design);
  touchDesign(design);
}

export interface ResolvedModuleSnap extends SnapDefinition { sourceDefinitionId: Id }
export function getModuleInstanceSnapDefinitions(design: DesignDocument, instanceId: Id): ResolvedModuleSnap[] {
  const instance = design.moduleInstances.find(candidate => candidate.id === instanceId);
  if (!instance) throw new Error('ModuleInstance inexistente');
  const version = design.moduleVersions.find(candidate => candidate.id === instance.versionId);
  const definition = design.moduleDefinitions.find(candidate => candidate.id === instance.definitionId);
  if (!version || !definition) throw new Error('Definition/Version de instancia inexistente');
  const configuredSnaps = version.snapshot.snapDefinitions.length ? version.snapshot.snapDefinitions : definition.snapDefinitions;
  // El origen de la definición siempre sirve como referencia de colocación/snap, además de los snaps personalizados.
  const originSnap = moduleOriginSnapDefinition(definition);
  const sourceSnaps = configuredSnaps.some(source => source.id === originSnap.id) ? configuredSnaps : [originSnap, ...configuredSnaps];
  const idMap = instanceSourceToCurrentMap(design, instance, version);
  return sourceSnaps.map(source => {
    const currentEntityId = source.entityId ? idMap.get(source.entityId) : undefined;
    const baseTransform = currentEntityId
      ? design.parts.some(part => part.id === currentEntityId) ? getPartWorldTransform(design, currentEntityId) : getAssemblyWorldTransform(design, currentEntityId)
      : getAssemblyWorldTransform(design, instance.rootAssemblyId);
    return {
      ...structuredClone(source),
      entityId: currentEntityId,
      position: localToWorld(baseTransform, source.position),
      normal: source.normal ? rotateVectorByEuler(source.normal, baseTransform.rotation) : undefined,
      sourceDefinitionId: source.id
    };
  });
}

export function detachModuleInstance(design: DesignDocument, instanceId: Id): void {
  const instance = design.moduleInstances.find(candidate => candidate.id === instanceId);
  if (!instance) throw new Error('ModuleInstance inexistente');
  instance.detached = true;
  instance.metadata.detachedAt = new Date().toISOString();
  touchDesign(design);
}

export function createEmptyModuleBuilder(design: DesignDocument, name = 'Nuevo módulo'): Assembly {
  const assembly = createAssembly(name);
  design.assemblies.push(assembly);
  const root = design.assemblies.find(candidate => candidate.id === design.rootAssemblyId);
  if (!root) throw new Error('Root Assembly inexistente');
  root.children.push({ kind: 'ASSEMBLY', id: assembly.id });
  touchDesign(design);
  return assembly;
}

export function createParameterDefinition(input: {
  key: string; label?: string; type?: ParameterDefinition['type']; defaultValue: number | string | boolean;
  unit?: 'mm' | 'deg' | 'none'; min?: number; max?: number; step?: number;
  options?: ParameterDefinition['options']; ui?: ParameterDefinition['ui'];
}): ParameterDefinition {
  const type = input.type ?? (typeof input.defaultValue === 'number' ? 'NUMBER' : typeof input.defaultValue === 'boolean' ? 'BOOLEAN' : 'SELECT');
  return {
    id: createId('param'), key: input.key, label: input.label ?? input.key, type, defaultValue: input.defaultValue,
    unit: input.unit ?? 'none', min: input.min, max: input.max, step: input.step, options: input.options,
    ui: input.ui ?? (type === 'COLOR' ? 'COLOR' : type === 'BOOLEAN' ? 'TOGGLE' : input.options ? 'SELECT' : 'INPUT')
  };
}

/** Publish a new immutable workshop version and refresh only matching linked instances.
 * Individual material overrides (made in the inspector) remain instance-local.
 * Existing world transforms and instance identity are preserved.
 */
export function updateWorkshopModule(
  design: DesignDocument,
  updated: ModuleDefinition,
  incoming: ModuleVersion
): void {
  const current = design.moduleDefinitions.find(item => item.id === updated.id);
  if (!current || !current.tags.includes('WORKSHOP')) throw new Error('Solo se pueden editar módulos creados en el taller.');
  if (incoming.definitionId !== current.id || design.moduleVersions.some(v => v.id === incoming.id)) throw new Error('Versión del módulo inválida.');
  const next = structuredClone(incoming);
  if (next.snapshot.assemblies.length !== 1) throw new Error('Esta definición requiere el editor avanzado de ensamblajes.');
  const newRoot = next.snapshot.assemblies[0]!;
  if (newRoot.id !== next.snapshot.rootAssemblyId || newRoot.children.some(child => child.kind !== 'PART')) throw new Error('Estructura del módulo no compatible con el taller.');
  if (next.snapshot.joints.length || next.snapshot.constraints.length || next.snapshot.bindings.length
    || next.snapshot.hardwareInstances.length || next.snapshot.machiningFeatures.length || next.snapshot.kinematics.length)
    throw new Error('Esta definición incluye relaciones técnicas que requieren edición avanzada.');
  // Never reuse IDs for changed material data: older immutable versions must remain reproducible.
  const materialIds = new Map<string,string>();
  for (const material of next.snapshot.materials) {
    const original = material.id;
    if (design.materials.some(existing => existing.id === original)) {
      material.id = createId('material');
      materialIds.set(original, material.id);
    }
  }
  for (const part of next.snapshot.parts) {
    if (part.materialId && materialIds.has(part.materialId)) part.materialId = materialIds.get(part.materialId);
  }
  const linked = design.moduleInstances.filter(instance => instance.definitionId === current.id && !instance.detached);
  for (const instance of linked) {
    const root = design.assemblies.find(assembly => assembly.id === instance.rootAssemblyId);
    if (!root || root.children.some(child => child.kind !== 'PART')) throw new Error('La instancia tiene una estructura distinta. Usa Hacer independiente antes de editar la definición.');
    const sourceIds = new Set(next.snapshot.parts.map(part => part.id));
    for (const child of root.children) {
      const old = design.parts.find(part => part.id === child.id);
      if (!old) throw new Error('Hay una referencia rota en la instancia del módulo.');
      const from = old.metadata.sourceModuleEntityId;
      if (typeof from !== 'string') throw new Error('La instancia no conserva sus referencias de origen.');
      if (sourceIds.has(from)) continue;
      if (design.joints.some(j => j.partAId === old.id || j.partBId === old.id)
        || design.constraints.some(c => c.entityIds.includes(old.id))
        || design.machiningFeatures.some(feature => feature.partId === old.id)
        || design.hardwareInstances.some(hardware => hardware.connectedPartIds.includes(old.id))
        || design.kinematics.some(k => k.movingEntityId === old.id || k.referenceEntityId === old.id)) {
        throw new Error(`La pieza «${old.name}» tiene relaciones externas. Desvincula la instancia antes de eliminarla de la definición.`);
      }
    }
  }
  // Validation above is complete; mutations below occur as one editor history action.
  design.materials.push(...structuredClone(next.snapshot.materials));
  for (const instance of linked) {
    const root = design.assemblies.find(assembly => assembly.id === instance.rootAssemblyId)!;
    const oldParts = root.children.map(child => design.parts.find(part => part.id === child.id)!).filter(Boolean);
    const previous = new Map(oldParts.map(part => [String(part.metadata.sourceModuleEntityId),part]));
    const children: typeof root.children = [];
    for (const source of next.snapshot.parts) {
      const prior = previous.get(source.id);
      const localAppearance = prior?.metadata.appearanceOverride;
      const part: Part = {
        ...structuredClone(source),
        id: prior?.id ?? createId('part'),
        materialId: source.materialId,
        hidden: prior?.hidden ?? source.hidden,
        locked: prior?.locked ?? source.locked,
        metadata: { ...structuredClone(source.metadata), ...(localAppearance?{appearanceOverride:structuredClone(localAppearance)}:{}),sourceModuleEntityId: source.id }
      };
      if (prior) {
        const index = design.parts.findIndex(p => p.id === prior.id);
        design.parts[index] = part;
      } else design.parts.push(part);
      children.push({kind:'PART',id:part.id});
    }
    const retained = new Set(children.map(child => child.id));
    design.parts = design.parts.filter(part => !oldParts.some(old => old.id === part.id) || retained.has(part.id));
    root.children = children;
    instance.versionId = next.id;
  }
  current.name = updated.name;
  current.description = updated.description;
  current.currentVersionId = next.id;
  current.versionIds = [...current.versionIds, next.id];
  design.moduleVersions.push(next);
  touchDesign(design);
}

/** Prepares new snapshot finishes for persistence and publication without mutating older versions. */
export function prepareWorkshopModuleVersion(version: ModuleVersion): ModuleVersion {
  const copy=structuredClone(version);
  const map=new Map(copy.snapshot.materials.map(item=>[item.id,createId('material')]));
  for(const material of copy.snapshot.materials) material.id=map.get(material.id)!;
  for(const part of copy.snapshot.parts) {
    if(part.materialId&&map.has(part.materialId)) part.materialId=map.get(part.materialId);
  }
  return copy;
}
