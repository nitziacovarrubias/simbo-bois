import './Inspector.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Layers3, Palette, Ruler, Settings2, Wrench } from 'lucide-react';
import { getPartWorldTransform, normalizeHex, type GrainDirection, type SemanticRole } from '@simbo/design-domain';
import { useEditor } from '../store';
import { editorCommands } from '../commands';
import CADNumericField from './CADNumericField';
import MaterialTextureField from './MaterialTextureField';
import { uiLabel } from '../uiLabels';

const roles: SemanticRole[] = ['GENERIC_PANEL','LEFT_SIDE','RIGHT_SIDE','BOTTOM','TOP','SHELF','BACK','DOOR','DRAWER_FRONT','DRAWER_SIDE','DRAWER_BACK','DRAWER_BOTTOM','FILLER','END_PANEL','TOE_KICK','COUNTERTOP','BACKSPLASH','DECORATIVE_PANEL'];
const grains: GrainDirection[] = ['NONE','HORIZONTAL','VERTICAL','CUSTOM'];

function Section({ title, icon, children, defaultOpen = false }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return <details className="inspector-section" defaultOpen={defaultOpen}>
    <summary>{icon}<span>{title}</span><ChevronDown className="section-chevron" /></summary>
    <div className="inspector-section-body">{children}</div>
  </details>;
}

