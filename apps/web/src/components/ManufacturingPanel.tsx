import './ManufacturingPanel.css';
import { useMemo } from 'react';
import { useEditor } from '../store';
import type { EdgeBanding } from '@simbo/design-domain';
import { uiLabel } from '../uiLabels';

export default function ManufacturingPanel() {
  const design = useEditor(state => state.design);
  const data = useMemo(() => useEditor.getState().manufacturing(), [design]);
  return <section className="panel manufacturing">
    <div className="panel-title">Datos de manufactura</div>
    <div className="stats"><div><b>{data.summary.partCount}</b><span>Piezas</span></div><div><b>{data.summary.hardwareCount}</b><span>Herrajes</span></div><div><b>{data.summary.machiningCount}</b><span>Mecanizados</span></div></div>
    <p className="muted manufacturing-note">Piezas y herrajes del diseño actual.</p>
    <div className="table-wrap"><table><thead><tr><th>Pieza</th><th>Rol</th><th>Medidas mm</th><th>Material</th><th>HEX</th><th>Veta</th><th>Canteado</th><th>Mecanizado</th></tr></thead><tbody>{data.parts.map(part => <tr key={part.id}><td>{part.name}</td><td>{uiLabel(part.semanticRole)}</td><td>{part.widthMm} × {part.heightMm} × {part.thicknessMm}</td><td>{part.material?.name ?? '—'}</td><td>{part.colorHex ?? '—'}</td><td>{uiLabel(part.grainDirection)}</td><td>{Object.entries(part.edgeBanding as EdgeBanding).filter(([, value]) => value.mode === 'EDGE_BAND').map(([key]) => key).join(', ') || '—'}</td><td>{part.machiningFeatures.length}</td></tr>)}</tbody></table></div>
    <div className="panel-subtitle">Lista de herrajes</div>{data.hardware.map(hardware => <div key={`${hardware.definitionId}${JSON.stringify(hardware.parameters)}`} className="joint-row"><span>{hardware.quantity} × <b>{hardware.name}</b></span><small>{Object.entries(hardware.parameters).map(([key,value]) => `${key}: ${String(value)}`).join(' · ')}</small></div>)}
  </section>;
}
