import './RoomPanel.css';
import { DoorOpen, AppWindow, Ruler, Trash2 } from 'lucide-react';
import { createId, type RoomOpening } from '@simbo/design-domain';
import { useEditor } from '../store';

export default function RoomPanel(){
  const room=useEditor(s=>s.design.room),mutate=useEditor(s=>s.mutate);
  const setRoom=(key:'widthMm'|'depthMm'|'heightMm'|'wallThicknessMm',value:number)=>mutate(d=>{if(Number.isFinite(value)&&value>0)d.room[key]=value});
  const updateOpening=(id:string,patch:Partial<RoomOpening>)=>mutate(d=>{const opening=d.room.openings.find(v=>v.id===id);if(opening)Object.assign(opening,patch);});
  return <section className="room-mini">
    <details open className="room-tree-section"><summary><Ruler size={15}/> Dimensiones</summary>
    <div className="field-grid"><label>Ancho mm<input type="number" value={room.widthMm} onChange={e=>setRoom('widthMm',Number(e.target.value))}/></label><label>Prof. mm<input type="number" value={room.depthMm} onChange={e=>setRoom('depthMm',Number(e.target.value))}/></label><label>Alto mm<input type="number" value={room.heightMm} onChange={e=>setRoom('heightMm',Number(e.target.value))}/></label><label>Muro mm<input type="number" min="20" value={room.wallThicknessMm} onChange={e=>setRoom('wallThicknessMm',Number(e.target.value))}/></label></div>
    </details>
    <details open className="room-tree-section"><summary><DoorOpen size={15}/> Aberturas <span className="room-tree-count">{room.openings.length}</span></summary>
    <div className="row room-add-openings"><button type="button" className="secondary" onClick={()=>mutate(d=>d.room.openings.push({id:createId('door'),type:'DOOR',wall:'NORTH',offsetMm:500,widthMm:900,heightMm:2100,sillHeightMm:0,openingDirection:'IN'}))}><DoorOpen size={15}/> Puerta</button><button type="button" className="secondary" onClick={()=>mutate(d=>d.room.openings.push({id:createId('window'),type:'WINDOW',wall:'EAST',offsetMm:800,widthMm:1200,heightMm:1000,sillHeightMm:900}))}><AppWindow size={15}/> Ventana</button></div>
    {room.openings.map(opening=><details key={opening.id} className="opening-editor"><summary><span className="room-opening-name">{opening.type==='DOOR'?<DoorOpen size={14}/>:<AppWindow size={14}/>} {opening.type==='DOOR'?'Puerta':'Ventana'} · {opening.wall==='NORTH'?'Norte':opening.wall==='SOUTH'?'Sur':opening.wall==='EAST'?'Este':'Oeste'}</span><small>{opening.widthMm} × {opening.heightMm} mm</small></summary><div className="opening-editor-body">
      <label>Pared<select value={opening.wall} onChange={e=>updateOpening(opening.id,{wall:e.target.value as RoomOpening['wall']})}><option value="NORTH">Norte</option><option value="SOUTH">Sur</option><option value="EAST">Este</option><option value="WEST">Oeste</option></select></label>
      <div className="field-grid"><label>Desplazamiento<input type="number" value={opening.offsetMm} onChange={e=>updateOpening(opening.id,{offsetMm:Number(e.target.value)})}/></label><label>Ancho<input type="number" min="1" value={opening.widthMm} onChange={e=>updateOpening(opening.id,{widthMm:Number(e.target.value)})}/></label><label>Alto<input type="number" min="1" value={opening.heightMm} onChange={e=>updateOpening(opening.id,{heightMm:Number(e.target.value)})}/></label><label>Antepecho<input type="number" min="0" disabled={opening.type==='DOOR'} value={opening.type==='DOOR'?0:opening.sillHeightMm??0} onChange={e=>updateOpening(opening.id,{sillHeightMm:Number(e.target.value)})}/></label></div>
      <button type="button" className="icon-text danger room-delete-opening" onClick={()=>mutate(d=>{d.room.openings=d.room.openings.filter(v=>v.id!==opening.id)})}><Trash2 size={14}/> Eliminar abertura</button>
    </div></details>)}
    </details>
  </section>;
}
