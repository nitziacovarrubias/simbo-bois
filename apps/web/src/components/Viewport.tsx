import './Viewport.css';
import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Grid, Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { animatedTransform } from '@simbo/kinematics-engine';
import {
  composeTransforms,
  getClearanceZoneWorldTransform,
  getHardwareWorldTransform,
  getMachiningFeatureWorldTransform,
  getParentAssemblyId,
  getPartWorldTransform,
  getWorldTransform,
  invertTransform,
  normalizeHex,
  type DesignDocument,
  type Id,
  type Part,
  type SectionPlane,
  type Transform
} from '@simbo/design-domain';
import { applianceDescriptor, countertopDescriptor, cutoutWorldCenter, partWorldAabb, roomSegments, roomWallAabbs, type RoomWall } from '@simbo/geometry-engine';
import { canPickEntity, lookAroundCamera, resolveIsolationPartIds, sectionClippingDescriptor, selectByScreenRectangle, walkCamera, type ScreenPoint, type SelectionFilters } from '@simbo/editor-engine';
import { editorInput, useEditor } from '../store';
import { DISPLAY_MODE_CONFIG, QUALITY_PRESETS, gridHierarchy, gridStepForDistance, selectionVisualState } from '../cadVisualSystem';

type R3fModifierEvent = ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>;

function modifierInput(event: R3fModifierEvent) {
  return { shift: event.nativeEvent.shiftKey, ctrl: event.nativeEvent.ctrlKey, meta: event.nativeEvent.metaKey, alt: event.nativeEvent.altKey };
}

function pointInput(event: ThreeEvent<PointerEvent>, entityId?: Id) {
  return {
    entityId,
    point: { x: event.point.x, y: event.point.y, z: event.point.z },
    screen: { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY },
    button: event.nativeEvent.button,
    buttons: event.nativeEvent.buttons,
    ...modifierInput(event)
  };
}

function captureCanvasPointer(event: ThreeEvent<PointerEvent>): void {
  const target = event.nativeEvent.target;
  if (target instanceof HTMLCanvasElement) target.setPointerCapture(event.nativeEvent.pointerId);
}

function releaseCanvasPointer(event: ThreeEvent<PointerEvent>): void {
  const target = event.nativeEvent.target;
  if (!(target instanceof HTMLCanvasElement) || !target.hasPointerCapture(event.nativeEvent.pointerId)) return;
  target.releasePointerCapture(event.nativeEvent.pointerId);
}

function isAssemblyAncestor(design: DesignDocument, assemblyId: Id, partId: Id): boolean {
  let parentId = getParentAssemblyId(design, partId);
  const visited = new Set<Id>();
  while (parentId && !visited.has(parentId)) {
    if (parentId === assemblyId) return true;
    visited.add(parentId);
    parentId = getParentAssemblyId(design, parentId);
  }
  return false;
}

function previewedTransform(design: DesignDocument, partId: Id, base: Transform, previewEntityId?: Id, original?: Transform, preview?: Transform): Transform {
  if (!previewEntityId || !original || !preview) return base;
  if (previewEntityId === partId) return structuredClone(preview);
  let ancestor = false;
  if (design.assemblies.some(assembly => assembly.id === previewEntityId)) ancestor = isAssemblyAncestor(design, previewEntityId, partId);
  const moduleInstance = design.moduleInstances.find(instance => instance.id === previewEntityId);
  if (moduleInstance) ancestor = isAssemblyAncestor(design, moduleInstance.rootAssemblyId, partId);
  if (!ancestor) return base;
  const relative = composeTransforms(invertTransform(original), base);
  return composeTransforms(preview, relative);
}

function selectionOwner(design: DesignDocument, partId: Id): Id | undefined {
  let parentId = getParentAssemblyId(design, partId);
  let nearest = parentId;
  while (parentId) {
    const instance = design.moduleInstances.find(candidate => candidate.rootAssemblyId === parentId && !candidate.detached);
    if (instance) return instance.id;
    nearest = parentId;
    parentId = getParentAssemblyId(design, parentId);
  }
  return nearest && nearest !== design.rootAssemblyId ? nearest : undefined;
}

function pointerPickTarget(design:DesignDocument,partId:Id,filters:SelectionFilters):Id|undefined {
  if(canPickEntity(design,partId,filters))return partId;
  const owner=selectionOwner(design,partId);
  if(owner&&canPickEntity(design,owner,filters))return owner;
  return undefined;
}

function CadGridSystem() {
  const room = useEditor(state => state.design.room);
  const mode = useEditor(state => state.displayMode);
  const target = useEditor(state => state.camera.target);
  const config = DISPLAY_MODE_CONFIG[mode];
  const gridVisible = useEditor(state => state.gridVisible);
  const cleanMode = useEditor(state => state.cleanMode);
  const presentationMode = useEditor(state => state.presentationMode);
  const [step, setStep] = useState<1 | 5 | 10 | 25 | 50 | 100>(50);
  const { camera } = useThree();
  useFrame(() => {
    const distance = Math.hypot(camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z);
    const next = gridStepForDistance(distance);
    if (next !== step) setStep(next);
  });
  if (config.grid === 'HIDDEN' || !gridVisible || cleanMode || presentationMode) return null;
  const hierarchy = gridHierarchy(step);
  const subtle = config.grid === 'SUBTLE';
  const axisLength = Math.max(room.widthMm, room.depthMm) * 1.15;
  return <group>
    <Grid
      args={[room.widthMm * 1.25, room.depthMm * 1.25]}
      position={[0, .7, 0]}
      cellSize={hierarchy.minor}
      sectionSize={hierarchy.major}
      cellColor={subtle ? '#AEB8BD' : '#9DA9AF'}
      sectionColor={subtle ? '#8C989F' : '#718089'}
      cellThickness={subtle ? .28 : .38}
      sectionThickness={subtle ? .65 : .9}
      fadeDistance={Math.max(room.widthMm, room.depthMm) * 1.75}
      fadeStrength={1.35}
      infiniteGrid={false}
    />
    {config.axes && <>
      <Line points={[[-axisLength, 1.4, 0], [axisLength, 1.4, 0]]} color="#A85F59" lineWidth={1.15} transparent opacity={.72} />
      <Line points={[[0, 1.4, -axisLength], [0, 1.4, axisLength]]} color="#557D9B" lineWidth={1.15} transparent opacity={.72} />
      <Line points={[[0, 0, 0], [0, Math.min(room.heightMm, axisLength), 0]]} color="#68866B" lineWidth={1.05} transparent opacity={.64} />
    </>}
  </group>;
}

function autoWallOpacity(wall:RoomWall, cameraPosition:{x:number;y:number;z:number}, room:{widthMm:number;depthMm:number}, opaque:number):number {
  const nx = cameraPosition.x / Math.max(room.widthMm / 2, 1);
  const nz = cameraPosition.z / Math.max(room.depthMm / 2, 1);
  const nearX = nx > .35 ? 'EAST' : nx < -.35 ? 'WEST' : undefined;
  const nearZ = nz > .35 ? 'SOUTH' : nz < -.35 ? 'NORTH' : undefined;
  return wall === nearX || wall === nearZ ? .08 : opaque;
}

