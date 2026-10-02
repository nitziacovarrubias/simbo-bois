import './Outliner.css';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Cuboid, Eye, EyeOff, FolderTree, Lock, Package, Search, Unlock } from 'lucide-react';
import { useEditor } from '../store';
import { uiLabel } from '../uiLabels';

export default function Outliner() {
  const design = useEditor(state => state.design);
  const selected = useEditor(state => state.selectedIds);
  const select = useEditor(state => state.selectWithModifiers);
  const hide = useEditor(state => state.hide);
  const lock = useEditor(state => state.lock);
  const rename = useEditor(state => state.rename);
  const setContextMenu = useEditor(state => state.setContextMenu);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([design.rootAssemblyId]));
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState('');
  const parts = useMemo(() => new Map(design.parts.map(part => [part.id, part])), [design.parts]);
  const assemblies = useMemo(() => new Map(design.assemblies.map(assembly => [assembly.id, assembly])), [design.assemblies]);
  const modulesByRoot = useMemo(() => new Map(design.moduleInstances.filter(instance => !instance.detached).map(instance => [instance.rootAssemblyId, instance])), [design.moduleInstances]);
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const modifiers = (event: React.MouseEvent) => ({ ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey });
  const beginRename = (id: string, name: string) => { setEditingId(id); setEditingName(name); };
  const finishRename = () => { if (editingId && editingName.trim()) rename(editingId, editingName.trim()); setEditingId(undefined); };

  const entityName = (id: string, name: string) => editingId === id
    ? <input className="tree-rename" autoFocus value={editingName} onChange={event => setEditingName(event.target.value)} onBlur={finishRename} onKeyDown={event => { if (event.key === 'Enter') finishRename(); if (event.key === 'Escape') setEditingId(undefined); }} onClick={event => event.stopPropagation()} />
    : <span className="tree-name" onDoubleClick={event => { event.stopPropagation(); beginRename(id, name); }}>{name}</span>;

  const row = (id: string, depth: number): React.ReactNode => {
    const assembly = assemblies.get(id);
    if (assembly) {
      const moduleInstance = modulesByRoot.get(id);
      const label = moduleInstance?.name ?? assembly.name;
      const matches = !query || label.toLowerCase().includes(query.toLowerCase());
      const childRows = assembly.children.map(child => row(child.id, depth + 1)).filter(Boolean);
      if (!matches && !childRows.length) return null;
      const selectId = moduleInstance?.id ?? assembly.id;
      return <div key={id}>
        <div className={`tree-row tree-assembly ${selected.includes(selectId) ? 'selected' : ''}`} style={{ paddingLeft: 6 + depth * 14 }} onClick={event => select(selectId, modifiers(event))} onContextMenu={event => { event.preventDefault(); select(selectId, modifiers(event)); setContextMenu({ x:event.clientX, y:event.clientY, entityId:selectId }); }}>
          <button className="icon disclosure" aria-label={expanded.has(id) ? 'Contraer' : 'Expandir'} onClick={event => { event.stopPropagation(); toggle(id); }}>{expanded.has(id) ? <ChevronDown /> : <ChevronRight />}</button>
          {moduleInstance ? <Package className="tree-type-icon" /> : <FolderTree className="tree-type-icon" />}
          {entityName(selectId, label)}
          {moduleInstance && <span className="tree-kind">Módulo</span>}
          <div className="tree-row-actions">
            <button className="icon" aria-label={assembly.hidden ? 'Mostrar' : 'Ocultar'} onClick={event => { event.stopPropagation(); hide(assembly.id, !assembly.hidden); }}>{assembly.hidden ? <EyeOff /> : <Eye />}</button>
            <button className="icon" aria-label={assembly.locked ? 'Desbloquear' : 'Bloquear'} onClick={event => { event.stopPropagation(); lock(assembly.id, !assembly.locked); }}>{assembly.locked ? <Lock /> : <Unlock />}</button>
          </div>
        </div>
        {expanded.has(id) && childRows}
      </div>;
    }
    const part = parts.get(id);
    if (!part || (query && !part.name.toLowerCase().includes(query.toLowerCase()))) return null;
    return <div key={id} className={`tree-row tree-part ${selected.includes(id) ? 'selected' : ''}`} style={{ paddingLeft: 27 + depth * 14 }} onClick={event => select(id, modifiers(event))} onContextMenu={event => { event.preventDefault(); select(id, modifiers(event)); setContextMenu({ x:event.clientX, y:event.clientY, entityId:id }); }}>
      <Cuboid className="tree-type-icon part" />
      {entityName(id, part.name)}
      <span className="tree-kind">{uiLabel(part.semanticRole)}</span>
      <div className="tree-row-actions">
        <button className="icon" aria-label={part.hidden ? 'Mostrar' : 'Ocultar'} onClick={event => { event.stopPropagation(); hide(id, !part.hidden); }}>{part.hidden ? <EyeOff /> : <Eye />}</button>
        <button className="icon" aria-label={part.locked ? 'Desbloquear' : 'Bloquear'} onClick={event => { event.stopPropagation(); lock(id, !part.locked); }}>{part.locked ? <Lock /> : <Unlock />}</button>
      </div>
    </div>;
  };

  const auxRow=(id:string,name:string,kind:string,hidden=false)=>(!query||`${name} ${kind}`.toLowerCase().includes(query.toLowerCase()))?<div key={id} className={`tree-row tree-part ${selected.includes(id)?'selected':''}`} style={{paddingLeft:27}} onClick={event=>select(id,modifiers(event))} onContextMenu={event=>{event.preventDefault();select(id,modifiers(event));setContextMenu({x:event.clientX,y:event.clientY,entityId:id});}}><Cuboid className="tree-type-icon part"/>{entityName(id,name)}<span className="tree-kind">{kind}</span><div className="tree-row-actions"><button className="icon" aria-label={hidden?'Mostrar':'Ocultar'} onClick={event=>{event.stopPropagation();hide(id,!hidden);}}>{hidden?<EyeOff/>:<Eye/>}</button></div></div>:null;

  return <section className="panel outliner">
    <div className="panel-heading"><div><span className="eyebrow">Espacio de trabajo</span><div className="panel-title">Escena</div></div><span className="entity-count">{design.parts.length+design.applianceInstances.length+design.countertops.length}</span></div>
    <label className="search"><Search /><input placeholder="Buscar en el diseño…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="tree">{row(design.rootAssemblyId, 0)}
      {!!design.applianceInstances.length&&<><div className="tree-section-label">ELECTRODOMÉSTICOS</div>{design.applianceInstances.map(v=>auxRow(v.id,v.name,'electrodoméstico',Boolean(v.hidden)))}</>}
      {!!design.countertops.length&&<><div className="tree-section-label">CUBIERTAS</div>{design.countertops.map(v=>auxRow(v.id,v.name,'cubierta',Boolean(v.hidden)))}</>}
      {!!design.servicePoints.length&&<><div className="tree-section-label">SERVICIOS</div>{design.servicePoints.map(v=>auxRow(v.id,v.name,uiLabel(v.type),Boolean(v.hidden)))}</>}
    </div>
  </section>;
}
