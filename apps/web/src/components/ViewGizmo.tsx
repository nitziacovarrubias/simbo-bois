import './ViewGizmo.css';
import {
  Box,
  Compass,
  MoveDown,
  MoveLeft,
  MoveRight,
  PanelTop,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';
import { runEditorCommand } from '../commandRuntime';

const viewItems = [
  { id: 'view.top', label: 'Superior', short: 'Sup.', Icon: PanelTop },
  { id: 'view.isometric', label: 'Isométrica', short: 'ISO', Icon: Box },
  { id: 'view.front', label: 'Frontal', short: 'Frente', Icon: Eye },
  { id: 'view.left', label: 'Izquierda', short: 'Izq.', Icon: MoveLeft },
  { id: 'view.back', label: 'Posterior', short: 'Atrás', Icon: RotateCcw },
  { id: 'view.right', label: 'Derecha', short: 'Der.', Icon: MoveRight },
  { id: 'view.bottom', label: 'Inferior', short: 'Inferior', Icon: MoveDown },
] as const;

export default function ViewGizmo() {
  const [viewsOpen, setViewsOpen] = useState(true);

  return (
    <nav
      className={`simbo-view-gizmo ${viewsOpen ? '' : 'view-gizmo-collapsed'}`}
      aria-label="Vistas de cámara"
    >
      <div className="view-gizmo-heading">
        <Compass aria-hidden="true" />
        <span>Vistas</span>
        <button
          className="view-gizmo-toggle"
          type="button"
          aria-label={viewsOpen ? 'Ocultar vistas de cámara' : 'Mostrar vistas de cámara'}
          title={viewsOpen ? 'Ocultar vistas' : 'Mostrar vistas'}
          aria-expanded={viewsOpen}
          aria-controls="simbo-camera-views"
          onClick={() => setViewsOpen((open) => !open)}
        >
          {viewsOpen ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {viewsOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </button>
      </div>
      <div id="simbo-camera-views" className="view-gizmo-grid" hidden={!viewsOpen}>
        {viewItems.map(({ id, label, short, Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={`Vista ${label}`}
            title={`Vista ${label}`}
            onClick={() => runEditorCommand(id)}
          >
            <Icon aria-hidden="true" />
            <span>{short}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
