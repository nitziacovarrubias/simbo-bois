import {
  CAD_SHORTCUTS,
  CommandRegistry,
  detectShortcutConflicts,
  type ShortcutAction,
} from '@simbo/editor-engine';
import type { Axis, ToolId } from '@simbo/editor-engine';
import type { Id } from '@simbo/design-domain';

export interface EditorCommandContext {
  activeTool: ToolId;
  selectedIds: Id[];
  undoStack?: string[];
  redoStack?: string[];
  selectedGuideId?: Id;
  selectedSectionId?: Id;
  activeSceneId?: Id;
  commandTargetId?: Id;
  presentationMode: boolean;
  commandPaletteOpen: boolean;
  inferenceCandidate?: { point: { x: number; y: number; z: number } };
  design: {
    rootAssemblyId: Id;
    parts: Array<{ id: Id }>;
    assemblies: Array<{ id: Id; name: string }>;
    moduleInstances: Array<{ id: Id }>;
    applianceDefinitions: Array<{ id: Id }>;
    applianceInstances: Array<{ id: Id }>;
    countertops: Array<{ id: Id }>;
    cutouts: Array<{ id: Id }>;
    servicePoints: Array<{ id: Id }>;
    clearanceZones: Array<{ id: Id; ownerId: Id }>;
    sectionPlanes: Array<{ id: Id }>;
    scenes: Array<{ id: Id }>;
  };
  setTool(tool: ToolId): void;
  select(id: Id, multi?: boolean): void;
  enterEditContext(id: Id): void;
  addPanel(): void;
  duplicateSelected(): void;
  groupSelected(name?: string): Id | undefined;
  ungroupSelected(): void;
  deleteSelected(): void;
  undo(): void;
  redo(): void;
  focusSelected(): void;
  fitAll(): void;
  fitRoom(): void;
  toggleProjection(): void;
  toggleCleanMode(): void;
  alignViewToInferenceFace(orthographic?: boolean): void;
  setOrbitPivot(point?: { x: number; y: number; z: number }): void;
  isolateSelected(): void;
  showAll(): void;
  hideSelectedTemp(): void;
  hideRestTemp(): void;
  unhideLast(): void;
  unhideAll(): void;
  saveAssemblyAsModule(assemblyId?: Id, name?: string): Id | undefined;
  flipSelected(axis: Axis): void;
  setView(preset: 'FRONT' | 'BACK' | 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'ISOMETRIC'): void;
  previousView(): void;
  nextView(): void;
  enterPresentation(): void;
  exitPresentation(): void;
  setCommandPaletteOpen(open: boolean): void;
  setActivePanel(
    panel: 'INSPECTOR' | 'MODULE' | 'JOINERY' | 'MANUFACTURING' | 'SCENES' | 'HEALTH' | 'LIBRARY',
  ): void;
  setPanelCollapsed?(side: 'left' | 'right', collapsed: boolean): void;
  setSelectedGuide(id?: Id): void;
  deleteSelectedGuide(): void;
  setVisibilityTag(tag: 'GUIDES', visible: boolean): void;
  selectSection(id?: Id): void;
  toggleSection(id: Id): void;
  invertSection(id: Id): void;
  lookAtSection(id: Id): void;
  deleteSection(id: Id): void;
  activateScene(id: Id, instant?: boolean): void;
  updateScene(id: Id): void;
  duplicateScene(id: Id): void;
  deleteScene(id: Id): void;
  addSection(): void;
  addScene(name: string): void;
  makeUnique(id: Id): void;
  setSelectedModuleOriginFromInference(): void;
  selectAllVisible(): void;
  invertSelection(): void;
  selectSameMaterial(): void;
  selectSameSemanticRole(): void;
  selectSameModuleDefinition(): void;
  insertApplianceDefinition(definitionId: Id): void;
  createCountertopRect(): void;
  createCutoutForSelectedCountertop(
    type?: 'SINK' | 'COOKTOP' | 'FAUCET' | 'SOCKET' | 'CUSTOM',
  ): void;
  createService(
    type?: 'ELECTRICAL' | 'WATER_SUPPLY' | 'DRAIN' | 'GAS' | 'VENT' | 'LIGHTING' | 'DATA' | 'OTHER',
  ): void;
  toggleClearances(ownerId?: Id, visible?: boolean): void;
  validatePlanning(): unknown;
}

