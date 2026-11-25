import {
  createId,
  findPart,
  getPartWorldTransform,
  invertTransform,
  rotateVectorByEuler,
  touchDesign,
  worldToLocal,
  worldTransformToPartLocal,
  type Anchor,
  type DesignDocument,
  type Euler3,
  type HardwareDefinition,
  type Joint,
  type MachiningFeature,
  type Vec3,
} from '../../design-domain/src/index.ts';
import {
  createHardwareDefinition,
  createHardwareInstance,
} from '../../hardware-engine/src/index.ts';
import { centerOfAabb, normalize, partWorldAabb } from '../../geometry-engine/src/index.ts';

export interface ScrewJointInput {
  diameterMm: number;
  lengthMm: number;
  quantity: number;
  spacingMm: number;
  startOffsetMm: number;
  head: 'COUNTERSUNK' | 'PAN' | 'HEX' | 'OTHER';
  orientation: 'AUTO' | 'MANUAL';
  axis?: Vec3;
  generatePilotHole?: boolean;
  pilotDiameterMm?: number;
  pilotDepthMm?: number;
  hardwareDefinitionId?: string;
}
export interface DowelJointInput {
  diameterMm: number;
  lengthMm: number;
  depthAMm: number;
  depthBMm: number;
  quantity: number;
  spacingMm: number;
  startOffsetMm: number;
  axis?: Vec3;
  hardwareDefinitionId?: string;
}
export interface HingeJointInput {
  quantity: number;
  verticalOffsetMm: number;
  spacingMm: number;
  openingAngleDeg: number;
  cupDiameterMm: number;
  cupDepthMm: number;
  mountingHoleDiameterMm: number;
  hardwareDefinitionId?: string;
  hingeAxis?: Vec3;
}
export interface DrawerSlideInput {
  lengthMm: number;
  offsetMm: number;
  clearanceMm: number;
  extensionDistanceMm: number;
  axis?: Vec3;
  hardwareDefinitionId?: string;
}

function contactAnchors(
  design: DesignDocument,
  partAId: string,
  partBId: string,
): { a: Anchor; b: Anchor; axis: Vec3 } {
  const aabbA = partWorldAabb(design, findPart(design, partAId));
  const aabbB = partWorldAabb(design, findPart(design, partBId));
  const centerA = centerOfAabb(aabbA);
  const centerB = centerOfAabb(aabbB);
  const dx = Math.abs(centerA.x - centerB.x);
  const dy = Math.abs(centerA.y - centerB.y);
  const dz = Math.abs(centerA.z - centerB.z);
  const axis: Vec3 =
    dx >= dy && dx >= dz
      ? { x: Math.sign(centerB.x - centerA.x) || 1, y: 0, z: 0 }
      : dy >= dz
        ? { x: 0, y: Math.sign(centerB.y - centerA.y) || 1, z: 0 }
        : { x: 0, y: 0, z: Math.sign(centerB.z - centerA.z) || 1 };
  const midpoint = {
    x: (centerA.x + centerB.x) / 2,
    y: (centerA.y + centerB.y) / 2,
    z: (centerA.z + centerB.z) / 2,
  };
  return {
    a: { kind: 'FACE', position: midpoint, normal: axis },
    b: { kind: 'FACE', position: midpoint, normal: { x: -axis.x, y: -axis.y, z: -axis.z } },
    axis,
  };
}