function RoomGeometry({ clippingPlanes=[] }: { clippingPlanes?:THREE.Plane[] }) {
  const room = useEditor(state => state.design.room);
  const mode = useEditor(state => state.displayMode);
  const wallsMode = useEditor(state => state.workspace.wallsMode);
  const cameraState = useEditor(state => state.camera);
  const visible = useEditor(state => state.visibilityTags.ROOM);
  const activeTool=useEditor(state=>state.activeTool);
  const roomPickable=useEditor(state=>state.selectionFilters.ROOM);
  const select=useEditor(state=>state.selectWithModifiers);
  const config = DISPLAY_MODE_CONFIG[mode];
  const shadowsEnabled = useEditor(state => QUALITY_PRESETS[state.workspace.qualityPreset].shadows);
  const segments=useMemo(()=>roomSegments(room),[room]);
  if(!visible)return <CadGridSystem/>;
  const opaque=Math.max(config.wallOpacity,.72);
  const wallOpacity=(wall:RoomWall)=>wallsMode==='VISIBLE'?opaque:wallsMode==='TRANSPARENT'?Math.min(config.wallOpacity,.28):wallsMode==='AUTO'?autoWallOpacity(wall,cameraState.position,room,opaque):0;
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow={shadowsEnabled && config.shadows !== 'OFF'} onPointerDown={event=>{if(event.nativeEvent.button!==0||activeTool!=='SELECT'||!roomPickable)return;event.stopPropagation();select(room.id,modifierInput(event));}}>
      <planeGeometry args={[room.widthMm, room.depthMm]} />
      <meshStandardMaterial color={config.floor} roughness={.94} metalness={0} clippingPlanes={clippingPlanes} side={THREE.DoubleSide}/>
    </mesh>
    <CadGridSystem />
    {wallsMode !== 'HIDDEN' && segments.map(segment=>{
      const opacity=wallOpacity(segment.wall);
      if(opacity<=0)return null;
      return <mesh key={segment.id} position={[segment.position.x,segment.position.y,segment.position.z]} receiveShadow={shadowsEnabled&&config.shadows!=='OFF'} castShadow={false} onPointerDown={event=>{if(event.nativeEvent.button!==0||activeTool!=='SELECT'||!roomPickable)return;event.stopPropagation();select(room.id,modifierInput(event));}}>
        <boxGeometry args={[segment.dimensionsMm.x,segment.dimensionsMm.y,segment.dimensionsMm.z]}/>
        <meshStandardMaterial color={config.wall} transparent={opacity<.999} opacity={opacity} depthWrite={opacity>.45} side={THREE.DoubleSide} roughness={.94} clippingPlanes={clippingPlanes}/>
      </mesh>;
    })}
  </group>;
}

function CachedCadEdges({ width, height, thickness, color, opacity, depthTest = true, quality = 1, clippingPlanes=[] }: { width: number; height: number; thickness: number; color: string; opacity: number; depthTest?: boolean; quality?: 1 | 2; clippingPlanes?:THREE.Plane[] }) {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(width, height, thickness);
    const edges = new THREE.EdgesGeometry(box, quality === 2 ? 10 : 20);
    box.dispose();
    return edges;
  }, [width, height, thickness, quality]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry} renderOrder={depthTest ? 1 : 5}>
    <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={depthTest} clippingPlanes={clippingPlanes}/>
  </lineSegments>;
}

function PartObject({ part, index, clippingPlanes=[] }: { part: Part; index: number; clippingPlanes?:THREE.Plane[] }) {
  const design = useEditor(state => state.design);
  const selectedIds = useEditor(state => state.selectedIds);
  const displayMode = useEditor(state => state.displayMode);
  const kinematicValues = useEditor(state => state.kinematicValues);
  const exploded = useEditor(state => state.exploded);
  const hovered = useEditor(state => state.hoveredId === part.id);
  const setHovered = useEditor(state => state.setHovered);
  const preview = useEditor(state => state.toolPreview);
  const previewEntityId = useEditor(state => state.toolPreviewEntityId);
  const original = useEditor(state => state.toolOriginal);
  const activeTool = useEditor(state => state.activeTool);
  const presentationMode=useEditor(state=>state.presentationMode);
  const cleanMode=useEditor(state=>state.cleanMode);
  const editContextId=useEditor(state=>state.editContextId);
  const selectionFilters=useEditor(state=>state.selectionFilters);
  const contextRoot=editContextId ? (design.moduleInstances.find(instance=>instance.id===editContextId)?.rootAssemblyId ?? editContextId) : undefined;
  const inContext=!contextRoot || isAssemblyAncestor(design,contextRoot,part.id) || getParentAssemblyId(design,part.id)===contextRoot;
  const selectedExact = selectedIds.includes(part.id);
  const selectedGroup = selectedIds.some(id => {
    const assembly = design.assemblies.find(candidate => candidate.id === id);
    if (assembly) return isAssemblyAncestor(design, assembly.id, part.id);
    const instance = design.moduleInstances.find(candidate => candidate.id === id);
    return instance ? isAssemblyAncestor(design, instance.rootAssemblyId, part.id) : false;
  });
  const previewing = Boolean(preview && previewEntityId && (previewEntityId === part.id || (design.assemblies.some(a => a.id === previewEntityId) && isAssemblyAncestor(design, previewEntityId, part.id)) || (design.moduleInstances.some(i => i.id === previewEntityId) && isAssemblyAncestor(design, design.moduleInstances.find(i => i.id === previewEntityId)!.rootAssemblyId, part.id))));
  const material = design.materials.find(candidate => candidate.id === part.materialId);
  const relation = design.kinematics.find(candidate => candidate.movingEntityId === part.id);
  const value = relation ? (kinematicValues[relation.id] ?? relation.currentValue) : 0;
  const base: Transform = relation ? animatedTransform(design, relation, value) : getPartWorldTransform(design, part.id);
  const visual = previewedTransform(design, part.id, base, previewEntityId, original, preview);
  const explodeOffset = exploded ? index * 35 : 0;
  const transform = { ...visual, position: { ...visual.position, x: visual.position.x + explodeOffset, z: visual.position.z + explodeOffset * .4 } };
  const overrideColor = typeof part.metadata.colorHex === 'string' ? part.metadata.colorHex : undefined;
  const baseColor = normalizeHex(overrideColor ?? material?.colorHex ?? '#B58A63');
  const config = DISPLAY_MODE_CONFIG[displayMode];
  const color = config.faceOverride ?? baseColor;
  const wireframe = displayMode === 'WIREFRAME';
  const xray = displayMode === 'XRAY';
  const hiddenLine = displayMode === 'HIDDEN_LINE';
  const quality = useEditor(state => QUALITY_PRESETS[state.workspace.qualityPreset]);
  const visualState = presentationMode || cleanMode ? 'NONE' : selectionVisualState(selectedExact, selectedGroup, hovered);
  const edgeColor = visualState === 'SELECTED' ? config.selectedEdgeColor : visualState === 'GROUP' ? config.groupEdgeColor : visualState === 'HOVER' ? config.hoverEdgeColor : config.edgeColor;
  const edgeOpacity = visualState === 'NONE' ? config.edgeOpacity : visualState === 'HOVER' ? .9 : 1;
  const emissive = visualState === 'SELECTED' ? '#2B1A08' : visualState === 'GROUP' ? '#10232D' : visualState === 'HOVER' ? '#10251B' : '#000000';
  const presentation = displayMode === 'PRESENTATION' || displayMode === 'SHADED';

  return <group
    position={[transform.position.x, transform.position.y, transform.position.z]}
    rotation={[transform.rotation.x, transform.rotation.y, transform.rotation.z]}
    onPointerOver={event => { event.stopPropagation(); if(inContext)setHovered(part.id); }}
    onPointerOut={() => setHovered(undefined)}
    onPointerMove={event => {
      if ((event.nativeEvent.buttons & 4) !== 0) return;
      if (part.locked) return;
      const target = activeTool === 'SELECT' ? pointerPickTarget(design, part.id, selectionFilters) : part.id;
      if (!target || (activeTool === 'SELECT' && !inContext)) return;
      event.stopPropagation();
      editorInput.pointerMove(pointInput(event, target));
    }}
    onPointerDown={event => {
      if (event.nativeEvent.button !== 0) return;
      event.stopPropagation();
      if (part.locked) return;
      const target = activeTool === 'SELECT' ? pointerPickTarget(design, part.id, selectionFilters) : part.id;
      if (!target || (activeTool === 'SELECT' && !inContext)) return;
      captureCanvasPointer(event);
      editorInput.pointerDown(pointInput(event, target));
    }}
    onPointerUp={event => {
      if (event.nativeEvent.button !== 0) return;
      if ((event.nativeEvent.buttons & 4) !== 0) return;
      const target = activeTool === 'SELECT' ? pointerPickTarget(design, part.id, selectionFilters) : part.id;
      if (!target) return;
      event.stopPropagation();
      editorInput.pointerUp(pointInput(event, target));
      releaseCanvasPointer(event);
    }}
    onDoubleClick={event => {
      event.stopPropagation();
      const owner = selectionOwner(design, part.id);
      if (owner && canPickEntity(design,owner,selectionFilters)) useEditor.getState().enterEditContext(owner);
    }}
    onContextMenu={event=>{
      event.stopPropagation();event.nativeEvent.preventDefault();
      if(!inContext)return;
      const owner=selectionOwner(design,part.id);
      const selectedOwner=owner&&selectedIds.includes(owner)&&canPickEntity(design,owner,selectionFilters)?owner:undefined;
      const entityId=selectedOwner??pointerPickTarget(design,part.id,selectionFilters);if(!entityId)return;
      useEditor.getState().select(entityId);
      useEditor.getState().setContextMenu({x:event.nativeEvent.clientX,y:event.nativeEvent.clientY,entityId});
    }}
  >
    <mesh castShadow={quality.shadows && presentation} receiveShadow={quality.shadows && presentation}>
      <boxGeometry args={[part.dimensions.widthMm, part.dimensions.heightMm, part.dimensions.thicknessMm]} />
      <meshStandardMaterial
        color={color}
        roughness={hiddenLine ? 1 : material?.roughness ?? .62}
        metalness={hiddenLine ? 0 : material?.metalness ?? 0}
        emissive={emissive}
        emissiveIntensity={visualState === 'NONE' ? 0 : visualState === 'HOVER' ? .1 : .16}
        transparent={xray || previewing || !inContext}
        opacity={!inContext ? .16 : xray ? .24 : previewing ? .64 : 1}
        wireframe={wireframe}
        clippingPlanes={clippingPlanes}
        depthWrite={!xray && inContext}
      />
      {!wireframe && <CachedCadEdges width={part.dimensions.widthMm} height={part.dimensions.heightMm} thickness={part.dimensions.thicknessMm} color={previewing ? config.selectedEdgeColor : edgeColor} opacity={previewing ? 1 : edgeOpacity} depthTest={!xray} quality={quality.edgeSegments} clippingPlanes={clippingPlanes}/>}
    </mesh>
    {displayMode === 'MANUFACTURING' && part.grainDirection !== 'NONE' && <Line points={[[-part.dimensions.widthMm * .3, 0, part.dimensions.thicknessMm / 2 + 1], [part.dimensions.widthMm * .3, 0, part.dimensions.thicknessMm / 2 + 1]]} lineWidth={1} color="#5B6870" />}
  </group>;
}