export const editorCommands = new CommandRegistry<EditorCommandContext>();
const commandTarget = (ctx: EditorCommandContext): Id | undefined =>
  ctx.commandTargetId ?? ctx.selectedIds[0] ?? ctx.selectedGuideId ?? ctx.selectedSectionId;
const targetSelection = (ctx: EditorCommandContext): Id[] =>
  ctx.commandTargetId ? [ctx.commandTargetId] : ctx.selectedIds;
const prepareTarget = (ctx: EditorCommandContext): void => {
  if (ctx.commandTargetId && !ctx.selectedIds.includes(ctx.commandTargetId))
    ctx.select(ctx.commandTargetId);
};
const tool = (
  id: string,
  label: string,
  toolId: ToolId,
  shortcut?: string,
  keywords: string[] = [],
) =>
  editorCommands.register({
    id,
    label,
    shortcut,
    keywords,
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.setTool(toolId);
    },
  });

tool('editor.select', 'Seleccionar', 'SELECT', CAD_SHORTCUTS.SELECT, ['selección', 'cursor']);
tool('editor.move', 'Mover', 'MOVE', CAD_SHORTCUTS.MOVE, ['trasladar', 'posición']);
tool('editor.rotate', 'Rotar', 'ROTATE', CAD_SHORTCUTS.ROTATE, ['girar', 'ángulo']);
tool('editor.measure', 'Cinta métrica', 'MEASURE', CAD_SHORTCUTS.MEASURE, [
  'medir',
  'distancia',
  'tape',
]);
tool('editor.guide', 'Crear guía', 'GUIDE', CAD_SHORTCUTS.GUIDE, [
  'punto guía',
  'línea guía',
  'plano guía',
]);
tool('editor.protractor', 'Transportador', 'PROTRACTOR', CAD_SHORTCUTS.PROTRACTOR, [
  'ángulo',
  '45 grados',
]);
tool('camera.walk', 'Caminar', 'WALK', CAD_SHORTCUTS.WALK, ['walk', 'recorrer habitación']);
tool('camera.look', 'Mirar alrededor', 'LOOK', CAD_SHORTCUTS.LOOK, ['look', 'orientar cámara']);
tool('camera.zoomWindow', 'Zoom por ventana', 'ZOOM_WINDOW', undefined, [
  'zoom ventana',
  'encuadrar región',
]);

editorCommands
  .register({
    id: 'editor.edit',
    label: 'Editar propiedades',
    keywords: ['editar', 'inspector'],
    canExecute: (ctx) => {
      const id = commandTarget(ctx);
      return Boolean(
        id &&
        [
          ...ctx.design.parts,
          ...ctx.design.applianceInstances,
          ...ctx.design.countertops,
          ...ctx.design.cutouts,
          ...ctx.design.servicePoints,
          ...ctx.design.assemblies,
          ...ctx.design.moduleInstances,
        ].some((v) => v.id === id),
      );
    },
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.setActivePanel('INSPECTOR');
      ctx.setPanelCollapsed?.('right', false);
    },
  })
  .register({
    id: 'editor.enterContext',
    label: 'Editar contexto',
    keywords: ['contexto', 'edit context'],
    canExecute: (ctx) => {
      const id = commandTarget(ctx);
      return Boolean(
        id &&
        (ctx.design.assemblies.some((v) => v.id === id && v.id !== ctx.design.rootAssemblyId) ||
          ctx.design.moduleInstances.some((v) => v.id === id)),
      );
    },
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.enterEditContext(id);
    },
  })
  .register({
    id: 'editor.setAxes',
    label: 'Definir ejes locales',
    keywords: ['set axes', 'ejes locales'],
    canExecute: (ctx) => {
      const id = commandTarget(ctx);
      return Boolean(
        id &&
        (ctx.design.assemblies.some((v) => v.id === id && v.id !== ctx.design.rootAssemblyId) ||
          ctx.design.moduleInstances.some((v) => v.id === id)),
      );
    },
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.setTool('AXES');
    },
  })
  .register({
    id: 'editor.material',
    label: 'Material / Apariencia',
    keywords: ['material', 'apariencia'],
    canExecute: (ctx) => {
      const id = commandTarget(ctx);
      return Boolean(id && ctx.design.parts.some((v) => v.id === id));
    },
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.setActivePanel('INSPECTOR');
      ctx.setPanelCollapsed?.('right', false);
    },
  });