function orientationFromAxis(axis: Vec3): Euler3 {
  const n = normalize(axis);
  return { x: Math.atan2(n.y, Math.hypot(n.x, n.z)), y: Math.atan2(n.x, n.z), z: 0 };
}
function spacedPositions(
  center: Vec3,
  quantity: number,
  spacingMm: number,
  startOffsetMm: number,
): Vec3[] {
  const start = (-(quantity - 1) * spacingMm) / 2 + startOffsetMm;
  return Array.from({ length: quantity }, (_, index) => ({
    x: center.x,
    y: center.y + start + index * spacingMm,
    z: center.z,
  }));
}
function resolveHardwareDefinition(
  design: DesignDocument,
  definitionId: string | undefined,
  fallback: () => HardwareDefinition,
): HardwareDefinition {
  if (definitionId) {
    const definition = design.hardwareDefinitions.find((value) => value.id === definitionId);
    if (!definition) throw new Error(`HardwareDefinition inexistente ${definitionId}`);
    return definition;
  }
  const candidate = fallback();
  const existing = design.hardwareDefinitions.find(
    (definition) =>
      definition.name === candidate.name &&
      definition.category === candidate.category &&
      JSON.stringify(definition.dimensions) === JSON.stringify(candidate.dimensions),
  );
  if (existing) return existing;
  design.hardwareDefinitions.push(candidate);
  return candidate;
}
function anchorToPartLocal(design: DesignDocument, partId: string, anchor: Anchor): Anchor {
  const partWorld = getPartWorldTransform(design, partId);
  const inverseRotation = invertTransform(partWorld).rotation;
  return {
    ...structuredClone(anchor),
    position: worldToLocal(partWorld, anchor.position),
    normal: anchor.normal ? rotateVectorByEuler(anchor.normal, inverseRotation) : undefined,
    axis: anchor.axis ? rotateVectorByEuler(anchor.axis, inverseRotation) : undefined,
  };
}
function localFeatureTransform(
  design: DesignDocument,
  partId: string,
  position: Vec3,
  orientation: Euler3,
) {
  return worldTransformToPartLocal(design, partId, { position, rotation: orientation });
}

export function createScrewJoint(
  design: DesignDocument,
  partAId: string,
  partBId: string,
  input: ScrewJointInput,
): Joint {
  if (input.quantity < 1 || input.diameterMm <= 0 || input.lengthMm <= 0)
    throw new Error('Parámetros de tornillo inválidos');
  const anchors = contactAnchors(design, partAId, partBId);
  const jointId = createId('joint');
  const axis = input.axis ?? anchors.axis;
  const definition = resolveHardwareDefinition(design, input.hardwareDefinitionId, () =>
    createHardwareDefinition({
      name: `Tornillo genérico ${input.diameterMm}x${input.lengthMm}`,
      category: 'SCREW',
      dimensions: { diameterMm: input.diameterMm, lengthMm: input.lengthMm },
      colorHex: '#777777',
    }),
  );
  const hardwareInstanceIds: string[] = [];
  const machiningFeatureIds: string[] = [];
  for (const position of spacedPositions(
    anchors.a.position,
    input.quantity,
    input.spacingMm,
    input.startOffsetMm,
  )) {
    const hardwareLocal = localFeatureTransform(
      design,
      partAId,
      position,
      orientationFromAxis(axis),
    );
    const hardware = createHardwareInstance(definition.id, [partAId, partBId], {
      position: hardwareLocal.position,
      orientation: hardwareLocal.rotation,
      parameters: { diameterMm: input.diameterMm, lengthMm: input.lengthMm, head: input.head },
      jointId,
      metadata: { coordinateSpace: 'PART_LOCAL', referencePartId: partAId },
    });
    design.hardwareInstances.push(hardware);
    hardwareInstanceIds.push(hardware.id);
    if (input.generatePilotHole !== false) {
      const featureLocal = localFeatureTransform(
        design,
        partAId,
        position,
        orientationFromAxis(axis),
      );
      const feature: MachiningFeature = {
        id: createId('machining'),
        partId: partAId,
        type: 'BORE',
        position: featureLocal.position,
        orientation: featureLocal.rotation,
        diameterMm: input.pilotDiameterMm ?? Math.max(1, input.diameterMm * 0.7),
        depthMm:
          input.pilotDepthMm ??
          Math.min(input.lengthMm * 0.7, findPart(design, partAId).dimensions.thicknessMm),
        parameters: { purpose: 'SCREW_PILOT' },
        jointId,
        metadata: { generatedBy: 'SCREW', coordinateSpace: 'PART_LOCAL' },
      };
      design.machiningFeatures.push(feature);
      findPart(design, partAId).machiningFeatureIds.push(feature.id);
      machiningFeatureIds.push(feature.id);
    }
  }
  const joint: Joint = {
    id: jointId,
    type: 'SCREW',
    partAId,
    partBId,
    anchorA: anchorToPartLocal(design, partAId, anchors.a),
    anchorB: anchorToPartLocal(design, partBId, anchors.b),
    hardwareInstanceIds,
    machiningFeatureIds,
    parameters: { ...input, axis },
    metadata: { previewConfirmed: true, anchorSpace: 'PART_LOCAL' },
  };
  design.joints.push(joint);
  touchDesign(design);
  return joint;
}

