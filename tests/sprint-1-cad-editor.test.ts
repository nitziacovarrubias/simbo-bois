import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAssemblyToAssembly,
  addPartToAssembly,
  createAssembly,
  createEmptyDesign,
  createPanel,
  getAssemblyWorldTransform,
  getPartWorldTransform,
  type SnapDefinition,
} from '../packages/design-domain/src/index.ts';
import {
  MeasurementsBuffer,
  SnapEngine,
  ToolManager,
  captureScene,
  createScene,
  defaultInferenceSettings,
  duplicateArray,
  infer,
  measurePartsWorld,
  parseMeasurement,
  parseRelativeCoordinates,
  resolveSnapDefinitionWorld,
  selectByScreenRectangle,
  snapDefinitionToDefinition,
  synchronizeCameraState,
} from '../packages/editor-engine/src/index.ts';

function nestedPart() {
  const design = createEmptyDesign('nested');
  const part = createPanel({
    name: 'Nested',
    materialId: design.materials[0]!.id,
    transform: { position: { x: 10, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  design.parts.push(part);
  const assembly = createAssembly('Parent', [{ kind: 'PART', id: part.id }]);
  assembly.transform.position.x = 1000;
  addAssemblyToAssembly(design, assembly);
  return { design, part, assembly };
}

test('Move begin -> preview -> cancel leaves DesignDocument untouched', () => {
  const { design, part } = nestedPart();
  const manager = new ToolManager();
  const before = JSON.stringify(design);
  manager.beginMovePickReference(design, part.id);
  manager.pickMoveReferenceWorld({ x: 1010, y: 0, z: 0 });
  manager.updateMove({ x: 1210, y: 0, z: 0 });
  assert.equal(manager.preview()!.position.x, 1210);
  manager.cancel();
  assert.equal(JSON.stringify(design), before);
  assert.equal(getPartWorldTransform(design, part.id).position.x, 1010);
});

test('Move exact distance commits once and converts world back to local for nested Part', () => {
  const { design, part, assembly } = nestedPart();
  const manager = new ToolManager();
  manager.beginMoveEntity(design, part.id, { x: 0, y: 0, z: 0 }, 'x');
  manager.exactMove('500mm');
  const moved = manager.commit(design);
  assert.equal(getPartWorldTransform(moved, part.id).position.x, 1510);
  assert.equal(moved.parts.find((value) => value.id === part.id)!.transform.position.x, 510);
  assert.equal(getAssemblyWorldTransform(moved, assembly.id).position.x, 1000);
  assert.equal(getPartWorldTransform(design, part.id).position.x, 1010);
});

test('Move reference point is point-to-point, not center-only', () => {
  const design = createEmptyDesign('reference');
  const part = createPanel({
    materialId: design.materials[0]!.id,
    transform: { position: { x: 100, y: 100, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  addPartToAssembly(design, part);
  const manager = new ToolManager();
  manager.beginMovePickReference(design, part.id);
  manager.pickMoveReferenceWorld({ x: 450, y: 350, z: 9 });
  manager.updateMove({ x: 1000, y: 500, z: 9 });
  const moved = manager.commit(design);
  const world = getPartWorldTransform(moved, part.id);
  assert.equal(world.position.x, 650);
  assert.equal(world.position.y, 250);
});

test('axis lock constrains preview and exact input uses locked axis', () => {
  const design = createEmptyDesign('axis');
  const part = createPanel({ materialId: design.materials[0]!.id });
  addPartToAssembly(design, part);
  const manager = new ToolManager();
  manager.beginMoveEntity(design, part.id, { x: 0, y: 0, z: 0 }, 'z');
  manager.updateMove({ x: 50, y: 80, z: 120 });
  assert.deepEqual(manager.preview()!.position, { x: 0, y: 0, z: 120 });
  manager.exactMove('50cm');
  assert.deepEqual(manager.preview()!.position, { x: 0, y: 0, z: 500 });
});

test('global numeric parsing supports mm/cm/m, degrees and coordinates', () => {
  assert.equal(parseMeasurement('500', 'LENGTH').value, 500);
  assert.equal(parseMeasurement('500mm', 'LENGTH').value, 500);
  assert.equal(parseMeasurement('50cm', 'LENGTH').value, 500);
  assert.equal(parseMeasurement('0.5m', 'LENGTH').value, 500);
  assert.equal(parseMeasurement('45deg', 'ANGLE').value, 45);
  assert.deepEqual(parseRelativeCoordinates('<500,0,200>'), { x: 500, y: 0, z: 200 });
  const buffer = new MeasurementsBuffer();
  for (const key of '50cm') buffer.feedKey(key);
  assert.equal(buffer.snapshot('LENGTH').normalized, '500 mm');
});

test('Rotate exact 90 degrees uses world transform and persists local rotation', () => {
  const { design, part } = nestedPart();
  const manager = new ToolManager();
  manager.beginRotateEntity(design, part.id, 15);
  manager.pickRotatePivot({ x: 1010, y: 0, z: 0 });
  manager.pickRotateReference({ x: 1110, y: 0, z: 0 });
  manager.exactRotate('90deg', 'y');
  const rotated = manager.commit(design);
  assert.ok(Math.abs(getPartWorldTransform(rotated, part.id).rotation.y - Math.PI / 2) < 1e-9);
});

test('Move copy mode creates a new domain Part and leaves source unchanged', () => {
  const design = createEmptyDesign('copy');
  const part = createPanel({ name: 'Shelf', materialId: design.materials[0]!.id });
  addPartToAssembly(design, part);
  const manager = new ToolManager();
  manager.beginMoveEntity(design, part.id, { x: 0, y: 0, z: 0 }, 'y', true);
  manager.exactMove(300);
  const copied = manager.commit(design);
  assert.equal(copied.parts.length, 2);
  assert.equal(getPartWorldTransform(copied, part.id).position.y, 0);
  const newPart = copied.parts.find((value) => value.id !== part.id)!;
  assert.equal(getPartWorldTransform(copied, newPart.id).position.y, 300);
  assert.equal(manager.lastCommittedEntityId, newPart.id);
});

test('duplicateArray uses world spacing even for a nested Part', () => {
  const { design, part } = nestedPart();
  const ids = duplicateArray(design, part.id, 2, 300, 'y');
  assert.equal(getPartWorldTransform(design, ids[0]!).position.y, 300);
  assert.equal(getPartWorldTransform(design, ids[1]!).position.y, 600);
  assert.equal(design.parts.find((value) => value.id === ids[0])!.transform.position.x, 10);
});

test('inference priority prefers endpoint over face at equal cursor distance', () => {
  const design = createEmptyDesign('inference priority');
  const part = createPanel({
    materialId: design.materials[0]!.id,
    dimensions: { widthMm: 100, heightMm: 100, thicknessMm: 20 },
  });
  addPartToAssembly(design, part);
  const settings = defaultInferenceSettings();
  settings.toleranceMm = 500;
  const candidates = infer(design, { x: 50, y: 50, z: 10 }, settings);
  assert.equal(candidates[0]!.kind, 'ENDPOINT');
});

test('custom SnapDefinitions move and orient without RIGHT -> LEFT hardcoding', () => {
  const design = createEmptyDesign('custom snaps');
  const moving = createPanel({ materialId: design.materials[0]!.id });
  const target = createPanel({
    materialId: design.materials[0]!.id,
    transform: { position: { x: 1000, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  addPartToAssembly(design, moving);
  addPartToAssembly(design, target);
  const source: SnapDefinition = {
    id: 'source',
    name: 'Trasera',
    entityId: moving.id,
    position: { x: 20, y: 0, z: 0 },
    compatibleTypes: ['WALL'],
    metadata: {},
  };
  const destination: SnapDefinition = {
    id: 'target',
    name: 'Pared',
    entityId: target.id,
    position: { x: -20, y: 0, z: 0 },
    orientation: { x: 0, y: Math.PI / 2, z: 0 },
    compatibleTypes: ['WALL'],
    metadata: {},
  };
  const sourceWorld = resolveSnapDefinitionWorld(design, moving.id, source);
  const targetWorld = resolveSnapDefinitionWorld(design, target.id, destination);
  const snap = snapDefinitionToDefinition(design, moving.id, sourceWorld, targetWorld);
  assert.equal(snap.position.x, 960);
  assert.equal(snap.rotation!.y, Math.PI / 2);
});

test('camera synchronization captures the real orbit pose into Scene', () => {
  const design = createEmptyDesign('camera');
  const base = synchronizeCameraState(
    {
      projection: 'PERSPECTIVE',
      position: { x: 1, y: 2, z: 3 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fov: 45,
      orthoScale: 5000,
    },
    { position: { x: 1234, y: 2345, z: 3456 }, target: { x: 111, y: 222, z: 333 } },
  );
  const scene = createScene('Orbitada', base, 'SHADED', design);
  design.scenes.push(scene);
  const later = synchronizeCameraState(base, {
    position: { x: 777, y: 888, z: 999 },
    target: { x: 10, y: 20, z: 30 },
  });
  captureScene(design, scene.id, later, 'HIDDEN_LINE');
  assert.deepEqual(design.scenes[0]!.camera.position, { x: 777, y: 888, z: 999 });
  assert.deepEqual(design.scenes[0]!.camera.target, { x: 10, y: 20, z: 30 });
  assert.equal(design.scenes[0]!.displayMode, 'HIDDEN_LINE');
});

test('selection window contains only fully enclosed bounds; crossing selects touched bounds', () => {
  const candidates = [
    { id: 'a', bounds: { left: 20, top: 20, right: 40, bottom: 40 } },
    { id: 'b', bounds: { left: 80, top: 80, right: 130, bottom: 130 } },
    { id: 'c', bounds: { left: 150, top: 150, right: 170, bottom: 170 } },
  ];
  assert.deepEqual(selectByScreenRectangle(candidates, { x: 0, y: 0 }, { x: 100, y: 100 }), ['a']);
  assert.deepEqual(selectByScreenRectangle(candidates, { x: 100, y: 100 }, { x: 0, y: 0 }), [
    'a',
    'b',
  ]);
});

test('Measure uses world-space centers for Parts under different Assemblies', () => {
  const design = createEmptyDesign('measure');
  const a = createPanel({ materialId: design.materials[0]!.id });
  const b = createPanel({ materialId: design.materials[0]!.id });
  design.parts.push(a, b);
  const aa = createAssembly('A', [{ kind: 'PART', id: a.id }]);
  const bb = createAssembly('B', [{ kind: 'PART', id: b.id }]);
  aa.transform.position.x = 1000;
  bb.transform.position.x = 2500;
  addAssemblyToAssembly(design, aa);
  addAssemblyToAssembly(design, bb);
  const measured = measurePartsWorld(design, a.id, b.id);
  assert.equal(measured.distanceMm, 1500);
  assert.deepEqual(measured.delta, { x: 1500, y: 0, z: 0 });
});

test('Rotate around an external pivot updates world position as well as rotation', () => {
  const design = createEmptyDesign('rotate pivot');
  const part = createPanel({
    materialId: design.materials[0]!.id,
    transform: { position: { x: 100, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  addPartToAssembly(design, part);
  const manager = new ToolManager();
  manager.beginRotateEntity(design, part.id, 15);
  manager.pickRotatePivot({ x: 0, y: 0, z: 0 });
  manager.pickRotateReference({ x: 100, y: 0, z: 0 });
  manager.exactRotate('90deg', 'z');
  const rotated = manager.commit(design);
  const world = getPartWorldTransform(rotated, part.id);
  assert.ok(Math.abs(world.position.x) < 1e-9);
  assert.ok(Math.abs(world.position.y - 100) < 1e-9);
  assert.ok(Math.abs(world.rotation.z - Math.PI / 2) < 1e-9);
});

test('SnapEngine chooses the nearest compatible face pair instead of hardcoding RIGHT -> LEFT', () => {
  const design = createEmptyDesign('smart face snap');
  const moving = createPanel({
    materialId: design.materials[0]!.id,
    dimensions: { widthMm: 100, heightMm: 100, thicknessMm: 20 },
  });
  const target = createPanel({
    materialId: design.materials[0]!.id,
    dimensions: { widthMm: 100, heightMm: 100, thicknessMm: 20 },
    transform: { position: { x: 0, y: 300, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  addPartToAssembly(design, moving);
  addPartToAssembly(design, target);
  const snap = new SnapEngine().face(design, moving, target);
  assert.ok(snap.label.includes('TOP') && snap.label.includes('BOTTOM'));
  assert.equal(snap.position.y, 200);
  assert.equal(snap.position.x, 0);
});
