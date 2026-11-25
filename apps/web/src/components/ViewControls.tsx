import './ViewControls.css';
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  CircleHelp,
  Command,
  Focus,
  Grid3X3,
  Maximize2,
  SlidersHorizontal,
  Compass,
} from 'lucide-react';
import type { QualityPreset, WallsMode } from '../cadVisualSystem';
import { useEditor } from '../store';
import { runEditorCommand } from '../commandRuntime';
import EditorHelpDialog from './EditorHelpDialog';

const modes = [
  ['SHADED', 'Sombreado'],
  ['TECHNICAL', 'Técnico'],
  ['PRESENTATION', 'Presentación'],
  ['HIDDEN_LINE', 'Línea oculta'],
  ['XRAY', 'Rayos X'],
  ['MONOCHROME', 'Monocromo'],
  ['WIREFRAME', 'Alámbrico'],
  ['MANUFACTURING', 'Manufactura'],
] as const;

const views = [
  ['view.isometric', 'Isométrica'],
  ['view.top', 'Superior (planta)'],
  ['view.front', 'Frontal'],
  ['view.back', 'Posterior'],
  ['view.left', 'Izquierda'],
  ['view.right', 'Derecha'],
  ['view.bottom', 'Inferior'],
] as const;

const selectionFilterLabels: Record<string, string> = {
  PARTS: 'Piezas',
  ASSEMBLIES: 'Conjuntos',
  MODULES: 'Módulos',
  ROOM: 'Habitación',
  HARDWARE: 'Herrajes',
  APPLIANCES: 'Electrodomésticos',
  COUNTERTOPS: 'Cubiertas',
  CUTOUTS: 'Recortes',
  SERVICES: 'Servicios',
  CLEARANCES: 'Holguras',
  FUNCTIONAL_ZONES: 'Zonas funcionales',
  SECTIONS: 'Secciones',
  GUIDES: 'Guías',
};

