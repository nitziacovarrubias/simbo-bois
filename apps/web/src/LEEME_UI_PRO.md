# SIMBO · Actualización UX/UI para el editor CAD

Este ZIP contiene la carpeta `src` completa, preparada para reemplazar la carpeta `apps/web/src` de la misma versión de SIMBO de la que procede el ZIP que compartiste. Haz una copia de tu carpeta original antes de reemplazarla.

## Mejoras visuales

- Cabecera y pie del editor en café, acentos naranja cálido, superficies claras y mayor legibilidad.
- Herramientas CAD verticales a la izquierda del lienzo; cámara/ajuste en la zona superior central; vistas con iconos y nombres legibles arriba a la derecha.
- Paneles izquierdo y derecho colapsables con botón de cierre en el encabezado y botones de reapertura visibles desde el lienzo. En ventanas de 1100 px o menos se comportan como cajones superpuestos para mantener útil el área de diseño.
- Paneles de escena, habitación, propiedades, biblioteca, módulos, uniones, manufactura, escenas, salud del modelo, controles contextuales y presentación con ajustes específicos de espaciado, tamaño, contraste, botones, alertas y tablas.
- Nuevo proyecto: diálogo visual accesible que llama a la misma acción `createProject` del store y sustituye al prompt nativo del navegador.
- Salud del modelo: se muestran primero 5 incidencias y existe una opción para mostrar el resto; ninguna incidencia se borra ni se modifica.
- Íconos Lucide ya disponibles en el proyecto; no se agregaron dependencias nuevas.

## Estilos por componente

Los estilos específicos se encuentran en `src/components/NombreComponente.css`. Los tokens globales están en `src/styles/tokens.css`; los controles compartidos en `src/styles/shared.css`; la distribución de paneles y barras en `src/App.css`. Los nuevos estilos tienen una capa CSS `@layer pro`, declarada en `src/styles/layers.css` para mantener prioridad uniforme sin depender del orden de carga.

## Alcance y verificaciones

Se conservaron sin cambios `store.ts`, `commands.ts`, `commandRuntime.ts`, `editorFacade.ts`, `cadVisualSystem.ts`, `Viewport.tsx`, `Inspector.tsx`, `Outliner.tsx` y `ToolOptions.tsx`. Los TSX modificados se limitaron a estructura visual, nombres cortos, iconos y un diálogo local para crear el proyecto. Se comprobó la sintaxis de los TSX y se analizó la gramática de todos los CSS; NO se ejecutó el build completo ni pruebas de interacción del proyecto porque solo se compartió `src`, sin el monorepo ni sus dependencias. Las modificaciones son de UX/UI; no cambian la geometría ni los motores CAD.

## Cómo instalar

1. Guarda tu `apps/web/src` actual como respaldo.
2. Sustituye esa carpeta por la carpeta `src` de este ZIP.
3. Conserva tu logotipo en `apps/web/public/simbo-logo.svg`.
4. Abre el editor y verifica cierres de paneles, vistas, selección, creación de proyecto y guardado en tu entorno.
