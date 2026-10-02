# SIMBO

**SIMBO** es una plataforma web para el diseño de cocinas y closets de **BOIS Cocinas y Closets** utilizando medidas reales y un modelo paramétrico como fuente principal de información.

El núcleo del sistema trabaja sobre un `DesignDocument`, que concentra la información del diseño y permite que la representación 2D/3D, las piezas y otros procesos posteriores utilicen los mismos datos.

> Three.js se utiliza para representar el diseño, pero no es la fuente de verdad del proyecto.

Actualmente el repositorio se encuentra en la etapa:

**SIMBO v1.0**

Esta versión representa una base estable del editor y del dominio sobre la cual continuará el desarrollo de los siguientes módulos de SIMBO.

---

## Funcionalidades actuales

El editor permite trabajar con varios elementos del diseño, entre ellos:

- habitaciones con medidas reales;
- piezas y componentes;
- conjuntos y módulos;
- materiales;
- herramientas básicas de edición CAD;
- vistas y escenas;
- secciones;
- electrodomésticos;
- cubiertas y superficies;
- selección, movimiento y rotación de elementos.

La lógica principal se mantiene separada del renderer para que el mismo dominio pueda utilizarse posteriormente desde otros módulos del sistema.

---

