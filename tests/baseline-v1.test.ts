import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { collectManufacturingData } from '../packages/manufacturing-engine/src/index.ts';
import {
  deserializeDesign,
  serializeDesign,
  validateDesignStructural,
} from '../packages/design-domain/src/index.ts';
import { createPerformanceDesign } from './fixtures/performance.ts';

function demoDesign() {
  return deserializeDesign(
    readFileSync(new URL('../examples/demo-kitchen.design.json', import.meta.url), 'utf8'),
  );
}

function hasRendererObject(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasRendererObject);
  const record = value as Record<string, unknown>;
  const forbidden = new Set([
    'mesh',
    'Mesh',
    'object3D',
    'Object3D',
    'bufferGeometry',
    'BufferGeometry',
  ]);
  return Object.entries(record).some(
    ([key, child]) => forbidden.has(key) || hasRendererObject(child),
  );
}

test('Baseline 1.0: demo oficial cumple el contrato y contiene entidades de integración', () => {
  const design = demoDesign();
  assert.equal(design.schemaVersion, 2);
  assert.deepEqual(validateDesignStructural(design), []);
  assert.ok(design.room.openings.some((opening) => opening.type === 'DOOR'));
  assert.ok(design.room.openings.some((opening) => opening.type === 'WINDOW'));
  assert.ok(design.materials.length >= 2);
  assert.ok(design.parts.length >= 1);
  assert.ok(design.assemblies.length >= 1);
  assert.ok(design.moduleDefinitions.length >= 1);
  assert.ok(design.moduleVersions.length >= 1);
  assert.ok(design.moduleInstances.length >= 1);
  assert.ok(design.joints.length >= 1);
  assert.ok(design.hardwareDefinitions.length >= 1);
  assert.ok(design.hardwareInstances.length >= 1);
  assert.ok(design.machiningFeatures.length >= 1);
  assert.ok(design.countertops.length >= 1);
  assert.ok(design.cutouts.length >= 1);
  assert.ok(design.applianceDefinitions.length >= 1);
  assert.ok(design.applianceInstances.length >= 1);
  assert.ok(design.servicePoints.length >= 1);
  assert.ok(design.scenes.length >= 1);
  assert.ok(design.sectionPlanes.length >= 1);
  assert.ok(design.functionalZones.some((zone) => zone.type === 'HANGING'));
  assert.ok(design.parts.some((part) => part.semanticRole === 'TOE_KICK'));
  assert.ok(design.parts.some((part) => part.semanticRole === 'SHOE_SHELF'));
  assert.equal(hasRendererObject(design), false);
});

test('Baseline 1.0: save/load conserva el mismo diseño lógico y manufactura no depende del renderer', () => {
  const design = demoDesign();
  const reloaded = deserializeDesign(serializeDesign(design));
  assert.deepEqual(reloaded, design);
  const manufacturing = collectManufacturingData(reloaded);
  assert.ok(manufacturing.parts.length > 0);
  assert.equal(Object.hasOwn(manufacturing, 'meshes'), false);
  assert.equal(Object.hasOwn(manufacturing, 'appliances'), false);
  assert.equal(Object.hasOwn(manufacturing, 'servicePoints'), false);
  assert.equal(Object.hasOwn(manufacturing, 'clearanceZones'), false);
});

test('Baseline 1.0: fixtures de rendimiento generan exactamente 50, 200 y 500 piezas', () => {
  for (const count of [50, 200, 500] as const) {
    const design = createPerformanceDesign(count);
    assert.equal(design.parts.length, count);
    assert.deepEqual(validateDesignStructural(design), []);
  }
});
