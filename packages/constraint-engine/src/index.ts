import {
  getWorldTransform,
  setAssemblyWorldTransform,
  setPartWorldTransform,
  type Assembly,
  type Binding,
  type BindingExpression,
  type Constraint,
  type DesignDocument,
  type Id,
  type Part,
  type Transform,
  type ValidationIssue
} from '../../design-domain/src/index.ts';

function getPath(root: unknown, path: string): unknown {
  const tokens = path.split('.').filter(Boolean);
  let current: unknown = root;
  for (const token of tokens) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function setPath(root: unknown, path: string, value: unknown): void {
  const tokens = path.split('.').filter(Boolean);
  if (!tokens.length) throw new Error('targetPath vacío');
  let current = root as Record<string, unknown>;
  for (const token of tokens.slice(0, -1)) {
    const next = current[token];
    if (!next || typeof next !== 'object') throw new Error(`Ruta inválida: ${path}`);
    current = next as Record<string, unknown>;
  }
  current[tokens[tokens.length - 1]!] = value;
}

export function evaluateExpression(expression: BindingExpression, context: unknown): number | string | boolean {
  if (expression.type === 'Literal') return expression.value;
  if (expression.type === 'Reference') {
    const value = getPath(context, expression.path);
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
      throw new Error(`Referencia no escalar: ${expression.path}`);
    }
    return value;
  }
  if (expression.type === 'Clamp') {
    const value = Number(evaluateExpression(expression.value, context));
    const min = Number(evaluateExpression(expression.min, context));
    const max = Number(evaluateExpression(expression.max, context));
    return Math.min(max, Math.max(min, value));
  }
  const left = Number(evaluateExpression(expression.left, context));
  const right = Number(evaluateExpression(expression.right, context));
  switch (expression.type) {
    case 'Add': return left + right;
    case 'Subtract': return left - right;
    case 'Multiply': return left * right;
    case 'Divide': if (right === 0) throw new Error('División entre cero'); return left / right;
    case 'Min': return Math.min(left, right);
    case 'Max': return Math.max(left, right);
  }
}

export function expressionReferences(expression: BindingExpression): string[] {
  if (expression.type === 'Reference') return [expression.path];
  if (expression.type === 'Literal') return [];
  if (expression.type === 'Clamp') return [
    ...expressionReferences(expression.value),
    ...expressionReferences(expression.min),
    ...expressionReferences(expression.max)
  ];
  return [...expressionReferences(expression.left), ...expressionReferences(expression.right)];
}

export function remapBindingExpression(
  expression: BindingExpression,
  remapPath: (path: string) => string
): BindingExpression {
  if (expression.type === 'Literal') return structuredClone(expression);
  if (expression.type === 'Reference') return { type: 'Reference', path: remapPath(expression.path) };
  if (expression.type === 'Clamp') return {
    type: 'Clamp',
    value: remapBindingExpression(expression.value, remapPath),
    min: remapBindingExpression(expression.min, remapPath),
    max: remapBindingExpression(expression.max, remapPath)
  };
  return {
    type: expression.type,
    left: remapBindingExpression(expression.left, remapPath),
    right: remapBindingExpression(expression.right, remapPath)
  };
}

export function detectBindingCycles(bindings: Binding[]): string[][] {
  const enabled = bindings.filter(binding => binding.enabled);
  const byTarget = new Map(enabled.map(binding => [binding.targetPath, binding]));
  const graph = new Map<string, string[]>();
  for (const binding of enabled) {
    graph.set(binding.targetPath, expressionReferences(binding.expression).filter(reference => byTarget.has(reference)));
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      const index = stack.indexOf(node);
      cycles.push([...stack.slice(index), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node); stack.push(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency);
    stack.pop(); visiting.delete(node); visited.add(node);
  };
  for (const node of graph.keys()) visit(node);
  return cycles;
}

export function applyBindings<T extends object>(target: T, bindings: Binding[], context: object = target): T {
  const cycles = detectBindingCycles(bindings);
  if (cycles.length) throw new Error(`Constraint cycle: ${cycles.map(cycle => cycle.join(' -> ')).join(', ')}`);
  const pending = [...bindings.filter(binding => binding.enabled)];
  let guard = pending.length * 3 + 1;
  while (pending.length && guard-- > 0) {
    let progress = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const binding = pending[index]!;
      const references = expressionReferences(binding.expression);
      const unresolved = references.some(reference => pending.some(candidate => candidate.targetPath === reference));
      if (unresolved) continue;
      setPath(target, binding.targetPath, evaluateExpression(binding.expression, context));
      pending.splice(index, 1);
      progress = true;
    }
    if (!progress && pending.length) throw new Error('Bindings no resolubles');
  }
  return target;
}

