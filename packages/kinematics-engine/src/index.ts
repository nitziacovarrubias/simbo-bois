import {
  findPart,
  getPartWorldTransform,
  type DesignDocument,
  type KinematicRelation,
  type Transform,
  type ValidationIssue,
  type Vec3
} from '../../design-domain/src/index.ts';
import { add, intersectsAabb, mul, partAabbAtTransform, partWorldAabb, sub } from '../../geometry-engine/src/index.ts';

export function clampKinematicValue(relation: KinematicRelation, value: number): number {
  return Math.max(relation.minValue, Math.min(relation.maxValue, value));
}
export function setKinematicValue(design: DesignDocument, relationId: string, value: number): void {
  const relation = design.kinematics.find(candidate => candidate.id === relationId);
  if (!relation) throw new Error('KinematicRelation inexistente');
  relation.currentValue = clampKinematicValue(relation, value);
}
export function animatedTransform(design: DesignDocument, relation: KinematicRelation, value = relation.currentValue): Transform {
  const base = structuredClone(getPartWorldTransform(design, relation.movingEntityId));
  const v = clampKinematicValue(relation, value);
  if (relation.type === 'PRISMATIC') {
    base.position = add(base.position, mul(relation.axis, v));
    return base;
  }
  const rad = v * Math.PI / 180;
  const axis = relation.axis;
  const pivotWorld = relation.metadata.pivotSpace === 'MOVING_LOCAL'
    ? add(base.position, relation.pivot)
    : relation.pivot;
  const rel = sub(base.position, pivotWorld);
  const c = Math.cos(rad), s = Math.sin(rad), t = 1 - c;
  const { x, y, z } = axis;
  const rotated: Vec3 = {
    x: (t*x*x+c)*rel.x+(t*x*y-s*z)*rel.y+(t*x*z+s*y)*rel.z,
    y: (t*x*y+s*z)*rel.x+(t*y*y+c)*rel.y+(t*y*z-s*x)*rel.z,
    z: (t*x*z-s*y)*rel.x+(t*y*z+s*x)*rel.y+(t*z*z+c)*rel.z
  };
  base.position = add(pivotWorld, rotated);
  if (Math.abs(axis.y) > .9) base.rotation.y += rad;
  else if (Math.abs(axis.x) > .9) base.rotation.x += rad;
  else base.rotation.z += rad;
  return base;
}
export function easing(t: number): number { return t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2; }
export function animationFrames(relation: KinematicRelation, toValue: number, frameCount = 24): number[] {
  const from = relation.currentValue, to = clampKinematicValue(relation, toValue);
  return Array.from({ length: frameCount + 1 }, (_, i) => from + (to - from) * easing(i / frameCount));
}
export interface MotionEnvelope { relationId: string; min: Vec3; max: Vec3; samples: number }
export function motionEnvelope(design: DesignDocument, relation: KinematicRelation, samples = 12): MotionEnvelope {
  const moving = findPart(design, relation.movingEntityId);
  let min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i <= samples; i++) {
    const transform = animatedTransform(design, relation, relation.minValue + (relation.maxValue - relation.minValue) * i / samples);
    const aabb = partAabbAtTransform(moving, transform);
    min = { x: Math.min(min.x,aabb.min.x), y: Math.min(min.y,aabb.min.y), z: Math.min(min.z,aabb.min.z) };
    max = { x: Math.max(max.x,aabb.max.x), y: Math.max(max.y,aabb.max.y), z: Math.max(max.z,aabb.max.z) };
  }
  return { relationId: relation.id, min, max, samples };
}
export function sampleMotionCollisions(design: DesignDocument, relationId: string, samples = 12): ValidationIssue[] {
  const relation = design.kinematics.find(candidate => candidate.id === relationId);
  if (!relation) throw new Error('KinematicRelation inexistente');
  const moving = findPart(design, relation.movingEntityId);
  const issues: ValidationIssue[] = [];
  for (let i = 0; i <= samples; i++) {
    const value = relation.minValue + (relation.maxValue - relation.minValue) * i / samples;
    const aabb = partAabbAtTransform(moving, animatedTransform(design, relation, value));
    for (const other of design.parts) {
      if (other.id === moving.id || other.id === relation.referenceEntityId || other.hidden) continue;
      if (intersectsAabb(aabb, partWorldAabb(design, other), 1)) {
        issues.push({ code: 'MOTION_INTERFERENCE', severity: 'WARNING', entityId: moving.id, message: `Posible interferencia con ${other.name} durante el movimiento`, metadata: { relationId, value, otherId: other.id } });
        return issues;
      }
    }
  }
  return issues;
}
