import './EditorToolbar.css';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Camera,
  ChevronDown,
  Command,
  Copy,
  Cuboid,
  Eye,
  EyeOff,
  Focus,
  Group,
  Layers3,
  MousePointer2,
  Move3D,
  Redo2,
  Rotate3D,
  Ruler,
  Undo2,
  Ungroup,
} from 'lucide-react';
import { useEditor } from '../store';
import { editorCommands } from '../commands';
import { commandUnavailableReason } from '../editorCommandFeedback';
import { runEditorCommand } from '../commandRuntime';
import { exportViewportPng } from './Viewport';

function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tool-group" role="group" aria-label={label}>
      <span className="tool-group-label">{label}</span>
      <div className="tool-group-actions">{children}</div>
    </div>
  );
}

function ToolButton({
  active = false,
  label,
  shortcut,
  disabled = false,
  reason,
  onClick,
  icon,
}: {
  active?: boolean;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  reason?: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  const tooltip = disabled
    ? `${label} · ${reason ?? 'No disponible'}`
    : `${label}${shortcut ? ` · ${shortcut}` : ''}`;
  return (
    <button
      type="button"
      className={`tool-button ${active ? 'active' : ''}`}
      aria-label={label}
      aria-pressed={['Seleccionar', 'Mover', 'Rotar', 'Medir'].includes(label) ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      title={tooltip}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

const moreActions = [
  { id: 'editor.duplicate', label: 'Duplicar', icon: <Copy /> },
  { id: 'editor.group', label: 'Crear conjunto', icon: <Group /> },
  { id: 'editor.ungroup', label: 'Desagrupar', icon: <Ungroup /> },
  { id: 'editor.isolate', label: 'Aislar selección', icon: <Layers3 /> },
  { id: 'editor.hide', label: 'Ocultar selección', icon: <EyeOff /> },
  { id: 'editor.showAll', label: 'Mostrar todo', icon: <Eye /> },
  { id: 'camera.focus', label: 'Enfocar selección', icon: <Focus /> },
  { id: 'palette.toggle', label: 'Buscar comandos', icon: <Command /> },
] as const;

export default function EditorToolbar() {
  const tool = useEditor((state) => state.activeTool);
  const selectedIds = useEditor((state) => state.selectedIds);
  const design = useEditor((state) => state.design);
  const undoStack = useEditor((state) => state.undoStack);
  const redoStack = useEditor((state) => state.redoStack);
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node))
        menuRef.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const available = (id: string) => editorCommands.canExecute(id, useEditor.getState());
  const reason = (id: string) =>
    commandUnavailableReason(id, selectedIds.length, undoStack.length, redoStack.length);
  const perform = (id: string) => {
    if (runEditorCommand(id)) menuRef.current?.removeAttribute('open');
  };

  return (
    <div className="tool-strip" role="toolbar" aria-label="Herramientas del editor CAD">
      <ToolGroup label="Seleccionar y crear">
        <ToolButton
          active={tool === 'SELECT'}
          label="Seleccionar"
          shortcut="S"
          onClick={() => perform('editor.select')}
          icon={<MousePointer2 />}
        />
        <ToolButton
          label="Agregar panel"
          shortcut="P"
          onClick={() => perform('editor.addPart')}
          icon={<Cuboid />}
        />
      </ToolGroup>
      <ToolGroup label="Transformar">
        <ToolButton
          active={tool === 'MOVE'}
          label="Mover"
          shortcut="M"
          onClick={() => perform('editor.move')}
          icon={<Move3D />}
        />
        <ToolButton
          active={tool === 'ROTATE'}
          label="Rotar"
          shortcut="R"
          onClick={() => perform('editor.rotate')}
          icon={<Rotate3D />}
        />
        <ToolButton
          active={tool === 'MEASURE'}
          label="Medir"
          shortcut="T"
          onClick={() => perform('editor.measure')}
          icon={<Ruler />}
        />
      </ToolGroup>
      <ToolGroup label="Historial">
        <ToolButton
          label="Deshacer"
          shortcut="Ctrl/Cmd+Z"
          disabled={!undoStack.length}
          reason={reason('editor.undo')}
          onClick={() => perform('editor.undo')}
          icon={<Undo2 />}
        />
        <ToolButton
          label="Rehacer"
          shortcut="Ctrl/Cmd+Shift+Z"
          disabled={!redoStack.length}
          reason={reason('editor.redo')}
          onClick={() => perform('editor.redo')}
          icon={<Redo2 />}
        />
      </ToolGroup>
      <details
        ref={menuRef}
        className="toolbar-overflow"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            menuRef.current?.removeAttribute('open');
            event.stopPropagation();
          }
        }}
      >
        <summary title="Más herramientas" aria-label="Más herramientas">
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="toolbar-menu" role="group" aria-label="Acciones sobre el diseño">
          <div className="toolbar-menu-section-title">Organizar diseño</div>
          {moreActions.map((action) => (
            <button
              type="button"
              key={action.id}
              disabled={!available(action.id)}
              title={!available(action.id) ? reason(action.id) : action.label}
              onClick={() => perform(action.id)}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
          <div className="toolbar-menu-section-title">Exportar vista</div>
          <button
            type="button"
            onClick={() => {
              exportViewportPng(1);
              menuRef.current?.removeAttribute('open');
            }}
          >
            <Camera />
            <span>Imagen PNG</span>
          </button>
          <button
            type="button"
            onClick={() => {
              exportViewportPng(2);
              menuRef.current?.removeAttribute('open');
            }}
          >
            <Camera />
            <span>Imagen PNG (2×)</span>
          </button>
          <span className="toolbar-menu-footer">
            {selectedIds.length
              ? `${selectedIds.length} seleccionados`
              : 'Selecciona una pieza para más acciones'}{' '}
            · {design.parts.length} piezas
          </span>
        </div>
      </details>
    </div>
  );
}
