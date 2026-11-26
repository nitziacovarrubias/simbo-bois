# Evidencias de pruebas

Fecha de ejecución: 2026-11-26  
Responsable: Copilot SDK en VS Code

## Alcance ejecutado

- Se ejecutaron las suites disponibles `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration` y `pnpm test:e2e`.
- Docker PostgreSQL quedó disponible en `127.0.0.1:5432` y se creó/migró `simbo_test`.
- Se verificaron CU-05 y el patrón Command con pruebas unitarias.
- Se verificó la demo Baseline 1.0 y se corrigieron sus entidades faltantes.
- Docker PostgreSQL permitió ejecutar integración y la mayor parte de E2E.
- E2E terminó con 6 pruebas aprobadas y 4 pruebas del editor fallidas.

## Defectos encontrados y correcciones

1. **Import inválido en CU-05**
   - Evidencia roja: `ERR_MODULE_NOT_FOUND` para el paquete `packages`.
   - Corrección: imports relativos a `../packages/quotation-engine/src/index.ts`.
   - Evidencia verde: 3 pruebas CU-05 pasaron.

2. **Baseline incompleto**
   - Evidencia roja: faltaban primero `WINDOW` y posteriormente entidades integradas como joints.
   - Corrección: se añadió una ventana y entidades mínimas válidas de joint, hardware, machining, servicio, electrodoméstico, cutout, zona funcional y sección al demo.
   - Evidencia verde: las 3 pruebas del baseline pasaron.

3. **Cutout obligatorio incompleto en el fixture oficial**
   - Evidencia roja: unitarias e integración devolvían HTTP 400 porque `cutouts[0].rotation` era obligatorio y faltaba en `demo-kitchen.design.json`.
   - Corrección: se añadió `"rotation": 0` al cutout del fixture.
   - Evidencia verde: `pnpm test` pasó 154/154 y `pnpm test:integration` pasó 13/13.

## Escenarios no encontrados

No existen códigos TDD-012 a TDD-017 ni TDD-021 a TDD-024 en el repositorio. Los únicos escenarios presentes son TDD-009 a TDD-011 en Playwright y TDD-018 a TDD-020 en integración.

## Patrones

- Command: `CommandRegistry` pasó el caso de enrutamiento, permisos de ejecución y búsqueda.
- Facade: existe `editorFacade.ts`, pero no hay prueba automatizada ni TDD identificado para verificarlo. No se registró un resultado positivo artificial.

## Resultados pendientes

- TDD-018 a TDD-020 ya fueron ejecutados contra PostgreSQL y pasaron.
- CU-08 E2E ya pasó contra PostgreSQL.
- Las pruebas editor E2E siguen fallando por timeouts o una revisión de servidor que no coincide con la expectativa.
- GitHub Actions no pudo consultarse desde el MCP por incompatibilidad de encabezados.

No se generaron capturas manuales en esta ejecución. Las evidencias disponibles son salida de terminal y archivos de prueba existentes.