function HardwareOverlay({clippingPlanes=[],visiblePartIds}:{clippingPlanes?:THREE.Plane[];visiblePartIds?:Set<Id>}) {
  const design = useEditor(state => state.design);
  const mode = useEditor(state => state.displayMode);
  const visibleTag=useEditor(state=>state.visibilityTags.HARDWARE);
  const technical=useEditor(state=>state.technicalOverlays);
  const activeTool=useEditor(state=>state.activeTool);
  const filters=useEditor(state=>state.selectionFilters);
  const select=useEditor(state=>state.selectWithModifiers);
  if (!visibleTag || !technical || !DISPLAY_MODE_CONFIG[mode].hardware) return null;
  return <group>{design.hardwareInstances.filter(instance => !instance.hidden && (!visiblePartIds || instance.connectedPartIds.some(id=>visiblePartIds.has(id)))).map(instance => {
    const definition = design.hardwareDefinitions.find(candidate => candidate.id === instance.definitionId);
    const diameter = Number(instance.parameters.diameterMm ?? definition?.dimensions.diameterMm ?? 6);
    const lengthMm = Number(instance.parameters.lengthMm ?? definition?.dimensions.lengthMm ?? 20);
    const world = getHardwareWorldTransform(design, instance.id);
    return <mesh key={instance.id} position={[world.position.x, world.position.y, world.position.z]} rotation={[world.rotation.x, world.rotation.y, world.rotation.z]} onPointerDown={event=>{if(event.nativeEvent.button!==0||activeTool!=='SELECT'||!canPickEntity(design,instance.id,filters))return;event.stopPropagation();select(instance.id,modifierInput(event));}}>
      <cylinderGeometry args={[diameter / 2, diameter / 2, lengthMm, 12]} />
      <meshStandardMaterial color={definition?.colorHex ?? '#777777'} metalness={.58} roughness={.34} clippingPlanes={clippingPlanes}/>
    </mesh>;
  })}</group>;
}

function MachiningOverlay({clippingPlanes=[],visiblePartIds}:{clippingPlanes?:THREE.Plane[];visiblePartIds?:Set<Id>}) {
  const design = useEditor(state => state.design);
  const mode = useEditor(state => state.displayMode);
  const visibleTag=useEditor(state=>state.visibilityTags.MACHINING);
  const technical=useEditor(state=>state.technicalOverlays);
  if (!visibleTag || !technical || !DISPLAY_MODE_CONFIG[mode].machining) return null;
  return <group>{design.machiningFeatures.filter(feature=>!visiblePartIds || visiblePartIds.has(feature.partId)).map(feature => {
    const world = getMachiningFeatureWorldTransform(design, feature.id);
    return <mesh key={feature.id} position={[world.position.x, world.position.y, world.position.z]} rotation={[world.rotation.x, world.rotation.y, world.rotation.z]}>
      <cylinderGeometry args={[(feature.diameterMm ?? 8) / 2, (feature.diameterMm ?? 8) / 2, Math.max(feature.depthMm ?? 10, 2), 12]} />
      <meshBasicMaterial color="#D65245" transparent opacity={mode === 'MANUFACTURING' ? .9 : .5} clippingPlanes={clippingPlanes}/>
    </mesh>;
  })}</group>;
}

function ServiceOverlay() {
  const design = useEditor(state => state.design);
  const mode = useEditor(state => state.displayMode);
  const visibleTag=useEditor(state=>state.visibilityTags.SERVICES);
  const technical=useEditor(state=>state.technicalOverlays);
  const activeTool=useEditor(state=>state.activeTool);
  const filters=useEditor(state=>state.selectionFilters);
  const selected=useEditor(state=>state.selectedIds);
  const hiddenIds=useEditor(state=>state.workspaceHiddenIds);
  const select=useEditor(state=>state.selectWithModifiers);
  const menu=useEditor(state=>state.setContextMenu);
  if (!visibleTag || !technical || !DISPLAY_MODE_CONFIG[mode].servicePoints) return null;
  return <group>{design.servicePoints.filter(point=>!point.hidden&&!hiddenIds.includes(point.id)).map(point => <mesh key={point.id} position={[point.position.x, point.position.y, point.position.z]} onPointerDown={event=>{if(event.nativeEvent.button!==0||activeTool!=='SELECT'||!canPickEntity(design,point.id,filters))return;event.stopPropagation();select(point.id,modifierInput(event));}} onContextMenu={event=>{event.stopPropagation();event.nativeEvent.preventDefault();select(point.id,modifierInput(event));menu({x:event.nativeEvent.clientX,y:event.nativeEvent.clientY,entityId:point.id});}}><sphereGeometry args={[selected.includes(point.id)?34:25, 12, 12]} /><meshBasicMaterial color="#438FB3" /></mesh>)}</group>;
}