editorCommands
  .register({
    id: 'editor.addPart',
    label: 'Agregar panel',
    shortcut: CAD_SHORTCUTS.PART,
    keywords: ['part', 'panel'],
    execute: (ctx) => ctx.addPanel(),
  })
  .register({
    id: 'editor.duplicate',
    label: 'Duplicar',
    keywords: ['copy', 'copia'],
    canExecute: (ctx) =>
      targetSelection(ctx).some(
        (id) =>
          ctx.design.parts.some((v) => v.id === id) ||
          ctx.design.assemblies.some((v) => v.id === id && v.id !== ctx.design.rootAssemblyId) ||
          ctx.design.moduleInstances.some((v) => v.id === id) ||
          ctx.design.applianceInstances.some((v) => v.id === id) ||
          ctx.design.countertops.some((v) => v.id === id),
      ),
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.duplicateSelected();
    },
  })
  .register({
    id: 'editor.group',
    label: 'Crear conjunto',
    keywords: ['agrupar', 'group'],
    canExecute: (ctx) =>
      targetSelection(ctx).some((id) => ctx.design.parts.some((part) => part.id === id)),
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.groupSelected();
    },
  })
  .register({
    id: 'editor.ungroup',
    label: 'Desagrupar',
    keywords: ['ungroup', 'separar conjunto'],
    canExecute: (ctx) =>
      targetSelection(ctx).some((id) =>
        ctx.design.assemblies.some((v) => v.id === id && v.id !== ctx.design.rootAssemblyId),
      ),
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.ungroupSelected();
    },
  })
  .register({
    id: 'editor.delete',
    label: 'Eliminar selección',
    shortcut: CAD_SHORTCUTS.DELETE,
    canExecute: (ctx) => targetSelection(ctx).length > 0,
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.deleteSelected();
    },
  })
  .register({
    id: 'editor.undo',
    label: 'Deshacer',
    shortcut: CAD_SHORTCUTS.UNDO,
    canExecute: (ctx) => (ctx.undoStack?.length ?? 0) > 0,
    execute: (ctx) => ctx.undo(),
  })
  .register({
    id: 'editor.redo',
    label: 'Rehacer',
    shortcut: CAD_SHORTCUTS.REDO,
    canExecute: (ctx) => (ctx.redoStack?.length ?? 0) > 0,
    execute: (ctx) => ctx.redo(),
  })
  .register({
    id: 'view.alignFace',
    label: 'Alinear vista a cara',
    keywords: ['face', 'perpendicular', 'ortho'],
    execute: (ctx) => ctx.alignViewToInferenceFace(true),
  })
  .register({
    id: 'camera.pivot',
    label: 'Fijar pivote de órbita',
    keywords: ['pivot', 'órbita'],
    canExecute: (ctx) => Boolean(ctx.inferenceCandidate),
    execute: (ctx) => {
      if (ctx.inferenceCandidate) ctx.setOrbitPivot(ctx.inferenceCandidate.point);
    },
  })
  .register({
    id: 'camera.focus',
    label: 'Enfocar selección',
    shortcut: CAD_SHORTCUTS.FOCUS,
    canExecute: (ctx) => ctx.selectedIds.length > 0,
    keywords: ['focus'],
    execute: (ctx) => ctx.focusSelected(),
  })
  .register({
    id: 'camera.fitAll',
    label: 'Ajustar todo',
    keywords: ['fit all', 'encuadrar todo'],
    execute: (ctx) => ctx.fitAll(),
  })
  .register({
    id: 'camera.fitRoom',
    label: 'Ajustar habitación',
    keywords: ['fit room', 'encuadrar habitación'],
    execute: (ctx) => ctx.fitRoom(),
  })
  .register({
    id: 'editor.isolate',
    label: 'Aislar',
    keywords: ['isolate', 'solo selección'],
    canExecute: (ctx) => targetSelection(ctx).length > 0,
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.isolateSelected();
    },
  })
  .register({
    id: 'editor.showAll',
    label: 'Mostrar todo',
    keywords: ['unhide', 'restaurar'],
    execute: (ctx) => ctx.showAll(),
  })
  .register({
    id: 'editor.hide',
    label: 'Ocultar selección',
    keywords: ['hide'],
    canExecute: (ctx) => targetSelection(ctx).length > 0,
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.hideSelectedTemp();
    },
  })
  .register({
    id: 'editor.hideRest',
    label: 'Ocultar resto',
    canExecute: (ctx) => targetSelection(ctx).length > 0,
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.hideRestTemp();
    },
  })
  .register({
    id: 'editor.unhideLast',
    label: 'Mostrar último oculto',
    execute: (ctx) => ctx.unhideLast(),
  })
  .register({
    id: 'editor.unhideAll',
    label: 'Mostrar todos los ocultos',
    execute: (ctx) => ctx.unhideAll(),
  })
  .register({
    id: 'editor.flipX',
    label: 'Voltear en X',
    keywords: ['mirror', 'flip x'],
    canExecute: (ctx) => targetSelection(ctx).length > 0,
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.flipSelected('x');
    },
  })
  .register({
    id: 'editor.flipY',
    label: 'Voltear en Y',
    keywords: ['mirror', 'flip y'],
    canExecute: (ctx) => targetSelection(ctx).length > 0,
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.flipSelected('y');
    },
  })
  .register({
    id: 'editor.flipZ',
    label: 'Voltear en Z',
    keywords: ['mirror', 'flip z'],
    canExecute: (ctx) => targetSelection(ctx).length > 0,
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.flipSelected('z');
    },
  })
  .register({
    id: 'selection.all',
    label: 'Seleccionar todo',
    keywords: ['select all'],
    execute: (ctx) => ctx.selectAllVisible(),
  })
  .register({
    id: 'selection.invert',
    label: 'Invertir selección',
    execute: (ctx) => ctx.invertSelection(),
  })
  .register({
    id: 'selection.sameMaterial',
    label: 'Seleccionar mismo material',
    canExecute: (ctx) => ctx.selectedIds.length > 0,
    execute: (ctx) => ctx.selectSameMaterial(),
  })
  .register({
    id: 'selection.sameRole',
    label: 'Seleccionar mismo rol semántico',
    canExecute: (ctx) => ctx.selectedIds.length > 0,
    execute: (ctx) => ctx.selectSameSemanticRole(),
  })
  .register({
    id: 'selection.sameModule',
    label: 'Seleccionar misma definición de módulo',
    canExecute: (ctx) => ctx.selectedIds.length > 0,
    execute: (ctx) => ctx.selectSameModuleDefinition(),
  })
  .register({
    id: 'view.front',
    label: 'Vista frontal',
    keywords: ['front', 'frente'],
    execute: (ctx) => ctx.setView('FRONT'),
  })
  .register({
    id: 'view.back',
    label: 'Vista posterior',
    keywords: ['back'],
    execute: (ctx) => ctx.setView('BACK'),
  })
  .register({
    id: 'view.top',
    label: 'Vista superior',
    keywords: ['top', 'planta'],
    execute: (ctx) => ctx.setView('TOP'),
  })
  .register({
    id: 'view.bottom',
    label: 'Vista inferior',
    keywords: ['bottom', 'inferior'],
    execute: (ctx) => ctx.setView('BOTTOM'),
  })
  .register({ id: 'view.left', label: 'Vista izquierda', execute: (ctx) => ctx.setView('LEFT') })
  .register({ id: 'view.right', label: 'Vista derecha', execute: (ctx) => ctx.setView('RIGHT') })
  .register({
    id: 'view.isometric',
    label: 'Vista isométrica',
    keywords: ['iso'],
    execute: (ctx) => ctx.setView('ISOMETRIC'),
  })
  .register({
    id: 'view.projection',
    label: 'Cambiar proyección',
    keywords: ['perspectiva', 'ortográfica', 'projection'],
    execute: (ctx) => ctx.toggleProjection(),
  })
  .register({
    id: 'view.clean',
    label: 'Vista limpia',
    keywords: ['clean view', 'ocultar interfaz'],
    execute: (ctx) => ctx.toggleCleanMode(),
  })
  .register({
    id: 'view.previous',
    label: 'Vista anterior',
    shortcut: CAD_SHORTCUTS.PREVIOUS_VIEW,
    execute: (ctx) => ctx.previousView(),
  })
  .register({
    id: 'view.next',
    label: 'Vista siguiente',
    shortcut: CAD_SHORTCUTS.NEXT_VIEW,
    execute: (ctx) => ctx.nextView(),
  })
  .register({
    id: 'section.create',
    label: 'Crear sección',
    shortcut: CAD_SHORTCUTS.SECTION,
    keywords: ['corte', 'section'],
    execute: (ctx) => {
      ctx.setActivePanel('SCENES');
      ctx.setTool('SECTION');
    },
  })
  .register({
    id: 'scene.create',
    label: 'Crear escena',
    keywords: ['vista guardada'],
    execute: (ctx) => ctx.addScene('Vista guardada'),
  })
  .register({
    id: 'presentation.toggle',
    label: 'Presentar',
    shortcut: CAD_SHORTCUTS.PRESENTATION,
    keywords: ['presentation'],
    execute: (ctx) => (ctx.presentationMode ? ctx.exitPresentation() : ctx.enterPresentation()),
  })
  .register({
    id: 'module.saveAssembly',
    label: 'Guardar como módulo',
    keywords: ['catálogo', 'guardar módulo', 'module definition'],
    canExecute: (ctx) => {
      const id = commandTarget(ctx);
      return Boolean(
        id &&
        ctx.design.assemblies.some(
          (assembly) => assembly.id === id && assembly.id !== ctx.design.rootAssemblyId,
        ),
      );
    },
    execute: (ctx) => {
      const id = commandTarget(ctx);
      const assembly = id ? ctx.design.assemblies.find((value) => value.id === id) : undefined;
      if (assembly) ctx.saveAssemblyAsModule(assembly.id, assembly.name);
    },
  })
  .register({
    id: 'module.makeUnique',
    label: 'Hacer independiente',
    keywords: ['make unique', 'módulo'],
    canExecute: (ctx) => {
      const id = commandTarget(ctx);
      return Boolean(id && ctx.design.moduleInstances.some((instance) => instance.id === id));
    },
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id && ctx.design.moduleInstances.some((instance) => instance.id === id))
        ctx.makeUnique(id);
    },
  })
  .register({
    id: 'module.setOrigin',
    label: 'Definir origen del módulo aquí',
    keywords: ['set module origin', 'origen inserción', 'reference point'],
    canExecute: (ctx) =>
      Boolean(ctx.inferenceCandidate) &&
      Boolean(
        commandTarget(ctx) &&
        ctx.design.moduleInstances.some((instance) => instance.id === commandTarget(ctx)),
      ),
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.setSelectedModuleOriginFromInference();
    },
  })
  .register({
    id: 'guide.delete',
    label: 'Eliminar guía',
    keywords: ['borrar guía'],
    canExecute: (ctx) => Boolean(commandTarget(ctx) && ctx.selectedGuideId),
    execute: (ctx) => ctx.deleteSelectedGuide(),
  })
  .register({
    id: 'guide.hide',
    label: 'Ocultar guías',
    keywords: ['hide guides'],
    execute: (ctx) => ctx.setVisibilityTag('GUIDES', false),
  })
  .register({
    id: 'section.toggle',
    label: 'Activar / desactivar sección',
    keywords: ['section toggle'],
    canExecute: (ctx) =>
      Boolean(
        commandTarget(ctx) && ctx.design.sectionPlanes.some((v) => v.id === commandTarget(ctx)),
      ),
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.toggleSection(id);
    },
  })
  .register({
    id: 'section.invert',
    label: 'Invertir sección',
    keywords: ['invert section'],
    canExecute: (ctx) =>
      Boolean(
        commandTarget(ctx) && ctx.design.sectionPlanes.some((v) => v.id === commandTarget(ctx)),
      ),
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.invertSection(id);
    },
  })
  .register({
    id: 'section.look',
    label: 'Mirar sección',
    keywords: ['look section', 'perpendicular'],
    canExecute: (ctx) =>
      Boolean(
        commandTarget(ctx) && ctx.design.sectionPlanes.some((v) => v.id === commandTarget(ctx)),
      ),
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.lookAtSection(id);
    },
  })
  .register({
    id: 'section.delete',
    label: 'Eliminar sección',
    keywords: ['delete section'],
    canExecute: (ctx) =>
      Boolean(
        commandTarget(ctx) && ctx.design.sectionPlanes.some((v) => v.id === commandTarget(ctx)),
      ),
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.deleteSection(id);
    },
  })
  .register({
    id: 'scene.activate',
    label: 'Activar escena',
    keywords: ['restore scene'],
    canExecute: (ctx) =>
      Boolean(commandTarget(ctx) && ctx.design.scenes.some((v) => v.id === commandTarget(ctx))),
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.activateScene(id);
    },
  })
  .register({
    id: 'scene.update',
    label: 'Actualizar escena',
    keywords: ['capture scene'],
    canExecute: (ctx) =>
      Boolean(commandTarget(ctx) && ctx.design.scenes.some((v) => v.id === commandTarget(ctx))),
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.updateScene(id);
    },
  })
  .register({
    id: 'scene.duplicate',
    label: 'Duplicar escena',
    keywords: ['copy scene'],
    canExecute: (ctx) =>
      Boolean(commandTarget(ctx) && ctx.design.scenes.some((v) => v.id === commandTarget(ctx))),
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.duplicateScene(id);
    },
  })
  .register({
    id: 'scene.delete',
    label: 'Eliminar escena',
    keywords: ['delete scene'],
    canExecute: (ctx) =>
      Boolean(commandTarget(ctx) && ctx.design.scenes.some((v) => v.id === commandTarget(ctx))),
    execute: (ctx) => {
      const id = commandTarget(ctx);
      if (id) ctx.deleteScene(id);
    },
  })
  .register({
    id: 'palette.toggle',
    label: 'Paleta de comandos',
    shortcut: CAD_SHORTCUTS.PALETTE,
    execute: (ctx) => ctx.setCommandPaletteOpen(!ctx.commandPaletteOpen),
  });

