import './ScenesPanel.css';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, RefreshCw, Trash2 } from 'lucide-react';
import type { VisibilityTag } from '@simbo/design-domain';
import { useEditor } from '../store';
import { editorCommands } from '../commands';
import { uiLabel } from '../uiLabels';

const TAGS:VisibilityTag[]=['ROOM','PARTS','MODULES','APPLIANCES','COUNTERTOPS','HARDWARE','MACHINING','CLEARANCES','SERVICES','FUNCTIONAL_ZONES','GUIDES','SECTIONS','DIMENSIONS'];
const TAG_LABELS:Record<VisibilityTag,string>={ROOM:'Habitación',PARTS:'Piezas',MODULES:'Módulos',APPLIANCES:'Electrodomésticos',COUNTERTOPS:'Cubiertas',HARDWARE:'Herrajes',MACHINING:'Maquinado',CLEARANCES:'Holguras',SERVICES:'Servicios',FUNCTIONAL_ZONES:'Zonas funcionales',GUIDES:'Guías',SECTIONS:'Secciones',DIMENSIONS:'Dimensiones'};

type Tab='SCENES'|'SECTIONS'|'VISIBILITY';
function runPanelCommand(id:string,targetId?:string){const context=targetId?{...useEditor.getState(),commandTargetId:targetId}:useEditor.getState();if(editorCommands.canExecute(id,context))editorCommands.execute(id,context);}

