import './EntityContextMenu.css';
import { editorCommands } from '../commands';
import { editorCommandContext, runEditorCommand } from '../commandRuntime';
import { useEditor } from '../store';

export default function EntityContextMenu(){
  const menu=useEditor(state=>state.contextMenu);
  const design=useEditor(state=>state.design);
  const setMenu=useEditor(state=>state.setContextMenu);
  const guides=useEditor(state=>state.guides);
  if(!menu)return null;
  const part=design.parts.find(value=>value.id===menu.entityId);
  const assembly=design.assemblies.find(value=>value.id===menu.entityId);
  const module=design.moduleInstances.find(value=>value.id===menu.entityId);
  const appliance=design.applianceInstances.find(value=>value.id===menu.entityId);
  const countertop=design.countertops.find(value=>value.id===menu.entityId);
  const cutout=design.cutouts.find(value=>value.id===menu.entityId);
  const service=design.servicePoints.find(value=>value.id===menu.entityId);
  const section=design.sectionPlanes.find(value=>value.id===menu.entityId);
  const guide=guides.find(value=>value.id===menu.entityId);
  const invoke=(id:string)=>{runEditorCommand(id,menu.entityId);setMenu(undefined);};
  const enabled=(id:string)=>editorCommands.canExecute(id,editorCommandContext(menu.entityId));
  return <><div className="context-menu-dismiss" onMouseDown={()=>setMenu(undefined)}/><div className="entity-context-menu" style={{left:menu.x,top:menu.y}} role="menu" aria-label="Menú contextual">
    {appliance&&<><b>Electrodoméstico · {appliance.name}</b><button onClick={()=>invoke('editor.edit')}>Editar</button><button onClick={()=>invoke('editor.move')}>Mover</button><button onClick={()=>invoke('editor.rotate')}>Rotar</button><button onClick={()=>invoke('editor.isolate')}>Aislar</button><button onClick={()=>invoke('clearance.toggle')}>Mostrar holguras</button><button onClick={()=>invoke('appliance.delete')}>Eliminar</button></>}
    {countertop&&<><b>Cubierta · {countertop.name}</b><button onClick={()=>invoke('editor.edit')}>Editar</button><button onClick={()=>invoke('cutout.create')}>Crear recorte</button><button onClick={()=>invoke('editor.move')}>Mover</button><button onClick={()=>invoke('editor.isolate')}>Aislar</button><button onClick={()=>invoke('editor.delete')}>Eliminar</button></>}
    {cutout&&<><b>Recorte · {cutout.type}</b><button onClick={()=>invoke('editor.edit')}>Editar</button><button onClick={()=>invoke('editor.delete')}>Eliminar</button></>}
    {service&&<><b>Servicio · {service.name}</b><button onClick={()=>invoke('editor.edit')}>Editar</button><button onClick={()=>invoke('editor.move')}>Mover</button><button onClick={()=>invoke('editor.delete')}>Eliminar</button></>}
    {part&&<><b>Pieza · {part.name}</b><button onClick={()=>invoke('editor.edit')}>Editar / seleccionar</button><button onClick={()=>invoke('editor.move')}>Mover</button><button onClick={()=>invoke('editor.rotate')}>Rotar</button><button onClick={()=>invoke('editor.duplicate')}>Duplicar</button><button onClick={()=>invoke('editor.hide')}>Ocultar</button><button disabled={!enabled('editor.group')} onClick={()=>invoke('editor.group')}>Crear conjunto</button><button onClick={()=>invoke('editor.material')}>Material</button><button onClick={()=>invoke('editor.delete')}>Eliminar</button></>}
    {assembly&&assembly.id!==design.rootAssemblyId&&<><b>Conjunto · {assembly.name}</b><button onClick={()=>invoke('editor.enterContext')}>Editar contexto</button><button onClick={()=>invoke('editor.move')}>Mover</button><button onClick={()=>invoke('editor.rotate')}>Rotar</button><button onClick={()=>invoke('editor.duplicate')}>Duplicar</button><button onClick={()=>invoke('editor.isolate')}>Aislar</button><button onClick={()=>invoke('module.saveAssembly')}>Guardar como módulo</button><button onClick={()=>invoke('editor.hide')}>Ocultar</button><button onClick={()=>invoke('editor.setAxes')}>Definir ejes</button><button onClick={()=>invoke('editor.delete')}>Eliminar</button></>}
    {module&&<><b>Módulo · {module.name}</b><button onClick={()=>invoke('editor.enterContext')}>Editar</button><button onClick={()=>invoke('module.makeUnique')}>Hacer independiente</button><button disabled={!enabled('module.setOrigin')} onClick={()=>invoke('module.setOrigin')}>Definir origen aquí</button><button onClick={()=>invoke('editor.isolate')}>Aislar</button><button onClick={()=>invoke('editor.move')}>Mover</button><button onClick={()=>invoke('editor.rotate')}>Rotar</button><button onClick={()=>invoke('editor.duplicate')}>Duplicar</button><button onClick={()=>invoke('editor.hide')}>Ocultar</button><button onClick={()=>invoke('editor.setAxes')}>Definir ejes</button><button onClick={()=>invoke('editor.delete')}>Eliminar</button></>}
    {guide&&<><b>Guía · {guide.label??guide.type}</b><button onClick={()=>invoke('guide.delete')}>Eliminar</button><button onClick={()=>invoke('guide.hide')}>Ocultar</button></>}
    {section&&<><b>Sección · {section.name}</b><button onClick={()=>invoke('section.toggle')}>Activar / desactivar</button><button onClick={()=>invoke('section.invert')}>Invertir</button><button onClick={()=>invoke('section.look')}>Mirar sección</button><button onClick={()=>invoke('section.delete')}>Eliminar</button></>}
  </div></>;
}