export function createDowelJoint(
  design: DesignDocument,
  partAId: string,
  partBId: string,
  input: DowelJointInput,
): Joint {
  if (input.quantity < 1 || input.diameterMm <= 0)
    throw new Error('Parámetros de tarugo inválidos');
  const anchors = contactAnchors(design, partAId, partBId);
  const jointId = createId('joint');
  const axis = input.axis ?? anchors.axis;
  const definition = resolveHardwareDefinition(design, input.hardwareDefinitionId, () =>
    createHardwareDefinition({
      name: `Tarugo genérico ${input.diameterMm}x${input.lengthMm}`,
      category: 'DOWEL',
      dimensions: { diameterMm: input.diameterMm, lengthMm: input.lengthMm },
      colorHex: '#B58A63',
    }),
  );
  const hardwareInstanceIds: string[] = [];
  const machiningFeatureIds: string[] = [];
  for (const position of spacedPositions(
    anchors.a.position,
    input.quantity,
    input.spacingMm,
    input.startOffsetMm,
  )) {
    const hardwareLocal = localFeatureTransform(
      design,
      partAId,
      position,
      orientationFromAxis(axis),
    );
    const hardware = createHardwareInstance(definition.id, [partAId, partBId], {
      position: hardwareLocal.position,
      orientation: hardwareLocal.rotation,
      parameters: { diameterMm: input.diameterMm, lengthMm: input.lengthMm },
      jointId,
      metadata: { coordinateSpace: 'PART_LOCAL', referencePartId: partAId },
    });
    design.hardwareInstances.push(hardware);
    hardwareInstanceIds.push(hardware.id);
    for (const [partId, depthMm] of [
      [partAId, input.depthAMm],
      [partBId, input.depthBMm],
    ] as const) {
      const featureLocal = localFeatureTransform(
        design,
        partId,
        position,
        orientationFromAxis(axis),
      );
      const feature: MachiningFeature = {
        id: createId('machining'),
        partId,
        type: 'BORE',
        position: featureLocal.position,
        orientation: featureLocal.rotation,
        diameterMm: input.diameterMm,
        depthMm,
        parameters: { purpose: 'DOWEL' },
        jointId,
        metadata: { generatedBy: 'DOWEL', coordinateSpace: 'PART_LOCAL' },
      };
      design.machiningFeatures.push(feature);
      findPart(design, partId).machiningFeatureIds.push(feature.id);
      machiningFeatureIds.push(feature.id);
    }
  }
  const joint: Joint = {
    id: jointId,
    type: 'DOWEL',
    partAId,
    partBId,
    anchorA: anchorToPartLocal(design, partAId, anchors.a),
    anchorB: anchorToPartLocal(design, partBId, anchors.b),
    hardwareInstanceIds,
    machiningFeatureIds,
    parameters: { ...input, axis },
    metadata: { previewConfirmed: true, anchorSpace: 'PART_LOCAL' },
  };
  design.joints.push(joint);
  touchDesign(design);
  return joint;
}

