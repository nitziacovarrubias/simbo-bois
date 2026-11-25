import {
  addPartToAssembly,
  createEmptyDesign,
  createPanel,
  type DesignDocument,
} from '../../packages/design-domain/src/index.ts';

export type PerformanceFixtureSize = 50 | 200 | 500;

export function createPerformanceDesign(partCount: PerformanceFixtureSize): DesignDocument {
  const design = createEmptyDesign(`Fixture de rendimiento ${partCount}`);
  const materialId = design.materials[0]!.id;
  const columns = 20;
  for (let index = 0; index < partCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    addPartToAssembly(
      design,
      createPanel({
        name: `Panel ${index + 1}`,
        materialId,
        dimensions: { widthMm: 400, heightMm: 700, thicknessMm: 18 },
        transform: {
          position: { x: column * 430 - 4000, y: 350, z: row * 100 - 1000 },
          rotation: { x: 0, y: 0, z: 0 },
        },
      }),
    );
  }
  return design;
}