function KitchenEntitiesOverlay({clippingPlanes=[]}:{clippingPlanes?:THREE.Plane[]}){
  const design=useEditor(state=>state.design);
  const mode=useEditor(state=>state.displayMode);
  const visibility=useEditor(state=>state.visibilityTags);
  const activeTool=useEditor(state=>state.activeTool);
  const filters=useEditor(state=>state.selectionFilters);
  const selected=useEditor(state=>state.selectedIds);
  const hiddenIds=useEditor(state=>state.workspaceHiddenIds);
  const isolatedIds=useEditor(state=>state.isolatedIds);
  const technical=useEditor(state=>state.technicalOverlays);
  const select=useEditor(state=>state.selectWithModifiers);
  const menu=useEditor(state=>state.setContextMenu);
  const config=DISPLAY_MODE_CONFIG[mode];
  const isolated=isolatedIds?new Set(isolatedIds):undefined;
  const allowed=(id:Id,hidden=false)=>!hidden&&!hiddenIds.includes(id)&&(!isolated||isolated.has(id));
  const pointer=(id:Id)=>(event:ThreeEvent<PointerEvent>)=>{if(event.nativeEvent.button!==0||activeTool!=='SELECT'||!canPickEntity(design,id,filters))return;event.stopPropagation();select(id,modifierInput(event));};
  const context=(id:Id)=>(event:ThreeEvent<MouseEvent>)=>{event.stopPropagation();event.nativeEvent.preventDefault();select(id,modifierInput(event));menu({x:event.nativeEvent.clientX,y:event.nativeEvent.clientY,entityId:id});};
  return <group>
    {visibility.APPLIANCES&&config.appliances&&design.applianceInstances.filter(v=>allowed(v.id,Boolean(v.hidden))).map(instance=>{const d=applianceDescriptor(design,instance),def=design.applianceDefinitions.find(v=>v.id===instance.definitionId),isSelected=selected.includes(instance.id);return <group key={instance.id} position={[d.transform.position.x,d.transform.position.y,d.transform.position.z]} rotation={[d.transform.rotation.x,d.transform.rotation.y,d.transform.rotation.z]} onPointerDown={pointer(instance.id)} onContextMenu={context(instance.id)}><mesh><boxGeometry args={[d.dimensionsMm.x,d.dimensionsMm.y,d.dimensionsMm.z]}/><meshStandardMaterial color={def?.colorHex??'#AEB4B7'} roughness={.55} metalness={.2} transparent={config.applianceOpacity<1} opacity={config.applianceOpacity} clippingPlanes={clippingPlanes}/></mesh><CachedCadEdges width={d.dimensionsMm.x} height={d.dimensionsMm.y} thickness={d.dimensionsMm.z} color={isSelected?config.selectedEdgeColor:config.edgeColor} opacity={isSelected?1:.65} clippingPlanes={clippingPlanes}/>{technical&&def?.requiredOpening&&<mesh position={[0,0,0]}><boxGeometry args={[def.requiredOpening.widthMm,def.requiredOpening.heightMm,def.requiredOpening.depthMm]}/><meshBasicMaterial wireframe transparent opacity={.18} color="#4F87A2" depthWrite={false}/></mesh>}</group>;})}
    {visibility.COUNTERTOPS&&config.countertops&&design.countertops.filter(v=>allowed(v.id,Boolean(v.hidden))).map(countertop=>{const d=countertopDescriptor(design,countertop),isSelected=selected.includes(countertop.id);return <group key={countertop.id} position={[d.transform.position.x,d.transform.position.y,d.transform.position.z]} rotation={[d.transform.rotation.x,d.transform.rotation.y,d.transform.rotation.z]} onPointerDown={pointer(countertop.id)} onContextMenu={context(countertop.id)}><mesh><boxGeometry args={[d.dimensionsMm.x,d.dimensionsMm.y,d.dimensionsMm.z]}/><meshStandardMaterial color={countertop.colorHex??'#D7D3CC'} roughness={countertop.roughness??.7} metalness={countertop.metalness??0} clippingPlanes={clippingPlanes}/></mesh><CachedCadEdges width={d.dimensionsMm.x} height={d.dimensionsMm.y} thickness={d.dimensionsMm.z} color={isSelected?config.selectedEdgeColor:config.edgeColor} opacity={.85} clippingPlanes={clippingPlanes}/></group>;})}
    {technical&&visibility.COUNTERTOPS&&design.cutouts.map(cutout=>{let center;try{center=cutoutWorldCenter(design,cutout.id);}catch{return null;}return <mesh key={cutout.id} position={[center.x,center.y+3,center.z]} rotation={[-Math.PI/2,cutout.rotation,0]} onPointerDown={pointer(cutout.id)} onContextMenu={context(cutout.id)}><planeGeometry args={[cutout.widthMm,cutout.depthMm]}/><meshBasicMaterial color="#B24E42" wireframe transparent opacity={selected.includes(cutout.id)?1:.65} depthTest={false}/></mesh>;})}
    {technical&&visibility.CLEARANCES&&config.clearances&&design.clearanceZones.filter(v=>allowed(v.id,Boolean(v.hidden))).map(zone=>{const t=getClearanceZoneWorldTransform(design,zone.id);return <mesh key={zone.id} position={[t.position.x,t.position.y,t.position.z]} rotation={[t.rotation.x,t.rotation.y,t.rotation.z]} onPointerDown={pointer(zone.id)} onContextMenu={context(zone.id)}><boxGeometry args={[zone.dimensions.widthMm,zone.dimensions.heightMm,zone.dimensions.depthMm]}/><meshBasicMaterial color="#D9902D" transparent opacity={selected.includes(zone.id)?.22:.1} wireframe={!selected.includes(zone.id)} depthWrite={false}/></mesh>;})}
    {technical&&visibility.FUNCTIONAL_ZONES&&design.functionalZones.filter(v=>allowed(v.id,Boolean(v.hidden))).map(zone=><mesh key={zone.id} position={[zone.transform.position.x,zone.transform.position.y,zone.transform.position.z]} rotation={[zone.transform.rotation.x,zone.transform.rotation.y,zone.transform.rotation.z]} onPointerDown={pointer(zone.id)}><boxGeometry args={[zone.dimensions.widthMm,zone.dimensions.heightMm,zone.dimensions.depthMm]}/><meshBasicMaterial color="#668FA0" transparent opacity={.08} wireframe depthWrite={false}/></mesh>)}
  </group>;
}

function InferenceMarker({ candidate }: { candidate: NonNullable<ReturnType<typeof useEditor.getState>['inferenceCandidate']> }) {
  const common = <meshBasicMaterial color="#E49A2E" depthTest={false} />;
  if (candidate.kind === 'MIDPOINT') return <mesh rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[24, 24, 5]} />{common}</mesh>;
  if (candidate.kind === 'CENTER') return <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[15, 3, 8, 20]} />{common}</mesh>;
  if (candidate.kind === 'FACE') return <mesh><circleGeometry args={[16, 16]} />{common}</mesh>;
  if (candidate.kind === 'AXIS' || candidate.kind === 'PARALLEL' || candidate.kind === 'PERPENDICULAR') return <mesh><boxGeometry args={[10, 10, 10]} />{common}</mesh>;
  return <mesh><boxGeometry args={[18, 18, 18]} />{common}</mesh>;
}

function InferenceLayer() {
  const enabled = useEditor(state => state.inferenceEnabled);
  const candidate = useEditor(state => state.inferenceCandidate);
  const locked = useEditor(state => state.inferenceLockedId);
  const clean=useEditor(state=>state.cleanMode);
  const guidesVisible=useEditor(state=>state.visibilityTags.GUIDES);
  if (!enabled || !candidate || clean || !guidesVisible) return null;
  const direction = candidate.direction;
  const linePoints = direction ? [
    [candidate.point.x - direction.x * 1200, candidate.point.y - direction.y * 1200, candidate.point.z - direction.z * 1200] as [number, number, number],
    [candidate.point.x + direction.x * 1200, candidate.point.y + direction.y * 1200, candidate.point.z + direction.z * 1200] as [number, number, number]
  ] : undefined;
  return <group>
    {linePoints && <Line points={linePoints} color="#CF8A22" lineWidth={1} dashed dashSize={18} gapSize={12} />}
    <group position={[candidate.point.x, candidate.point.y, candidate.point.z]}>
      <InferenceMarker candidate={candidate} />
      <Html center distanceFactor={8}><div className={`inference-tooltip ${locked ? 'locked' : ''}`}>{candidate.label}{locked ? ' · bloqueado' : ''}</div></Html>
    </group>
  </group>;
}

