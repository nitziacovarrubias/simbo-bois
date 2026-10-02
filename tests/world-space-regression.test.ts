import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssembly,
  createEmptyDesign,
  createPanel,
  getAssemblyWorldTransform,
  getHardwareWorldTransform,
  getMachiningFeatureWorldTransform,
  getPartWorldTransform,
  type Assembly,
  type CameraState,
  type DesignDocument,
  type ModuleDefinition,
  type ModuleVersion,
  type Part
} from '../packages/design-domain/src/index.ts';
import {
  alignParts,
  applySnap,
  defaultInferenceSettings,
  distributeParts,
  fitAllCamera,
  focusCamera,
  infer,
  snapFaceToFace
} from '../packages/editor-engine/src/index.ts';
import {
  designGeometry,
  intersectsAabb,
  partLocalAabb,
  partWorldAabb
} from '../packages/geometry-engine/src/index.ts';
import { createScrewJoint } from '../packages/joinery-engine/src/index.ts';
import { instantiateModule } from '../packages/module-engine/src/index.ts';
import { boundaryIssues, collisionIssues } from '../packages/validation-engine/src/index.ts';

function attachAssembly(design: DesignDocument, assembly: Assembly): void {
  design.assemblies.push(assembly);
  design.assemblies.find(candidate => candidate.id === design.rootAssemblyId)!.children.push({ kind: 'ASSEMBLY', id: assembly.id });
}

