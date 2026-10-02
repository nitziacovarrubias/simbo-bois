# @simbo/geometry-engine

Calcula información geométrica derivada del `DesignDocument`: descriptores de cajas, esquinas, AABB, segmentos de habitación, bounds de cubiertas y volúmenes auxiliares.

Para piezas existen APIs separadas como `partLocalAabb(part)` y `partWorldAabb(design, part)` para evitar confundir espacios de coordenadas. `designGeometry()` entrega transforms efectivos que el renderer puede consumir.

Este paquete no guarda geometría Three.js dentro del documento. Los descriptores pueden regenerarse a partir del dominio.