function GuideLayer() {
  const guides = useEditor(state => state.guides);
  const selectedGuideId=useEditor(state=>state.selectedGuideId);
  const setSelectedGuide=useEditor(state=>state.setSelectedGuide);
  const visible=useEditor(state=>state.visibilityTags.GUIDES && !state.cleanMode);
  const guidesPickable=useEditor(state=>state.selectionFilters.GUIDES);
  if(!visible)return null;
  const down=(id:Id)=>(event:ThreeEvent<PointerEvent>)=>{if(event.nativeEvent.button!==0||!guidesPickable)return;event.stopPropagation();setSelectedGuide(id);};
  const menu=(id:Id)=>(event:ThreeEvent<MouseEvent>)=>{if(!guidesPickable)return;event.stopPropagation();event.nativeEvent.preventDefault();setSelectedGuide(id);useEditor.getState().setContextMenu({x:event.nativeEvent.clientX,y:event.nativeEvent.clientY,entityId:id});};
  return <group>{guides.map(guide => {
    const selected=guide.id===selectedGuideId;
    const color=selected?'#D78A24':'#547E9A';
    if(guide.type==='POINT')return <mesh key={guide.id} position={[guide.origin.x,guide.origin.y,guide.origin.z]} onPointerDown={down(guide.id)} onContextMenu={menu(guide.id)}><sphereGeometry args={[selected?14:10,10,10]}/><meshBasicMaterial color={color} depthTest={false}/></mesh>;
    if(guide.type==='LINE')return <Line key={guide.id} points={[[guide.origin.x-guide.direction.x*2500,guide.origin.y-guide.direction.y*2500,guide.origin.z-guide.direction.z*2500],[guide.origin.x+guide.direction.x*2500,guide.origin.y+guide.direction.y*2500,guide.origin.z+guide.direction.z*2500]]} color={color} lineWidth={selected?1.8:1} dashed onPointerDown={down(guide.id)} onContextMenu={menu(guide.id)}/>;
    const quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(guide.normal.x,guide.normal.y,guide.normal.z).normalize());
    return <group key={guide.id} position={[guide.origin.x,guide.origin.y,guide.origin.z]} quaternion={quaternion} onPointerDown={down(guide.id)} onContextMenu={menu(guide.id)}><mesh><planeGeometry args={[1800,1800]}/><meshBasicMaterial color={color} transparent opacity={selected ? .12 : .06} side={THREE.DoubleSide} depthWrite={false}/></mesh><Line points={[[-900,0,1],[900,0,1]]} color={color} lineWidth={1} dashed/><Line points={[[0,-900,1],[0,900,1]]} color={color} lineWidth={1} dashed/></group>;
  })}</group>;
}

function MeasureLayer() {
  const visible=useEditor(state=>state.visibilityTags.DIMENSIONS && !state.cleanMode);
  const pointA = useEditor(state => state.measurePointA);
  const result = useEditor(state => state.measureResult);
  if(!visible)return null;
  return <group>
    {pointA && <mesh position={[pointA.x, pointA.y, pointA.z]}><sphereGeometry args={[12, 10, 10]} /><meshBasicMaterial color="#2A778D" depthTest={false} /></mesh>}
    {result && <><Line points={[[result.pointA.x, result.pointA.y, result.pointA.z], [result.pointB.x, result.pointB.y, result.pointB.z]]} color="#2A778D" lineWidth={2} /><Html position={[result.pointB.x, result.pointB.y, result.pointB.z]} center distanceFactor={10}><div className="measure-tooltip"><b>{result.distanceMm.toFixed(2)} mm</b><span>ΔX {result.delta.x.toFixed(1)} · ΔY {result.delta.y.toFixed(1)} · ΔZ {result.delta.z.toFixed(1)}</span></div></Html></>}
  </group>;
}

function RotateProtractor() {
  const tool = useEditor(state => state.activeTool);
  const pivot = useEditor(state => state.toolPivot);
  const axis = useEditor(state => state.axisLock) ?? 'y';
  if (tool !== 'ROTATE' || !pivot) return null;
  const rotation: [number, number, number] = axis === 'y' ? [Math.PI / 2, 0, 0] : axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0];
  return <group position={[pivot.x, pivot.y, pivot.z]} rotation={rotation}>
    <mesh><torusGeometry args={[260, 3, 8, 72]} /><meshBasicMaterial color="#CC8A29" depthTest={false} /></mesh>
    {Array.from({ length: 24 }, (_, index) => {
      const angle = index * Math.PI / 12;
      return <Line key={index} points={[[Math.cos(angle) * 235, Math.sin(angle) * 235, 0], [Math.cos(angle) * 270, Math.sin(angle) * 270, 0]]} color="#CC8A29" lineWidth={1} />;
    })}
  </group>;
}

function ProtractorLayer() {
  const tool=useEditor(state=>state.activeTool);
  const center=useEditor(state=>state.protractorCenter);
  const reference=useEditor(state=>state.protractorReference);
  const result=useEditor(state=>state.protractorResult);
  if(tool!=='PROTRACTOR'||!center)return null;
  const radius=280;
  const ref=reference?new THREE.Vector3(reference.x-center.x,reference.y-center.y,reference.z-center.z).normalize():undefined;
  const points:[number,number,number][]=[];
  if(ref&&result){
    const normal=new THREE.Vector3(result.normal.x,result.normal.y,result.normal.z).normalize();
    const start=new THREE.Vector3(result.referenceDirection.x,result.referenceDirection.y,result.referenceDirection.z).normalize();
    for(let i=0;i<=32;i++){
      const q=new THREE.Quaternion().setFromAxisAngle(normal,result.angleRad*i/32);
      const value=start.clone().applyQuaternion(q).multiplyScalar(radius);
      points.push([center.x+value.x,center.y+value.y,center.z+value.z]);
    }
  }
  return <group>
    <mesh position={[center.x,center.y,center.z]}><sphereGeometry args={[12,10,10]}/><meshBasicMaterial color="#B86F1D" depthTest={false}/></mesh>
    {reference&&<Line points={[[center.x,center.y,center.z],[center.x+(ref?.x??0)*radius*1.25,center.y+(ref?.y??0)*radius*1.25,center.z+(ref?.z??0)*radius*1.25]]} color="#B86F1D" lineWidth={1.4}/>} 
    {points.length>1&&<Line points={points} color="#D58A25" lineWidth={2}/>} 
    {result&&<Html position={[center.x+result.measuredDirection.x*radius,center.y+result.measuredDirection.y*radius,center.z+result.measuredDirection.z*radius]} center distanceFactor={10}><div className="measure-tooltip"><b>{Math.abs(result.angleDeg).toFixed(2)}°</b><span>Transportador</span></div></Html>}
  </group>;
}

function LocalAxesLayer(){
  const design=useEditor(state=>state.design);
  const contextId=useEditor(state=>state.editContextId);
  const tool=useEditor(state=>state.activeTool);
  const originDraft=useEditor(state=>state.axesOrigin);
  const xDraft=useEditor(state=>state.axesXPoint);
  let transform:Transform|undefined;
  if(contextId){try{transform=getWorldTransform(design,contextId);}catch{/* Contexto desactualizado. */}}
  if(!transform&&tool!=='AXES')return null;
  const lengthMm=650;
  if(transform){
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(transform.rotation.x,transform.rotation.y,transform.rotation.z));
    return <group position={[transform.position.x,transform.position.y,transform.position.z]} quaternion={q} renderOrder={7}>
      <Line points={[[0,0,0],[lengthMm,0,0]]} color="#D06A61" lineWidth={2} depthTest={false}/>
      <Line points={[[0,0,0],[0,lengthMm,0]]} color="#6F9B72" lineWidth={2} depthTest={false}/>
      <Line points={[[0,0,0],[0,0,lengthMm]]} color="#5C87AA" lineWidth={2} depthTest={false}/>
      <Html position={[lengthMm,0,0]} center distanceFactor={12}><span className="local-axis-label">X local</span></Html>
    </group>;
  }
  return <group>{originDraft&&<mesh position={[originDraft.x,originDraft.y,originDraft.z]}><sphereGeometry args={[14,10,10]}/><meshBasicMaterial color="#D58A25" depthTest={false}/></mesh>}{originDraft&&xDraft&&<Line points={[[originDraft.x,originDraft.y,originDraft.z],[xDraft.x,xDraft.y,xDraft.z]]} color="#D06A61" lineWidth={2} depthTest={false}/>}</group>;
}

function TransformGhostLayer(){
  const ghosts=useEditor(state=>state.transformGhosts);
  const design=useEditor(state=>state.design);
  if(!ghosts.length)return null;
  return <group renderOrder={6}>{ghosts.map((ghost,index)=>{
    const part=design.parts.find(candidate=>candidate.id===ghost.entityId);if(!part)return null;
    return <group key={`${ghost.entityId}:${index}`} position={[ghost.transform.position.x,ghost.transform.position.y,ghost.transform.position.z]} rotation={[ghost.transform.rotation.x,ghost.transform.rotation.y,ghost.transform.rotation.z]}>
      <mesh><boxGeometry args={[part.dimensions.widthMm,part.dimensions.heightMm,part.dimensions.thicknessMm]}/><meshStandardMaterial color="#4A9A70" transparent opacity={.2} depthWrite={false}/><Edges color="#377B58" lineWidth={1.5}/></mesh>
    </group>;
  })}</group>;
}

