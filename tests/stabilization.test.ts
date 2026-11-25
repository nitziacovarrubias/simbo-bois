import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAssembly,
  createEmptyDesign,
  createPanel,
  getAssemblyWorldTransform,
  getHardwareWorldTransform,
  getMachiningFeatureWorldTransform,
  getPartWorldTransform,
  getWorldTransform,
  type Binding,
  type Constraint,
} from '../packages/design-domain/src/index.ts';
import { designGeometry } from '../packages/geometry-engine/src/index.ts';
import { ToolManager } from '../packages/editor-engine/src/index.ts';
import {
  createModuleDefinitionFromAssembly,
  installPortableModule,
  instantiateModule,
} from '../packages/module-engine/src/index.ts';
import { createScrewJoint, createHingeJoint } from '../packages/joinery-engine/src/index.ts';
import { collectManufacturingData } from '../packages/manufacturing-engine/src/index.ts';
import { animatedTransform } from '../packages/kinematics-engine/src/index.ts';

function attachAssembly(
  design: ReturnType<typeof createEmptyDesign>,
  assembly: ReturnType<typeof createAssembly>,
) {
  design.assemblies.push(assembly);
  design.assemblies
    .find((a) => a.id === design.rootAssemblyId)!
    .children.push({ kind: 'ASSEMBLY', id: assembly.id });
}