export default function Inspector() {
  const design = useEditor(state => state.design);
  const ids = useEditor(state => state.selectedIds);
  const selectedSectionId=useEditor(state=>state.selectedSectionId);
  const mutate = useEditor(state => state.mutate);
  const setDims = useEditor(state => state.setPartDimensions);
  const commit = useEditor(state => state.commitTransform);
  const setSectionPosition=useEditor(state=>state.setSectionPosition);
  const setSectionNormal=useEditor(state=>state.setSectionNormal);
  const part = design.parts.find(candidate => candidate.id === ids[0]);
  const assembly = design.assemblies.find(candidate => candidate.id === ids[0]);
  const instance = design.moduleInstances.find(candidate => candidate.id === ids[0]);
  const appliance=design.applianceInstances.find(candidate=>candidate.id===ids[0]);
  const countertop=design.countertops.find(candidate=>candidate.id===ids[0]);
  const cutout=design.cutouts.find(candidate=>candidate.id===ids[0]);
  const service=design.servicePoints.find(candidate=>candidate.id===ids[0]);
  const clearance=design.clearanceZones.find(candidate=>candidate.id===ids[0]);
  const material = useMemo(() => part?.materialId ? design.materials.find(candidate => candidate.id === part.materialId) : undefined, [design.materials, part?.materialId]);
  const [hexDraft, setHexDraft] = useState(material?.colorHex ?? '#B58A63');
  useEffect(() => setHexDraft(material?.colorHex ?? '#B58A63'), [material?.id, material?.colorHex]);
  const section=design.sectionPlanes.find(candidate=>candidate.id===selectedSectionId);
  const runSectionCommand=(id:'section.invert'|'section.look')=>editorCommands.execute(id,{...useEditor.getState(),commandTargetId:section?.id});
  if(section)return <section className="inspector inspector-contextual">
    <div className="inspector-header"><div><span className="eyebrow">Plano de sección</span><h2>{section.name}</h2></div><span className="entity-badge">Sección</span></div>
    <Section title="Posición" icon={<Settings2/>}><div className="vector-grid vector-grid-3">
      <CADNumericField label="X" value={section.position.x} unit="mm" onCommit={value=>setSectionPosition(section.id,{...section.position,x:value})}/>
      <CADNumericField label="Y" value={section.position.y} unit="mm" onCommit={value=>setSectionPosition(section.id,{...section.position,y:value})}/>
      <CADNumericField label="Z" value={section.position.z} unit="mm" onCommit={value=>setSectionPosition(section.id,{...section.position,z:value})}/>
    </div></Section>
    <Section title="Orientación" icon={<Ruler/>}><div className="vector-grid vector-grid-3">
      <CADNumericField label="Nx" value={section.normal.x} unit="none" step={.1} onCommit={value=>setSectionNormal(section.id,{...section.normal,x:value})}/>
      <CADNumericField label="Ny" value={section.normal.y} unit="none" step={.1} onCommit={value=>setSectionNormal(section.id,{...section.normal,y:value})}/>
      <CADNumericField label="Nz" value={section.normal.z} unit="none" step={.1} onCommit={value=>setSectionNormal(section.id,{...section.normal,z:value})}/>
    </div><div className="row"><button onClick={()=>runSectionCommand('section.invert')}>{section.inverted?'Normal':'Invertir'}</button><button className="secondary" onClick={()=>runSectionCommand('section.look')}>Mirar sección</button></div></Section>
    <Section title="Estado" defaultOpen><p className="muted">Corte visual no destructivo · alcance {uiLabel(section.scope??'ALL')} · {section.enabled?'Activo':'Desactivado'}.</p></Section>
  </section>;

  if(appliance){
    const definition=design.applianceDefinitions.find(v=>v.id===appliance.definitionId);
    const dims=definition ? {...definition.dimensions,...appliance.dimensionsOverride} : undefined;
    return <section className="inspector inspector-contextual"><div className="inspector-header"><div><span className="eyebrow">Electrodoméstico</span><h2>{appliance.name}</h2></div><span className="entity-badge">{uiLabel(definition?.category??'OTHER')}</span></div>
      <Section title="General"><p className="muted">{definition?.manufacturer??'DEMO / GENÉRICO'} {definition?.model??''}</p></Section>
      {dims&&<Section title="Dimensiones" icon={<Ruler/>}><div className="vector-grid vector-grid-3"><CADNumericField label="Ancho" value={dims.widthMm} unit="mm" onCommit={value=>mutate(doc=>{const v=doc.applianceInstances.find(x=>x.id===appliance.id);const base=doc.applianceDefinitions.find(x=>x.id===appliance.definitionId)?.dimensions;if(v&&base)v.dimensionsOverride={...base,...v.dimensionsOverride,widthMm:value};})}/><CADNumericField label="Alto" value={dims.heightMm} unit="mm" onCommit={value=>mutate(doc=>{const v=doc.applianceInstances.find(x=>x.id===appliance.id);const base=doc.applianceDefinitions.find(x=>x.id===appliance.definitionId)?.dimensions;if(v&&base)v.dimensionsOverride={...base,...v.dimensionsOverride,heightMm:value};})}/><CADNumericField label="Prof." value={dims.depthMm} unit="mm" onCommit={value=>mutate(doc=>{const v=doc.applianceInstances.find(x=>x.id===appliance.id);const base=doc.applianceDefinitions.find(x=>x.id===appliance.definitionId)?.dimensions;if(v&&base)v.dimensionsOverride={...base,...v.dimensionsOverride,depthMm:value};})}/></div></Section>}
      <Section title="Instalación" defaultOpen={false}><p className="muted">Abertura requerida: {definition?.requiredOpening?`${definition.requiredOpening.widthMm}×${definition.requiredOpening.heightMm}×${definition.requiredOpening.depthMm} mm`:'No definido'}.</p></Section>
      <Section title="Servicios" defaultOpen={false}><div className="compact-list">{definition?.serviceRequirements.map((r,i)=><span className="chip" key={i}>{r.required?'Requiere':'Prefiere'} {uiLabel(r.serviceType)}{r.maxDistanceMm?` ≤ ${r.maxDistanceMm} mm`:''}</span>)}</div></Section>
      <Section title="Holguras" defaultOpen={false}><span className="chip">{design.clearanceZones.filter(z=>z.ownerId===appliance.id).length} zonas</span></Section>
    </section>;
  }
  if(countertop)return <section className="inspector inspector-contextual"><div className="inspector-header"><div><span className="eyebrow">Cubierta</span><h2>{countertop.name}</h2></div><span className="entity-badge">Cubierta</span></div><Section title="Dimensiones" icon={<Ruler/>}><div className="vector-grid vector-grid-2"><CADNumericField label="Grosor" value={countertop.thicknessMm} unit="mm" min={1} onCommit={value=>mutate(doc=>{const target=doc.countertops.find(v=>v.id===countertop.id);if(target)target.thicknessMm=value;})}/><CADNumericField label="Altura" value={countertop.heightMm} unit="mm" onCommit={value=>mutate(doc=>{const target=doc.countertops.find(v=>v.id===countertop.id);if(target)target.heightMm=value;})}/></div></Section><Section title="Recortes" defaultOpen={false}><span className="chip">{countertop.cutoutIds.length} recortes</span></Section></section>;
  if(cutout)return <section className="inspector inspector-contextual"><div className="inspector-header"><div><span className="eyebrow">Recorte</span><h2>{uiLabel(cutout.type)}</h2></div><span className="entity-badge">Recorte</span></div><Section title="Recortes"><div className="vector-grid vector-grid-2"><CADNumericField label="Ancho" value={cutout.widthMm} unit="mm" min={1} onCommit={value=>mutate(doc=>{const target=doc.cutouts.find(v=>v.id===cutout.id);if(target)target.widthMm=value;})}/><CADNumericField label="Prof." value={cutout.depthMm} unit="mm" min={1} onCommit={value=>mutate(doc=>{const target=doc.cutouts.find(v=>v.id===cutout.id);if(target)target.depthMm=value;})}/></div></Section></section>;
  if(service)return <section className="inspector inspector-contextual"><div className="inspector-header"><div><span className="eyebrow">Punto de servicio</span><h2>{service.name}</h2></div><span className="entity-badge">{uiLabel(service.type)}</span></div><Section title="General"><div className="vector-grid vector-grid-3"><CADNumericField label="X" value={service.position.x} unit="mm" onCommit={value=>commit(service.id,{...service.position,x:value},service.orientation??{x:0,y:0,z:0})}/><CADNumericField label="Y" value={service.position.y} unit="mm" onCommit={value=>commit(service.id,{...service.position,y:value},service.orientation??{x:0,y:0,z:0})}/><CADNumericField label="Z" value={service.position.z} unit="mm" onCommit={value=>commit(service.id,{...service.position,z:value},service.orientation??{x:0,y:0,z:0})}/></div></Section></section>;
  if(clearance)return <section className="inspector inspector-contextual"><div className="inspector-header"><div><span className="eyebrow">Zona de holgura</span><h2>{clearance.name}</h2></div><span className="entity-badge">{uiLabel(clearance.type)}</span></div><Section title="Holguras"><p className="muted">{clearance.description}</p><span className="chip">{uiLabel(clearance.severity)}</span></Section></section>;

  if (!part) {
    if (assembly || instance) return <section className="inspector inspector-contextual">
      <div className="inspector-header"><div><span className="eyebrow">Propiedades</span><h2>{assembly?.name ?? instance?.name}</h2></div><span className="entity-badge">{assembly ? 'Conjunto' : 'Módulo'}</span></div>
      <Section title="Jerarquía" icon={<Layers3 />}>
        <p className="muted">{assembly ? `${assembly.children.length} elementos directos en este conjunto.` : 'Instancia paramétrica. La geometría visible mantiene transformaciones locales en sus piezas.'}</p>
      </Section>
      <Section title="Edición contextual" icon={<Settings2 />} defaultOpen>
        <p className="muted">Usa Mover/Rotar en el área de diseño para transformar el conjunto. Las propiedades manufacturables de las piezas se editan al seleccionar una pieza.</p>
      </Section>
    </section>;
    return <section className="inspector inspector-empty">
      <div className="inspector-header"><div><span className="eyebrow">Propiedades CAD</span><h2>Sin selección</h2></div></div>
      <div className="empty-state-card"><Settings2 /><b>Selecciona una pieza o módulo</b><span>Edita transformación, dimensiones, material y manufactura desde este panel contextual.</span></div>
    </section>;
  }

  const transform = getPartWorldTransform(design, part.id);
  const updateTransform = (key: 'position' | 'rotation', axis: 'x' | 'y' | 'z', value: number) => {
    const position = { ...transform.position };
    const rotation = { ...transform.rotation };
    if (key === 'position') position[axis] = value;
    else rotation[axis] = value * Math.PI / 180;
    commit(part.id, position, rotation);
  };
  const commitHex = () => {
    if (!material) return;
    const normalized = normalizeHex(hexDraft, material.colorHex);
    setHexDraft(normalized);
    mutate(doc => { const target=doc.materials.find(candidate => candidate.id === material.id); if(target)target.colorHex = normalized; });
  };

  return <section className="inspector">
    <div className="inspector-header">
      <div><span className="eyebrow">Pieza · {uiLabel(part.semanticRole)}</span><h2>{part.name}</h2></div>
      <span className="entity-badge">Panel</span>
    </div>

    <Section title="Transformación" icon={<Settings2 />}>
      <div className="vector-grid vector-grid-3">
        <CADNumericField label="X" value={transform.position.x} unit="mm" onCommit={value => updateTransform('position','x',value)} />
        <CADNumericField label="Y" value={transform.position.y} unit="mm" onCommit={value => updateTransform('position','y',value)} />
        <CADNumericField label="Z" value={transform.position.z} unit="mm" onCommit={value => updateTransform('position','z',value)} />
      </div>
      <div className="vector-grid vector-grid-3">
        <CADNumericField label="Rot X" value={transform.rotation.x * 180 / Math.PI} unit="deg" step={1} onCommit={value => updateTransform('rotation','x',value)} />
        <CADNumericField label="Rot Y" value={transform.rotation.y * 180 / Math.PI} unit="deg" step={1} onCommit={value => updateTransform('rotation','y',value)} />
        <CADNumericField label="Rot Z" value={transform.rotation.z * 180 / Math.PI} unit="deg" step={1} onCommit={value => updateTransform('rotation','z',value)} />
      </div>
    </Section>

    <Section title="Dimensiones" icon={<Ruler />} defaultOpen>
      <div className="vector-grid vector-grid-3">
        <CADNumericField label="Ancho" value={part.dimensions.widthMm} unit="mm" min={1} onCommit={value => setDims(part.id,value,part.dimensions.heightMm,part.dimensions.thicknessMm)} />
        <CADNumericField label="Alto" value={part.dimensions.heightMm} unit="mm" min={1} onCommit={value => setDims(part.id,part.dimensions.widthMm,value,part.dimensions.thicknessMm)} />
        <CADNumericField label="Grosor" value={part.dimensions.thicknessMm} unit="mm" min={1} onCommit={value => setDims(part.id,part.dimensions.widthMm,part.dimensions.heightMm,value)} />
      </div>
    </Section>

    <Section title="Apariencia" icon={<Palette />}>
      <label className="cad-select-field"><span>Material</span><select value={part.materialId ?? ''} onChange={event => mutate(doc => { const target=doc.parts.find(candidate => candidate.id === part.id); if(target)target.materialId = event.target.value; })}>{design.materials.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {material && <>
        <div className="color-control"><input className="color-swatch" aria-label="Selector de color" type="color" value={material.colorHex} onChange={event => { const value = event.target.value.toUpperCase(); setHexDraft(value); mutate(doc => { const target=doc.materials.find(candidate => candidate.id === material.id); if(target)target.colorHex = value; }); }} /><label><span>HEX</span><input value={hexDraft} onChange={event => setHexDraft(event.target.value)} onBlur={commitHex} onKeyDown={event => { if (event.key === 'Enter') { commitHex(); event.currentTarget.blur(); } if (event.key === 'Escape') { setHexDraft(material.colorHex); event.currentTarget.blur(); } }} /></label></div>
        <MaterialTextureField key={material.id} material={material} onChange={dataUrl=>mutate(doc=>{const target=doc.materials.find(m=>m.id===material.id);if(target){if(dataUrl)target.metadata.textureDataUrl=dataUrl;else delete target.metadata.textureDataUrl;}})}/>
        <div className="vector-grid vector-grid-2"><CADNumericField label="Rugosidad" value={material.roughness ?? .6} unit="none" step={.05} min={0} max={1} onCommit={value => mutate(doc => { const target=doc.materials.find(candidate => candidate.id === material.id); if(target)target.roughness = value; })} /><CADNumericField label="Metalizado" value={material.metalness ?? 0} unit="none" step={.05} min={0} max={1} onCommit={value => mutate(doc => { const target=doc.materials.find(candidate => candidate.id === material.id); if(target)target.metalness = value; })} /></div>
      </>}
    </Section>

    <Section title="Manufactura" icon={<Wrench />}>
      <label className="cad-select-field"><span>Rol semántico</span><select value={part.semanticRole} onChange={event => mutate(doc => { const target=doc.parts.find(candidate => candidate.id === part.id); if(target)target.semanticRole = event.target.value as SemanticRole; })}>{roles.map(role => <option key={role} value={role}>{uiLabel(role)}</option>)}</select></label>
      <label className="cad-select-field"><span>Veta</span><select value={part.grainDirection} onChange={event => mutate(doc => { const target=doc.parts.find(candidate => candidate.id === part.id); if(target)target.grainDirection = event.target.value as GrainDirection; })}>{grains.map(grain => <option key={grain} value={grain}>{uiLabel(grain)}</option>)}</select></label>
      <div className="edge-band-grid">{(['TOP','BOTTOM','LEFT','RIGHT'] as const).map(edge => <label key={edge}><input type="checkbox" checked={part.edgeBanding[edge].mode === 'EDGE_BAND'} onChange={event => mutate(doc => { const target=doc.parts.find(candidate => candidate.id === part.id); if(target)target.edgeBanding[edge] = { mode: event.target.checked ? 'EDGE_BAND' : 'NONE' }; })} /><span>{edge==='TOP'?'Superior':edge==='BOTTOM'?'Inferior':edge==='LEFT'?'Izquierdo':'Derecho'}</span></label>)}</div>
    </Section>

    <Section title="Uniones" defaultOpen={false}>
      <div className="compact-list">{design.joints.filter(joint => joint.partAId === part.id || joint.partBId === part.id).map(joint => <span key={joint.id} className="chip">{uiLabel(joint.type)} · {joint.hardwareInstanceIds.length} herrajes</span>)}{!design.joints.some(joint => joint.partAId === part.id || joint.partBId === part.id) && <span className="muted">Sin uniones asociadas.</span>}</div>
    </Section>
    <Section title="Mecanizado" defaultOpen={false}>
      <span className="chip">{design.machiningFeatures.filter(feature => feature.partId === part.id).length} operaciones</span>
    </Section>
  </section>;
}
