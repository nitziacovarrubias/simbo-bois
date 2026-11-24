import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls, Edges } from '@react-three/drei';
import { ArrowLeft, Copy, Layers3, Plus, Save, Trash2 } from 'lucide-react';
import { addPartToAssembly, createEmptyDesign, createId, createPanel, getPartWorldTransform,
  validateDesignStructural, type DesignDocument, type ModuleDefinition, type ModuleVersion, type Part } from '@simbo/design-domain';
import { createModuleDefinitionFromAssembly } from '@simbo/module-engine';
import MaterialSurface from './MaterialSurface';
import MaterialTextureField from './MaterialTextureField';
import ConfirmDialog from './ConfirmDialog';
import './ModuleWorkshop.css';

interface Props {
  canPublish: boolean;
  onClose: () => void;
  onSave: (definition: ModuleDefinition, version: ModuleVersion, publish: boolean) => Promise<void>;
}
const numeric = (value:number,min=-100000,max=100000) => Number.isFinite(value) ? Math.min(max,Math.max(min,value)) : min;
function PieceInput({label,value,onChange,min=-10000,max=10000}: {label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number}) {
  return <label className="module-workshop-number"><span>{label}</span><input type="number" min={min} max={max} step="1" value={value} onChange={e=>{if(e.target.value!=='')onChange(numeric(Number(e.target.value),min,max));}}/></label>;
}

function Preview({draft,selected,onSelect,top}:{draft:DesignDocument;selected?:string;onSelect:(id:string)=>void;top:boolean}){
  const material=draft.materials[0];
  return <Canvas key={top?'top':'perspective'} shadows camera={{position:top?([0,3000,0.01] as [number,number,number]):([1650,1300,1800] as [number,number,number]),fov:45,near:1,far:20000,up:top?([0,0,-1] as [number,number,number]):([0,1,0] as [number,number,number])}}
    gl={{antialias:true,powerPreference:'high-performance'}}>
    <color attach="background" args={['#ece8df']}/>
    <ambientLight intensity={1.25}/>
    <directionalLight position={[2500,3500,3500]} intensity={2} castShadow/>
    <Grid args={[6000,6000]} sectionSize={500} cellSize={100} cellColor="#b6aea2" sectionColor="#8a7661" fadeDistance={7000} fadeStrength={1.2} position={[0,-1,0]}/>
    {draft.parts.map(part=>{
      const t=getPartWorldTransform(draft,part.id);
      return <mesh key={part.id} position={[t.position.x,t.position.y,t.position.z]} rotation={[t.rotation.x,t.rotation.y,t.rotation.z]}
        castShadow receiveShadow onPointerDown={event=>{event.stopPropagation();onSelect(part.id);}}>
        <boxGeometry args={[part.dimensions.widthMm,part.dimensions.heightMm,part.dimensions.thicknessMm]}/>
        <MaterialSurface material={material} color={material?.colorHex??'#bd9b73'}/>
        <Edges color={selected===part.id?'#f0a321':'#6c5141'} threshold={22}/>
      </mesh>;
    })}
    <OrbitControls target={[0,350,0]} enableDamping enablePan enableZoom enableRotate={!top} minDistance={200} maxDistance={7500}/>
  </Canvas>;
}