function panel(design: DesignDocument, name: string, x = 0): Part {
  const part = createPanel({
    name,
    materialId: design.materials[0]!.id,
    dimensions: { widthMm: 100, heightMm: 100, thicknessMm: 20 },
    transform: { position: { x, y: 100, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
  });
  design.parts.push(part);
  return part;
}

const camera: CameraState = {
  projection: 'PERSPECTIVE',
  position: { x: 5000, y: 3000, z: 5000 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fov: 45,
  orthoScale: 5000
};

test('partLocalAabb and partWorldAabb keep local/world coordinate spaces explicit', () => {
  const design = createEmptyDesign('AABB spaces');
  const part = panel(design, 'Nested', 10);
  const assembly = createAssembly('Parent', [{ kind: 'PART', id: part.id }]);
  assembly.transform.position.x = 1000;
  attachAssembly(design, assembly);

  const local = partLocalAabb(part);
  const world = partWorldAabb(design, part);
  assert.equal((local.min.x + local.max.x) / 2, 10);
  assert.equal((world.min.x + world.max.x) / 2, 1010);
});

test('designGeometry exposes the effective viewport transform: Part X=10 + Assembly X=1000 => X=1010', () => {
  const design = createEmptyDesign('Viewport transform');
  const part = panel(design, 'Viewport part', 10);
  const assembly = createAssembly('Viewport parent', [{ kind: 'PART', id: part.id }]);
  assembly.transform.position.x = 1000;
  attachAssembly(design, assembly);

  const descriptor = designGeometry(design).find(item => item.entityId === part.id)!;
  assert.equal(part.transform.position.x, 10);
  assert.equal(descriptor.transform.position.x, 1010);
});

test('alignParts uses world AABBs and persists the result back as local transforms', () => {
  const design = createEmptyDesign('Align world');
  const a = panel(design, 'A', 10);
  const b = panel(design, 'B', 200);
  const assemblyA = createAssembly('A parent', [{ kind: 'PART', id: a.id }]);
  assemblyA.transform.position.x = 1000;
  const assemblyB = createAssembly('B parent', [{ kind: 'PART', id: b.id }]);
  assemblyB.transform.position.x = 2000;
  attachAssembly(design, assemblyA);
  attachAssembly(design, assemblyB);

  assert.doesNotThrow(() => alignParts(design, [a.id, b.id], 'x', 'CENTER'));
  const worldA = getPartWorldTransform(design, a.id);
  const worldB = getPartWorldTransform(design, b.id);
  assert.ok(Math.abs(worldA.position.x - worldB.position.x) < 1e-9);
  assert.notEqual(a.transform.position.x, worldA.position.x);
  assert.notEqual(b.transform.position.x, worldB.position.x);
});

test('fitAllCamera uses world AABBs and no Array.map callback can be misread as DesignDocument', () => {
  const design = createEmptyDesign('Fit world');
  const a = panel(design, 'A', 10);
  const b = panel(design, 'B', 200);
  const assemblyA = createAssembly('A parent', [{ kind: 'PART', id: a.id }]);
  assemblyA.transform.position.x = 1000;
  const assemblyB = createAssembly('B parent', [{ kind: 'PART', id: b.id }]);
  assemblyB.transform.position.x = 2000;
  attachAssembly(design, assemblyA);
  attachAssembly(design, assemblyB);

  const fitted = fitAllCamera(camera, design, [a, b]);
  assert.equal(fitted.target.x, 1605);
  assert.equal(fitted.target.y, 100);
});

test('hardware and machining overlays have world transforms that follow Assembly rotation', () => {
  const design = createEmptyDesign('Hardware world');
  const a = panel(design, 'A', 0);
  const b = panel(design, 'B', 200);
  const assembly = createAssembly('Hardware parent', [
    { kind: 'PART', id: a.id },
    { kind: 'PART', id: b.id }
  ]);
  assembly.transform.position.x = 1000;
  attachAssembly(design, assembly);

  const joint = createScrewJoint(design, a.id, b.id, {
    diameterMm: 4,
    lengthMm: 50,
    quantity: 1,
    spacingMm: 0,
    startOffsetMm: 0,
    head: 'COUNTERSUNK',
    orientation: 'AUTO',
    generatePilotHole: true
  });
  const hardwareId = joint.hardwareInstanceIds[0]!;
  const machiningId = joint.machiningFeatureIds[0]!;
  const beforeHardware = getHardwareWorldTransform(design, hardwareId);
  const beforeMachining = getMachiningFeatureWorldTransform(design, machiningId);
  const origin = getAssemblyWorldTransform(design, assembly.id).position;

  assembly.transform.rotation.z = Math.PI / 2;
  const afterHardware = getHardwareWorldTransform(design, hardwareId);
  const afterMachining = getMachiningFeatureWorldTransform(design, machiningId);

  const expectedHardwareX = origin.x - (beforeHardware.position.y - origin.y);
  const expectedHardwareY = origin.y + (beforeHardware.position.x - origin.x);
  const expectedMachiningX = origin.x - (beforeMachining.position.y - origin.y);
  const expectedMachiningY = origin.y + (beforeMachining.position.x - origin.x);
  assert.ok(Math.abs(afterHardware.position.x - expectedHardwareX) < 1e-6);
  assert.ok(Math.abs(afterHardware.position.y - expectedHardwareY) < 1e-6);
  assert.ok(Math.abs(afterMachining.position.x - expectedMachiningX) < 1e-6);
  assert.ok(Math.abs(afterMachining.position.y - expectedMachiningY) < 1e-6);
});

test('boundaryIssues reports OUTSIDE_ROOM when only the parent Assembly moves the Part outside', () => {
  const design = createEmptyDesign('Boundary world');
  design.room.widthMm = 1000;
  design.room.depthMm = 1000;
  design.room.heightMm = 1000;
  const part = panel(design, 'Inside local', 0);
  const assembly = createAssembly('Outside parent', [{ kind: 'PART', id: part.id }]);
  assembly.transform.position.x = 2000;
  attachAssembly(design, assembly);

  assert.ok(boundaryIssues(design).some(issue => issue.code === 'OUTSIDE_ROOM' && issue.entityId === part.id));
});

test('collisionIssues detects collision between Parts in different transformed Assemblies', () => {
  const design = createEmptyDesign('Collision world');
  const a = panel(design, 'A', 0);
  const b = panel(design, 'B', 5000);
  const assemblyA = createAssembly('A parent', [{ kind: 'PART', id: a.id }]);
  assemblyA.transform.position.x = 1000;
  const assemblyB = createAssembly('B parent', [{ kind: 'PART', id: b.id }]);
  assemblyB.transform.position.x = -4000;
  attachAssembly(design, assemblyA);
  attachAssembly(design, assemblyB);

  assert.ok(collisionIssues(design).some(issue => issue.code === 'COLLISION'));
});

test('inference, face snap, distribute and focus operate in world space for nested Parts', () => {
  const design = createEmptyDesign('CAD world tools');
  const a = panel(design, 'A', 0);
  const b = panel(design, 'B', 0);
  const c = panel(design, 'C', 0);
  const assemblyA = createAssembly('A parent', [{ kind: 'PART', id: a.id }]);
  assemblyA.transform.position.x = 0;
  const assemblyB = createAssembly('B parent', [{ kind: 'PART', id: b.id }]);
  assemblyB.transform.position.x = 1000;
  const assemblyC = createAssembly('C parent', [{ kind: 'PART', id: c.id }]);
  assemblyC.transform.position.x = 3000;
  attachAssembly(design, assemblyA);
  attachAssembly(design, assemblyB);
  attachAssembly(design, assemblyC);

  const settings = defaultInferenceSettings();
  settings.toleranceMm = 1;
  const candidates = infer(design, { x: 1000, y: 100, z: 0 }, settings);
  const center = candidates.find(candidate => candidate.kind === 'CENTER' && candidate.entityId === b.id)!;
  assert.equal(center.point.x, 1000);

  distributeParts(design, [a.id, b.id, c.id], 'x');
  assert.equal(getPartWorldTransform(design, b.id).position.x, 1500);
  assert.equal(b.transform.position.x, 500);

  const snap = snapFaceToFace(design, a, c, 'RIGHT', 'LEFT');
  applySnap(design, a.id, snap);
  assert.equal(getPartWorldTransform(design, a.id).position.x, 2900);
  assert.equal(a.transform.position.x, 2900);

  const focused = focusCamera(camera, partWorldAabb(design, b));
  assert.equal(focused.target.x, 1500);
});

test('intersectsAabb applies an explicit CAD tolerance and rejects invalid tolerances', () => {
  const a = { min: { x: -1, y: -1, z: -1 }, max: { x: 0, y: 1, z: 1 } };
  const b = { min: { x: 0.5, y: -1, z: -1 }, max: { x: 1.5, y: 1, z: 1 } };
  assert.equal(intersectsAabb(a, b, 0.4), false);
  assert.equal(intersectsAabb(a, b, 0.5), true);
  assert.doesNotThrow(() => intersectsAabb(a, b, 0));
});


test('seed-shaped ModuleSnapshot includes every current collection and can be instantiated', () => {
  const design = createEmptyDesign('Seed snapshot');
  const definition: ModuleDefinition = {
    id: 'demo-module-definition',
    name: 'Módulo demostrativo data-driven',
    description: 'DEMO / ASSUMPTION',
    parameterDefinitions: [],
    snapDefinitions: [],
    origin: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    versionIds: ['demo-module-v1'],
    currentVersionId: 'demo-module-v1',
    tags: ['DEMO'],
    metadata: { demo: true }
  };
  const version: ModuleVersion = {
    id: 'demo-module-v1',
    definitionId: definition.id,
    version: 1,
    createdAt: '2026-09-05T00:00:00.000Z',
    immutable: true,
    snapshot: {
      rootAssemblyId: 'demo-root',
      parts: [],
      assemblies: [{
        id: 'demo-root',
        name: 'Módulo demostrativo raíz',
        children: [],
        transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        metadata: { demo: true }
      }],
      constraints: [],
      bindings: [],
      joints: [],
      hardwareDefinitions: [],
      hardwareInstances: [],
      machiningFeatures: [],
      kinematics: [],
      materials: [],
      snapDefinitions: [],
      parameterBindings: []
    }
  };
  design.moduleDefinitions.push(definition);
  design.moduleVersions.push(version);
  const instance = instantiateModule(design, definition.id, { position: { x: 250, y: 0, z: 0 } });
  assert.equal(instance.definitionId, definition.id);
  assert.ok(design.assemblies.some(assembly => assembly.id === instance.rootAssemblyId));
});
