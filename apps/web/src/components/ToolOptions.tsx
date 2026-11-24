import './ToolOptions.css';
import { useEffect, useState } from 'react';
import { useEditor } from '../store';
import { runEditorCommand } from '../commandRuntime';

export default function ToolOptions() {
  const tool=useEditor(state=>state.activeTool);
  const selected=useEditor(state=>state.selectedIds);
  const axisLock=useEditor(state=>state.axisLock);
  const setAxisLock=useEditor(state=>state.setAxisLock);
  const copyMode=useEditor(state=>state.copyMode);
  const toggleCopyMode=useEditor(state=>state.toggleCopyMode);
  const angularSnapDeg=useEditor(state=>state.angularSnapDeg);
  const setAngularSnap=useEditor(state=>state.setAngularSnap);
  const inferenceEnabled=useEditor(state=>state.inferenceEnabled);
  const inferenceLocked=useEditor(state=>state.inferenceLockedId);
  const toggleInference=useEditor(state=>state.toggleInference);
  const lockInference=useEditor(state=>state.lockInference);
  const beginSectionPlacement=useEditor(state=>state.beginSectionPlacement);
  const guideMode=useEditor(state=>state.guideMode);
  const setGuideMode=useEditor(state=>state.setGuideMode);
  const selectedGuideId=useEditor(state=>state.selectedGuideId);
  const deleteSelectedGuide=useEditor(state=>state.deleteSelectedGuide);
  const clearGuides=useEditor(state=>state.clearGuides);
  const workspace=useEditor(state=>state.workspace);
  const setWalkSettings=useEditor(state=>state.setWalkSettings);
  const protractorResult=useEditor(state=>state.protractorResult);
  const align=useEditor(state=>state.alignSelected);
  const distributeAdvanced=useEditor(state=>state.distributeSelectedAdvanced);
  const previewAlign=useEditor(state=>state.previewAlign);
  const clearTransformGhosts=useEditor(state=>state.clearTransformGhosts);
  const linearArraySelected=useEditor(state=>state.linearArraySelected);
  const radialArraySelected=useEditor(state=>state.radialArraySelected);
  const previewLinearArray=useEditor(state=>state.previewLinearArray);
  const previewRadialArray=useEditor(state=>state.previewRadialArray);
  const camera=useEditor(state=>state.camera);
  const gridSnap=useEditor(state=>state.gridSnapSelected);
  const previewSnap=useEditor(state=>state.previewSnapSelectedTo);
  const pendingSnap=useEditor(state=>state.pendingSnap);
  const confirmSnap=useEditor(state=>state.confirmSnap);
  const cancelSnap=useEditor(state=>state.cancelSnap);
  const [arrayAxis,setArrayAxis]=useState<'x'|'y'|'z'>('y');
  const [arrayMode,setArrayMode]=useState<'COUNT'|'SPACING'|'FILL'>('COUNT');
  const [arrayCount,setArrayCount]=useState(4);
  const [arraySpacing,setArraySpacing]=useState(300);
  const [arrayFill,setArrayFill]=useState(1200);
  const [radialCount,setRadialCount]=useState(6);
  const [radialAngle,setRadialAngle]=useState(360);
  const [arrayPreviewKind,setArrayPreviewKind]=useState<'LINEAR'|'RADIAL'>();

  useEffect(()=>{
    if(arrayPreviewKind==='LINEAR')previewLinearArray({mode:arrayMode,axis:arrayAxis,count:arrayCount,spacingMm:arraySpacing,fillMm:arrayFill});
    else if(arrayPreviewKind==='RADIAL')previewRadialArray({pivot:camera.target,axis:arrayAxis,angleDeg:radialAngle,count:radialCount});
    else clearTransformGhosts();
    return()=>clearTransformGhosts();
  },[arrayPreviewKind,arrayMode,arrayAxis,arrayCount,arraySpacing,arrayFill,radialCount,radialAngle,camera.target,selected,previewLinearArray,previewRadialArray,clearTransformGhosts]);

  const visible=tool==='MOVE'||tool==='ROTATE'||tool==='SECTION'||tool==='GUIDE'||tool==='PROTRACTOR'||tool==='WALK'||tool==='LOOK'||tool==='AXES'||selected.length>0||Boolean(pendingSnap);
  if(!visible)return null;
  const secondSelected=selected.length===2?selected[1]:undefined;

  return <div className="context-tool-panel" aria-label="Opciones de herramienta">
    {tool==='SECTION'&&<div className="context-group"><span className="context-label">Orientación sección</span><button onClick={()=>beginSectionPlacement('X')}>X</button><button onClick={()=>beginSectionPlacement('Y')}>Y</button><button onClick={()=>beginSectionPlacement('Z')}>Z</button><span>Luego coloca el plano</span></div>}
    {(tool==='MOVE'||tool==='ROTATE')&&<div className="context-group"><span className="context-label">{tool==='MOVE'?'Mover':'Rotar'}</span><button className={axisLock==='x'?'active':''} onClick={()=>setAxisLock(axisLock==='x'?undefined:'x')}>X</button><button className={axisLock==='y'?'active':''} onClick={()=>setAxisLock(axisLock==='y'?undefined:'y')}>Y</button><button className={axisLock==='z'?'active':''} onClick={()=>setAxisLock(axisLock==='z'?undefined:'z')}>Z</button>{tool==='MOVE'&&<button className={copyMode?'active':''} onClick={toggleCopyMode}>{copyMode?'Copiar':'Mover original'}</button>}{tool==='ROTATE'&&<select aria-label="Ajuste angular" value={angularSnapDeg} onChange={event=>setAngularSnap(Number(event.target.value) as 1|5|15)}><option value={1}>Ajuste 1°</option><option value={5}>Ajuste 5°</option><option value={15}>Ajuste 15°</option></select>}<button className={inferenceEnabled?'active':''} onClick={toggleInference}>Inferencias</button><button className={inferenceLocked?'active':''} onClick={lockInference}>Bloquear</button></div>}
    {tool==='GUIDE'&&<div className="context-group"><span className="context-label">Guía</span>{(['POINT','LINE','PLANE'] as const).map(mode=><button key={mode} className={guideMode===mode?'active':''} onClick={()=>setGuideMode(mode)}>{mode==='POINT'?'Punto':mode==='LINE'?'Línea':'Plano'}</button>)}<button disabled={!selectedGuideId} onClick={deleteSelectedGuide}>Eliminar guía</button><button onClick={clearGuides}>Limpiar guías</button></div>}
    {tool==='PROTRACTOR'&&<div className="context-group"><span className="context-label">Transportador</span><button className={axisLock==='x'?'active':''} onClick={()=>setAxisLock('x')}>Plano YZ</button><button className={axisLock==='y'||!axisLock?'active':''} onClick={()=>setAxisLock('y')}>Plano XZ</button><button className={axisLock==='z'?'active':''} onClick={()=>setAxisLock('z')}>Plano XY</button>{protractorResult&&<span>{Math.abs(protractorResult.angleDeg).toFixed(2)}°</span>}</div>}
    {(tool==='WALK'||tool==='LOOK')&&<div className="context-group"><span className="context-label">{tool==='WALK'?'Recorrer':'Mirar alrededor'}</span><label>Ojos <input type="number" value={workspace.eyeHeightMm} onChange={event=>setWalkSettings({eyeHeightMm:Number(event.target.value)})}/> mm</label><label>Velocidad <input type="number" value={workspace.walkSpeed} onChange={event=>setWalkSettings({walkSpeed:Number(event.target.value)})}/> mm/s</label><label className="toggle"><input type="checkbox" checked={workspace.walkCollision} onChange={event=>setWalkSettings({walkCollision:event.target.checked})}/>Colisiones</label><button onClick={()=>runEditorCommand(tool==='WALK'?'camera.look':'camera.walk')}>{tool==='WALK'?'Mirar':'Recorrer'}</button></div>}
    {tool==='AXES'&&<div className="context-group"><span className="context-label">Ejes locales</span><span>Origen → X → orientación</span><button onClick={()=>runEditorCommand('editor.select')}>Cancelar</button></div>}
    {selected.length>1&&<details className="cad-tool-extra"><summary>Alinear / distribuir</summary><div className="context-group"><span className="context-label">Eje de ajuste</span><select aria-label="Eje" value={arrayAxis} onChange={event=>setArrayAxis(event.target.value as 'x'|'y'|'z')}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select><button onMouseEnter={()=>previewAlign(arrayAxis,'MIN')} onMouseLeave={clearTransformGhosts} onClick={()=>align(arrayAxis,'MIN')}>Mín.</button><button onMouseEnter={()=>previewAlign(arrayAxis,'CENTER')} onMouseLeave={clearTransformGhosts} onClick={()=>align(arrayAxis,'CENTER')}>Centro</button><button onMouseEnter={()=>previewAlign(arrayAxis,'MAX')} onMouseLeave={clearTransformGhosts} onClick={()=>align(arrayAxis,'MAX')}>Máx.</button><button onClick={()=>distributeAdvanced(arrayAxis,'CENTERS')}>Centros iguales</button><button onClick={()=>distributeAdvanced(arrayAxis,'GAPS')}>Huecos iguales</button></div></details>}
    {selected.length>0&&<details className="cad-tool-extra"><summary>Matrices</summary><div className="context-group"><details className="mini-popover" onToggle={event=>setArrayPreviewKind(event.currentTarget.open?'LINEAR':undefined)}><summary>Matriz lineal</summary><div><select aria-label="Modo de matriz" value={arrayMode} onChange={event=>setArrayMode(event.target.value as typeof arrayMode)}><option value="COUNT">Cantidad</option><option value="SPACING">Espaciado</option><option value="FILL">Rellenar longitud</option></select><input aria-label="Cantidad" title="Cantidad de copias" type="number" min="2" max="50" value={arrayCount} onChange={event=>setArrayCount(Math.max(2,Math.min(50,Number(event.target.value)||2)))}/><input aria-label="Espaciado" title="Espaciado en mm" type="number" min="1" value={arraySpacing} onChange={event=>setArraySpacing(Math.max(1,Number(event.target.value)||1))}/><input aria-label="Longitud" title="Longitud total en mm" type="number" min="1" value={arrayFill} onChange={event=>setArrayFill(Math.max(1,Number(event.target.value)||1))}/><button onClick={()=>{setArrayPreviewKind(undefined);linearArraySelected({mode:arrayMode,axis:arrayAxis,count:arrayCount,spacingMm:arraySpacing,fillMm:arrayFill});}}>Crear</button></div></details><details className="mini-popover" onToggle={event=>setArrayPreviewKind(event.currentTarget.open?'RADIAL':undefined)}><summary>Matriz radial</summary><div><input aria-label="Cantidad radial" type="number" min="2" max="50" value={radialCount} onChange={event=>setRadialCount(Math.max(2,Math.min(50,Number(event.target.value)||2)))}/><input aria-label="Ángulo radial" title="Ángulo en grados" type="number" min="1" max="360" value={radialAngle} onChange={event=>setRadialAngle(Math.max(1,Math.min(360,Number(event.target.value)||1)))}/><button onClick={()=>{setArrayPreviewKind(undefined);radialArraySelected({pivot:camera.target,axis:arrayAxis,angleDeg:radialAngle,count:radialCount});}}>Crear</button></div></details></div></details>}
    {selected.length===2&&secondSelected&&<div className="context-group"><button onClick={()=>gridSnap(50)}>Ajustar a cuadrícula 50</button><button onClick={()=>previewSnap(secondSelected)}>Ajustar a cara</button></div>}
    {pendingSnap&&<div className="context-group"><span>{pendingSnap.result.label}</span><button onClick={confirmSnap}>Confirmar</button><button className="secondary" onClick={cancelSnap}>Cancelar</button></div>}
  </div>;
}
