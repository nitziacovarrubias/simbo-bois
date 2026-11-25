import './EntityContextMenu.css';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  Focus,
  Group,
  Layers3,
  Move3D,
  Paintbrush,
  Pencil,
  Rotate3D,
  Scissors,
  Settings2,
  Trash2,
  Ungroup,
  Wrench,
} from 'lucide-react';
import { editorCommands } from '../commands';
import { editorCommandContext, runEditorCommand } from '../commandRuntime';
import { commandUnavailableReason } from '../editorCommandFeedback';
import { useEditor } from '../store';

type Action = { id: string; label: string; icon: ReactNode; group?: string };
const item = (id: string, label: string, icon: ReactNode, group?: string): Action => ({
  id,
  label,
  icon,
  group,
});

export default function EntityContextMenu() {
  const menu = useEditor((state) => state.contextMenu);
  const design = useEditor((state) => state.design);
  const setMenu = useEditor((state) => state.setContextMenu);
  const guides = useEditor((state) => state.guides);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const priorFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setMenu(undefined);
    };
    window.addEventListener('keydown', onEscape, true);
    return () => {
      window.removeEventListener('keydown', onEscape, true);
      priorFocus?.focus();
    };
  }, [menu?.entityId, setMenu]);

  if (!menu) return null;
  const id = menu.entityId;
  const part = design.parts.find((value) => value.id === id);
  const assembly = design.assemblies.find(
    (value) => value.id === id && value.id !== design.rootAssemblyId,
  );
  const module = design.moduleInstances.find((value) => value.id === id);
  const appliance = design.applianceInstances.find((value) => value.id === id);
  const countertop = design.countertops.find((value) => value.id === id);
  const cutout = design.cutouts.find((value) => value.id === id);
  const service = design.servicePoints.find((value) => value.id === id);
  const section = design.sectionPlanes.find((value) => value.id === id);
  const guide = guides.find((value) => value.id === id);
  const heading = part
    ? `Pieza · ${part.name}`
    : assembly
      ? `Conjunto · ${assembly.name}`
      : module
        ? `Módulo · ${module.name}`
        : appliance
          ? `Electrodoméstico · ${appliance.name}`
          : countertop
            ? `Cubierta · ${countertop.name}`
            : cutout
              ? `Recorte · ${cutout.type}`
              : service
                ? `Servicio · ${service.name}`
                : section
                  ? `Sección · ${section.name}`
                  : guide
                    ? `Guía · ${guide.label ?? guide.type}`
                    : 'Objeto';

  const edit = item('editor.edit', 'Editar propiedades', <Pencil />);
  const move = item('editor.move', 'Mover', <Move3D />);
  const rotate = item('editor.rotate', 'Rotar', <Rotate3D />);
  const duplicate = item('editor.duplicate', 'Duplicar', <Copy />);
  const isolate = item('editor.isolate', 'Aislar', <Layers3 />);
  const hide = item('editor.hide', 'Ocultar', <EyeOff />);
  const remove = item('editor.delete', 'Eliminar', <Trash2 />, 'Peligro');
  const actions: Action[] = part
    ? [
        edit,
        move,
        rotate,
        duplicate,
        item('editor.group', 'Crear conjunto', <Group />),
        item('editor.material', 'Material', <Paintbrush />),
        hide,
        remove,
      ]
    : assembly
      ? [
          item('editor.enterContext', 'Editar conjunto', <Settings2 />),
          move,
          rotate,
          duplicate,
          item('editor.ungroup', 'Desagrupar', <Ungroup />),
          isolate,
          item('module.saveAssembly', 'Guardar como módulo', <Layers3 />),
          hide,
          remove,
        ]
      : module
        ? [
            item('editor.enterContext', 'Editar módulo', <Settings2 />),
            move,
            rotate,
            duplicate,
            isolate,
            item('module.makeUnique', 'Hacer independiente', <Wrench />),
            item('module.setOrigin', 'Definir origen', <Focus />),
            hide,
            remove,
          ]
        : appliance
          ? [
              edit,
              move,
              rotate,
              isolate,
              item('clearance.toggle', 'Mostrar holguras', <Eye />),
              remove,
            ]
          : countertop
            ? [edit, move, item('cutout.create', 'Crear recorte', <Scissors />), isolate, remove]
            : cutout || service
              ? [edit, ...(service ? [move] : []), remove]
              : guide
                ? [
                    item('guide.delete', 'Eliminar guía', <Trash2 />),
                    item('guide.hide', 'Ocultar guías', <EyeOff />),
                  ]
                : section
                  ? [
                      item('section.toggle', 'Activar/desactivar', <Eye />),
                      item('section.invert', 'Invertir', <Rotate3D />),
                      item('section.look', 'Mirar sección', <Focus />),
                      item('section.delete', 'Eliminar sección', <Trash2 />),
                    ]
                  : [];

  const position = {
    left: Math.max(10, Math.min(menu.x, window.innerWidth - 272)),
    top: Math.max(
      10,
      Math.min(menu.y, window.innerHeight - Math.min(500, actions.length * 41 + 80)),
    ),
  };
  const enabled = (command: string) => editorCommands.canExecute(command, editorCommandContext(id));
  const invoke = (command: string) => {
    runEditorCommand(command, id);
    setMenu(undefined);
  };

  return (
    <>
      <div className="context-menu-dismiss" onPointerDown={() => setMenu(undefined)} />
      <div
        ref={menuRef}
        className="entity-context-menu"
        style={position}
        role="group"
        aria-label={`Acciones de ${heading}`}
      >
        <div className="entity-menu-heading" title={heading}>
          {heading}
        </div>
        {actions.map((action, index) => {
          const canRun = enabled(action.id);
          return (
            <div key={`${action.id}-${index}`}>
              {action.group && <div className="entity-menu-group-label">{action.group}</div>}
              <button
                type="button"
                disabled={!canRun}
                title={!canRun ? commandUnavailableReason(action.id, 1) : action.label}
                onClick={() => invoke(action.id)}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
