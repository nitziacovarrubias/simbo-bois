const labels: Record<string, string> = {
  ALL: 'Todos',
  PART: 'Pieza', PARTS: 'Piezas', ASSEMBLY: 'Conjunto', ASSEMBLIES: 'Conjuntos', MODULES: 'Módulos',
  APPLIANCES: 'Electrodomésticos', MATERIALS: 'Materiales', HARDWARE: 'Herrajes',
  REFRIGERATOR: 'Refrigerador', OVEN: 'Horno', MICROWAVE: 'Microondas', DISHWASHER: 'Lavavajillas', COOKTOP: 'Parrilla', RANGE: 'Estufa', HOOD: 'Campana', WASHER: 'Lavadora', DRYER: 'Secadora', CUSTOM: 'Personalizado', OTHER: 'Otro',
  ELECTRICAL: 'Eléctrico', WATER_SUPPLY: 'Agua', DRAIN: 'Drenaje', GAS: 'Gas', VENT: 'Ventilación', LIGHTING: 'Iluminación', DATA: 'Datos',
  GENERIC_PANEL: 'Panel genérico', LEFT_SIDE: 'Lateral izquierdo', RIGHT_SIDE: 'Lateral derecho', BOTTOM: 'Base', TOP: 'Tapa', SHELF: 'Repisa', BACK: 'Trasera', DOOR: 'Puerta', DRAWER_FRONT: 'Frente de cajón', DRAWER_SIDE: 'Lateral de cajón', DRAWER_BACK: 'Trasera de cajón', DRAWER_BOTTOM: 'Fondo de cajón', FILLER: 'Relleno', END_PANEL: 'Panel final', TOE_KICK: 'Zoclo', COUNTERTOP: 'Cubierta', BACKSPLASH: 'Salpicadero', DECORATIVE_PANEL: 'Panel decorativo', DIVIDER: 'Divisor', BACK_PANEL: 'Panel trasero', SHOE_SHELF: 'Repisa para zapatos',
  NONE: 'Sin veta', HORIZONTAL: 'Horizontal', VERTICAL: 'Vertical',
  SCREW: 'Tornillo', DOWEL: 'Taquete', HINGE: 'Bisagra', DRAWER_SLIDE: 'Corredera', SHELF_SUPPORT: 'Soporte de repisa', BRACKET: 'Soporte', HANGER: 'Colgador', LEG: 'Pata', HANDLE: 'Jaladera', ACCESSORY: 'Accesorio', GENERIC: 'Genérico',
  REVOLUTE: 'Giro', PRISMATIC: 'Deslizamiento',
  PERSPECTIVE: 'Perspectiva', ORTHOGRAPHIC: 'Ortográfica',
  TECHNICAL: 'Técnico', PRESENTATION: 'Presentación', XRAY: 'Rayos X', HIDDEN_LINE: 'Línea oculta', WIREFRAME: 'Alámbrico', MONOCHROME: 'Monocromo', MANUFACTURING: 'Manufactura', SHADED: 'Sombreado',
  VISIBLE: 'Paredes visibles', TRANSPARENT: 'Paredes transparentes', HIDDEN: 'Sin paredes', AUTO: 'Automático',
  ERROR: 'Error', WARNING: 'Advertencia', INFO: 'Información',
  NORTH: 'Norte', SOUTH: 'Sur', EAST: 'Este', WEST: 'Oeste',
  SINK: 'Fregadero', FAUCET: 'Grifo', SOCKET: 'Contacto',
  STORAGE: 'Almacenamiento', HANGING: 'Colgado', DRAWERS: 'Cajones', APPLIANCE: 'Electrodoméstico', COOKING: 'Cocción', PREP: 'Preparación'
};

export function uiLabel(value: string | undefined): string {
  if (!value) return '—';
  return labels[value] ?? value.replaceAll('_', ' ').toLowerCase();
}