function SnapGhost() {
  const pending = useEditor(state => state.pendingSnap);
  const design = useEditor(state => state.design);
  if (!pending) return null;
  const part = design.parts.find(candidate => candidate.id === pending.partId);
  if (!part) return null;
  const result = pending.result;
  const world = getPartWorldTransform(design, part.id);
  return <group position={[result.position.x, result.position.y, result.position.z]} rotation={[result.rotation?.x ?? world.rotation.x, result.rotation?.y ?? world.rotation.y, result.rotation?.z ?? world.rotation.z]}>
    <mesh><boxGeometry args={[part.dimensions.widthMm, part.dimensions.heightMm, part.dimensions.thicknessMm]} /><meshStandardMaterial color="#4A9A70" transparent opacity={.26} depthWrite={false} /><Edges color="#377B58" lineWidth={2} /></mesh>
  </group>;
}

function projectPartBounds(design: DesignDocument, part: Part, camera: THREE.Camera, width: number, height: number) {
  const aabb = partWorldAabb(design, part);
  const xs = [aabb.min.x, aabb.max.x], ys = [aabb.min.y, aabb.max.y], zs = [aabb.min.z, aabb.max.z];
  const points: THREE.Vector3[] = [];
  for (const x of xs) for (const y of ys) for (const z of zs) points.push(new THREE.Vector3(x, y, z).project(camera));
  const screen = points.map(point => ({ x: (point.x + 1) * .5 * width, y: (1 - point.y) * .5 * height }));
  return { left: Math.min(...screen.map(point => point.x)), top: Math.min(...screen.map(point => point.y)), right: Math.max(...screen.map(point => point.x)), bottom: Math.max(...screen.map(point => point.y)) };
}

function InteractionPlane() {
  const design = useEditor(state => state.design);
  const activeTool = useEditor(state => state.activeTool);
  const beginDrag = useEditor(state => state.beginSelectionDrag);
  const updateDrag = useEditor(state => state.updateSelectionDrag);
  const endDrag = useEditor(state => state.endSelectionDrag);
  const selectMany = useEditor(state => state.selectMany);
  const clear = useEditor(state => state.clearSelection);
  const zoomWindow=useEditor(state=>state.zoomWindow);
  const { camera, size } = useThree();
  const moved = useRef(false);
  const start = useRef<ScreenPoint | null>(null);
  const modifiers = useRef({ shift: false, ctrl: false, meta: false });
  const toScreen = (event: ThreeEvent<PointerEvent>): ScreenPoint => ({ x: (event.pointer.x + 1) * .5 * size.width, y: (1 - event.pointer.y) * .5 * size.height });
  return <mesh
    position={[0, 0, 0]}
    rotation={[-Math.PI / 2, 0, 0]}
    onPointerDown={event => {
      if (event.nativeEvent.button !== 0) return;
      if (activeTool === 'SELECT' || activeTool === 'ZOOM_WINDOW') {
        event.stopPropagation();
        const point = toScreen(event);
        start.current = point; moved.current = false;
        modifiers.current = { shift: event.nativeEvent.shiftKey, ctrl: event.nativeEvent.ctrlKey, meta: event.nativeEvent.metaKey };
        beginDrag(point);
        captureCanvasPointer(event);
      } else { captureCanvasPointer(event); editorInput.pointerDown(pointInput(event)); }
    }}
    onPointerMove={event => {
      if ((event.nativeEvent.buttons & 4) !== 0) return;
      if ((activeTool === 'SELECT' || activeTool === 'ZOOM_WINDOW') && start.current) {
        event.stopPropagation();
        const point = toScreen(event);
        if (Math.hypot(point.x - start.current.x, point.y - start.current.y) > 4) moved.current = true;
        updateDrag(point);
      } else editorInput.pointerMove(pointInput(event));
    }}
    onPointerUp={event => {
      if (event.nativeEvent.button !== 0) return;
      if ((activeTool === 'SELECT' || activeTool === 'ZOOM_WINDOW') && start.current) {
        event.stopPropagation();
        const end = toScreen(event);
        if(activeTool==='ZOOM_WINDOW'){
          if(moved.current){
            const width=Math.abs(end.x-start.current.x),height=Math.abs(end.y-start.current.y);
            const fraction=Math.max(width/Math.max(size.width,1),height/Math.max(size.height,1));
            const cx=(end.x+start.current.x)/2,cy=(end.y+start.current.y)/2;
            zoomWindow(fraction,{x:(cx-size.width/2)/Math.max(size.width,1),y:-(cy-size.height/2)/Math.max(size.height,1)});
          }
        } else if (!moved.current) {
          if (!modifiers.current.shift && !modifiers.current.ctrl && !modifiers.current.meta) clear();
        } else {
          const candidates = design.parts.filter(part => !part.hidden).map(part => ({ id: part.id, bounds: projectPartBounds(design, part, camera, size.width, size.height), selectable: !part.locked }));
          const ids = selectByScreenRectangle(candidates, start.current, end);
          selectMany(ids, modifiers.current.ctrl || modifiers.current.meta ? 'TOGGLE' : modifiers.current.shift ? 'ADD' : 'REPLACE');
        }
        start.current = null; endDrag(); releaseCanvasPointer(event);
      } else { editorInput.pointerUp(pointInput(event)); releaseCanvasPointer(event); }
    }}
  >
    <planeGeometry args={[Math.max(design.room.widthMm, 10000) * 2, Math.max(design.room.depthMm, 10000) * 2]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>;
}

function partBelongsToModule(design:DesignDocument,partId:Id):boolean {
  let parent=getParentAssemblyId(design,partId);
  const visited=new Set<Id>();
  while(parent&&!visited.has(parent)){
    if(design.moduleInstances.some(instance=>instance.rootAssemblyId===parent&&!instance.detached))return true;
    visited.add(parent);parent=getParentAssemblyId(design,parent);
  }
  return false;
}

function SectionPlaneVisual({section,draft=false}:{section:SectionPlane;draft?:boolean}) {
  const room=useEditor(state=>state.design.room);
  const descriptor=sectionClippingDescriptor(section);
  const openContextMenu=useEditor(state=>state.setContextMenu);
  const selectSection=useEditor(state=>state.selectSection);
  const sectionsPickable=useEditor(state=>state.selectionFilters.SECTIONS);
  const quaternion=useMemo(()=>new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(descriptor.normal.x,descriptor.normal.y,descriptor.normal.z).normalize()),[descriptor.normal.x,descriptor.normal.y,descriptor.normal.z]);
  const size=Math.max(room.widthMm,room.depthMm,room.heightMm)*1.18;
  return <group
    position={[descriptor.point.x,descriptor.point.y,descriptor.point.z]}
    quaternion={quaternion}
    renderOrder={8}
    onPointerDown={event=>{if(event.nativeEvent.button!==0||draft||!sectionsPickable)return;event.stopPropagation();selectSection(section.id);}}
    onContextMenu={event=>{
      if(draft||!sectionsPickable)return;
      event.stopPropagation(); event.nativeEvent.preventDefault();
      selectSection(section.id);
      openContextMenu({x:event.nativeEvent.clientX,y:event.nativeEvent.clientY,entityId:section.id});
    }}
  >
    <mesh><planeGeometry args={[size,size]}/><meshBasicMaterial color={draft?'#4E9B83':'#D9902D'} transparent opacity={draft ? .16 : .12} side={THREE.DoubleSide} depthWrite={false} depthTest={false}/></mesh>
    <Line points={[[-size/2,0,1],[size/2,0,1]]} color={draft?'#3C836D':'#B97520'} lineWidth={1.4} depthTest={false}/>
    <Line points={[[0,-size/2,1],[0,size/2,1]]} color={draft?'#3C836D':'#B97520'} lineWidth={1.4} depthTest={false}/>
  </group>;
}

