import { useMemo } from 'react';
import { Box } from 'lucide-react';
import { createEmptyDesign, getPartWorldTransform, normalizeHex, type ModuleVersion } from '@simbo/design-domain';
import type { PreviewPart } from '../apiClient';
import './DesignThumbnail.css';

type Point3 = [number, number, number];
type Poly = { pts: string; fill: string; order: number; key: string };
const project = ([x,y,z]: Point3):[number,number] => [(x-z)*.72, (x+z)*.36 - y*.88];
const corners = (part:PreviewPart):Point3[] => {
  const {width:w,height:h,depth:d,x,y,z,rx,ry,rz}=part;
  const out:Point3[]=[];
  for (const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1]){
    let xx=a*w/2, yy=b*h/2, zz=c*d/2;
    // XYZ Euler (same intrinsic convention used by the editor's Three.js objects).
    const cy=Math.cos(ry),sy=Math.sin(ry),cx=Math.cos(rx),sx=Math.sin(rx),cz=Math.cos(rz),sz=Math.sin(rz);
    const x1=xx, y1=yy*cx-zz*sx,z1=yy*sx+zz*cx;
    const x2=x1*cy+z1*sy,y2=y1,z2=-x1*sy+z1*cy;
    xx=x2*cz-y2*sz;yy=x2*sz+y2*cz;zz=z2;
    out.push([x+xx,y+yy,z+zz]);
  }
  return out;
};
const clipColor = (value:string)=>/^#[0-9A-F]{6}$/i.test(value)?value:'#b58a63';
function face(color:string, factor:number){
  const hex=clipColor(color).slice(1);
  return '#'+[0,2,4].map(i=>Math.max(0,Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)*factor))).toString(16).padStart(2,'0')).join('');
}

export function modulePreviewParts(version: ModuleVersion): PreviewPart[] {
  const doc=createEmptyDesign('Vista previa');
  doc.rootAssemblyId=version.snapshot.rootAssemblyId;
  doc.parts=version.snapshot.parts;
  doc.assemblies=version.snapshot.assemblies;
  doc.materials=version.snapshot.materials;
  return doc.parts.slice(0,100).flatMap(part=>{
    try {
      const t=getPartWorldTransform(doc,part.id);
      const color=typeof part.metadata.colorHex==='string'?part.metadata.colorHex:doc.materials.find(m=>m.id===part.materialId)?.colorHex??'#b58a63';
      return [{x:t.position.x,y:t.position.y,z:t.position.z,rx:t.rotation.x,ry:t.rotation.y,rz:t.rotation.z,
        width:part.dimensions.widthMm,height:part.dimensions.heightMm,depth:part.dimensions.thicknessMm,color:normalizeHex(color)}];
    }catch{return [];}
  });
}

export default function DesignThumbnail({parts,label='Vista previa del diseño',empty='Sin piezas guardadas'}:{parts:PreviewPart[];label?:string;empty?:string}){
  const render=useMemo(()=>{
    const polygons:Poly[]=[];
    for(const [index,part] of parts.entries()){
      if (![part.x,part.y,part.z,part.width,part.height,part.depth].every(Number.isFinite))continue;
      const p=corners(part); const faceIndices=[
        {v:[2,3,7,6],shade:1.14}, // top
        {v:[1,3,7,5],shade:.9}, // near Z
        {v:[4,5,7,6],shade:.72} // near X
      ];
      for(const [side,f] of faceIndices.entries()){
        const projected=f.v.map(i=>project(p[i]!));
        const order=f.v.reduce((n,i)=>n+p[i]![0]+p[i]![2]-p[i]![1]*.22,0)/4;
        polygons.push({pts:projected.map(pt=>pt.map(n=>n.toFixed(2)).join(',')).join(' '),fill:face(part.color,f.shade),order,key:`${index}-${side}`});
      }
    }
    if(!polygons.length)return undefined;
    const coordinates=polygons.flatMap(p=>p.pts.split(' ').map(v=>v.split(',').map(Number) as [number,number]));
    const xx=coordinates.map(v=>v[0]),yy=coordinates.map(v=>v[1]);
    const minX=Math.min(...xx),maxX=Math.max(...xx),minY=Math.min(...yy),maxY=Math.max(...yy);
    const size=Math.max(maxX-minX,maxY-minY,1);
    const margin=size*.14;
    return {polygons:polygons.sort((a,b)=>a.order-b.order),viewBox:`${minX-margin} ${minY-margin} ${maxX-minX+2*margin} ${maxY-minY+2*margin}`};
  },[parts]);
  return <div className="simbo-thumbnail">
    {render?<svg viewBox={render.viewBox} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {render.polygons.map(face=><polygon key={face.key} points={face.pts} fill={face.fill} stroke="#554637" strokeOpacity=".35" strokeWidth="1.4" strokeLinejoin="round"/>)}
    </svg>:<div className="simbo-thumbnail-empty"><Box size={27} strokeWidth={1.3}/><span>{empty}</span></div>}
  </div>;
}
