import type {
  Anchor,
  Assembly,
  DesignDocument,
  Euler3,
  Id,
  ModuleInstance,
  Part,
  Transform,
  Vec3
} from './index.ts';

type Mat3 = [number, number, number, number, number, number, number, number, number];

function rotationMatrix(rotation: Euler3): Mat3 {
  const cx = Math.cos(rotation.x);
  const sx = Math.sin(rotation.x);
  const cy = Math.cos(rotation.y);
  const sy = Math.sin(rotation.y);
  const cz = Math.cos(rotation.z);
  const sz = Math.sin(rotation.z);
  return [
    cz * cy,
    cz * sy * sx - sz * cx,
    cz * sy * cx + sz * sx,
    sz * cy,
    sz * sy * sx + cz * cx,
    sz * sy * cx - cz * sx,
    -sy,
    cy * sx,
    cy * cx
  ];
}

function multiplyMatrix(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[c + 3]! + a[r * 3 + 2]! * b[c + 6]!;
    }
  }
  return out as Mat3;
}

function transposeMatrix(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function eulerFromMatrix(matrix: Mat3): Euler3 {
  const sy = Math.max(-1, Math.min(1, -matrix[6]));
  const y = Math.asin(sy);
  const cy = Math.cos(y);
  if (Math.abs(cy) > 1e-10) {
    return {
      x: Math.atan2(matrix[7], matrix[8]),
      y,
      z: Math.atan2(matrix[3], matrix[0])
    };
  }
  return { x: Math.atan2(-matrix[5], matrix[4]), y, z: 0 };
}

export function cloneTransform(transform: Transform): Transform {
  return structuredClone(transform);
}

export function rotateVectorByEuler(vector: Vec3, rotation: Euler3): Vec3 {
  const m = rotationMatrix(rotation);
  return {
    x: m[0] * vector.x + m[1] * vector.y + m[2] * vector.z,
    y: m[3] * vector.x + m[4] * vector.y + m[5] * vector.z,
    z: m[6] * vector.x + m[7] * vector.y + m[8] * vector.z
  };
}

export function composeTransforms(parent: Transform, local: Transform): Transform {
  const offset = rotateVectorByEuler(local.position, parent.rotation);
  return {
    position: {
      x: parent.position.x + offset.x,
      y: parent.position.y + offset.y,
      z: parent.position.z + offset.z
    },
    rotation: eulerFromMatrix(multiplyMatrix(rotationMatrix(parent.rotation), rotationMatrix(local.rotation)))
  };
}

export function invertTransform(transform: Transform): Transform {
  const inverseMatrix = transposeMatrix(rotationMatrix(transform.rotation));
  const inverseRotation = eulerFromMatrix(inverseMatrix);
  const negative = { x: -transform.position.x, y: -transform.position.y, z: -transform.position.z };
  return { position: rotateVectorByEuler(negative, inverseRotation), rotation: inverseRotation };
}

export function localToWorld(transform: Transform, point: Vec3): Vec3 {
  const rotated = rotateVectorByEuler(point, transform.rotation);
  return { x: transform.position.x + rotated.x, y: transform.position.y + rotated.y, z: transform.position.z + rotated.z };
}

export function worldToLocal(transform: Transform, point: Vec3): Vec3 {
  return localToWorld(invertTransform(transform), point);
}

export function getParentAssemblyId(design: DesignDocument, entityId: Id): Id | undefined {
  for (const assembly of design.assemblies) {
    if (assembly.children.some(child => child.id === entityId)) return assembly.id;
  }
  return undefined;
}

export function getModuleInstanceForRootAssembly(design: DesignDocument, rootAssemblyId: Id): ModuleInstance | undefined {
  return design.moduleInstances.find(instance => instance.rootAssemblyId === rootAssemblyId && !instance.detached);
}

function findAssembly(design: DesignDocument, id: Id): Assembly {
  const assembly = design.assemblies.find(candidate => candidate.id === id);
  if (!assembly) throw new Error(`Assembly no encontrado: ${id}`);
  return assembly;
}

function findPart(design: DesignDocument, id: Id): Part {
  const part = design.parts.find(candidate => candidate.id === id);
  if (!part) throw new Error(`Part no encontrada: ${id}`);
  return part;
}

function identity(): Transform {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
}

export function getModuleInstanceWorldTransform(design: DesignDocument, instanceId: Id): Transform {
  const instance = design.moduleInstances.find(candidate => candidate.id === instanceId);
  if (!instance) throw new Error(`ModuleInstance no encontrado: ${instanceId}`);
  const parentId = getParentAssemblyId(design, instance.rootAssemblyId);
  const parentWorld = parentId ? getAssemblyWorldTransform(design, parentId) : identity();
  return composeTransforms(parentWorld, instance.transform);
}

export function getAssemblyWorldTransform(
  design: DesignDocument,
  assemblyId: Id,
  visiting: Set<Id> = new Set()
): Transform {
  if (visiting.has(assemblyId)) throw new Error(`Ciclo en jerarquía de assemblies: ${assemblyId}`);
  visiting.add(assemblyId);
  const assembly = findAssembly(design, assemblyId);
  const parentId = getParentAssemblyId(design, assemblyId);
  const parentWorld = parentId ? getAssemblyWorldTransform(design, parentId, visiting) : identity();
  const instance = getModuleInstanceForRootAssembly(design, assemblyId);
  const withInstance = instance ? composeTransforms(parentWorld, instance.transform) : parentWorld;
  const world = composeTransforms(withInstance, assembly.transform);
  visiting.delete(assemblyId);
  return world;
}

export function getPartWorldTransform(design: DesignDocument, partId: Id): Transform {
  const part = findPart(design, partId);
  const parentId = getParentAssemblyId(design, partId);
  const parentWorld = parentId ? getAssemblyWorldTransform(design, parentId) : identity();
  return composeTransforms(parentWorld, part.transform);
}

export function getApplianceWorldTransform(design: DesignDocument, applianceInstanceId: Id): Transform {
  const instance = design.applianceInstances.find(candidate => candidate.id === applianceInstanceId);
  if (!instance) throw new Error(`ApplianceInstance no encontrado: ${applianceInstanceId}`);
  return structuredClone(instance.transform);
}

export function getCountertopWorldTransform(design: DesignDocument, countertopId: Id): Transform {
  const countertop = design.countertops.find(candidate => candidate.id === countertopId);
  if (!countertop) throw new Error(`Countertop no encontrado: ${countertopId}`);
  return structuredClone(countertop.transform);
}

export function getServicePointWorldPosition(design: DesignDocument, servicePointId: Id): Vec3 {
  const service = design.servicePoints.find(candidate => candidate.id === servicePointId);
  if (!service) throw new Error(`ServicePoint no encontrado: ${servicePointId}`);
  return structuredClone(service.position);
}

export function getServicePointWorldTransform(design:DesignDocument,servicePointId:Id):Transform {
  const service=design.servicePoints.find(candidate=>candidate.id===servicePointId);
  if(!service)throw new Error(`ServicePoint no encontrado: ${servicePointId}`);
  return {position:structuredClone(service.position),rotation:structuredClone(service.orientation??{x:0,y:0,z:0})};
}

export function getClearanceZoneWorldTransform(design: DesignDocument, clearanceZoneId: Id): Transform {
  const zone = design.clearanceZones.find(candidate => candidate.id === clearanceZoneId);
  if (!zone) throw new Error(`ClearanceZone no encontrada: ${clearanceZoneId}`);
  if (zone.coordinateSpace === 'WORLD') return structuredClone(zone.transform);
  const owner = design.applianceInstances.find(candidate => candidate.id === zone.ownerId);
  if (owner) return composeTransforms(owner.transform, zone.transform);
  const part = design.parts.find(candidate => candidate.id === zone.ownerId);
  if (part) return composeTransforms(getPartWorldTransform(design, part.id), zone.transform);
  const countertop = design.countertops.find(candidate => candidate.id === zone.ownerId);
  if (countertop) return composeTransforms(countertop.transform, zone.transform);
  return structuredClone(zone.transform);
}

export function getWorldTransform(design: DesignDocument, entityId: Id): Transform {
  if (design.parts.some(candidate => candidate.id === entityId)) return getPartWorldTransform(design, entityId);
  if (design.assemblies.some(candidate => candidate.id === entityId)) return getAssemblyWorldTransform(design, entityId);
  if (design.moduleInstances.some(candidate => candidate.id === entityId)) return getModuleInstanceWorldTransform(design, entityId);
  if (design.applianceInstances.some(candidate => candidate.id === entityId)) return getApplianceWorldTransform(design, entityId);
  if (design.countertops.some(candidate => candidate.id === entityId)) return getCountertopWorldTransform(design, entityId);
  if (design.servicePoints.some(candidate => candidate.id === entityId)) return getServicePointWorldTransform(design, entityId);
  if (design.clearanceZones.some(candidate => candidate.id === entityId)) return getClearanceZoneWorldTransform(design, entityId);
  throw new Error(`Entidad transformable no encontrada: ${entityId}`);
}

export function setPartWorldTransform(design: DesignDocument, partId: Id, world: Transform): void {
  const part = findPart(design, partId);
  const parentId = getParentAssemblyId(design, partId);
  const parentWorld = parentId ? getAssemblyWorldTransform(design, parentId) : identity();
  part.transform = composeTransforms(invertTransform(parentWorld), world);
}

export function setAssemblyWorldTransform(design: DesignDocument, assemblyId: Id, world: Transform): void {
  const assembly = findAssembly(design, assemblyId);
  const parentId = getParentAssemblyId(design, assemblyId);
  const parentWorld = parentId ? getAssemblyWorldTransform(design, parentId) : identity();
  const localWithInstance = composeTransforms(invertTransform(parentWorld), world);
  const instance = getModuleInstanceForRootAssembly(design, assemblyId);
  assembly.transform = instance
    ? composeTransforms(invertTransform(instance.transform), localWithInstance)
    : localWithInstance;
}

export function setModuleInstanceWorldTransform(design: DesignDocument, instanceId: Id, world: Transform): void {
  const instance = design.moduleInstances.find(candidate => candidate.id === instanceId);
  if (!instance) throw new Error(`ModuleInstance no encontrado: ${instanceId}`);
  const parentId = getParentAssemblyId(design, instance.rootAssemblyId);
  const parentWorld = parentId ? getAssemblyWorldTransform(design, parentId) : identity();
  instance.transform = composeTransforms(invertTransform(parentWorld), world);
}

export function setApplianceWorldTransform(design: DesignDocument, instanceId: Id, world: Transform): void {
  const instance = design.applianceInstances.find(candidate => candidate.id === instanceId);
  if (!instance) throw new Error(`ApplianceInstance no encontrado: ${instanceId}`);
  instance.transform = structuredClone(world);
}

export function setCountertopWorldTransform(design: DesignDocument, countertopId: Id, world: Transform): void {
  const countertop = design.countertops.find(candidate => candidate.id === countertopId);
  if (!countertop) throw new Error(`Countertop no encontrado: ${countertopId}`);
  countertop.transform = structuredClone(world);
}

export function setServicePointWorldTransform(design:DesignDocument,servicePointId:Id,world:Transform):void {
  const service=design.servicePoints.find(candidate=>candidate.id===servicePointId);
  if(!service)throw new Error(`ServicePoint no encontrado: ${servicePointId}`);
  service.position=structuredClone(world.position);service.orientation=structuredClone(world.rotation);
}

function metadataId(metadata: Record<string, unknown>, key: string): Id | undefined {
  const value = metadata[key];
  return typeof value === 'string' ? value : undefined;
}

export function getHardwareWorldTransform(design: DesignDocument, hardwareInstanceId: Id): Transform {
  const instance = design.hardwareInstances.find(candidate => candidate.id === hardwareInstanceId);
  if (!instance) throw new Error(`HardwareInstance no encontrado: ${hardwareInstanceId}`);
  const stored: Transform = { position: structuredClone(instance.position), rotation: structuredClone(instance.orientation) };
  if (instance.metadata.coordinateSpace !== 'PART_LOCAL') return stored;
  const referencePartId = metadataId(instance.metadata, 'referencePartId');
  if (!referencePartId) return stored;
  return composeTransforms(getPartWorldTransform(design, referencePartId), stored);
}

export function getMachiningFeatureWorldTransform(design: DesignDocument, machiningFeatureId: Id): Transform {
  const feature = design.machiningFeatures.find(candidate => candidate.id === machiningFeatureId);
  if (!feature) throw new Error(`MachiningFeature no encontrada: ${machiningFeatureId}`);
  const stored: Transform = { position: structuredClone(feature.position), rotation: structuredClone(feature.orientation) };
  if (feature.metadata.coordinateSpace !== 'PART_LOCAL') return stored;
  return composeTransforms(getPartWorldTransform(design, feature.partId), stored);
}

export function worldTransformToPartLocal(design: DesignDocument, partId: Id, worldTransform: Transform): Transform {
  return composeTransforms(invertTransform(getPartWorldTransform(design, partId)), worldTransform);
}

export function getJointAnchorWorld(design: DesignDocument, jointId: Id, side: 'A' | 'B'): Anchor {
  const joint = design.joints.find(candidate => candidate.id === jointId);
  if (!joint) throw new Error(`Joint no encontrado: ${jointId}`);
  const anchor = side === 'A' ? joint.anchorA : joint.anchorB;
  if (joint.metadata.anchorSpace !== 'PART_LOCAL') return structuredClone(anchor);
  const partId = side === 'A' ? joint.partAId : joint.partBId;
  const partWorld = getPartWorldTransform(design, partId);
  return {
    ...structuredClone(anchor),
    position: localToWorld(partWorld, anchor.position),
    normal: anchor.normal ? rotateVectorByEuler(anchor.normal, partWorld.rotation) : undefined,
    axis: anchor.axis ? rotateVectorByEuler(anchor.axis, partWorld.rotation) : undefined
  };
}