type Transformable = Part | Assembly;
function findTransformable(design: DesignDocument, id: Id): Transformable | undefined {
  return design.parts.find(part => part.id === id) ?? design.assemblies.find(assembly => assembly.id === id);
}
function setWorldTransform(design: DesignDocument, entity: Transformable, transform: Transform): void {
  if ('dimensions' in entity) setPartWorldTransform(design, entity.id, transform);
  else setAssemblyWorldTransform(design, entity.id, transform);
}

function applyConstraint(design: DesignDocument, constraint: Constraint): void {
  const entityA = findTransformable(design, constraint.entityIds[0] ?? '');
  const entityB = findTransformable(design, constraint.entityIds[1] ?? '');
  if (!entityA) throw new Error(`Constraint ${constraint.id}: entidad A inexistente`);
  if (constraint.type === 'DIMENSION_BINDING') return;
  if (constraint.type === 'LOCK_AXIS') {
    const axis = String(constraint.parameters.axis ?? 'x') as 'x' | 'y' | 'z';
    const world = getWorldTransform(design, entityA.id);
    world.position[axis] = Number(constraint.parameters.valueMm ?? world.position[axis]);
    setWorldTransform(design, entityA, world);
    return;
  }
  if (constraint.type === 'DISTANCE' || constraint.type === 'CENTER') {
    if (!entityB) throw new Error(`Constraint ${constraint.id}: entidad B inexistente`);
    const axis = String(constraint.parameters.axis ?? 'x') as 'x' | 'y' | 'z';
    const worldA = getWorldTransform(design, entityA.id);
    const worldB = getWorldTransform(design, entityB.id);
    worldB.position[axis] = constraint.type === 'CENTER'
      ? worldA.position[axis]
      : worldA.position[axis] + Number(constraint.parameters.distanceMm ?? 0);
    setWorldTransform(design, entityB, worldB);
    return;
  }
  if (constraint.type === 'EQUAL_DIMENSION') {
    if (!entityB || !('dimensions' in entityA) || !('dimensions' in entityB)) throw new Error('EQUAL_DIMENSION requiere dos Parts');
    const dimension = String(constraint.parameters.dimension ?? 'widthMm') as 'widthMm' | 'heightMm' | 'thicknessMm';
    entityB.dimensions[dimension] = entityA.dimensions[dimension];
    return;
  }
  if (constraint.type === 'PARALLEL' || constraint.type === 'PERPENDICULAR') {
    if (!entityB) throw new Error(`Constraint ${constraint.id}: entidad B inexistente`);
    const worldA = getWorldTransform(design, entityA.id);
    const worldB = getWorldTransform(design, entityB.id);
    worldB.rotation = { ...worldA.rotation };
    if (constraint.type === 'PERPENDICULAR') worldB.rotation.y += Math.PI / 2;
    setWorldTransform(design, entityB, worldB);
    return;
  }
  throw new Error(`Constraint ${constraint.type} todavía no está soportado por el solver`);
}

export function solveConstraints(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const constraint of design.constraints.filter(candidate => candidate.enabled)) {
    try { applyConstraint(design, constraint); }
    catch (error) {
      issues.push({ code: 'CONSTRAINT_INVALID', severity: 'WARNING', entityId: constraint.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return issues;
}

export function solveDesignRelations(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entities: Record<string, Part | Assembly> = {};
  for (const part of design.parts) entities[part.id] = part;
  for (const assembly of design.assemblies) entities[assembly.id] = assembly;
  try { applyBindings({ entities }, design.bindings, { entities }); }
  catch (error) { issues.push({ code: 'BINDING_SOLVE', severity: 'ERROR', message: error instanceof Error ? error.message : String(error) }); }
  issues.push(...solveConstraints(design));
  return issues;
}

export function validateConstraints(design: DesignDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const cycle of detectBindingCycles(design.bindings)) {
    issues.push({ code: 'CONSTRAINT_CYCLE', severity: 'ERROR', message: `Ciclo: ${cycle.join(' -> ')}` });
  }
  const ids = new Set([...design.parts.map(part => part.id), ...design.assemblies.map(assembly => assembly.id)]);
  for (const constraint of design.constraints) {
    for (const id of constraint.entityIds) {
      if (!ids.has(id)) issues.push({ code: 'CONSTRAINT_REF', severity: 'WARNING', entityId: constraint.id, message: `Constraint referencia entidad inexistente ${id}` });
    }
  }
  return issues;
}
