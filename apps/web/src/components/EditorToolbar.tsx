import './EditorToolbar.css';
import type { ReactNode } from 'react';
import { Camera as CameraIcon, ChevronDown, CircleDot, Copy, Cuboid, Eye, Focus, Group, Layers3, Move3D, Redo2, Rotate3D, Ruler, Undo2, Ungroup } from 'lucide-react';
import { useEditor } from '../store';
import { runEditorCommand } from '../commandRuntime';
import { editorFacade } from '../editorFacade';
import { exportViewportPng } from './Viewport';
import { DEMO_FOCUSED_UI } from '../demoUiConfig';

function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div className="tool-group"><span className="tool-group-label">{label}</span><div className="tool-group-actions">{children}</div></div>;
}

function ToolButton({ active = false, label, shortcut, onClick, icon }: { active?: boolean; label: string; shortcut?: string; onClick: () => void; icon: ReactNode }) {
  return <button className={`tool-button ${active ? 'active' : ''}`} aria-label={label} onClick={onClick} title={`${label}${shortcut ? ` · ${shortcut}` : ''}`}>{icon}<span className="sr-only">{label}</span></button>;
}

export default function EditorToolbar() {
  const tool = useEditor(state => state.activeTool);
  const cleanMode = useEditor(state => state.cleanMode);
  const reloadLocal = useEditor(state => state.reloadLocal);

  return <div className="tool-strip" role="toolbar" aria-label="Herramientas principales del editor">
    <ToolGroup label="Selección"><ToolButton active={tool === 'SELECT'} label="Seleccionar" shortcut="S" onClick={() => runEditorCommand('editor.select')} icon={<Focus />} /></ToolGroup>
    <ToolGroup label="Crear"><ToolButton label="Panel" shortcut="P" onClick={() => runEditorCommand('editor.addPart')} icon={<Cuboid />} /></ToolGroup>
    <ToolGroup label="Transformar"><ToolButton active={tool === 'MOVE'} label="Mover" shortcut="M" onClick={() => runEditorCommand('editor.move')} icon={<Move3D />} /><ToolButton active={tool === 'ROTATE'} label="Rotar" shortcut="R" onClick={() => runEditorCommand('editor.rotate')} icon={<Rotate3D />} /></ToolGroup>
    <ToolGroup label="Medir"><ToolButton active={tool === 'MEASURE'} label="Medir" shortcut="T" onClick={() => runEditorCommand('editor.measure')} icon={<Ruler />} /></ToolGroup>
    <ToolGroup label="Historial"><ToolButton label="Deshacer" shortcut="Ctrl/Cmd+Z" onClick={() => runEditorCommand('editor.undo')} icon={<Undo2 />} /><ToolButton label="Rehacer" shortcut="Ctrl/Cmd+Shift+Z" onClick={() => runEditorCommand('editor.redo')} icon={<Redo2 />} /></ToolGroup>
    <details className="toolbar-overflow">
      <summary title="Más acciones" aria-label="Más acciones"><ChevronDown /></summary>
      <div className="toolbar-menu" role="group" aria-label="Acciones adicionales">
        {DEMO_FOCUSED_UI ? <>
          <button onClick={() => runEditorCommand('editor.duplicate')}><Copy />Duplicar</button>
          <button onClick={() => runEditorCommand('editor.group')}><Group />Agrupar</button>
          <button onClick={() => runEditorCommand('editor.showAll')}><Eye />Mostrar todo</button>
          <button onClick={() => exportViewportPng(1)}><CameraIcon />Exportar imagen</button>
        </> : <>
        <button onClick={() => runEditorCommand('editor.duplicate')}><Copy />Duplicar</button>
        <button onClick={() => runEditorCommand('editor.group')}><Group />Agrupar</button>
        <button onClick={() => runEditorCommand('editor.ungroup')}><Ungroup />Desagrupar</button>
        <button onClick={() => runEditorCommand('editor.isolate')}><Layers3 />Aislar</button>
        <button onClick={() => runEditorCommand('editor.showAll')}><Eye />Mostrar todo</button>
        <button onClick={() => runEditorCommand('editor.hide')}><Eye />Ocultar selección</button>
        <button onClick={() => runEditorCommand('editor.hideRest')}><Eye />Ocultar resto</button>
        <button onClick={() => runEditorCommand('editor.unhideLast')}><Eye />Mostrar último oculto</button>
        <button onClick={() => runEditorCommand('editor.unhideAll')}><Eye />Mostrar ocultos</button>
        <button onClick={() => runEditorCommand('editor.guide')}><Layers3 />Crear guía</button>
        <button onClick={() => runEditorCommand('editor.protractor')}><CircleDot />Transportador</button>
        <button onClick={() => runEditorCommand('camera.walk')}><Move3D />Recorrer</button>
        <button onClick={() => runEditorCommand('camera.look')}><Eye />Mirar alrededor</button>
        <button onClick={() => runEditorCommand('camera.zoomWindow')}>Zoom por ventana</button>
        <button onClick={() => runEditorCommand('section.create')}>Crear sección</button>
        <button onClick={() => runEditorCommand('presentation.toggle')}>Presentación</button>
        <button className={cleanMode ? 'active' : ''} onClick={() => runEditorCommand('view.clean')}>Vista limpia</button>
        <button onClick={() => runEditorCommand('editor.setAxes')}>Definir ejes</button>
        <button onClick={() => runEditorCommand('editor.flipX')}>Voltear X</button>
        <button onClick={() => runEditorCommand('editor.flipY')}>Voltear Y</button>
        <button onClick={() => runEditorCommand('editor.flipZ')}>Voltear Z</button>
        <button onClick={() => runEditorCommand('view.alignFace')}>Alinear vista a cara</button>
        <button onClick={() => runEditorCommand('palette.toggle')}>Paleta de comandos</button>
        <button onClick={reloadLocal}>Cargar guardado local</button>
        <button onClick={() => editorFacade.loadDemo()}>Abrir demo oficial</button>
        <button onClick={() => exportViewportPng(1)}>Exportar PNG 1x</button>
        <button onClick={() => exportViewportPng(2)}>Exportar PNG 2x</button>
        </>}
      </div>
    </details>
  </div>;
}
