import './HealthPanel.css';
import { useMemo, useState } from 'react';
import { useEditor } from '../store';
import { uiLabel } from '../uiLabels';

export default function HealthPanel() {
  const [showAll, setShowAll] = useState(false);
  const design = useEditor(state => state.design);
  const select = useEditor(state => state.select);
  const focus = useEditor(state => state.focusSelected);
  const issues = useMemo(() => useEditor.getState().health(), [design]);
  const groups = {
    ERROR: issues.filter(issue => issue.severity === 'ERROR'),
    WARNING: issues.filter(issue => issue.severity === 'WARNING'),
    INFO: issues.filter(issue => issue.severity === 'INFO')
  };
  const shown = showAll ? issues : issues.slice(0, 5);
  const issueTitle = (code:string) => ({ OUTSIDE_ROOM:'Fuera de la habitación', COLLISION:'Posible interferencia', CLEARANCE_OUTSIDE_ROOM:'Área de apertura fuera del espacio' } as Record<string,string>)[code] ?? code.replaceAll('_',' ').toLowerCase();
  return <section className="panel health-panel">
    <div className="panel-title">Salud del modelo</div>
    <div className="stats"><div><b>{groups.ERROR.length}</b><span>Errores</span></div><div><b>{groups.WARNING.length}</b><span>Advertencias</span></div><div><b>{groups.INFO.length}</b><span>Información</span></div></div>
    {issues.length === 0 ? <div className="success">✓ Sin incidencias</div> : shown.map((issue, index) => <button className={`issue ${issue.severity.toLowerCase()}`} key={`${issue.code}${issue.entityId}${index}`} onClick={() => { if (issue.entityId) { select(issue.entityId); setTimeout(() => focus(), 0); } }}><b title={issue.code}>{issueTitle(issue.code)}</b><span>{issue.message}</span><small>{uiLabel(issue.severity)} · Enfocar ↗</small></button>)}
    {issues.length > 5 && <button className="health-more" type="button" onClick={()=>setShowAll(value=>!value)} aria-expanded={showAll}>{showAll ? 'Ver menos' : `Ver todas las incidencias (${issues.length})`}</button>}
  </section>;
}
