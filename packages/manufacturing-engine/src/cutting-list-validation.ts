import {
 validateDesignStructural,
 type DesignDocument,
 type ValidationIssue
} from '../../design-domain/src/index.ts';
export function validateCuttingListInput(
 design: DesignDocument
): ValidationIssue[] {
 const issues = validateDesignStructural(design)
 .filter(issue => issue.severity === 'ERROR');
 if (issues.length > 0) return issues;
 const parts = design.parts.filter(part => part.manufacturable);
 if (parts.length === 0) {
 issues.push({
 code: 'CUTTING_LIST_NO_PARTS',
 severity: 'ERROR',
 entityId: design.id,
 message: 'El diseño no contiene piezas fabricables.'
 });
 return issues;
 }
 for (const part of parts) {
 if (!part.materialId) {
 issues.push({
 code: 'CUTTING_LIST_MATERIAL_REQUIRED',
 severity: 'ERROR',
 entityId: part.id,
 message: `${part.name} (${part.id}): falta material asignado.`
 });
 }
 }
 return issues;
}
