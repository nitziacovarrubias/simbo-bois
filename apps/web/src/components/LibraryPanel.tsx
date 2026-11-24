import './LibraryPanel.css';
import { useEffect, useMemo, useState } from 'react';
import { Box, Search, Boxes, Microwave, Palette, Wrench, Plus, RefreshCw } from 'lucide-react';
import { createMaterial, type ApplianceCategory } from '@simbo/design-domain';
import { installPortableModule, instantiateModule } from '@simbo/module-engine';
import { apiClient, type SharedModuleEntry } from '../apiClient';
import { useEditor } from '../store';
import { uiLabel } from '../uiLabels';
import DesignThumbnail, { modulePreviewParts } from './DesignThumbnail';
import MaterialTextureField from './MaterialTextureField';
import SharedDialog from './SharedDialog';

type Tab = 'MODULES' | 'APPLIANCES' | 'MATERIALS' | 'HARDWARE';
const tabLabel: Record<Tab, string> = { MODULES:'Módulos', APPLIANCES:'Electrodomésticos', MATERIALS:'Materiales', HARDWARE:'Herrajes' };

export default function LibraryPanel({ onCreateModule }: { onCreateModule?: () => void }) {
  const design = useEditor(state => state.design);
  const mutate = useEditor(state => state.mutate);
  const insertAppliance = useEditor(state => state.insertApplianceDefinition);
  const insertModule = useEditor(state => state.insertModule);
  const [tab, setTab] = useState<Tab>('MODULES');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'ALL' | ApplianceCategory>('ALL');
  const [shared,setShared]=useState<SharedModuleEntry[]>([]);
  const [loadingShared,setLoadingShared]=useState(false);
  const [error,setError]=useState('');
  const [newMaterial,setNewMaterial]=useState(false);
  const [materialName,setMaterialName]=useState('');
  const [materialColor,setMaterialColor]=useState('#B58A63');
  const q = query.trim().toLowerCase();
  const appliances = useMemo(() => design.applianceDefinitions.filter(definition => (category === 'ALL' || definition.category === category) && (!q || `${definition.name} ${definition.category} ${definition.manufacturer ?? ''} ${definition.model ?? ''}`.toLowerCase().includes(q))), [design.applianceDefinitions, category, q]);
  const categories = useMemo(() => ['ALL', ...new Set(design.applianceDefinitions.map(value => value.category))] as Array<'ALL' | ApplianceCategory>, [design.applianceDefinitions]);
  const fetchShared = async () => {
    if (!apiClient.hasSession()) return;
    setLoadingShared(true);
    try {setShared(await apiClient.modules());setError('');}
    catch { setError('No se pudo consultar la biblioteca compartida.'); }
    finally {setLoadingShared(false);}
  };
  useEffect(()=>{void fetchShared();},[]);
  const local = design.moduleDefinitions.filter(def=>!q||`${def.name} ${def.tags.join(' ')}`.toLowerCase().includes(q));
  const external=shared.filter(entry=>!design.moduleDefinitions.some(def=>def.id===entry.definitionId) && (!q || entry.name.toLowerCase().includes(q)));
  const insertShared=(entry:SharedModuleEntry)=>{
    setError('');
    try {mutate(doc=>{installPortableModule(doc,entry.definitionJson,entry.versionJson);instantiateModule(doc,entry.definitionId,{position:{x:500,y:0,z:500}});});}
    catch(reason){setError(reason instanceof Error?reason.message:'No se pudo insertar el módulo compartido.');}
  };
  const addMaterial=()=>{
    const name=materialName.trim();if(!name)return;
    mutate(doc=>{const material=createMaterial(name,materialColor);delete material.metadata.demo;doc.materials.push(material);});
    setNewMaterial(false);setMaterialName('');setMaterialColor('#B58A63');
  };
  return <section className="panel library-panel">
    <div className="panel-heading"><div><span className="eyebrow">Diseño</span><div className="panel-title">Biblioteca</div></div><Box /></div>
    <div className="library-tabs">{(['MODULES','APPLIANCES','MATERIALS','HARDWARE'] as const).map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)} title={tabLabel[value]} aria-label={tabLabel[value]} aria-pressed={tab === value}>{value === 'MODULES' ? <Boxes aria-hidden="true"/> : value === 'APPLIANCES' ? <Microwave aria-hidden="true"/> : value === 'MATERIALS' ? <Palette aria-hidden="true"/> : <Wrench aria-hidden="true"/>}<span className="sr-only">{tabLabel[value]}</span></button>)}</div>
    <label className="search"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar…" aria-label="Buscar en biblioteca" /></label>
    {error && <p className="library-error" role="alert">{error}</p>}
    {tab === 'MODULES' && <>
      <div className="library-actions">
        {onCreateModule&&<button type="button" className="library-create" onClick={onCreateModule}><Plus size={16}/> Crear módulo</button>}
        <button type="button" className="library-refresh" onClick={()=>void fetchShared()} disabled={loadingShared} title="Actualizar biblioteca compartida" aria-label="Actualizar biblioteca"><RefreshCw size={16}/></button>
      </div>
      <div className="library-list library-module-list">
        {local.map(definition=>{
          const version=design.moduleVersions.find(value=>value.id===definition.currentVersionId);
          return <article className="library-module-card" key={definition.id}>
            <div className="library-module-preview"><DesignThumbnail parts={version?modulePreviewParts(version):[]} label={`Vista previa del módulo ${definition.name}`} empty="Sin vista previa" /></div>
            <div className="library-module-content"><b title={definition.name}>{definition.name}</b><small>{version?.snapshot.parts.length??0} piezas · Módulo del proyecto</small>
              <button type="button" onClick={()=>{try{setError('');insertModule(definition.id);}catch(reason){setError(reason instanceof Error?reason.message:'No se pudo insertar el módulo.');}}}><Plus size={15}/> Insertar</button>
            </div>
          </article>;
        })}
        {external.map(entry=><article className="library-module-card" key={entry.id}>
          <div className="library-module-preview"><DesignThumbnail parts={modulePreviewParts(entry.versionJson)} label={`Vista previa del módulo ${entry.name}`} empty="Sin vista previa"/></div>
          <div className="library-module-content"><b title={entry.name}>{entry.name}</b><small>{entry.versionJson.snapshot.parts.length} piezas · Biblioteca compartida</small>
            <button type="button" onClick={()=>insertShared(entry)}><Plus size={15}/> Insertar</button>
          </div>
        </article>)}
        {!local.length&&!external.length&&<p className="library-empty">Todavía no hay módulos. Selecciona «Crear módulo» para diseñar uno en un plano independiente.</p>}
      </div>
    </>}
    {tab === 'APPLIANCES' && <>
      <select className="library-category" aria-label="Categoría de electrodoméstico" value={category} onChange={event => setCategory(event.target.value as typeof category)}>{categories.map(value => <option key={value} value={value}>{uiLabel(value)}</option>)}</select>
      <div className="library-list">{appliances.map(definition => <article className="library-card library-card--swatch" key={definition.id}><span className="library-swatch" style={{ background:definition.colorHex }} /><div className="library-card-copy"><b title={definition.name}>{definition.name}</b><small>{uiLabel(definition.category)} · {definition.dimensions.widthMm}×{definition.dimensions.heightMm}×{definition.dimensions.depthMm} mm</small>{definition.metadata.sourceType === 'DEMO' && <em>DEMO / GENÉRICO</em>}</div><button onClick={() => insertAppliance(definition.id)} title={`Insertar ${definition.name}`} aria-label={`Insertar ${definition.name}`}><Plus aria-hidden="true"/><span className="sr-only">Insertar</span></button></article>)}{!appliances.length && <div className="muted">Sin resultados.</div>}</div>
    </>}
    {tab === 'MATERIALS' && <>
      <div className="library-actions"><button type="button" className="library-create" onClick={()=>setNewMaterial(true)}><Plus size={16}/> Nuevo material</button></div>
      <div className="library-list">{design.materials.filter(value => !q || value.name.toLowerCase().includes(q)).map(material => <article className="library-material-card" key={material.id}>
        <div className="library-material-summary"><span className="library-swatch" style={{ background:material.colorHex }}/><div><b>{material.name}</b><small>{material.thicknessMm?`${material.thicknessMm} mm`:'Acabado personalizado'}</small></div></div>
        <details><summary>Color y textura</summary>
          <label className="library-material-color">Color base<input type="color" value={material.colorHex} onChange={event=>mutate(doc=>{const target=doc.materials.find(item=>item.id===material.id);if(target)target.colorHex=event.target.value.toUpperCase();})}/></label>
          <MaterialTextureField material={material} onChange={dataUrl=>mutate(doc=>{const target=doc.materials.find(item=>item.id===material.id);if(target){if(dataUrl)target.metadata.textureDataUrl=dataUrl;else delete target.metadata.textureDataUrl;}})}/>
        </details>
      </article>)}</div>
    </>}
    {tab === 'HARDWARE' && <div className="library-list">{design.hardwareDefinitions.filter(value => !q || value.name.toLowerCase().includes(q)).map(definition => <article className="library-card library-card--plain" key={definition.id}><div className="library-card-copy"><b title={definition.name}>{definition.name}</b><small>{uiLabel(definition.category)}</small></div></article>)}{!design.hardwareDefinitions.length && <div className="muted">Sin herrajes definidos.</div>}</div>}
    {newMaterial&&<SharedDialog title="Nuevo material" description="Añade un material para utilizarlo en tus piezas." onClose={()=>setNewMaterial(false)} footer={<><button type="button" className="simbo-dialog-button" onClick={()=>setNewMaterial(false)}>Cancelar</button><button type="button" className="simbo-dialog-button simbo-dialog-button--primary" disabled={!materialName.trim()} onClick={addMaterial}>Agregar material</button></>}>
      <label className="library-new-material">Nombre<input value={materialName} maxLength={80} onChange={event=>setMaterialName(event.target.value)} placeholder="Ej. Encino natural" autoFocus /></label>
      <label className="library-new-material">Color base<input type="color" value={materialColor} onChange={event=>setMaterialColor(event.target.value)} /></label>
    </SharedDialog>}
  </section>;
}
