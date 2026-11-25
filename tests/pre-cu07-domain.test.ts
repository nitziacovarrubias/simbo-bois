import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPartToAssembly,
  createAssembly,
  createEmptyDesign,
  createPanel,
  validateDesignStructural,
  type Binding,
} from '../packages/design-domain/src/index.ts';
import {
  createModuleDefinitionFromAssembly,
  instantiateModule,
  updateModuleInstanceParameters,
} from '../packages/module-engine/src/index.ts';
import {
  collectManufacturingData,
  getPartOrigin,
} from '../packages/manufacturing-engine/src/index.ts';

function fixture() {
  const design = createEmptyDesign('Parámetros');
  const part = createPanel({ materialId: design.materials[0]!.id });
  const group = createAssembly('Plantilla', [{ kind: 'PART', id: part.id }]);
  design.parts.push(part);
  design.assemblies.push(group);
  design.assemblies[0]!.children.push({ kind: 'ASSEMBLY', id: group.id });
  const binding: Binding = {
    id: 'width-binding',
    targetPath: `entities.${part.id}.dimensions.widthMm`,
    enabled: true,
    expression: { type: 'Reference', path: 'params.width' },
  };
  const { definition } = createModuleDefinitionFromAssembly(design, group.id, {
    name: 'Prueba',
    parameters: [
      {
        id: 'width-param',
        key: 'width',
        label: 'Ancho',
        type: 'NUMBER',
        defaultValue: 700,
        min: 300,
        max: 900,
      },
    ],
    parameterBindings: [binding],
  });
  return { design, part, definition };
}
test('parámetros respetan ambos límites inclusivos declarados', () => {
  const { design, definition } = fixture();
  for (const width of [300, 900]) {
    const instance = instantiateModule(design, definition.id, { parameterValues: { width } });
    const parts = design.parts.filter(
      (part) => getPartOrigin(design, part.id).moduleInstanceId === instance.id,
    );
    assert.equal(parts[0]!.dimensions.widthMm, width);
  }
});
test('override inválido no muta diseño ni revisión', () => {
  const { design, definition } = fixture();
  const instance = instantiateModule(design, definition.id);
  const before = structuredClone(design);
  assert.throws(() => updateModuleInstanceParameters(design, instance.id, { width: 299 }));
  assert.deepEqual(design, before);
  assert.throws(() =>
    instantiateModule(design, definition.id, { parameterValues: { width: 901 } }),
  );
  assert.deepEqual(design, before);
});
test('referencias de material y jerarquía inválidas producen errores estructurales', () => {
  const design = createEmptyDesign();
  const part = createPanel({ materialId: 'missing' });
  addPartToAssembly(design, part);
  design.assemblies[0]!.children.push({ kind: 'ASSEMBLY', id: design.rootAssemblyId });
  const codes = validateDesignStructural(design).map((issue) => issue.code);
  assert.ok(codes.includes('PART_MATERIAL_REF'));
  assert.ok(codes.includes('ASSEMBLY_CYCLE'));
});
test('manufactura conserva IDs distintos y trazabilidad hacia módulo y snapshot', () => {
  const { design, definition, part } = fixture();
  const a = instantiateModule(design, definition.id),
    b = instantiateModule(design, definition.id);
  const origins = collectManufacturingData(design).parts.map((value) =>
    getPartOrigin(design, value.id),
  );
  assert.equal(new Set(origins.map((value) => value.partId)).size, 3);
  assert.ok(
    origins.some(
      (value) => value.moduleInstanceId === a.id && value.sourceModuleEntityId === part.id,
    ),
  );
  assert.ok(
    origins.some(
      (value) =>
        value.moduleInstanceId === b.id && value.moduleVersionId === definition.currentVersionId,
    ),
  );
  assert.deepEqual(validateDesignStructural(design), []);
});
test('material no asignado y diseño vacío siguen siendo válidos para edición', () => {
  const design = createEmptyDesign();
  assert.deepEqual(validateDesignStructural(design), []);
  addPartToAssembly(design, createPanel());
  assert.deepEqual(validateDesignStructural(design), []);
  assert.equal(collectManufacturingData(design).summary.partCount, 1);
});
