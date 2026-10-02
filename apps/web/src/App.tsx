import './App.css';
import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, Camera, CircleDot, Cuboid, FolderPlus, Layers3, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Save, Scissors, Settings2, Wrench } from 'lucide-react';
import Viewport from './components/Viewport';
import Outliner from './components/Outliner';
import Inspector from './components/Inspector';
import ModuleBuilder from './components/ModuleBuilder';
import JoineryPanel from './components/JoineryPanel';
import ManufacturingPanel from './components/ManufacturingPanel';
import ScenesPanel from './components/ScenesPanel';
import HealthPanel from './components/HealthPanel';
import RoomPanel from './components/RoomPanel';
import LibraryPanel from './components/LibraryPanel';
import EditorToolbar from './components/EditorToolbar';
import ViewControls from './components/ViewControls';
import StatusBar from './components/StatusBar';
import ToolOptions from './components/ToolOptions';
import ViewGizmo from './components/ViewGizmo';
import EditContextBreadcrumb from './components/EditContextBreadcrumb';
import CommandPalette from './components/CommandPalette';
import EntityContextMenu from './components/EntityContextMenu';
import PresentationWorkspace from './components/PresentationWorkspace';
import NewProjectDialog from './components/NewProjectDialog';
import { autosaveNow, editorInput, useEditor } from './store';
import { editorFacade } from './editorFacade';

type ActivePanel = ReturnType<typeof useEditor.getState>['activePanel'];

