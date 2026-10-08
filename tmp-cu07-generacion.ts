import {
  createEmptyDesign,
  createPanel,
  addPartToAssembly,
  deserializeDesign
} from './packages/design-domain/src/index.ts';

import {
  createModuleDefinitionFromAssembly,
  instantiateModule
} from './packages/module-engine/src/index.ts';

import {
  generateCuttingList,
  getPartOrigin
} from './packages/manufacturing-engine/src/index.ts';

// Creamos dos módulos con un lateral cada uno y una repisa independiente.
const design = createEmptyDesign('Cocina de ejemplo');

const material = design.materials[0];
if (!material) {
  throw new Error('Falta el material del ejemplo.');
}
material.name = 'Melamina blanca';

const lateral = createPanel({
  name: 'Lateral',
  materialId: material.id,
  dimensions: {
    widthMm: 600,
    heightMm: 700,
    thicknessMm: 18
  }
});

addPartToAssembly(design, lateral, design.rootAssemblyId);

const { definition, version } = createModuleDefinitionFromAssembly(
  design,
  design.rootAssemblyId,
  { name: 'Modelo base' }
);

// La plantilla ya quedó guardada en el snapshot.
// Contaremos únicamente los laterales de las dos instancias.
lateral.manufacturable = false;

const module1 = instantiateModule(design, definition.id, {
  name: 'Módulo 1',
  position: { x: 0, y: 0, z: 0 }
});

const module2 = instantiateModule(design, definition.id, {
  name: 'Módulo 2',
  position: { x: 1000, y: 0, z: 0 }
});

const shelf = createPanel({
  name: 'Repisa',
  materialId: material.id,
  dimensions: {
    widthMm: 800,
    heightMm: 300,
    thicknessMm: 18
  }
});

addPartToAssembly(design, shelf, design.rootAssemblyId);

const lateral1 = design.parts.find(part =>
  getPartOrigin(design, part.id).moduleInstanceId === module1.id
);

const lateral2 = design.parts.find(part =>
  getPartOrigin(design, part.id).moduleInstanceId === module2.id
);

if (!lateral1 || !lateral2) {
  throw new Error('Faltan los laterales de los módulos.');
}

// Cambiamos los IDs y sus referencias solo en el ejemplo en memoria.
// El generador y los documentos de la aplicación mantienen su comportamiento.
const readableIds = new Map<string, string>([
  [design.id, 'diseno-cocina'],
  [design.rootAssemblyId, 'cocina'],
  [material.id, 'material-1'],
  [lateral.id, 'lateral-plantilla'],
  [definition.id, 'modelo-base'],
  [version.id, 'modelo-base-v1'],
  [module1.id, 'modulo-1'],
  [module1.rootAssemblyId, 'ensamble-1'],
  [lateral1.id, 'lateral-1'],
  [module2.id, 'modulo-2'],
  [module2.rootAssemblyId, 'ensamble-2'],
  [lateral2.id, 'lateral-2'],
  [shelf.id, 'repisa-1']
]);

const demo = deserializeDesign(
  JSON.stringify(design, (_key, value: unknown) =>
    typeof value === 'string'
      ? readableIds.get(value) ?? value
      : value
  )
);

const before = JSON.stringify(demo);

const source = {
  projectId: 'cocina-1',
  designVersionId: 'diseno-v1',
  revision: 1
};

const result = generateCuttingList(demo, source);

const grouped = result.rows.find(row => row.quantity === 2);

const total = result.rows.reduce(
  (sum, row) => sum + row.quantity,
  0
);

// Comprobamos cantidades, trazabilidad y que el diseño no cambie.
if (result.rows.length !== 2 || total !== 3 || !grouped) {
  throw new Error('Se esperaban dos filas y tres piezas.');
}

if (
  grouped.origins.length !== 2 ||
  new Set(
    grouped.origins.map(origin => origin.moduleInstanceId)
  ).size !== 2 ||
  grouped.origins.some(origin => !origin.moduleInstanceId)
) {
  throw new Error('Faltan los orígenes de las dos instancias.');
}

if (before !== JSON.stringify(demo)) {
  throw new Error('El generador modificó el diseño.');
}

// Mostramos el resultado real devuelto por el generador.
console.log(JSON.stringify(result, null, 2));

console.log(
  '\nEjemplo correcto: 2 filas, 3 piezas y dos instancias trazables.'
);
console.log('Los laterales se agrupan en una fila con cantidad 2.');
console.log('La repisa queda en otra fila con cantidad 1.');
console.log('El diseño original permanece intacto.');