test('transform hierarchy composes Design -> Assembly -> Assembly -> Part', () => {
  const design = createEmptyDesign('Hierarchy');
  const part = createPanel({
    name: 'Panel',
    materialId: design.materials[0]!.id,
    transform: { position: { x: 25, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  design.parts.push(part);
  const child = createAssembly('Child', [{ kind: 'PART', id: part.id }]);
  child.transform.position.x = 100;
  const parent = createAssembly('Parent', [{ kind: 'ASSEMBLY', id: child.id }]);
  parent.transform.position.x = 1000;
  design.assemblies.push(child, parent);
  design.assemblies
    .find((a) => a.id === design.rootAssemblyId)!
    .children.push({ kind: 'ASSEMBLY', id: parent.id });
  assert.equal(getPartWorldTransform(design, part.id).position.x, 1125);
  assert.equal(getAssemblyWorldTransform(design, child.id).position.x, 1100);
  const descriptor = designGeometry(design).find((item) => item.entityId === part.id)!;
  assert.equal(descriptor.transform.position.x, 1125);
  assert.equal(part.transform.position.x, 25);
});

test('rotating an Assembly rotates descendants around its local origin', () => {
  const design = createEmptyDesign('Rotation');
  const part = createPanel({
    name: 'Panel',
    materialId: design.materials[0]!.id,
    transform: { position: { x: 100, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  design.parts.push(part);
  const assembly = createAssembly('Rotated', [{ kind: 'PART', id: part.id }]);
  assembly.transform.rotation.z = Math.PI / 2;
  attachAssembly(design, assembly);
  const world = getPartWorldTransform(design, part.id);
  assert.ok(Math.abs(world.position.x) < 1e-6);
  assert.ok(Math.abs(world.position.y - 100) < 1e-6);
});

test('ToolManager previews, cancels and commits Assembly transforms as one operation', () => {
  const design = createEmptyDesign('Tools');
  const part = createPanel({ name: 'Panel', materialId: design.materials[0]!.id });
  design.parts.push(part);
  const assembly = createAssembly('Move me', [{ kind: 'PART', id: part.id }]);
  attachAssembly(design, assembly);
  const manager = new ToolManager();
  manager.beginMoveEntity(design, assembly.id, { x: 0, y: 0, z: 0 }, 'x');
  manager.exactMove(500);
  assert.equal(getPartWorldTransform(design, part.id).position.x, 0);
  manager.cancel();
  assert.equal(getAssemblyWorldTransform(design, assembly.id).position.x, 0);
  manager.beginMoveEntity(design, assembly.id, { x: 0, y: 0, z: 0 }, 'x');
  manager.exactMove(500);
  const moved = manager.commit(design);
  assert.equal(getAssemblyWorldTransform(moved, assembly.id).position.x, 500);
  assert.equal(getPartWorldTransform(moved, part.id).position.x, 500);
  assert.equal(getAssemblyWorldTransform(design, assembly.id).position.x, 0);
});

test('ModuleSnapshot is portable with screws, hardware definitions, machining and material dependencies', () => {
  const source = createEmptyDesign('Source');
  const a = createPanel({ name: 'A', materialId: source.materials[0]!.id });
  const b = createPanel({
    name: 'B',
    materialId: source.materials[0]!.id,
    transform: { position: { x: 100, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  source.parts.push(a, b);
  const group = createAssembly('Portable', [
    { kind: 'PART', id: a.id },
    { kind: 'PART', id: b.id },
  ]);
  attachAssembly(source, group);
  createScrewJoint(source, a.id, b.id, {
    diameterMm: 4,
    lengthMm: 50,
    quantity: 2,
    spacingMm: 80,
    startOffsetMm: 0,
    head: 'COUNTERSUNK',
    orientation: 'AUTO',
  });
  const { definition, version } = createModuleDefinitionFromAssembly(source, group.id, {
    name: 'Portable screws',
  });
  assert.equal(version.snapshot.hardwareDefinitions.length, 1);
  assert.equal(version.snapshot.hardwareInstances.length, 2);
  assert.equal(version.snapshot.machiningFeatures.length, 2);
  assert.equal(version.snapshot.materials.length, 1);
  const target = createEmptyDesign('Target');
  installPortableModule(target, structuredClone(definition), structuredClone(version));
  const instance = instantiateModule(target, definition.id, { position: { x: 1000, y: 0, z: 0 } });
  const data = collectManufacturingData(target);
  assert.equal(
    data.hardware.reduce((sum, item) => sum + item.quantity, 0),
    2,
  );
  assert.equal(target.hardwareDefinitions.length, 1);
  assert.equal(target.machiningFeatures.length, 2);
  const instanceParts = target.parts.filter((part) => part.metadata.sourceModuleEntityId);
  assert.ok(
    instanceParts.some((part) => getPartWorldTransform(target, part.id).position.x >= 1000),
  );
  assert.equal(getWorldTransform(target, instance.id).position.x, 1000);
  const hardwareId = target.hardwareInstances[0]!.id;
  const machiningId = target.machiningFeatures[0]!.id;
  const hardwareBefore = getHardwareWorldTransform(target, hardwareId).position.x;
  const machiningBefore = getMachiningFeatureWorldTransform(target, machiningId).position.x;
  const manager = new ToolManager();
  manager.beginMoveEntity(target, instance.id);
  const current = getWorldTransform(target, instance.id);
  manager.setPreview({
    ...current,
    position: { ...current.position, x: current.position.x + 400 },
  });
  const moved = manager.commit(target);
  assert.ok(
    Math.abs(getHardwareWorldTransform(moved, hardwareId).position.x - hardwareBefore - 400) < 1e-6,
  );
  assert.ok(
    Math.abs(
      getMachiningFeatureWorldTransform(moved, machiningId).position.x - machiningBefore - 400,
    ) < 1e-6,
  );

  const movedInstance = moved.moduleInstances.find((item) => item.id === instance.id)!;
  const instanceOrigin = getWorldTransform(moved, instance.id).position;
  const hardwareBeforeRotation = getHardwareWorldTransform(moved, hardwareId).position;
  const machiningBeforeRotation = getMachiningFeatureWorldTransform(moved, machiningId).position;
  movedInstance.transform.rotation.z = Math.PI / 2;
  const hardwareAfterRotation = getHardwareWorldTransform(moved, hardwareId).position;
  const machiningAfterRotation = getMachiningFeatureWorldTransform(moved, machiningId).position;
  assert.ok(
    Math.abs(
      hardwareAfterRotation.x - (instanceOrigin.x - (hardwareBeforeRotation.y - instanceOrigin.y)),
    ) < 1e-6,
  );
  assert.ok(
    Math.abs(
      hardwareAfterRotation.y - (instanceOrigin.y + (hardwareBeforeRotation.x - instanceOrigin.x)),
    ) < 1e-6,
  );
  assert.ok(
    Math.abs(
      machiningAfterRotation.x -
        (instanceOrigin.x - (machiningBeforeRotation.y - instanceOrigin.y)),
    ) < 1e-6,
  );
  assert.ok(
    Math.abs(
      machiningAfterRotation.y -
        (instanceOrigin.y + (machiningBeforeRotation.x - instanceOrigin.x)),
    ) < 1e-6,
  );
});

test('Module general bindings remap Reference AST paths and constraints solve after instantiation', () => {
  const source = createEmptyDesign('Bindings source');
  const a = createPanel({ name: 'A', materialId: source.materials[0]!.id });
  const b = createPanel({ name: 'B', materialId: source.materials[0]!.id });
  source.parts.push(a, b);
  const group = createAssembly('Binding module', [
    { kind: 'PART', id: a.id },
    { kind: 'PART', id: b.id },
  ]);
  attachAssembly(source, group);
  const binding: Binding = {
    id: 'binding-general',
    enabled: true,
    targetPath: `entities.${b.id}.dimensions.widthMm`,
    expression: {
      type: 'Add',
      left: { type: 'Reference', path: `entities.${a.id}.dimensions.widthMm` },
      right: { type: 'Literal', value: 25 },
    },
  };
  source.bindings.push(binding);
  const constraint: Constraint = {
    id: 'constraint-distance',
    type: 'DISTANCE',
    entityIds: [a.id, b.id],
    parameters: { axis: 'x', distanceMm: 250 },
    enabled: true,
  };
  source.constraints.push(constraint);
  const { definition, version } = createModuleDefinitionFromAssembly(source, group.id, {
    name: 'Bindings',
  });
  assert.equal(version.snapshot.bindings.length, 1);
  assert.equal(version.snapshot.constraints.length, 1);
  const target = createEmptyDesign('Target');
  installPortableModule(target, structuredClone(definition), structuredClone(version));
  const instance = instantiateModule(target, definition.id);
  const clonedA = target.parts.find((part) => part.metadata.sourceModuleEntityId === a.id)!;
  const clonedB = target.parts.find((part) => part.metadata.sourceModuleEntityId === b.id)!;
  const installedBinding = target.bindings.find((item) => item.targetPath.includes(clonedB.id))!;
  assert.ok(JSON.stringify(installedBinding.expression).includes(clonedA.id));
  assert.equal(clonedB.dimensions.widthMm, clonedA.dimensions.widthMm + 25);
  assert.ok(
    Math.abs(
      getPartWorldTransform(target, clonedB.id).position.x -
        getPartWorldTransform(target, clonedA.id).position.x -
        250,
    ) < 1e-6,
  );
  assert.equal(target.moduleInstances[0]!.id, instance.id);
});

test('portable hinge carries hardware + kinematics and animates in a fresh DesignDocument', () => {
  const source = createEmptyDesign('Hinge source');
  const door = createPanel({
    name: 'Door',
    semanticRole: 'DOOR',
    materialId: source.materials[0]!.id,
    dimensions: { widthMm: 500, heightMm: 700, thicknessMm: 18 },
  });
  const side = createPanel({
    name: 'Side',
    semanticRole: 'LEFT_SIDE',
    materialId: source.materials[0]!.id,
    transform: { position: { x: -250, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  source.parts.push(door, side);
  const group = createAssembly('Hinge module', [
    { kind: 'PART', id: door.id },
    { kind: 'PART', id: side.id },
  ]);
  attachAssembly(source, group);
  createHingeJoint(source, door.id, side.id, {
    quantity: 2,
    verticalOffsetMm: 100,
    spacingMm: 500,
    openingAngleDeg: 105,
    cupDiameterMm: 35,
    cupDepthMm: 12,
    mountingHoleDiameterMm: 5,
  });
  const { definition, version } = createModuleDefinitionFromAssembly(source, group.id, {
    name: 'Portable hinge',
  });
  assert.equal(version.snapshot.kinematics.length, 1);
  const target = createEmptyDesign('Fresh');
  installPortableModule(target, structuredClone(definition), structuredClone(version));
  instantiateModule(target, definition.id, { position: { x: 300, y: 0, z: 0 } });
  assert.equal(target.hardwareDefinitions.length, 1);
  assert.equal(target.hardwareInstances.length, 2);
  assert.equal(target.kinematics.length, 1);
  const relation = target.kinematics[0]!;
  const closed = animatedTransform(target, relation, 0);
  const opened = animatedTransform(target, relation, 90);
  assert.notDeepEqual(opened.rotation, closed.rotation);
});

test('ModuleInstance transform is a real parent transform and can rotate/move as a unit', () => {
  const source = createEmptyDesign('Instance transform source');
  const part = createPanel({
    name: 'Offset Part',
    materialId: source.materials[0]!.id,
    transform: { position: { x: 100, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  source.parts.push(part);
  const group = createAssembly('Instance Root', [{ kind: 'PART', id: part.id }]);
  source.assemblies.push(group);
  source.assemblies[0]!.children.push({ kind: 'ASSEMBLY', id: group.id });
  const { definition } = createModuleDefinitionFromAssembly(source, group.id, {
    name: 'Instance Transform Module',
  });
  const instance = instantiateModule(source, definition.id, {
    position: { x: 500, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: Math.PI / 2 },
  });
  const cloned = source.parts.find((value) => value.metadata.sourceModuleEntityId === part.id)!;
  const world = getPartWorldTransform(source, cloned.id);
  assert.ok(Math.abs(world.position.x - 500) < 1e-6);
  assert.ok(Math.abs(world.position.y - 100) < 1e-6);
  assert.equal(cloned.transform.position.x, 100);
  const manager = new ToolManager();
  manager.beginMoveEntity(source, instance.id);
  const current = getWorldTransform(source, instance.id);
  manager.setPreview({ ...current, position: { x: 900, y: 0, z: 0 } });
  const moved = manager.commit(source);
  const movedPart = moved.parts.find((value) => value.metadata.sourceModuleEntityId === part.id)!;
  assert.ok(Math.abs(getPartWorldTransform(moved, movedPart.id).position.x - 900) < 1e-6);
  assert.ok(Math.abs(getPartWorldTransform(moved, movedPart.id).position.y - 100) < 1e-6);
});