export default function App() {
  const design=useEditor(state=>state.design);
  const panel=useEditor(state=>state.activePanel);
  const setPanel=useEditor(state=>state.setActivePanel);
  const saveStatus=useEditor(state=>state.saveStatus);
  const workspace=useEditor(state=>state.workspace);
  const setPanelCollapsed=useEditor(state=>state.setPanelCollapsed);
  const setPanelWidth=useEditor(state=>state.setPanelWidth);
  const createProject=useEditor(state=>state.createProject);
  const createVersion=useEditor(state=>state.createVersion);
  const presentationMode=useEditor(state=>state.presentationMode);
  const [newProjectOpen,setNewProjectOpen]=useState(false);

  useEffect(()=>{
    if(saveStatus!=='PENDIENTE')return;
    const timer=window.setTimeout(()=>autosaveNow(),700);
    return()=>window.clearTimeout(timer);
  },[design.metadata.draftRevision,saveStatus]);

  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      const element=event.target instanceof HTMLElement?event.target:undefined;
      const tag=element?.tagName;
      if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||element?.isContentEditable)return;
      const key=event.key.toLowerCase();
      if(event.ctrlKey||event.metaKey||['arrowright','arrowup','arrowleft','escape','enter','backspace','delete'].includes(key))event.preventDefault();
      editorInput.keyDown({key:event.key,shift:event.shiftKey,ctrl:event.ctrlKey,meta:event.metaKey,alt:event.altKey,repeat:event.repeat});
    };
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[]);

  const startResize=(side:'left'|'right',event:ReactPointerEvent<HTMLDivElement>)=>{
    event.preventDefault();
    const startX=event.clientX;
    const startWidth=side==='left'?workspace.leftPanelWidth:workspace.rightPanelWidth;
    const move=(pointer:PointerEvent)=>setPanelWidth(side,startWidth+(pointer.clientX-startX)*(side==='left'?1:-1));
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);document.body.classList.remove('resizing-panels');};
    document.body.classList.add('resizing-panels');
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  };
  const openPanel=(next:ActivePanel)=>{setPanel(next);setPanelCollapsed('right',false);};
  const leftWidth=workspace.leftPanelCollapsed?0:workspace.leftPanelWidth;
  const rightWidth=workspace.rightPanelCollapsed?0:workspace.rightPanelWidth;

  if(presentationMode)return <PresentationWorkspace/>;

  const shellSizes = {
    '--left-panel-width': `${leftWidth}px`,
    '--right-panel-width': `${rightWidth}px`
  } as CSSProperties;

  return <div className="app-shell" style={shellSizes}>
    <header className="topbar">
      <div className="brand" aria-label="SIMBO · BOIS Cocinas y Closets">
        <span className="brand-icon" aria-hidden="true">
          <img src="/simbo-logo.svg" alt="" onError={event => { event.currentTarget.hidden = true; }} />
          <Layers3 className="brand-logo-fallback" />
        </span>
        <div className="brand-copy"><strong>SIMBO</strong><span>BOIS · DISEÑO PARAMÉTRICO</span></div>
      </div>
      <div className="project-name" title={design.metadata.name}>
        <span>{design.metadata.name}</span><small>Edición de diseño <b>·</b> r{design.metadata.draftRevision}</small>
      </div>
      <div className="save-state">
        <span className={`status ${saveStatus.toLowerCase()}`} role="status">{saveStatus}</span>
        <button className="top-action top-save" onClick={autosaveNow} aria-label="Guardar diseño" title="Guardar diseño"><Save aria-hidden="true"/><span>Guardar</span></button>
        <button className="top-action secondary-dark" onClick={()=>void createVersion()} title="Guardar una nueva versión del diseño">Versión</button>
      </div>
    </header>

    <aside className="left-rail" aria-label="Áreas del editor">
      <button title="Nuevo proyecto" aria-label="Nuevo proyecto" onClick={()=>setNewProjectOpen(true)}><FolderPlus/></button>
      <button title="Abrir demo oficial" aria-label="Abrir demo oficial" onClick={()=>editorFacade.loadDemo()}><Layers3/></button>
      <button className={panel==='INSPECTOR'?'active':''} title="Propiedades" aria-label="Propiedades" onClick={()=>openPanel('INSPECTOR')}><Settings2/></button>
      <button className={panel==='LIBRARY'?'active':''} title="Biblioteca" aria-label="Biblioteca" onClick={()=>openPanel('LIBRARY')}><Box/></button>
      <button className={panel==='MODULE'?'active':''} title="Constructor de módulos" aria-label="Constructor de módulos" onClick={()=>openPanel('MODULE')}><Cuboid/></button>
      <button className={panel==='JOINERY'?'active':''} title="Uniones" aria-label="Uniones" onClick={()=>openPanel('JOINERY')}><Wrench/></button>
      <button className={panel==='MANUFACTURING'?'active':''} title="Manufactura" aria-label="Manufactura" onClick={()=>openPanel('MANUFACTURING')}><Scissors/></button>
      <button className={panel==='SCENES'?'active':''} title="Escenas y secciones" aria-label="Escenas y secciones" onClick={()=>openPanel('SCENES')}><Camera/></button>
      <button className={panel==='HEALTH'?'active':''} title="Salud del modelo" aria-label="Salud del modelo" onClick={()=>openPanel('HEALTH')}><CircleDot/></button>
    </aside>

    <aside className={`left-panel ${workspace.leftPanelCollapsed?'collapsed':''}`} aria-label="Panel de escena y habitación"><div className="panel-shell-heading"><span>Diseño y escena</span><button type="button" aria-label="Cerrar panel izquierdo" title="Cerrar panel" onClick={()=>setPanelCollapsed('left',true)}><PanelLeftClose aria-hidden="true"/></button></div><Outliner/><RoomPanel/></aside>

    <main className="viewport-area">
      {!workspace.leftPanelCollapsed&&<div className="panel-resizer panel-resizer-left" onPointerDown={event=>startResize('left',event)}/>} 
      {!workspace.rightPanelCollapsed&&<div className="panel-resizer panel-resizer-right" onPointerDown={event=>startResize('right',event)}/>} 
      <button className="panel-toggle panel-toggle-left" aria-label={workspace.leftPanelCollapsed?'Mostrar panel izquierdo':'Ocultar panel izquierdo'} title={workspace.leftPanelCollapsed?'Mostrar panel izquierdo':'Ocultar panel izquierdo'} onClick={()=>setPanelCollapsed('left',!workspace.leftPanelCollapsed)}>{workspace.leftPanelCollapsed?<PanelLeftOpen/>:<PanelLeftClose/>}</button>
      <button className="panel-toggle panel-toggle-right" aria-label={workspace.rightPanelCollapsed?'Mostrar panel de propiedades':'Ocultar panel de propiedades'} title={workspace.rightPanelCollapsed?'Mostrar panel de propiedades':'Ocultar panel de propiedades'} onClick={()=>setPanelCollapsed('right',!workspace.rightPanelCollapsed)}>{workspace.rightPanelCollapsed?<PanelRightOpen/>:<PanelRightClose/>}</button>
      <div className="editor-command-dock"><EditorToolbar/><ViewControls/></div>
      <Viewport/>
      <EditContextBreadcrumb/>
      <ViewGizmo/>
      <ToolOptions/>
    </main>

    <CommandPalette/>
    <EntityContextMenu/>

    <aside className={`right-panel ${workspace.rightPanelCollapsed?'collapsed':''}`} aria-label="Panel de herramientas y propiedades">
      <div className="panel-shell-heading"><span>{panel==='INSPECTOR'?'Propiedades':panel==='MODULE'?'Módulos':panel==='JOINERY'?'Uniones':panel==='MANUFACTURING'?'Manufactura':panel==='SCENES'?'Escenas':panel==='HEALTH'?'Validación':'Biblioteca'}</span><button type="button" aria-label="Cerrar panel derecho" title="Cerrar panel" onClick={()=>setPanelCollapsed('right',true)}><PanelRightClose aria-hidden="true"/></button></div>
      {panel==='INSPECTOR'&&<Inspector/>}
      {panel==='MODULE'&&<ModuleBuilder/>}
      {panel==='JOINERY'&&<JoineryPanel/>}
      {panel==='MANUFACTURING'&&<ManufacturingPanel/>}
      {panel==='SCENES'&&<ScenesPanel/>}
      {panel==='HEALTH'&&<HealthPanel/>}
      {panel==='LIBRARY'&&<LibraryPanel/>}
    </aside>
    <StatusBar/>
    {newProjectOpen && <NewProjectDialog onCancel={()=>setNewProjectOpen(false)} onCreate={name=>{createProject(name);setNewProjectOpen(false);}}/>}
  </div>;
}