editorCommands
  .register({
    id: 'appliance.insert',
    label: 'Insertar electrodoméstico',
    keywords: ['appliance', 'electrodoméstico'],
    canExecute: (ctx) => ctx.design.applianceDefinitions.length > 0,
    execute: (ctx) => {
      const definition = ctx.design.applianceDefinitions[0];
      if (definition) ctx.insertApplianceDefinition(definition.id);
    },
  })
  .register({
    id: 'appliance.delete',
    label: 'Eliminar electrodoméstico',
    keywords: ['appliance delete'],
    canExecute: (ctx) =>
      Boolean(
        commandTarget(ctx) &&
        ctx.design.applianceInstances.some((v) => v.id === commandTarget(ctx)),
      ),
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.deleteSelected();
    },
  })
  .register({
    id: 'countertop.create',
    label: 'Crear cubierta',
    keywords: ['countertop', 'cubierta'],
    execute: (ctx) => ctx.createCountertopRect(),
  })
  .register({
    id: 'cutout.create',
    label: 'Crear recorte',
    keywords: ['cutout', 'hueco'],
    canExecute: (ctx) =>
      targetSelection(ctx).some((id) => ctx.design.countertops.some((v) => v.id === id)),
    execute: (ctx) => {
      prepareTarget(ctx);
      ctx.createCutoutForSelectedCountertop();
    },
  })
  .register({
    id: 'service.create',
    label: 'Crear servicio',
    keywords: ['service', 'instalación'],
    execute: (ctx) => ctx.createService(),
  })
  .register({
    id: 'clearance.toggle',
    label: 'Mostrar/ocultar holguras',
    keywords: ['clearance', 'holgura'],
    canExecute: (ctx) => {
      const id = commandTarget(ctx);
      return Boolean(
        id &&
        (ctx.design.applianceInstances.some((v) => v.id === id) ||
          ctx.design.clearanceZones.some((v) => v.ownerId === id || v.id === id)),
      );
    },
    execute: (ctx) => ctx.toggleClearances(commandTarget(ctx)),
  })
  .register({
    id: 'planning.validate',
    label: 'Validar planificación',
    keywords: ['planning', 'validar cocina'],
    execute: (ctx) => {
      ctx.validatePlanning();
      ctx.setActivePanel('HEALTH');
    },
  });

export const SHORTCUT_ACTION_COMMAND: Partial<Record<ShortcutAction, string>> = {
  SELECT: 'editor.select',
  MOVE: 'editor.move',
  ROTATE: 'editor.rotate',
  MEASURE: 'editor.measure',
  GUIDE: 'editor.guide',
  PROTRACTOR: 'editor.protractor',
  WALK: 'camera.walk',
  LOOK: 'camera.look',
  PART: 'editor.addPart',
  SECTION: 'section.create',
  PRESENTATION: 'presentation.toggle',
  PALETTE: 'palette.toggle',
  DELETE: 'editor.delete',
  UNDO: 'editor.undo',
  REDO: 'editor.redo',
  FOCUS: 'camera.focus',
  PREVIOUS_VIEW: 'view.previous',
  NEXT_VIEW: 'view.next',
};

export const DEFAULT_COMMAND_SHORTCUTS = Object.fromEntries(
  editorCommands
    .list()
    .flatMap((command) => (command.shortcut ? [[command.id, command.shortcut] as const] : [])),
) as Record<string, string>;
export const DEFAULT_SHORTCUT_CONFLICTS = detectShortcutConflicts(DEFAULT_COMMAND_SHORTCUTS);