export function createHingeJoint(
  design: DesignDocument,
  doorPartId: string,
  sidePartId: string,
  input: HingeJointInput,
): Joint {
  if (input.quantity < 1 || input.openingAngleDeg <= 0)
    throw new Error('Parámetros de bisagra inválidos');
  const door = findPart(design, doorPartId);
  const anchors = contactAnchors(design, doorPartId, sidePartId);
  const jointId = createId('joint');
  const hingeAxis = input.hingeAxis ?? { x: 0, y: 1, z: 0 };
  const definition = resolveHardwareDefinition(design, input.hardwareDefinitionId, () =>
    createHardwareDefinition({
      name: `Bisagra genérica ${input.cupDiameterMm} mm`,
      category: 'HINGE',
      dimensions: { cupDiameterMm: input.cupDiameterMm, cupDepthMm: input.cupDepthMm },
      mountingPattern: [
        {
          offset: { x: 0, y: 0, z: 0 },
          diameterMm: input.cupDiameterMm,
          depthMm: input.cupDepthMm,
          type: 'BORE',
        },
      ],
      kinematics: { type: 'REVOLUTE', axis: hingeAxis, maxAngleDeg: input.openingAngleDeg },
      colorHex: '#8A8A8A',
    }),
  );
  const doorWorld = getPartWorldTransform(design, doorPartId);
  const bottom = doorWorld.position.y - door.dimensions.heightMm / 2 + input.verticalOffsetMm;
  const spacing =
    input.quantity === 1
      ? 0
      : input.spacingMm ||
        Math.max(0, (door.dimensions.heightMm - 2 * input.verticalOffsetMm) / (input.quantity - 1));
  const hardwareInstanceIds: string[] = [];
  const machiningFeatureIds: string[] = [];
  for (let index = 0; index < input.quantity; index += 1) {
    const position = {
      x: anchors.a.position.x,
      y: bottom + index * spacing,
      z: anchors.a.position.z,
    };
    const hardwareLocal = localFeatureTransform(
      design,
      doorPartId,
      position,
      orientationFromAxis(hingeAxis),
    );
    const hardware = createHardwareInstance(definition.id, [doorPartId, sidePartId], {
      position: hardwareLocal.position,
      orientation: hardwareLocal.rotation,
      parameters: { openingAngleDeg: input.openingAngleDeg },
      jointId,
      metadata: { coordinateSpace: 'PART_LOCAL', referencePartId: doorPartId },
    });
    design.hardwareInstances.push(hardware);
    hardwareInstanceIds.push(hardware.id);
    const cupLocal = localFeatureTransform(
      design,
      doorPartId,
      position,
      orientationFromAxis(anchors.axis),
    );
    const plateLocal = localFeatureTransform(
      design,
      sidePartId,
      position,
      orientationFromAxis(anchors.axis),
    );
    const cup: MachiningFeature = {
      id: createId('machining'),
      partId: doorPartId,
      type: 'BORE',
      position: cupLocal.position,
      orientation: cupLocal.rotation,
      diameterMm: input.cupDiameterMm,
      depthMm: input.cupDepthMm,
      parameters: { purpose: 'HINGE_CUP' },
      jointId,
      metadata: { generatedBy: 'HINGE', coordinateSpace: 'PART_LOCAL' },
    };
    const plate: MachiningFeature = {
      id: createId('machining'),
      partId: sidePartId,
      type: 'BORE',
      position: plateLocal.position,
      orientation: plateLocal.rotation,
      diameterMm: input.mountingHoleDiameterMm,
      depthMm: Math.min(10, findPart(design, sidePartId).dimensions.thicknessMm),
      parameters: { purpose: 'HINGE_PLATE' },
      jointId,
      metadata: { generatedBy: 'HINGE', coordinateSpace: 'PART_LOCAL' },
    };
    design.machiningFeatures.push(cup, plate);
    findPart(design, doorPartId).machiningFeatureIds.push(cup.id);
    findPart(design, sidePartId).machiningFeatureIds.push(plate.id);
    machiningFeatureIds.push(cup.id, plate.id);
  }
  const pivotWorld = {
    x: doorWorld.position.x - door.dimensions.widthMm / 2,
    y: doorWorld.position.y,
    z: doorWorld.position.z,
  };
  const pivotLocal = worldToLocal(doorWorld, pivotWorld);
  const joint: Joint = {
    id: jointId,
    type: 'HINGE',
    partAId: doorPartId,
    partBId: sidePartId,
    anchorA: anchorToPartLocal(design, doorPartId, {
      kind: 'AXIS',
      position: pivotWorld,
      axis: hingeAxis,
    }),
    anchorB: anchorToPartLocal(design, sidePartId, anchors.b),
    hardwareInstanceIds,
    machiningFeatureIds,
    parameters: { ...input, hingeAxis },
    metadata: { previewConfirmed: true, anchorSpace: 'PART_LOCAL' },
  };
  design.joints.push(joint);
  design.kinematics.push({
    id: createId('kinematic'),
    type: 'REVOLUTE',
    movingEntityId: doorPartId,
    referenceEntityId: sidePartId,
    jointId,
    axis: hingeAxis,
    pivot: pivotLocal,
    minValue: 0,
    maxValue: input.openingAngleDeg,
    currentValue: 0,
    metadata: { unit: 'deg', pivotSpace: 'MOVING_LOCAL' },
  });
  touchDesign(design);
  return joint;
}

