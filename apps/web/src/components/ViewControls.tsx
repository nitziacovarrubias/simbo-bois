import './ViewControls.css';
import { Box, ChevronDown, Command, Focus, Maximize2, SlidersHorizontal, Compass } from 'lucide-react';
import type { QualityPreset, WallsMode } from '../cadVisualSystem';
import { useEditor } from '../store';
import { runEditorCommand } from '../commandRuntime';
import { DEMO_FOCUSED_UI } from '../demoUiConfig';

const modes = [
  ['SHADED', 'Sombreado'], ['TECHNICAL', 'Técnico'], ['PRESENTATION', 'Presentación'], ['HIDDEN_LINE', 'Línea oculta'],
  ['XRAY', 'Rayos X'], ['MONOCHROME', 'Monocromo'], ['WIREFRAME', 'Alámbrico'], ['MANUFACTURING', 'Manufactura']
] as const;

const selectionFilterLabels: Record<string, string> = {
  PARTS:'Piezas', ASSEMBLIES:'Conjuntos', MODULES:'Módulos', ROOM:'Habitación', HARDWARE:'Herrajes',
  APPLIANCES:'Electrodomésticos', COUNTERTOPS:'Cubiertas', CUTOUTS:'Recortes', SERVICES:'Servicios',
  CLEARANCES:'Holguras', FUNCTIONAL_ZONES:'Zonas funcionales', SECTIONS:'Secciones', GUIDES:'Guías'
};

export default function ViewControls() {
  const display = useEditor(state => state.displayMode);
  const setDisplay = useEditor(state => state.setDisplayMode);
  const camera = useEditor(state => state.camera);
  const workspace = useEditor(state => state.workspace);
  const setQualityPreset = useEditor(state => state.setQualityPreset);
  const setWallsMode = useEditor(state => state.setWallsMode);
  const selectionFilters = useEditor(state => state.selectionFilters);
  const setSelectionFilter = useEditor(state => state.setSelectionFilter);

  return <div className="viewport-head-controls" role="toolbar" aria-label="Controles de vista">
    <div className="view-quick-actions" role="group" aria-label="Encuadre">
      <button title="Ajustar todo" aria-label="Ajustar todo" onClick={() => runEditorCommand('camera.fitAll')}><Maximize2 aria-hidden="true"/></button>
      <button title="Ajustar habitación" aria-label="Ajustar habitación" onClick={() => runEditorCommand('camera.fitRoom')}><Box aria-hidden="true"/></button>
      <button title="Enfocar selección" aria-label="Enfocar selección" onClick={() => runEditorCommand('camera.focus')}><Focus aria-hidden="true"/></button>
    </div>
    <details className="view-menu">
      <summary title="Elegir orientación de cámara" aria-label="Elegir orientación de cámara"><Compass aria-hidden="true"/></summary>
      <div className="view-menu-popover">
        <button onClick={() => runEditorCommand('view.top')}>Superior</button>
        <button onClick={() => runEditorCommand('view.front')}>Frontal</button>
        {!DEMO_FOCUSED_UI && <button onClick={() => runEditorCommand('view.back')}>Posterior</button>}
        {!DEMO_FOCUSED_UI && <button onClick={() => runEditorCommand('view.left')}>Izquierda</button>}
        <button onClick={() => runEditorCommand('view.right')}>Derecha</button>
        {!DEMO_FOCUSED_UI && <button onClick={() => runEditorCommand('view.bottom')}>Inferior</button>}
        <button onClick={() => runEditorCommand('view.isometric')}>Isométrica</button>
        <hr />
        {!DEMO_FOCUSED_UI && <button onClick={() => runEditorCommand('view.previous')}>Vista anterior</button>}
        {!DEMO_FOCUSED_UI && <button onClick={() => runEditorCommand('view.next')}>Vista siguiente</button>}
        <button onClick={() => runEditorCommand('view.projection')}>{camera.projection === 'PERSPECTIVE' ? 'Cambiar a ortográfica' : 'Cambiar a perspectiva'}</button>
      </div>
    </details>
    <select title="Estilo de visualización" className="display-mode-select" aria-label="Modo de visualización" value={display} onChange={event => setDisplay(event.target.value as typeof display)}>{modes.filter(([value]) => !DEMO_FOCUSED_UI || ['SHADED','TECHNICAL','MANUFACTURING'].includes(value) || value === display).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <details className="view-settings-menu">
      <summary title="Opciones de visualización" aria-label="Opciones de visualización"><SlidersHorizontal aria-hidden="true"/></summary>
      <div className="view-settings-popover">
        <label>Calidad de imagen<select aria-label="Calidad" value={workspace.qualityPreset} onChange={event => setQualityPreset(event.target.value as QualityPreset)}><option value="PERFORMANCE">Rendimiento</option><option value="BALANCED">Balanceado</option><option value="QUALITY">Calidad</option></select></label>
        <label>Visualización de paredes<select aria-label="Paredes" value={workspace.wallsMode} onChange={event => setWallsMode(event.target.value as WallsMode)}><option value="VISIBLE">Paredes</option><option value="TRANSPARENT">Paredes transparentes</option><option value="HIDDEN">Sin paredes</option><option value="AUTO">Automático</option></select></label>
        <details className="selection-filter-menu"><summary>Filtros de selección <ChevronDown aria-hidden="true"/></summary><div>{(Object.keys(selectionFilters) as Array<keyof typeof selectionFilters>).map(kind => <label key={kind}><input type="checkbox" checked={selectionFilters[kind]} onChange={event => setSelectionFilter(kind, event.target.checked)} />{selectionFilterLabels[String(kind)] ?? String(kind)}</label>)}</div></details>
      </div>
    </details>
    {!DEMO_FOCUSED_UI && <button className="command-search-button" title="Paleta de comandos" aria-label="Paleta de comandos" onClick={() => runEditorCommand('palette.toggle')}><Command aria-hidden="true"/></button>}
  </div>;
}
