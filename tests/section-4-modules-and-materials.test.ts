import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addPartToAssembly,
  createEmptyDesign,
  createPanel,
  serializeDesign,
  deserializeDesign,
  validateDesignStructural,
  getPartWorldTransform,
} from '../packages/design-domain/src/index.ts';
import {
  createModuleDefinitionFromAssembly,
  installPortableModule,
  instantiateModule,
} from '../packages/module-engine/src/index.ts';

function prepareWorkshop() {
  const draft = createEmptyDesign('Módulo temporal');
  const material = draft.materials[0]!;
  const part = createPanel({
    name: 'Lateral',
    dimensions: { widthMm: 600, heightMm: 700, thicknessMm: 18 },
    materialId: material.id,
    transform: { position: { x: 120, y: 350, z: 50 }, rotation: { x: 0, y: 0, z: 0 } },
  });
  addPartToAssembly(draft, part);
  return { draft, part, material };
}

test('A temporary workshop does not change the open project before saving', () => {
  const project = createEmptyDesign('Proyecto activo');
  const before = serializeDesign(project);
  const { draft } = prepareWorkshop();
  assert.notEqual(draft.id, project.id);
  assert.equal(serializeDesign(project), before);
});

test('Saving a workshop builds a portable definition that can be inserted without replacing the current design', () => {
  const project = createEmptyDesign('Proyecto activo');
  const originalId = project.id;
  const { draft } = prepareWorkshop();
  const { definition, version } = createModuleDefinitionFromAssembly(draft, draft.rootAssemblyId, {
    name: 'Gabinete lateral',
    tags: ['USER', 'WORKSHOP'],
  });
  assert.equal(version.snapshot.parts.length, 1);
  installPortableModule(project, definition, version);
  const instance = instantiateModule(project, definition.id, {
    position: { x: 500, y: 0, z: 500 },
  });
  assert.equal(project.id, originalId);
  assert.equal(project.parts.length, 1);
  assert.equal(project.moduleDefinitions.length, 1);
  assert.ok(instance.rootAssemblyId);
  assert.deepEqual(
    validateDesignStructural(project).filter((i) => i.severity === 'ERROR'),
    [],
  );
  assert.ok(Number.isFinite(getPartWorldTransform(project, project.parts[0]!.id).position.x));
});

test('Texture metadata remains available in saved documents and module snapshots', () => {
  const { draft, material } = prepareWorkshop();
  material.metadata.textureDataUrl = 'data:image/webp;base64,YWJj';
  const { version } = createModuleDefinitionFromAssembly(draft, draft.rootAssemblyId, {
    name: 'Texturado',
  });
  assert.equal(
    version.snapshot.materials[0]?.metadata.textureDataUrl,
    material.metadata.textureDataUrl,
  );
  const restored = deserializeDesign(serializeDesign(draft));
  assert.equal(restored.materials[0]?.metadata.textureDataUrl, material.metadata.textureDataUrl);
});

test('Module preview geometry belongs only to the module snapshot, never unrelated project parts', () => {
  const { draft, part } = prepareWorkshop();
  const { version } = createModuleDefinitionFromAssembly(draft, draft.rootAssemblyId, {
    name: 'Aislado',
  });
  assert.deepEqual(
    version.snapshot.parts.map((p) => p.id),
    [part.id],
  );
  assert.equal(version.snapshot.assemblies.length, 1);
});
