import type { DesignDocument, Part } from '../../design-domain/src/index.ts';
import type { CuttingListRow } from '../../shared-contracts/src/index.ts';
import type { ManufacturingPart, PartOrigin } from './index.ts';

function equivalentKey(part: ManufacturingPart, original: Part): string {
  const d = original.dimensions;
  const extraMetadata = Object.keys(original.metadata)
    .some(key => key !== 'sourceModuleEntityId');
  const simple = part.shape === 'RECTANGULAR_PANEL'
    && part.machiningFeatures.length === 0
    && original.machiningFeatureIds.length === 0
    && d.polygon === undefined && d.radiusMm === undefined
    && d.lengthMm === undefined && part.grainDirection !== 'CUSTOM'
    && !extraMetadata;
  if (!simple) return JSON.stringify(['individual', part.id]);
  const edges = (['TOP', 'BOTTOM', 'LEFT', 'RIGHT'] as const)
    .map(edge => {
      const value = part.edgeBanding[edge];
      return [value.mode, value.materialId ?? null, value.type ?? null];
    });
  return JSON.stringify([
    part.shape, part.widthMm, part.heightMm, part.thicknessMm,
    part.material?.id, part.grainDirection, edges
  ]);
}

export function buildCuttingListRows(
  design: DesignDocument,
  parts: ManufacturingPart[],
  origins: PartOrigin[]
): CuttingListRow[] {
  const originals = new Map(design.parts.map(part => [part.id, part]));
  const sourceOrigins = new Map(origins.map(origin => [origin.partId, origin]));
  const groups = new Map<string, CuttingListRow>();
  for (const part of parts) {
    const original = originals.get(part.id);
    const origin = sourceOrigins.get(part.id);
    if (!original || !origin || !part.material) {
      throw new Error(`Faltan datos para la pieza ${part.id}.`);
    }
    const key = equivalentKey(part, original);
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.origins.push(structuredClone(origin));
      continue;
    }
    groups.set(key, {
      id: `row-${groups.size + 1}`,
      name: part.name,
      widthMm: part.widthMm,
      heightMm: part.heightMm,
      thicknessMm: part.thicknessMm,
      material: { id: part.material.id, name: part.material.name },
      grainDirection: part.grainDirection,
      quantity: 1,
      origins: [structuredClone(origin)]
    });
  }
  return [...groups.values()];
}