export default function ScenesPanel(){
  const design=useEditor(s=>s.design);
  const activeSceneId=useEditor(s=>s.activeSceneId);
  const selectedSectionId=useEditor(s=>s.selectedSectionId);
  const visibility=useEditor(s=>s.visibilityTags);
  const gridVisible=useEditor(s=>s.gridVisible);
  const sectionGizmosVisible=useEditor(s=>s.sectionGizmosVisible);
  const technicalOverlays=useEditor(s=>s.technicalOverlays);
  const workspace=useEditor(s=>s.workspace);
  const add=useEditor(s=>s.addScene);
  const rename=useEditor(s=>s.renameScene),move=useEditor(s=>s.moveScene);
  const beginSection=useEditor(s=>s.beginSectionPlacement),selectSection=useEditor(s=>s.selectSection);
  const setSectionPosition=useEditor(s=>s.setSectionPosition),setSectionNormal=useEditor(s=>s.setSectionNormal),rotateSection=useEditor(s=>s.rotateSection);
  const setVisibility=useEditor(s=>s.setVisibilityTag),setGrid=useEditor(s=>s.setGridVisible),setGizmos=useEditor(s=>s.setSectionGizmosVisible),setTechnical=useEditor(s=>s.setTechnicalOverlays),setTransition=useEditor(s=>s.setSceneTransitionEnabled);
  const activeTool=useEditor(s=>s.activeTool);
  const [tab,setTab]=useState<Tab>('SCENES');
  useEffect(()=>{if(activeTool==='SECTION')setTab('SECTIONS');},[activeTool]);
  const [name,setName]=useState('Vista general');
  const ordered=useMemo(()=>[...design.scenes].sort((a,b)=>a.order-b.order),[design.scenes]);
  const selectedSection=design.sectionPlanes.find(section=>section.id===selectedSectionId);
  return <section className="panel scenes-workspace-panel">
    <div className="panel-title">Escena y presentación</div>
    <div className="panel-tabs compact-tabs">
      <button className={tab==='SCENES'?'active':''} onClick={()=>setTab('SCENES')}>ESCENA</button>
      <button className={tab==='SECTIONS'?'active':''} onClick={()=>setTab('SECTIONS')}>VISTAS</button>
      <button className={tab==='VISIBILITY'?'active':''} onClick={()=>setTab('VISIBILITY')}>VISIBILIDAD</button>
    </div>

    {tab==='SCENES'&&<>
      <div className="row scene-create-row"><input aria-label="Nombre de escena" value={name} onChange={event=>setName(event.target.value)}/><button onClick={()=>add(name)}>Crear</button></div>
      <label className="toggle scene-transition-toggle"><input type="checkbox" checked={workspace.sceneTransitionEnabled} onChange={event=>setTransition(event.target.checked)}/>Transición suave</label>
      <div className="scene-list">{ordered.map((scene,index)=><div className={`scene-card ${activeSceneId===scene.id?'active':''}`} key={scene.id}>
        <button className="scene-activate" onClick={()=>runPanelCommand('scene.activate',scene.id)}><b>{scene.name}</b><small>{uiLabel(scene.camera.projection)} · {uiLabel(scene.displayMode)} · {uiLabel(scene.presentation.wallsMode)}</small></button>
        <input aria-label={`Renombrar ${scene.name}`} defaultValue={scene.name} key={`${scene.id}:${scene.name}`} onBlur={event=>rename(scene.id,event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>
        <div className="row scene-actions"><button className="icon-text" title="Actualizar escena" onClick={()=>runPanelCommand('scene.update',scene.id)}><RefreshCw aria-hidden="true"/>Actualizar</button><button className="icon-text scene-icon-action" aria-label="Subir escena" title="Subir escena" disabled={index===0} onClick={()=>move(scene.id,-1)}><ArrowUp aria-hidden="true"/></button><button className="icon-text scene-icon-action" aria-label="Bajar escena" title="Bajar escena" disabled={index===ordered.length-1} onClick={()=>move(scene.id,1)}><ArrowDown aria-hidden="true"/></button><button className="icon-text scene-icon-action" aria-label="Duplicar escena" title="Duplicar escena" onClick={()=>runPanelCommand('scene.duplicate',scene.id)}><Copy aria-hidden="true"/></button><button className="icon-text danger scene-icon-action" aria-label="Eliminar escena" title="Eliminar escena" onClick={()=>runPanelCommand('scene.delete',scene.id)}><Trash2 aria-hidden="true"/></button></div>
      </div>)}</div>
      {ordered.length===0&&<div className="empty-state-card compact"><b>Sin escenas guardadas</b><span>Guarda la cámara y el estado de presentación actual.</span></div>}
      <button className="primary-wide" disabled={!ordered.length} onClick={()=>runPanelCommand('presentation.toggle')} title="Abrir presentación a pantalla completa">Presentar ↗</button>
    </>}

    {tab==='SECTIONS'&&<>
      <div className="panel-subtitle">Nueva sección</div><div className="row"><button onClick={()=>beginSection('X')}>X</button><button onClick={()=>beginSection('Y')}>Y</button><button onClick={()=>beginSection('Z')}>Z</button></div>
      <p className="muted compact-help">Elige eje y haz clic en el área de diseño para colocar el plano. El corte es visual y no modifica las piezas.</p>
      <div className="section-list">{design.sectionPlanes.map(section=><div className={`card section-card ${selectedSectionId===section.id?'active':''}`} key={section.id}>
        <div className="row"><button className="section-select" onClick={()=>selectSection(section.id)}><b>{section.name}</b></button><label className="toggle"><input type="checkbox" checked={section.enabled} onChange={()=>runPanelCommand('section.toggle',section.id)}/>Activo</label></div>
        <div className="row"><button className="icon-text" onClick={()=>runPanelCommand('section.look',section.id)}>Mirar sección</button><button className="icon-text" onClick={()=>runPanelCommand('section.invert',section.id)}>Invertir</button><button className="icon-text danger" onClick={()=>runPanelCommand('section.delete',section.id)}>Eliminar</button></div>
      </div>)}</div>
      {selectedSection&&<div className="section-editor card">
        <div className="panel-subtitle">Plano seleccionado</div>
        <div className="field-grid"><label>X mm<input type="number" value={selectedSection.position.x} onChange={e=>setSectionPosition(selectedSection.id,{...selectedSection.position,x:Number(e.target.value)})}/></label><label>Y mm<input type="number" value={selectedSection.position.y} onChange={e=>setSectionPosition(selectedSection.id,{...selectedSection.position,y:Number(e.target.value)})}/></label><label>Z mm<input type="number" value={selectedSection.position.z} onChange={e=>setSectionPosition(selectedSection.id,{...selectedSection.position,z:Number(e.target.value)})}/></label></div>
        <div className="field-grid"><label>Nx<input type="number" step="0.1" value={selectedSection.normal.x} onChange={e=>setSectionNormal(selectedSection.id,{...selectedSection.normal,x:Number(e.target.value)})}/></label><label>Ny<input type="number" step="0.1" value={selectedSection.normal.y} onChange={e=>setSectionNormal(selectedSection.id,{...selectedSection.normal,y:Number(e.target.value)})}/></label><label>Nz<input type="number" step="0.1" value={selectedSection.normal.z} onChange={e=>setSectionNormal(selectedSection.id,{...selectedSection.normal,z:Number(e.target.value)})}/></label></div>
        <div className="row"><button className="icon-text" onClick={()=>rotateSection(selectedSection.id,'x',15)}>Rx +15°</button><button className="icon-text" onClick={()=>rotateSection(selectedSection.id,'y',15)}>Ry +15°</button><button className="icon-text" onClick={()=>rotateSection(selectedSection.id,'z',15)}>Rz +15°</button></div>
      </div>}
    </>}

    {tab==='VISIBILITY'&&<>
      <div className="visibility-list">{TAGS.map(tag=><label className="visibility-row" key={tag}><input type="checkbox" checked={visibility[tag]} onChange={event=>setVisibility(tag,event.target.checked)}/><span>{TAG_LABELS[tag]}</span></label>)}</div>
      <div className="panel-subtitle">Área de diseño</div>
      <label className="toggle"><input type="checkbox" checked={gridVisible} onChange={event=>setGrid(event.target.checked)}/>Cuadrícula visible</label>
      <label className="toggle"><input type="checkbox" checked={sectionGizmosVisible} onChange={event=>setGizmos(event.target.checked)}/>Gizmo de sección</label>
      <label className="toggle"><input type="checkbox" checked={technicalOverlays} onChange={event=>setTechnical(event.target.checked)}/>Capas técnicas</label>
    </>}
  </section>;
}
