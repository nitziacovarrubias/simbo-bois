import {
  getPartWorldTransform,
  migrateDesign,
  normalizeHex,
  type DesignDocument,
} from '@simbo/design-domain';

export interface PreviewPart {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rx: number;
  ry: number;
  rz: number;
  color: string;
}
/** Small geometric preview taken from the last PERSISTED draft, not a mock image. */
export function projectPreviewParts(raw: unknown): PreviewPart[] {
  try {
    if (!raw || typeof raw !== 'object') return [];
    const design = (
      (raw as { schemaVersion?: number }).schemaVersion === 1 ? migrateDesign(raw) : raw
    ) as DesignDocument;
    if (!Array.isArray(design.parts) || !Array.isArray(design.assemblies)) return [];
    return design.parts
      .filter((part) => !part.hidden)
      .slice(0, 100)
      .flatMap((part) => {
        try {
          const world = getPartWorldTransform(design, part.id);
          const color =
            typeof part.metadata?.colorHex === 'string'
              ? part.metadata.colorHex
              : (design.materials.find((material) => material.id === part.materialId)?.colorHex ??
                '#b58a63');
          return [
            {
              x: world.position.x,
              y: world.position.y,
              z: world.position.z,
              width: part.dimensions.widthMm,
              height: part.dimensions.heightMm,
              depth: part.dimensions.thicknessMm,
              rx: world.rotation.x,
              ry: world.rotation.y,
              rz: world.rotation.z,
              color: normalizeHex(color),
            },
          ];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
