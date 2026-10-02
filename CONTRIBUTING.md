# Contribuir a SIMBO

## Antes de cambiar código

Trabaja en una rama `feature/...` o `fix/...`; no desarrolles directamente en `main`. Actualiza tu rama con `main` antes del Pull Request.

## Reglas de código

Los nombres técnicos van en inglés: archivos, tipos, funciones, variables y eventos. Todo texto visible para BOIS va en español. Mantén TypeScript estricto y evita `any` cuando exista un tipo real.

`@simbo/design-domain` no puede depender de React, Three.js, Prisma ni del store del editor. Three.js representa el diseño, pero no lo define.

## Pruebas y documentación

Agrega pruebas cuando cambies comportamiento importante, no para aumentar un contador. Si cambias una frontera arquitectónica, el `DesignDocument` o su `schemaVersion`, actualiza la documentación y la migración correspondiente.

## Pull Request

Explica qué cambió, cómo se probó y qué quedó sin verificar. No subas `node_modules`, `.env`, builds, cobertura ni artefactos temporales.
