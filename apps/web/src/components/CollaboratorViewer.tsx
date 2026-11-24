import MaterialSurface from './MaterialSurface';
import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowLeft, Box, Eye, Layers3, Rotate3D } from 'lucide-react';
import { getPartWorldTransform, normalizeHex, type DesignDocument } from '@simbo/design-domain';
import { applianceDescriptor, countertopDescriptor, roomSegments } from '@simbo/geometry-engine';
import type { DesignResponse, ProjectSummary, SessionUser } from '../apiClient';
import { PROJECT_TYPE_LABELS } from './NewProjectDialog';
import './CollaboratorViewer.css';

interface Props { project: ProjectSummary; response: DesignResponse; user:SessionUser; onBack: () => void; }

function DesignScene({ design }: { design: DesignDocument }) {
  const segments = useMemo(() => roomSegments(design.room), [design.room]);
  return <>
    <hemisphereLight intensity={1.3} color="#ffffff" groundColor="#a28a6d" />
    <directionalLight position={[3000, 6500, 4000]} intensity={1.9} castShadow shadow-mapSize={[1024, 1024]}/>
    <directionalLight position={[-3600, 2400, -1800]} intensity={0.5}/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[design.room.widthMm, design.room.depthMm]}/>
      <meshStandardMaterial color="#e9e4db" roughness={0.95} side={THREE.DoubleSide}/>
    </mesh>
    {segments.map(segment => <mesh key={segment.id} position={[segment.position.x,segment.position.y,segment.position.z]}>
      <boxGeometry args={[segment.dimensionsMm.x,segment.dimensionsMm.y,segment.dimensionsMm.z]}/>
      <meshStandardMaterial color="#e0d9cd" transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide}/>
    </mesh>)}
    {design.parts.filter(part => !part.hidden).map(part => {
      const transform = getPartWorldTransform(design, part.id);
      const material = design.materials.find(entry => entry.id === part.materialId);
      const customColor = typeof part.metadata.colorHex === 'string' ? part.metadata.colorHex : undefined;
      return <mesh key={part.id} position={[transform.position.x,transform.position.y,transform.position.z]}
        rotation={[transform.rotation.x,transform.rotation.y,transform.rotation.z]} castShadow receiveShadow>
        <boxGeometry args={[part.dimensions.widthMm,part.dimensions.heightMm,part.dimensions.thicknessMm]}/>
        <MaterialSurface material={material} color={normalizeHex(customColor ?? material?.colorHex ?? '#b58a63')}
          roughness={material?.roughness ?? 0.7} metalness={material?.metalness ?? 0}/>
        <Edges color="#624f3c" threshold={22} />
      </mesh>;
    })}
    {design.countertops.filter(top => !top.hidden).map(top => {
      const desc=countertopDescriptor(design,top);
      return <mesh key={top.id} position={[desc.transform.position.x,desc.transform.position.y,desc.transform.position.z]}
        rotation={[desc.transform.rotation.x,desc.transform.rotation.y,desc.transform.rotation.z]} castShadow receiveShadow>
        <boxGeometry args={[desc.dimensionsMm.x,desc.dimensionsMm.y,desc.dimensionsMm.z]}/>
        <meshStandardMaterial color={top.colorHex ?? '#d7d3cc'} roughness={top.roughness ?? 0.7} metalness={top.metalness ?? 0}/>
        <Edges color="#999087" threshold={22}/>
      </mesh>;
    })}
    {design.applianceInstances.filter(item => !item.hidden).map(instance => {
      const desc=applianceDescriptor(design,instance);
      const definition=design.applianceDefinitions.find(item=>item.id===instance.definitionId);
      return <mesh key={instance.id} position={[desc.transform.position.x,desc.transform.position.y,desc.transform.position.z]}
        rotation={[desc.transform.rotation.x,desc.transform.rotation.y,desc.transform.rotation.z]} castShadow receiveShadow>
        <boxGeometry args={[desc.dimensionsMm.x,desc.dimensionsMm.y,desc.dimensionsMm.z]}/>
        <meshStandardMaterial color={definition?.colorHex ?? '#aeb4b7'} roughness={0.55} metalness={0.2}/>
        <Edges color="#767d7e" threshold={22}/>
      </mesh>;
    })}
  </>;
}

export default function CollaboratorViewer({ project, response, user, onBack }: Props) {
  const [topView, setTopView] = useState(false);
  const { design, revision } = response;
  const room = design.room;
  const distance = Math.max(room.widthMm,room.depthMm,room.heightMm,1500);
  const camera = topView
    ? {position:[0,distance*2.1,0.01] as [number,number,number],up:[0,0,-1] as [number,number,number]}
    : {position:[distance*1.2,distance*0.9,distance*1.45] as [number,number,number],up:[0,1,0] as [number,number,number]};
  return <main className="simbo-readonly-page">
    <header className="simbo-readonly-header">
      <div className="simbo-readonly-brand"><Layers3 size={22}/><strong>SIMBO</strong></div>
      <div className="simbo-readonly-project"><strong>{project.name}</strong><span>{project.projectType ? PROJECT_TYPE_LABELS[project.projectType] : 'Proyecto'} · Revisión {revision}</span></div>
      <span className="simbo-readonly-badge" title={user.email}><Eye size={16}/> {user.name} · Colaborador · Solo lectura</span>
      <button type="button" className="simbo-readonly-back" onClick={onBack}><ArrowLeft size={16}/> Volver a proyectos</button>
    </header>
    <section className="simbo-readonly-content" aria-label="Consulta de diseño">
      <div className="simbo-readonly-toolbar">
        <div><h1>Vista del diseño</h1><p>Gira y acerca la cámara para revisar el mobiliario.</p></div>
        <div className="simbo-readonly-views" role="group" aria-label="Cambiar vista">
          <button type="button" onClick={()=>setTopView(false)} aria-pressed={!topView} className={!topView?'active':''}><Rotate3D size={17}/> 3D</button>
          <button type="button" onClick={()=>setTopView(true)} aria-pressed={topView} className={topView?'active':''}><Box size={17}/> Planta</button>
        </div>
      </div>
      <div className="simbo-readonly-canvas">
        <Canvas key={topView?'top':'3d'} shadows dpr={[1,1.75]}
          camera={{position:camera.position,up:camera.up,fov:45,near:1,far:distance*20}}
          gl={{antialias:true,powerPreference:'high-performance'}}
          onCreated={({gl})=>{gl.outputColorSpace=THREE.SRGBColorSpace;gl.toneMapping=THREE.ACESFilmicToneMapping;}}>
          <color attach="background" args={['#f2f0e9']}/>
          <DesignScene design={design}/>
          <OrbitControls target={[0,room.heightMm*0.42,0]} enablePan enableZoom enableRotate={!topView}
            maxDistance={distance*8} minDistance={Math.max(100,distance*0.12)}/>
        </Canvas>
        {design.parts.length===0 && <div className="simbo-readonly-empty">Este diseño todavía no tiene piezas.</div>}
      </div>
      <div className="simbo-readonly-summary">
        <span>{design.parts.filter(part=>!part.hidden).length} piezas visibles</span>
        <span>{design.moduleInstances.length} módulos</span>
        <span>Habitación: {room.widthMm} × {room.depthMm} × {room.heightMm} mm</span>
        {project.responsible && <span>Responsable: {project.responsible.name}</span>}
      </div>
    </section>
  </main>;
}
