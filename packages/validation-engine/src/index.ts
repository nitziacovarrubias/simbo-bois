import {
  getApplianceWorldTransform,
  getServicePointWorldPosition,
  normalizeHex,
  validateDesignStructural,
  type DesignDocument,
  type PlanningIssue,
  type RequiredOpening,
  type ValidationIssue,
} from '../../design-domain/src/index.ts';
import { validateConstraints } from '../../constraint-engine/src/index.ts';
import {
  applianceWorldAabb,
  clearanceZoneWorldAabb,
  countertopWorldAabb,
  intersectsAabb,
  isCutoutInsideCountertop,
  partWorldAabb,
} from '../../geometry-engine/src/index.ts';

const outside = (
  a: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
  design: DesignDocument,
) =>
  a.min.x < -design.room.widthMm / 2 ||
  a.max.x > design.room.widthMm / 2 ||
  a.min.z < -design.room.depthMm / 2 ||
  a.max.z > design.room.depthMm / 2 ||
  a.min.y < 0 ||
  a.max.y > design.room.heightMm;
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function collisionIssues(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < design.parts.length; i++)
    for (let j = i + 1; j < design.parts.length; j++) {
      const a = design.parts[i]!,
        b = design.parts[j]!;
      if (a.hidden || b.hidden) continue;
      if (intersectsAabb(partWorldAabb(design, a), partWorldAabb(design, b), 0.1))
        issues.push({
          code: 'COLLISION',
          severity: 'WARNING',
          entityId: a.id,
          message: `Posible colisión: ${a.name} / ${b.name}`,
          metadata: { otherId: b.id },
        });
    }
  return issues;
}
export function boundaryIssues(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const part of design.parts) {
    if (outside(partWorldAabb(design, part), design))
      issues.push({
        code: 'OUTSIDE_ROOM',
        severity: 'WARNING',
        entityId: part.id,
        message: `${part.name} sale de los límites de la habitación`,
      });
  }
  return issues;
}
export function applianceBoundaryIssues(design: DesignDocument): ValidationIssue[] {
  return design.applianceInstances
    .filter((instance) => outside(applianceWorldAabb(design, instance), design))
    .map((instance) => ({
      code: 'APPLIANCE_OUTSIDE_ROOM',
      severity: 'WARNING' as const,
      entityId: instance.id,
      message: `${instance.name} sale de los límites de la habitación`,
    }));
}
export function openingFits(required: RequiredOpening, available: RequiredOpening): boolean {
  return (
    available.widthMm >= required.widthMm &&
    available.heightMm >= required.heightMm &&
    available.depthMm >= required.depthMm
  );
}
export function requiredOpeningIssues(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const instance of design.applianceInstances) {
    const definition = design.applianceDefinitions.find(
      (candidate) => candidate.id === instance.definitionId,
    );
    if (!definition?.requiredOpening || !instance.availableOpening) continue;
    if (!openingFits(definition.requiredOpening, instance.availableOpening))
      issues.push({
        code: 'REQUIRED_OPENING_INSUFFICIENT',
        severity: 'WARNING',
        entityId: instance.id,
        message: `${instance.name}: el hueco disponible es menor al RequiredOpening declarado`,
        metadata: {
          required: structuredClone(definition.requiredOpening),
          available: structuredClone(instance.availableOpening),
        },
      });
  }
  return issues;
}
export function serviceRequirementIssues(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const instance of design.applianceInstances) {
    const definition = design.applianceDefinitions.find(
      (candidate) => candidate.id === instance.definitionId,
    );
    if (!definition) continue;
    const origin = getApplianceWorldTransform(design, instance.id).position;
    for (const requirement of definition.serviceRequirements) {
      const compatible = design.servicePoints.filter(
        (point) => point.type === requirement.serviceType,
      );
      if (!compatible.length) {
        if (requirement.required)
          issues.push({
            code: 'SERVICE_REQUIRED_MISSING',
            severity: 'WARNING',
            entityId: instance.id,
            message: `${instance.name}: falta servicio ${requirement.serviceType}`,
            metadata: { serviceType: requirement.serviceType },
          });
        continue;
      }
      if (requirement.maxDistanceMm === undefined) continue;
      let nearest = compatible[0]!;
      let nearestDistance = distance(origin, getServicePointWorldPosition(design, nearest.id));
      for (const point of compatible.slice(1)) {
        const current = distance(origin, getServicePointWorldPosition(design, point.id));
        if (current < nearestDistance) {
          nearest = point;
          nearestDistance = current;
        }
      }
      if (nearestDistance > requirement.maxDistanceMm)
        issues.push({
          code: 'SERVICE_TOO_FAR',
          severity: 'WARNING',
          entityId: instance.id,
          message: `${instance.name}: servicio ${requirement.serviceType} supera la distancia máxima declarada`,
          metadata: {
            serviceType: requirement.serviceType,
            servicePointId: nearest.id,
            distanceMm: nearestDistance,
            maxDistanceMm: requirement.maxDistanceMm,
          },
        });
    }
  }
  return issues;
}
export function clearanceIssues(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const zone of design.clearanceZones) {
    const box = clearanceZoneWorldAabb(design, zone);
    if (outside(box, design))
      issues.push({
        code: 'CLEARANCE_OUTSIDE_ROOM',
        severity: 'WARNING',
        entityId: zone.id,
        message: `${zone.name} sale de la habitación`,
      });
    for (const part of design.parts) {
      if (part.hidden) continue;
      if (intersectsAabb(box, partWorldAabb(design, part), 0.1))
        issues.push({
          code: 'CLEARANCE_INTERFERENCE',
          severity: 'WARNING',
          entityId: zone.id,
          message: `${zone.name} intersecta ${part.name}`,
          metadata: { ownerId: zone.ownerId, otherId: part.id },
        });
    }
    for (const appliance of design.applianceInstances) {
      if (appliance.id === zone.ownerId || appliance.hidden) continue;
      if (intersectsAabb(box, applianceWorldAabb(design, appliance), 0.1))
        issues.push({
          code: 'CLEARANCE_INTERFERENCE',
          severity: 'WARNING',
          entityId: zone.id,
          message: `${zone.name} intersecta ${appliance.name}`,
          metadata: { ownerId: zone.ownerId, otherId: appliance.id },
        });
    }
  }
  return issues;
}
export function cutoutIssues(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const cutout of design.cutouts) {
    const countertop = design.countertops.find((candidate) => candidate.id === cutout.countertopId);
    if (!countertop) {
      issues.push({
        code: 'CUTOUT_COUNTERTOP_MISSING',
        severity: 'WARNING',
        entityId: cutout.id,
        message: 'Cutout sin Countertop válido',
      });
      continue;
    }
    if (!isCutoutInsideCountertop(countertop, cutout))
      issues.push({
        code: 'CUTOUT_OUTSIDE_COUNTERTOP',
        severity: 'WARNING',
        entityId: cutout.id,
        message: `Cutout ${cutout.type} sale de ${countertop.name}`,
        metadata: { countertopId: countertop.id },
      });
  }
  return issues;
}
export function countertopIssues(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const countertop of design.countertops) {
    if (countertop.hidden) continue;
    const box = countertopWorldAabb(design, countertop);
    for (const part of design.parts) {
      if (part.hidden) continue;
      if (intersectsAabb(box, partWorldAabb(design, part), 0.1))
        issues.push({
          code: 'COUNTERTOP_INTERFERENCE',
          severity: 'WARNING',
          entityId: countertop.id,
          message: `${countertop.name} intersecta ${part.name}`,
          metadata: { otherId: part.id },
        });
    }
  }
  return issues;
}
export function servicePointIssues(design: DesignDocument): ValidationIssue[] {
  return design.servicePoints
    .filter(
      (point) =>
        point.position.x < -design.room.widthMm / 2 ||
        point.position.x > design.room.widthMm / 2 ||
        point.position.z < -design.room.depthMm / 2 ||
        point.position.z > design.room.depthMm / 2 ||
        point.position.y < 0 ||
        point.position.y > design.room.heightMm,
    )
    .map((point) => ({
      code: 'SERVICE_OUTSIDE_ROOM',
      severity: 'WARNING' as const,
      entityId: point.id,
      message: `${point.name} sale de la habitación`,
    }));
}
export function hardwareIssues(design: DesignDocument): ValidationIssue[] {
  const defs = new Set(design.hardwareDefinitions.map((d) => d.id)),
    parts = new Set(design.parts.map((p) => p.id));
  const issues: ValidationIssue[] = [];
  for (const h of design.hardwareInstances) {
    if (!defs.has(h.definitionId))
      issues.push({
        code: 'HARDWARE_DEFINITION_MISSING',
        severity: 'WARNING',
        entityId: h.id,
        message: 'Herraje con definición inexistente',
      });
    for (const id of h.connectedPartIds)
      if (!parts.has(id))
        issues.push({
          code: 'HARDWARE_PART_MISSING',
          severity: 'WARNING',
          entityId: h.id,
          message: `Herraje referencia pieza inexistente ${id}`,
        });
  }
  return issues;
}
export function jointIssues(design: DesignDocument): ValidationIssue[] {
  const parts = new Set(design.parts.map((p) => p.id)),
    hardware = new Set(design.hardwareInstances.map((h) => h.id)),
    machining = new Set(design.machiningFeatures.map((m) => m.id));
  const issues: ValidationIssue[] = [];
  for (const j of design.joints) {
    if (!parts.has(j.partAId) || !parts.has(j.partBId))
      issues.push({
        code: 'JOINT_PART_MISSING',
        severity: 'WARNING',
        entityId: j.id,
        message: 'Joint con referencia de pieza inválida',
      });
    for (const id of j.hardwareInstanceIds)
      if (!hardware.has(id))
        issues.push({
          code: 'JOINT_HARDWARE_MISSING',
          severity: 'WARNING',
          entityId: j.id,
          message: `Joint referencia herraje inexistente ${id}`,
        });
    for (const id of j.machiningFeatureIds)
      if (!machining.has(id))
        issues.push({
          code: 'JOINT_MACHINING_MISSING',
          severity: 'WARNING',
          entityId: j.id,
          message: `Joint referencia mecanizado inexistente ${id}`,
        });
  }
  return issues;
}
export function machiningIssues(design: DesignDocument): ValidationIssue[] {
  const parts = new Set(design.parts.map((p) => p.id)),
    issues: ValidationIssue[] = [];
  for (const m of design.machiningFeatures) {
    if (!parts.has(m.partId))
      issues.push({
        code: 'MACHINING_PART_MISSING',
        severity: 'WARNING',
        entityId: m.id,
        message: 'Mecanizado sin pieza válida',
      });
    if (m.diameterMm !== undefined && m.diameterMm <= 0)
      issues.push({
        code: 'MACHINING_DIAMETER',
        severity: 'WARNING',
        entityId: m.id,
        message: 'Diámetro de mecanizado inválido',
      });
    if (m.depthMm !== undefined && m.depthMm <= 0)
      issues.push({
        code: 'MACHINING_DEPTH',
        severity: 'WARNING',
        entityId: m.id,
        message: 'Profundidad de mecanizado inválida',
      });
  }
  return issues;
}
export function materialIssues(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const m of design.materials)
    if (normalizeHex(m.colorHex, '#__INVALID__') === '#__INVALID__')
      issues.push({
        code: 'MATERIAL_COLOR',
        severity: 'WARNING',
        entityId: m.id,
        message: `Color HEX inválido en ${m.name}; el renderer usará fallback`,
      });
  return issues;
}
export function manufacturingWarnings(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const p of design.parts.filter((p) => p.manufacturable)) {
    if (!p.materialId)
      issues.push({
        code: 'MANUFACTURING_NO_MATERIAL',
        severity: 'INFO',
        entityId: p.id,
        message: `${p.name} no tiene material asignado`,
      });
  }
  return issues;
}
export function planningIssues(design: DesignDocument): PlanningIssue[] {
  const domainIssues = [
    ...applianceBoundaryIssues(design),
    ...clearanceIssues(design),
    ...serviceRequirementIssues(design),
    ...requiredOpeningIssues(design),
    ...cutoutIssues(design),
    ...countertopIssues(design),
    ...servicePointIssues(design),
  ];
  return domainIssues.map((issue) => ({
    severity: issue.severity === 'ERROR' ? 'ERROR' : issue.severity === 'INFO' ? 'INFO' : 'WARNING',
    ruleId: issue.code,
    entityIds: issue.entityId ? [issue.entityId] : [],
    message: issue.message,
    source: 'SIMBO_GEOMETRIC',
    metadata: issue.metadata,
  }));
}
export function modelHealth(design: DesignDocument): ValidationIssue[] {
  return [
    ...validateDesignStructural(design),
    ...validateConstraints(design),
    ...jointIssues(design),
    ...hardwareIssues(design),
    ...machiningIssues(design),
    ...materialIssues(design),
    ...manufacturingWarnings(design),
    ...boundaryIssues(design),
    ...collisionIssues(design),
    ...applianceBoundaryIssues(design),
    ...clearanceIssues(design),
    ...serviceRequirementIssues(design),
    ...requiredOpeningIssues(design),
    ...cutoutIssues(design),
    ...countertopIssues(design),
    ...servicePointIssues(design),
  ];
}