function SceneContents() {
  const design = useEditor(state => state.design);
  const visibility=useEditor(state=>state.visibilityTags);
  const isolatedIds=useEditor(state=>state.isolatedIds);
  const workspaceHiddenIds=useEditor(state=>state.workspaceHiddenIds);
  const activeSectionId=useEditor(state=>state.activeSectionId);
  const selectedSectionId=useEditor(state=>state.selectedSectionId);
  const sectionDraft=useEditor(state=>state.sectionDraft);
  const presentationMode=useEditor(state=>state.presentationMode);
  const cleanMode=useEditor(state=>state.cleanMode);
  const activeTool=useEditor(state=>state.activeTool);
  const showSectionGizmo=useEditor(state=>state.sectionGizmosVisible && state.visibilityTags.SECTIONS && !state.cleanMode && !state.presentationMode);
  const activeSection=design.sectionPlanes.find(section=>section.id===activeSectionId);
  const descriptor=activeSection?sectionClippingDescriptor(activeSection):undefined;
  const plane=useMemo(()=>descriptor?new THREE.Plane(new THREE.Vector3(descriptor.normal.x,descriptor.normal.y,descriptor.normal.z),descriptor.planeConstant):undefined,[descriptor?.id,descriptor?.normal.x,descriptor?.normal.y,descriptor?.normal.z,descriptor?.planeConstant]);
  const partPlanes=plane&&(!descriptor?.scope||descriptor.scope==='ALL'||descriptor.scope==='PARTS')?[plane]:[];
  const roomPlanes=plane&&(!descriptor?.scope||descriptor.scope==='ALL'||descriptor.scope==='ROOM')?[plane]:[];
  const hardwarePlanes=plane&&(!descriptor?.scope||descriptor.scope==='ALL'||descriptor.scope==='HARDWARE')?[plane]:[];
  const kitchenPlanes=plane&&(!descriptor?.scope||descriptor.scope==='ALL')?[plane]:[];
  const isolatedPartIds=useMemo(()=>isolatedIds?resolveIsolationPartIds(design,isolatedIds):undefined,[design,isolatedIds]);
  const workspaceHiddenPartIds=useMemo(()=>{
    const direct=new Set<Id>();
    for(const id of workspaceHiddenIds){
      if(design.parts.some(part=>part.id===id))direct.add(id);
      else for(const partId of resolveIsolationPartIds(design,[id]))direct.add(partId);
    }
    return direct;
  },[design,workspaceHiddenIds]);
  const visibleParts=useMemo(()=>design.parts.filter(part=>{
    if(part.hidden)return false;
    if(workspaceHiddenPartIds.has(part.id))return false;
    if(isolatedPartIds&&!isolatedPartIds.has(part.id))return false;
    return partBelongsToModule(design,part.id)?visibility.MODULES:visibility.PARTS;
  }),[design,isolatedPartIds,workspaceHiddenPartIds,visibility.MODULES,visibility.PARTS]);
  const visiblePartIds=useMemo(()=>new Set(visibleParts.map(part=>part.id)),[visibleParts]);
  return <>
    <RoomGeometry clippingPlanes={roomPlanes}/>
    {!presentationMode&&activeTool!=='WALK'&&activeTool!=='LOOK'&&<InteractionPlane />}
    <group>{visibleParts.map((part, index) => <PartObject key={part.id} part={part} index={index} clippingPlanes={partPlanes}/>)}</group>
    <KitchenEntitiesOverlay clippingPlanes={kitchenPlanes}/><HardwareOverlay clippingPlanes={hardwarePlanes} visiblePartIds={isolatedPartIds?visiblePartIds:undefined}/><MachiningOverlay clippingPlanes={partPlanes} visiblePartIds={isolatedPartIds?visiblePartIds:undefined}/><ServiceOverlay />{!presentationMode&&!cleanMode&&<><InferenceLayer /><GuideLayer /><MeasureLayer /><RotateProtractor /><ProtractorLayer /><LocalAxesLayer /><TransformGhostLayer /><SnapGhost /></>}
    {showSectionGizmo&&selectedSectionId&&design.sectionPlanes.find(section=>section.id===selectedSectionId)&&<SectionPlaneVisual section={design.sectionPlanes.find(section=>section.id===selectedSectionId)!}/>} 
    {showSectionGizmo&&sectionDraft&&<SectionPlaneVisual section={sectionDraft} draft/>}
  </>;
}

function WalkLookControls(){
  const activeTool=useEditor(state=>state.activeTool);
  const design=useEditor(state=>state.design);
  const workspace=useEditor(state=>state.workspace);
  const sync=useEditor(state=>state.syncCameraFromViewport);
  const {gl,camera}=useThree();
  const keys=useRef({forward:0,strafe:0});
  const dragging=useRef(false);
  const local=useRef(useEditor.getState().camera);
  const wasActive=useRef(false);
  const collisionBoxes=useMemo(()=>[...design.parts.filter(part=>!part.hidden).map(part=>partWorldAabb(design,part)),...roomWallAabbs(design.room)],[design]);
  useEffect(()=>{
    const enabled=activeTool==='WALK'||activeTool==='LOOK';
    if(enabled){local.current=structuredClone(useEditor.getState().camera);wasActive.current=true;}
    else if(wasActive.current){wasActive.current=false;sync(local.current);keys.current={forward:0,strafe:0};}
  },[activeTool,sync]);
  useEffect(()=>{
    if(activeTool!=='WALK'&&activeTool!=='LOOK')return;
    const element=gl.domElement;
    const down=(event:PointerEvent)=>{if(event.button===0){dragging.current=true;element.setPointerCapture?.(event.pointerId);}};
    const up=(event:PointerEvent)=>{dragging.current=false;try{element.releasePointerCapture?.(event.pointerId);}catch{/* El puntero ya fue liberado. */}};
    const move=(event:PointerEvent)=>{if(!dragging.current)return;local.current=lookAroundCamera(local.current,-event.movementX*.0025,-event.movementY*.0025);};
    const keydown=(event:KeyboardEvent)=>{if(activeTool!=='WALK')return;const key=event.key.toLowerCase();if(key==='w'||key==='arrowup')keys.current.forward=1;if(key==='s'||key==='arrowdown')keys.current.forward=-1;if(key==='a'||key==='arrowleft')keys.current.strafe=-1;if(key==='d'||key==='arrowright')keys.current.strafe=1;};
    const keyup=(event:KeyboardEvent)=>{const key=event.key.toLowerCase();if((key==='w'||key==='arrowup')&&keys.current.forward>0)keys.current.forward=0;if((key==='s'||key==='arrowdown')&&keys.current.forward<0)keys.current.forward=0;if((key==='a'||key==='arrowleft')&&keys.current.strafe<0)keys.current.strafe=0;if((key==='d'||key==='arrowright')&&keys.current.strafe>0)keys.current.strafe=0;};
    element.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up,true);element.addEventListener('pointermove',move,true);window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);
    return()=>{element.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);element.removeEventListener('pointermove',move,true);window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);};
  },[activeTool,gl]);
  useFrame((_,delta)=>{
    if(activeTool!=='WALK'&&activeTool!=='LOOK')return;
    if(activeTool==='WALK')local.current=walkCamera(local.current,keys.current,Math.min(delta,.05),{eyeHeightMm:workspace.eyeHeightMm,walkSpeed:workspace.walkSpeed,collision:workspace.walkCollision,radiusMm:180},workspace.walkCollision?collisionBoxes:[]);
    const state=local.current;
    camera.position.set(state.position.x,state.position.y,state.position.z);camera.up.set(state.up.x,state.up.y,state.up.z);camera.lookAt(state.target.x,state.target.y,state.target.z);
  });
  return null;
}