export function createDrawerSlideJoint(
  design: DesignDocument,
  drawerPartId: string,
  cabinetPartId: string,
  input: DrawerSlideInput,
): Joint {
  const anchors = contactAnchors(design, drawerPartId, cabinetPartId);
  const jointId = createId('joint');
  const axis = input.axis ?? { x: 0, y: 0, z: 1 };
  const definition = resolveHardwareDefinition(design, input.hardwareDefinitionId, () =>
    createHardwareDefinition({
      name: `Corredera genérica ${input.lengthMm}`,
      category: 'DRAWER_SLIDE',
      dimensions: { lengthMm: input.lengthMm, extensionDistanceMm: input.extensionDistanceMm },
      kinematics: { type: 'PRISMATIC', axis, maxDistanceMm: input.extensionDistanceMm },
      colorHex: '#777777',
    }),
  );
  const hardwareLocal = localFeatureTransform(
    design,
    drawerPartId,
    anchors.a.position,
    orientationFromAxis(axis),
  );
  const hardware = createHardwareInstance(definition.id, [drawerPartId, cabinetPartId], {
    position: hardwareLocal.position,
    orientation: hardwareLocal.rotation,
    parameters: { lengthMm: input.lengthMm, clearanceMm: input.clearanceMm },
    jointId,
    metadata: { coordinateSpace: 'PART_LOCAL', referencePartId: drawerPartId },
  });
  design.hardwareInstances.push(hardware);
  const joint: Joint = {
    id: jointId,
    type: 'DRAWER_SLIDE',
    partAId: drawerPartId,
    partBId: cabinetPartId,
    anchorA: anchorToPartLocal(design, drawerPartId, anchors.a),
    anchorB: anchorToPartLocal(design, cabinetPartId, anchors.b),
    hardwareInstanceIds: [hardware.id],
    machiningFeatureIds: [],
    parameters: { ...input, axis },
    metadata: { previewConfirmed: true, anchorSpace: 'PART_LOCAL' },
  };
  design.joints.push(joint);
  design.kinematics.push({
    id: createId('kinematic'),
    type: 'PRISMATIC',
    movingEntityId: drawerPartId,
    referenceEntityId: cabinetPartId,
    jointId,
    axis,
    pivot: anchorToPartLocal(design, drawerPartId, anchors.a).position,
    minValue: 0,
    maxValue: input.extensionDistanceMm,
    currentValue: 0,
    metadata: { unit: 'mm' },
  });
  touchDesign(design);
  return joint;
}

export function suggestJointTypes(
  design: DesignDocument,
  partAId: string,
  partBId: string,
): string[] {
  const roles = [findPart(design, partAId).semanticRole, findPart(design, partBId).semanticRole];
  if (
    roles.includes('DOOR') &&
    roles.some((role) => role === 'LEFT_SIDE' || role === 'RIGHT_SIDE' || role === 'GENERIC_PANEL')
  )
    return ['HINGE', 'SCREW'];
  if (roles.includes('SHELF')) return ['SHELF_SUPPORT', 'SCREW', 'DOWEL'];
  return ['SCREW', 'DOWEL', 'BRACKET'];
}