export default function ModuleWorkshop({canPublish,onClose,onSave}:Props){
  const [draft,setDraft]=useState(()=>{
    const doc=createEmptyDesign('Nuevo módulo');
    doc.materials[0]!.name='Material del módulo';
    doc.materials[0]!.colorHex='#BD9B73';
    return doc;
  });
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [selected,setSelected]=useState<string>();
  const [top,setTop]=useState(false);
  const [publish,setPublish]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [confirmDiscard,setConfirmDiscard]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const part=useMemo(()=>draft.parts.find(item=>item.id===selected),[draft,selected]);
  const material=draft.materials[0]!;
  const change=(fn:(doc:DesignDocument)=>void)=>{setDraft(previous=>{const next=structuredClone(previous);fn(next);return next;});setDirty(true);setError('');};
  const edit=(fn:(part:Part)=>void)=>change(doc=>{const target=doc.parts.find(item=>item.id===selected);if(target)fn(target);});
  const add=()=>{
    const id=createId('part');
    change(doc=>{
      const next=createPanel({id,name:`Panel ${doc.parts.length+1}`,dimensions:{widthMm:600,heightMm:720,thicknessMm:18},
        materialId:doc.materials[0]?.id,transform:{position:{x:doc.parts.length*35,y:360,z:0},rotation:{x:0,y:0,z:0}}});
      addPartToAssembly(doc,next);
    });
    setSelected(id);
  };
  const duplicate=()=>{if(!part)return;const id=createId('part');change(doc=>{const copy=structuredClone(part);copy.id=id;copy.name=`${part.name} copia`;copy.transform.position.x+=80;addPartToAssembly(doc,copy);});setSelected(id);};
  const remove=()=>{if(!selected)return;change(doc=>{doc.parts=doc.parts.filter(item=>item.id!==selected);for(const a of doc.assemblies)a.children=a.children.filter(child=>child.id!==selected);});setSelected(undefined);};
  const save=async()=>{
    const validName=name.trim();
    if(!validName){setError('Escribe el nombre del módulo.');return;}
    if(validName.length>160){setError('El nombre no puede superar 160 caracteres.');return;}
    if(!draft.parts.length){setError('Agrega al menos un panel antes de guardar.');return;}
    if(draft.parts.some(p=>p.dimensions.widthMm<=0||p.dimensions.heightMm<=0||p.dimensions.thicknessMm<=0)){
      setError('Todas las medidas deben ser mayores que cero.');return;
    }
    const invalid=validateDesignStructural(draft).filter(issue=>issue.severity==='ERROR');
    if(invalid.length){setError(invalid[0]?.message??'El módulo contiene datos inválidos.');return;}
    setBusy(true);setError('');
    try {
      const standalone=structuredClone(draft);
      const {definition,version}=createModuleDefinitionFromAssembly(standalone,standalone.rootAssemblyId,{
        name:validName,description:description.trim(),tags:['USER','WORKSHOP']
      });
      await onSave(definition,version,canPublish&&publish);
    }catch(reason){setError(reason instanceof Error?reason.message:'No se pudo guardar el módulo.');}
    finally{setBusy(false);}
  };
  const cancel=()=>dirty?setConfirmDiscard(true):onClose();
  return <main className="module-workshop" data-simbo-modal="true">
    <header className="module-workshop-header">
      <button type="button" onClick={cancel} className="module-workshop-back"><ArrowLeft size={18}/> Volver al proyecto</button>
      <div className="module-workshop-brand"><Layers3 size={22}/><div><strong>Constructor de módulos</strong><span>Área de trabajo temporal · No modifica el proyecto hasta guardar</span></div></div>
      <button type="button" className="module-workshop-save" onClick={()=>void save()} disabled={busy}><Save size={17}/>{busy?'Guardando…':'Guardar módulo'}</button>
    </header>
    <div className="module-workshop-body">
      <aside className="module-workshop-sidebar">
        <h2>Nuevo módulo</h2>
        <label>Nombre<input maxLength={160} value={name} onChange={e=>{setName(e.target.value);setDirty(true);}} placeholder="Ej. Gabinete bajo 60"/></label>
        <label>Descripción<textarea rows={2} maxLength={500} value={description} onChange={e=>{setDescription(e.target.value);setDirty(true);}} placeholder="Descripción opcional"/></label>
        <div className="module-workshop-section-heading"><strong>Piezas ({draft.parts.length})</strong><button type="button" onClick={add}><Plus size={15}/> Panel</button></div>
        <div className="module-workshop-piece-list">
          {draft.parts.map(item=><button type="button" key={item.id} className={item.id===selected?'selected':''} onClick={()=>setSelected(item.id)}>
            <span>{item.name}</span><small>{item.dimensions.widthMm} × {item.dimensions.heightMm} × {item.dimensions.thicknessMm} mm</small>
          </button>)}
          {!draft.parts.length&&<p className="module-workshop-empty">Agrega un panel para comenzar a diseñar.</p>}
        </div>
        {canPublish&&<label className="module-workshop-share"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/> Publicar también en biblioteca compartida</label>}
        <small className="module-workshop-help">Los módulos guardados en el proyecto se pueden insertar desde Biblioteca. Los compartidos quedan disponibles en otros proyectos.</small>
      </aside>
      <section className="module-workshop-scene" aria-label="Plano temporal del módulo">
        <div className="module-workshop-scene-tools"><span>{top?'Vista superior':'Vista 3D'}</span><div><button type="button" className={!top?'active':''} onClick={()=>setTop(false)}>3D</button><button type="button" className={top?'active':''} onClick={()=>setTop(true)}>Planta</button></div></div>
        <Preview draft={draft} selected={selected} onSelect={setSelected} top={top}/>
        <span className="module-workshop-scene-hint">Arrastra para orbitar · Rueda para acercar · Clic en una pieza para editarla</span>
      </section>
      <aside className="module-workshop-properties">
        <h2>Propiedades</h2>
        {part?<>
          <label>Nombre de pieza<input value={part.name} onChange={e=>edit(p=>{p.name=e.target.value;})}/></label>
          <h3>Medidas (mm)</h3>
          <div className="module-workshop-fields">
            <PieceInput label="Ancho" min={1} max={10000} value={part.dimensions.widthMm} onChange={v=>edit(p=>{p.dimensions.widthMm=v;})}/>
            <PieceInput label="Alto" min={1} max={10000} value={part.dimensions.heightMm} onChange={v=>edit(p=>{p.dimensions.heightMm=v;})}/>
            <PieceInput label="Grosor" min={1} max={200} value={part.dimensions.thicknessMm} onChange={v=>edit(p=>{p.dimensions.thicknessMm=v;})}/>
          </div>
          <h3>Posición (mm)</h3>
          <div className="module-workshop-fields">
            {(['x','y','z'] as const).map(axis=><PieceInput key={axis} label={axis.toUpperCase()} value={part.transform.position[axis]} onChange={v=>edit(p=>{p.transform.position[axis]=v;})}/>)}
          </div>
          <PieceInput label="Rotación Y (°)" min={-360} max={360} value={Math.round(part.transform.rotation.y*180/Math.PI)} onChange={v=>edit(p=>{p.transform.rotation.y=v*Math.PI/180;})}/>
          <div className="module-workshop-actions"><button type="button" onClick={duplicate}><Copy size={15}/> Duplicar</button><button type="button" onClick={remove} className="danger"><Trash2 size={15}/> Eliminar</button></div>
        </>:<p className="module-workshop-empty">Selecciona un panel para ajustar medidas y posición.</p>}
        <details className="module-workshop-material"><summary>Material y textura</summary><label>Color<input type="color" value={material.colorHex} onChange={e=>change(doc=>{doc.materials[0]!.colorHex=e.target.value.toUpperCase();})}/></label>
          <MaterialTextureField material={material} onChange={url=>change(doc=>{if(url)doc.materials[0]!.metadata.textureDataUrl=url;else delete doc.materials[0]!.metadata.textureDataUrl;})}/>
        </details>
        {error&&<p role="alert" className="module-workshop-error">{error}</p>}
      </aside>
    </div>
    {confirmDiscard&&<ConfirmDialog title="Salir sin guardar" message="Los cambios del módulo temporal se perderán. El proyecto abierto no se modificará." confirmLabel="Descartar módulo" destructive onCancel={()=>setConfirmDiscard(false)} onConfirm={onClose}/>}
  </main>;
}