export default function ViewControls() {
  const display = useEditor((state) => state.displayMode);
  const setDisplay = useEditor((state) => state.setDisplayMode);
  const camera = useEditor((state) => state.camera);
  const selectedCount = useEditor((state) => state.selectedIds.length);
  const gridVisible = useEditor((state) => state.gridVisible);
  const setGridVisible = useEditor((state) => state.setGridVisible);
  const workspace = useEditor((state) => state.workspace);
  const setQualityPreset = useEditor((state) => state.setQualityPreset);
  const setWallsMode = useEditor((state) => state.setWallsMode);
  const selectionFilters = useEditor((state) => state.selectionFilters);
  const setSelectionFilter = useEditor((state) => state.setSelectionFilter);
  const [helpOpen, setHelpOpen] = useState(false);
  const viewMenu = useRef<HTMLDetailsElement>(null);
  const viewSettings = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      for (const element of [viewMenu.current, viewSettings.current]) {
        if (element && !element.contains(event.target as Node)) element.open = false;
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const goToView = (id: string) => {
    runEditorCommand(id);
    viewMenu.current?.removeAttribute('open');
  };

  return (
    <div className="viewport-head-controls" role="toolbar" aria-label="Controles de vista">
      <div className="view-quick-actions" role="group" aria-label="Encuadre">
        <button
          type="button"
          title="Ajustar todo"
          aria-label="Ajustar todo"
          onClick={() => runEditorCommand('camera.fitAll')}
        >
          <Maximize2 aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Ajustar habitación"
          aria-label="Ajustar habitación"
          onClick={() => runEditorCommand('camera.fitRoom')}
        >
          <Box aria-hidden="true" />
        </button>
        <button
          type="button"
          title={selectedCount ? 'Enfocar selección' : 'Selecciona una pieza para enfocarla'}
          aria-label="Enfocar selección"
          disabled={!selectedCount}
          onClick={() => runEditorCommand('camera.focus')}
        >
          <Focus aria-hidden="true" />
        </button>
      </div>
      <details
        className="view-menu"
        ref={viewMenu}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            viewMenu.current?.removeAttribute('open');
            event.stopPropagation();
          }
        }}
      >
        <summary title="Elegir orientación de cámara" aria-label="Elegir orientación de cámara">
          <Compass aria-hidden="true" />
        </summary>
        <div className="view-menu-popover">
          {views.map(([id, label]) => (
            <button type="button" key={id} onClick={() => goToView(id)}>
              {label}
            </button>
          ))}
          <hr />
          <button type="button" onClick={() => goToView('view.previous')}>
            Vista anterior
          </button>
          <button type="button" onClick={() => goToView('view.next')}>
            Vista siguiente
          </button>
          <button type="button" onClick={() => goToView('view.projection')}>
            {camera.projection === 'PERSPECTIVE'
              ? 'Proyección ortográfica'
              : 'Proyección perspectiva'}
          </button>
        </div>
      </details>
      <select
        title="Estilo de visualización"
        className="display-mode-select"
        aria-label="Modo de visualización"
        value={display}
        onChange={(event) => setDisplay(event.target.value as typeof display)}
      >
        {modes.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        title={
          display === 'PRESENTATION'
            ? 'La cuadrícula está oculta en presentación'
            : gridVisible
              ? 'Ocultar cuadrícula'
              : 'Mostrar cuadrícula'
        }
        aria-label="Cuadrícula"
        aria-pressed={gridVisible && display !== 'PRESENTATION'}
        disabled={display === 'PRESENTATION'}
        className={gridVisible ? 'view-toggle-active' : ''}
        onClick={() => setGridVisible(!gridVisible)}
      >
        <Grid3X3 aria-hidden="true" />
      </button>
      <details
        className="view-settings-menu"
        ref={viewSettings}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            viewSettings.current?.removeAttribute('open');
            event.stopPropagation();
          }
        }}
      >
        <summary title="Opciones de visualización" aria-label="Opciones de visualización">
          <SlidersHorizontal aria-hidden="true" />
        </summary>
        <div className="view-settings-popover">
          <label>
            Calidad de imagen
            <select
              aria-label="Calidad"
              value={workspace.qualityPreset}
              onChange={(event) => setQualityPreset(event.target.value as QualityPreset)}
            >
              <option value="PERFORMANCE">Rendimiento</option>
              <option value="BALANCED">Equilibrada</option>
              <option value="QUALITY">Calidad</option>
            </select>
          </label>
          <label>
            Visualización de paredes
            <select
              aria-label="Paredes"
              value={workspace.wallsMode}
              onChange={(event) => setWallsMode(event.target.value as WallsMode)}
            >
              <option value="VISIBLE">Visibles</option>
              <option value="TRANSPARENT">Transparentes</option>
              <option value="HIDDEN">Ocultas</option>
              <option value="AUTO">Automático</option>
            </select>
          </label>
          <details className="selection-filter-menu">
            <summary>
              Filtros de selección <ChevronDown aria-hidden="true" />
            </summary>
            <div>
              {(Object.keys(selectionFilters) as Array<keyof typeof selectionFilters>).map(
                (kind) => (
                  <label key={kind}>
                    <input
                      type="checkbox"
                      checked={selectionFilters[kind]}
                      onChange={(event) => setSelectionFilter(kind, event.target.checked)}
                    />
                    {selectionFilterLabels[String(kind)] ?? String(kind)}
                  </label>
                ),
              )}
            </div>
          </details>
        </div>
      </details>
      <button
        type="button"
        title="Buscar comandos · Ctrl/Cmd + K"
        aria-label="Buscar comandos"
        className="command-search-button"
        onClick={() => runEditorCommand('palette.toggle')}
      >
        <Command aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Guía rápida del editor"
        aria-label="Ayuda del editor"
        onClick={() => setHelpOpen(true)}
      >
        <CircleHelp aria-hidden="true" />
      </button>
      {helpOpen && <EditorHelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