function NavigationControls() {
  const cameraState = useEditor(state => state.camera);
  const transition = useEditor(state=>state.cameraTransition);
  const sync = useEditor(state => state.syncCameraFromViewport);
  const finishTransition=useEditor(state=>state.finishCameraTransition);
  const cancelTransition=useEditor(state=>state.cancelCameraTransition);
  const presentationMode=useEditor(state=>state.presentationMode);
  const allowNavigation=useEditor(state=>state.presentationAllowNavigation);
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const { gl, camera } = useThree();
  const activeTool = useEditor(state => state.activeTool);
  useEffect(() => {
    const element = gl.domElement;
    const down = (event: PointerEvent) => {
      if (!controls.current || event.button !== 1) return;
      controls.current.mouseButtons.MIDDLE = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      element.style.cursor = 'grabbing';
    };
    const up = () => { if (controls.current) controls.current.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE; element.style.cursor = ''; };
    element.addEventListener('pointerdown', down, true);
    element.addEventListener('pointerup', up, true);
    return () => { element.removeEventListener('pointerdown', down, true); element.removeEventListener('pointerup', up, true); };
  }, [gl, activeTool]);
  useFrame(()=>{
    if(!transition||!controls.current)return;
    const raw=Math.min(1,Math.max(0,(Date.now()-transition.startedAt)/transition.durationMs));
    const t=raw<.5?4*raw*raw*raw:1-Math.pow(-2*raw+2,3)/2;
    const lerp=(a:number,b:number)=>a+(b-a)*t;
    camera.position.set(lerp(transition.from.position.x,transition.to.position.x),lerp(transition.from.position.y,transition.to.position.y),lerp(transition.from.position.z,transition.to.position.z));
    camera.up.set(lerp(transition.from.up.x,transition.to.up.x),lerp(transition.from.up.y,transition.to.up.y),lerp(transition.from.up.z,transition.to.up.z)).normalize();
    controls.current.target.set(lerp(transition.from.target.x,transition.to.target.x),lerp(transition.from.target.y,transition.to.target.y),lerp(transition.from.target.z,transition.to.target.z));
    if(camera instanceof THREE.PerspectiveCamera){camera.fov=lerp(transition.from.fov,transition.to.fov);camera.updateProjectionMatrix();}
    if(camera instanceof THREE.OrthographicCamera){const scale=lerp(transition.from.orthoScale,transition.to.orthoScale);camera.left=-scale/2;camera.right=scale/2;camera.top=scale/2;camera.bottom=-scale/2;camera.updateProjectionMatrix();}
    controls.current.update();
    if(raw>=1)finishTransition();
  });
  return <OrbitControls
    ref={controls}
    makeDefault
    target={[cameraState.target.x, cameraState.target.y, cameraState.target.z]}
    enableDamping
    dampingFactor={.1}
    zoomToCursor
    screenSpacePanning
    enabled={(activeTool!=='WALK'&&activeTool!=='LOOK')&&(!presentationMode||allowNavigation)}
    mouseButtons={{ LEFT: null as never, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null as never }}
    onStart={()=>{
      if(!transition)return;
      const target=controls.current?.target as THREE.Vector3|undefined;
      cancelTransition({position:{x:camera.position.x,y:camera.position.y,z:camera.position.z},target:target?{x:target.x,y:target.y,z:target.z}:cameraState.target,up:{x:camera.up.x,y:camera.up.y,z:camera.up.z},fov:camera instanceof THREE.PerspectiveCamera?camera.fov:cameraState.fov,orthoScale:camera instanceof THREE.OrthographicCamera?Math.abs(camera.right-camera.left):cameraState.orthoScale});
    }}
    onEnd={() => {
      const target = controls.current?.target as THREE.Vector3 | undefined;
      sync({
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: target ? { x: target.x, y: target.y, z: target.z } : cameraState.target,
        up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
        fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : cameraState.fov,
        orthoScale: camera instanceof THREE.OrthographicCamera ? Math.abs(camera.right - camera.left) : cameraState.orthoScale
      });
    }}
  />;
}

function RendererVisualSettings({ exposure }: { exposure: number }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.localClippingEnabled = true;
  }, [gl, exposure]);
  return null;
}


type ViewportCapture = (scale:1|2)=>Promise<Blob>;
let viewportCapture:ViewportCapture|undefined;

export async function exportViewportPng(scale:1|2=1):Promise<void> {
  if(!viewportCapture)throw new Error('Área de diseño no disponible');
  const blob=await viewportCapture(scale);
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`simbo-viewport-${scale}x.png`;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}

function ViewportCaptureBridge(){
  const {gl,scene,camera,size}=useThree();
  useEffect(()=>{
    viewportCapture=async(scale)=>{
      const oldRatio=gl.getPixelRatio();
      const maxDimension=Math.max(size.width,size.height,1);
      const effectiveScale=scale===2?Math.max(1,Math.min(2,4096/maxDimension)):1;
      try{
        gl.setPixelRatio(effectiveScale);gl.setSize(size.width,size.height,false);gl.render(scene,camera);
        const blob=await new Promise<Blob>((resolve,reject)=>gl.domElement.toBlob(value=>value?resolve(value):reject(new Error('No se pudo capturar PNG')),'image/png'));
        return blob;
      }finally{
        gl.setPixelRatio(oldRatio);gl.setSize(size.width,size.height,false);gl.render(scene,camera);
      }
    };
    return()=>{viewportCapture=undefined;};
  },[gl,scene,camera,size.width,size.height]);
  return null;
}

function Cameras() {
  const camera = useEditor(state => state.camera);
  return <>
    {camera.projection === 'PERSPECTIVE'
      ? <PerspectiveCamera makeDefault position={[camera.position.x, camera.position.y, camera.position.z]} up={[camera.up.x, camera.up.y, camera.up.z]} fov={camera.fov} near={1} far={50000} />
      : <OrthographicCamera makeDefault position={[camera.position.x, camera.position.y, camera.position.z]} up={[camera.up.x, camera.up.y, camera.up.z]} zoom={1} left={-camera.orthoScale / 2} right={camera.orthoScale / 2} top={camera.orthoScale / 2} bottom={-camera.orthoScale / 2} near={-50000} far={50000} />}
    <NavigationControls />
    <WalkLookControls />
  </>;
}

function SelectionMarquee() {
  const drag = useEditor(state => state.selectionDrag);
  if (!drag) return null;
  const left = Math.min(drag.start.x, drag.end.x), top = Math.min(drag.start.y, drag.end.y);
  const width = Math.abs(drag.end.x - drag.start.x), height = Math.abs(drag.end.y - drag.start.y);
  if (width < 3 && height < 3) return null;
  return <div className={`selection-marquee ${drag.mode.toLowerCase()}`} style={{ left, top, width, height }} />;
}

export default function Viewport() {
  const mode = useEditor(state => state.displayMode);
  const activeTool = useEditor(state => state.activeTool);
  const partCount = useEditor(state => state.design.parts.length);
  const qualityPreset = useEditor(state => state.workspace.qualityPreset);
  const config = DISPLAY_MODE_CONFIG[mode];
  const quality = QUALITY_PRESETS[qualityPreset];
  const shadows = quality.shadows && config.shadows !== 'OFF';
  const shadowMapSize = config.shadows === 'LOW' ? 1024 : quality.shadowMapSize;
  return <div className={`viewport-canvas-wrap cursor-${activeTool.toLowerCase()}`}>
    <Canvas
      shadows={shadows}
      dpr={quality.dpr}
      gl={{ antialias: true, localClippingEnabled: true, powerPreference: 'high-performance', preserveDrawingBuffer:true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = config.exposure;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.localClippingEnabled = true;
      }}
    >
      <color attach="background" args={[config.background]} />
      <RendererVisualSettings exposure={config.exposure} />
      <ViewportCaptureBridge />
      <hemisphereLight intensity={config.environmentIntensity} color="#F8FAFB" groundColor="#9A968F" />
      <directionalLight
        position={[3000, 5200, 2400]}
        intensity={mode === 'PRESENTATION' ? 1.5 : 1.15}
        castShadow={shadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-near={200}
        shadow-camera-far={14000}
        shadow-bias={-0.00015}
        shadow-normalBias={.025}
      />
      <directionalLight position={[-2600, 2800, 1800]} intensity={mode === 'PRESENTATION' ? .5 : .38} />
      <directionalLight position={[900, 2200, -3400]} intensity={mode === 'PRESENTATION' ? .34 : .22} />
      <Cameras />
      <SceneContents />
      {config.contactShadows && quality.contactShadow && <ContactShadows position={[0, 2, 0]} opacity={.2} scale={8000} blur={2.8} far={2200} frames={qualityPreset === 'QUALITY' ? Infinity : 1} />}
    </Canvas>
    {partCount === 0 && <div className="viewport-empty-state"><b>Espacio listo para diseñar</b><span>Agrega un panel o selecciona un módulo de la biblioteca.</span></div>}
    <SelectionMarquee />
  </div>;
}
