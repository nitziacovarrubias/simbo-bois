import type {
  Countertop,
  Cutout,
  DesignDocument,
  EdgeBanding,
  GrainDirection,
  Id,
  MachiningFeature,
  MaterialDefinition,
  Part,
} from '../../design-domain/src/index.ts';
import { collectHardware, type HardwareRequirement } from '../../hardware-engine/src/index.ts';
import {
  CuttingListSourceSchema,
  CuttingListResponseSchema,
  type CuttingListResponse,
} from '../../shared-contracts/src/index.ts';
import { validateCuttingListInput } from './cutting-list-validation.ts';
import { buildCuttingListRows } from './cutting-list.ts';
export interface ManufacturingPart {
  id: Id;
  name: string;
  semanticRole: string;
  shape: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  material?: MaterialDefinition;
  colorHex?: string;
  grainDirection: GrainDirection;
  edgeBanding: EdgeBanding;
  machiningFeatures: MachiningFeature[];
  metadata: Record<string, unknown>;
}
export interface ManufacturingCountertop {
  id: Id;
  name: string;
  outline: Countertop['outline'];
  thicknessMm: number;
  heightMm: number;
  material?: MaterialDefinition;
  colorHex?: string;
  cutouts: Cutout[];
  metadata: Record<string, unknown>;
}
export interface ManufacturingData {
  parts: ManufacturingPart[];
  countertops: ManufacturingCountertop[];
  hardware: HardwareRequirement[];
  machiningFeatures: MachiningFeature[];
  edgeBanding: Array<{ partId: Id; edges: EdgeBanding }>;
  summary: {
    partCount: number;
    countertopCount: number;
    hardwareCount: number;
    machiningCount: number;
  };
}

export function collectManufacturingData(design: DesignDocument): ManufacturingData {
  const mats = new Map(design.materials.map((material) => [material.id, material]));
  const machiningByPart = new Map<Id, MachiningFeature[]>();
  for (const machining of design.machiningFeatures) {
    const list = machiningByPart.get(machining.partId) ?? [];
    list.push(structuredClone(machining));
    machiningByPart.set(machining.partId, list);
  }
  const parts = design.parts
    .filter((part) => part.manufacturable)
    .map((part: Part): ManufacturingPart => {
      const material = part.materialId ? mats.get(part.materialId) : undefined;
      return {
        id: part.id,
        name: part.name,
        semanticRole: part.semanticRole,
        shape: part.shape,
        widthMm: part.dimensions.widthMm,
        heightMm: part.dimensions.heightMm,
        thicknessMm: part.dimensions.thicknessMm,
        material: material ? structuredClone(material) : undefined,
        colorHex: material?.colorHex,
        grainDirection: part.grainDirection,
        edgeBanding: structuredClone(part.edgeBanding),
        machiningFeatures: machiningByPart.get(part.id) ?? [],
        metadata: structuredClone(part.metadata),
      };
    });
  const countertops = design.countertops.map((countertop): ManufacturingCountertop => {
    const material = countertop.materialDefinitionId
      ? mats.get(countertop.materialDefinitionId)
      : undefined;
    return {
      id: countertop.id,
      name: countertop.name,
      outline: structuredClone(countertop.outline),
      thicknessMm: countertop.thicknessMm,
      heightMm: countertop.heightMm,
      material: material ? structuredClone(material) : undefined,
      colorHex: countertop.colorHex ?? material?.colorHex,
      cutouts: design.cutouts
        .filter((cutout) => cutout.countertopId === countertop.id)
        .map((cutout) => structuredClone(cutout)),
      metadata: structuredClone(countertop.metadata),
    };
  });
  const hardware = collectHardware(design);
  return {
    parts,
    countertops,
    hardware,
    machiningFeatures: structuredClone(design.machiningFeatures),
    edgeBanding: parts.map((part) => ({
      partId: part.id,
      edges: structuredClone(part.edgeBanding),
    })),
    summary: {
      partCount: parts.length,
      countertopCount: countertops.length,
      hardwareCount: hardware.reduce((count, item) => count + item.quantity, 0),
      machiningCount: design.machiningFeatures.length,
    },
  };
}

export interface PartOrigin {
  partId: Id;
  assemblyPath: Id[];
  moduleInstanceId?: Id;
  moduleDefinitionId?: Id;
  moduleVersionId?: Id;
  sourceModuleEntityId?: Id;
}

/** Consulta derivada de la jerarquía local; no almacena geometría ni agrupa piezas. */
export function getPartOrigin(design: DesignDocument, partId: Id): PartOrigin {
  const part = design.parts.find((candidate) => candidate.id === partId);
  if (!part) throw new Error(`Part inexistente ${partId}`);
  const path: Id[] = [];
  const seen = new Set<Id>([partId]);
  let childId = partId;
  while (true) {
    const parent = design.assemblies.find((assembly) =>
      assembly.children.some((child) => child.id === childId),
    );
    if (!parent) break;
    if (seen.has(parent.id)) throw new Error('Ciclo en jerarquía Assembly');
    seen.add(parent.id);
    path.unshift(parent.id);
    childId = parent.id;
  }
  const instance = design.moduleInstances.find((candidate) =>
    path.includes(candidate.rootAssemblyId),
  );
  return {
    partId,
    assemblyPath: path,
    moduleInstanceId: instance?.id,
    moduleDefinitionId: instance?.definitionId,
    moduleVersionId: instance?.versionId,
    sourceModuleEntityId:
      typeof part.metadata.sourceModuleEntityId === 'string'
        ? part.metadata.sourceModuleEntityId
        : undefined,
  };
}

export function generateCuttingList(
  design: DesignDocument,
  source: CuttingListResponse['source'],
): CuttingListResponse {
  const issues = validateCuttingListInput(design);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join('; '));
  }
  const parsedSource = CuttingListSourceSchema.parse(source);
  const data = collectManufacturingData(design);
  const origins = data.parts.map((part) => getPartOrigin(design, part.id));
  const rows = buildCuttingListRows(design, data.parts, origins);
  return CuttingListResponseSchema.parse({ source: parsedSource, rows });
}

export { validateCuttingListInput };
