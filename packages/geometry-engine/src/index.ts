import {
  getApplianceWorldTransform,
  getClearanceZoneWorldTransform,
  getCountertopWorldTransform,
  getPartWorldTransform,
  rotateVectorByEuler,
  type ApplianceInstance,
  type Countertop,
  type Cutout,
  type DesignDocument,
  type Euler3,
  type Part,
  type Room,
  type RoomOpening,
  type Transform,
  type Vec3
} from '../../design-domain/src/index.ts';

export interface GeometryDescriptor {
  entityId: string;
  kind: 'BOX' | 'POLYGON_PRISM';
  dimensionsMm: { x: number; y: number; z: number };
  polygon?: Array<{ x: number; y: number }>;
  transform: Transform;
  materialId?: string;
  semanticRole: string;
}

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a: Vec3, scalar: number): Vec3 => ({ x: a.x * scalar, y: a.y * scalar, z: a.z * scalar });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (v: Vec3): number => Math.sqrt(dot(v, v));
export const normalize = (v: Vec3): Vec3 => {
  const l = length(v) || 1;
  return mul(v, 1 / l);
};
export const rotateVector = (v: Vec3, e: Euler3): Vec3 => rotateVectorByEuler(v, e);

export function partDescriptor(part: Part, transform: Transform = part.transform): GeometryDescriptor {
  return {
    entityId: part.id,
    kind: part.shape === 'POLYGON_PANEL' ? 'POLYGON_PRISM' : 'BOX',
    dimensionsMm: {
      x: part.dimensions.widthMm,
      y: part.dimensions.heightMm,
      z: part.dimensions.thicknessMm
    },
    polygon: part.dimensions.polygon?.map(point => ({ x: point.xMm, y: point.yMm })),
    transform: structuredClone(transform),
    materialId: part.materialId,
    semanticRole: part.semanticRole
  };
}

export function designGeometry(design: DesignDocument): GeometryDescriptor[] {
  return design.parts
    .filter(part => !part.hidden)
    .map(part => partDescriptor(part, getPartWorldTransform(design, part.id)));
}

export function partCorners(part: Part, transform: Transform = part.transform): Vec3[] {
  const hx = part.dimensions.widthMm / 2;
  const hy = part.dimensions.heightMm / 2;
  const hz = part.dimensions.thicknessMm / 2;
  const corners: Vec3[] = [];
  for (const x of [-hx, hx]) {
    for (const y of [-hy, hy]) {
      for (const z of [-hz, hz]) {
        corners.push(add(transform.position, rotateVector({ x, y, z }, transform.rotation)));
      }
    }
  }
  return corners;
}

export function partWorldCorners(design: DesignDocument, part: Part): Vec3[] {
  return partCorners(part, getPartWorldTransform(design, part.id));
}

export function partAabbAtTransform(part: Part, transform: Transform): Aabb {
  const corners = partCorners(part, transform);
  return {
    min: {
      x: Math.min(...corners.map(corner => corner.x)),
      y: Math.min(...corners.map(corner => corner.y)),
      z: Math.min(...corners.map(corner => corner.z))
    },
    max: {
      x: Math.max(...corners.map(corner => corner.x)),
      y: Math.max(...corners.map(corner => corner.y)),
      z: Math.max(...corners.map(corner => corner.z))
    }
  };
}

/** AABB in the Part's parent coordinate system. Part.transform remains local-to-parent. */
export function partLocalAabb(part: Part): Aabb {
  return partAabbAtTransform(part, part.transform);
}

/** AABB in Design world coordinates, including Assembly and ModuleInstance transforms. */
export function partWorldAabb(design: DesignDocument, part: Part): Aabb {
  return partAabbAtTransform(part, getPartWorldTransform(design, part.id));
}

export function boxAabbAtTransform(dimensions:{x:number;y:number;z:number},transform:Transform):Aabb {
  const hx=dimensions.x/2,hy=dimensions.y/2,hz=dimensions.z/2;
  const corners:Vec3[]=[];
  for(const x of [-hx,hx])for(const y of [-hy,hy])for(const z of [-hz,hz])corners.push(add(transform.position,rotateVector({x,y,z},transform.rotation)));
  return {min:{x:Math.min(...corners.map(v=>v.x)),y:Math.min(...corners.map(v=>v.y)),z:Math.min(...corners.map(v=>v.z))},max:{x:Math.max(...corners.map(v=>v.x)),y:Math.max(...corners.map(v=>v.y)),z:Math.max(...corners.map(v=>v.z))}};
}

export function applianceDimensions(design:DesignDocument,instance:ApplianceInstance):{widthMm:number;heightMm:number;depthMm:number}{
  const definition=design.applianceDefinitions.find(value=>value.id===instance.definitionId);
  if(!definition)throw new Error(`ApplianceDefinition no encontrada: ${instance.definitionId}`);
  return {...definition.dimensions,...(instance.dimensionsOverride??{})};
}
export function applianceWorldAabb(design:DesignDocument,instance:ApplianceInstance):Aabb{const d=applianceDimensions(design,instance);return boxAabbAtTransform({x:d.widthMm,y:d.heightMm,z:d.depthMm},getApplianceWorldTransform(design,instance.id));}

export function countertopPlanBounds(countertop:Countertop):{widthMm:number;depthMm:number}{
  if(countertop.outline.type==='RECTANGULAR')return {widthMm:countertop.outline.widthMm,depthMm:countertop.outline.depthMm};
  if(countertop.outline.type==='L_SHAPE')return {widthMm:countertop.outline.widthMm,depthMm:countertop.outline.depthMm+countertop.outline.returnDepthMm};
  const xs=countertop.outline.points.map(v=>v.xMm),ys=countertop.outline.points.map(v=>v.yMm);
  return {widthMm:xs.length?Math.max(...xs)-Math.min(...xs):0,depthMm:ys.length?Math.max(...ys)-Math.min(...ys):0};
}
export function countertopWorldAabb(design:DesignDocument,countertop:Countertop):Aabb{
  const base=getCountertopWorldTransform(design,countertop.id),bounds=countertopPlanBounds(countertop);
  const localCenter={x:0,y:countertop.heightMm+countertop.thicknessMm/2,z:0};
  const center=add(base.position,rotateVector(localCenter,base.rotation));
  return boxAabbAtTransform({x:bounds.widthMm,y:countertop.thicknessMm,z:bounds.depthMm},{position:center,rotation:base.rotation});
}
export function clearanceZoneWorldAabb(design:DesignDocument,zoneOrId:string|DesignDocument['clearanceZones'][number]):Aabb{const zone=typeof zoneOrId==='string'?design.clearanceZones.find(v=>v.id===zoneOrId):zoneOrId;if(!zone)throw new Error(`ClearanceZone no encontrada: ${String(zoneOrId)}`);return boxAabbAtTransform({x:zone.dimensions.widthMm,y:zone.dimensions.heightMm,z:zone.dimensions.depthMm},getClearanceZoneWorldTransform(design,zone.id));}
export function cutoutWorldCenter(design:DesignDocument,cutoutId:string):Vec3{const cutout=design.cutouts.find(v=>v.id===cutoutId);if(!cutout)throw new Error(`Cutout no encontrado: ${cutoutId}`);const countertop=design.countertops.find(v=>v.id===cutout.countertopId);if(!countertop)throw new Error(`Countertop no encontrado: ${cutout.countertopId}`);const t=getCountertopWorldTransform(design,countertop.id);return add(t.position,rotateVector({x:cutout.position2D.xMm,y:countertop.heightMm+countertop.thicknessMm,z:cutout.position2D.yMm},t.rotation));}
export function isCutoutInsideCountertop(countertop:Countertop,cutout:Cutout):boolean{
  if(countertop.outline.type==='RECTANGULAR'){const hw=countertop.outline.widthMm/2,hd=countertop.outline.depthMm/2;const c=Math.abs(Math.cos(cutout.rotation)),s=Math.abs(Math.sin(cutout.rotation));const ex=(cutout.widthMm*c+cutout.depthMm*s)/2,ey=(cutout.widthMm*s+cutout.depthMm*c)/2;return Math.abs(cutout.position2D.xMm)+ex<=hw+1e-6&&Math.abs(cutout.position2D.yMm)+ey<=hd+1e-6;}
  const bounds=countertopPlanBounds(countertop);return Math.abs(cutout.position2D.xMm)+cutout.widthMm/2<=bounds.widthMm/2+1e-6&&Math.abs(cutout.position2D.yMm)+cutout.depthMm/2<=bounds.depthMm/2+1e-6;
}
export function applianceDescriptor(design:DesignDocument,instance:ApplianceInstance):GeometryDescriptor{const d=applianceDimensions(design,instance);return {entityId:instance.id,kind:'BOX',dimensionsMm:{x:d.widthMm,y:d.heightMm,z:d.depthMm},transform:getApplianceWorldTransform(design,instance.id),semanticRole:'APPLIANCE'};}
export function countertopDescriptor(design:DesignDocument,countertop:Countertop):GeometryDescriptor{const b=countertopPlanBounds(countertop),base=getCountertopWorldTransform(design,countertop.id),center=add(base.position,rotateVector({x:0,y:countertop.heightMm+countertop.thicknessMm/2,z:0},base.rotation));return {entityId:countertop.id,kind:'BOX',dimensionsMm:{x:b.widthMm,y:countertop.thicknessMm,z:b.depthMm},transform:{position:center,rotation:base.rotation},materialId:countertop.materialDefinitionId,semanticRole:'COUNTERTOP'};}

/**
 * Devuelve true cuando los AABB se cruzan o están separados como máximo por toleranceMm.
 * Una tolerancia positiva permite tratar huecos muy pequeños como contacto en validaciones CAD.
 * Tolerancias negativas o no finitas no son válidas.
 */
export function intersectsAabb(a: Aabb, b: Aabb, toleranceMm = 0): boolean {
  if (!Number.isFinite(toleranceMm) || toleranceMm < 0) {
    throw new Error('toleranceMm debe ser un número finito >= 0');
  }
  return !(
    a.max.x + toleranceMm < b.min.x || a.min.x - toleranceMm > b.max.x ||
    a.max.y + toleranceMm < b.min.y || a.min.y - toleranceMm > b.max.y ||
    a.max.z + toleranceMm < b.min.z || a.min.z - toleranceMm > b.max.z
  );
}

export function centerOfAabb(a: Aabb): Vec3 {
  return {
    x: (a.min.x + a.max.x) / 2,
    y: (a.min.y + a.max.y) / 2,
    z: (a.min.z + a.max.z) / 2
  };
}


export type RoomWall = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
export interface WallSegmentDescriptor {
  id: string;
  wall: RoomWall;
  position: Vec3;
  dimensionsMm: { x: number; y: number; z: number };
  /** Horizontal interval measured from the same wall origin used by RoomOpening.offsetMm. */
  uStartMm: number;
  uEndMm: number;
  vStartMm: number;
  vEndMm: number;
}

interface Rect2 { u0:number; u1:number; v0:number; v1:number; }

function validOpeningRect(opening: RoomOpening, wallLengthMm: number, wallHeightMm: number): Rect2 | undefined {
  const u0 = Math.max(0, Math.min(wallLengthMm, opening.offsetMm));
  const u1 = Math.max(0, Math.min(wallLengthMm, opening.offsetMm + opening.widthMm));
  const sill = opening.type === 'DOOR' ? 0 : (opening.sillHeightMm ?? 0);
  const v0 = Math.max(0, Math.min(wallHeightMm, sill));
  const v1 = Math.max(0, Math.min(wallHeightMm, sill + opening.heightMm));
  if (![u0,u1,v0,v1].every(Number.isFinite) || u1 <= u0 || v1 <= v0) return undefined;
  return {u0,u1,v0,v1};
}

/** Subtracts one opening rectangle from one solid wall rectangle without CSG. */
export function subtractWallOpening(rect: Rect2, opening: Rect2): Rect2[] {
  const iu0 = Math.max(rect.u0, opening.u0), iu1 = Math.min(rect.u1, opening.u1);
  const iv0 = Math.max(rect.v0, opening.v0), iv1 = Math.min(rect.v1, opening.v1);
  if (iu1 <= iu0 || iv1 <= iv0) return [rect];
  const result: Rect2[] = [];
  if (rect.u0 < iu0) result.push({u0:rect.u0,u1:iu0,v0:rect.v0,v1:rect.v1});
  if (iu1 < rect.u1) result.push({u0:iu1,u1:rect.u1,v0:rect.v0,v1:rect.v1});
  if (rect.v0 < iv0) result.push({u0:iu0,u1:iu1,v0:rect.v0,v1:iv0});
  if (iv1 < rect.v1) result.push({u0:iu0,u1:iu1,v0:iv1,v1:rect.v1});
  return result.filter(piece => piece.u1-piece.u0 > 1e-6 && piece.v1-piece.v0 > 1e-6);
}

/**
 * Genera cajas de muro alrededor de las aberturas de Room. No persiste geometría Three.js ni usa CSG.
 * Las puertas generan piezas laterales/superior y las ventanas laterales/inferior/superior.
 */
export function roomWallSegments(room: Room, wall: RoomWall): WallSegmentDescriptor[] {
  const wallLength = wall === 'NORTH' || wall === 'SOUTH' ? room.widthMm : room.depthMm;
  let rectangles: Rect2[] = [{u0:0,u1:wallLength,v0:0,v1:room.heightMm}];
  const openings = room.openings.filter(opening => opening.wall === wall);
  for (const opening of openings) {
    const openingRect = validOpeningRect(opening, wallLength, room.heightMm);
    if (!openingRect) continue;
    rectangles = rectangles.flatMap(rect => subtractWallOpening(rect, openingRect));
  }
  return rectangles.map((rect,index) => {
    const uCenter = (rect.u0 + rect.u1) / 2;
    const y = (rect.v0 + rect.v1) / 2;
    const width = rect.u1 - rect.u0;
    const height = rect.v1 - rect.v0;
    if (wall === 'NORTH' || wall === 'SOUTH') return {
      id:`wall-${wall.toLowerCase()}-${index}`, wall,
      position:{x:-room.widthMm/2 + uCenter, y, z: wall === 'NORTH' ? -room.depthMm/2 : room.depthMm/2},
      dimensionsMm:{x:width,y:height,z:room.wallThicknessMm}, uStartMm:rect.u0,uEndMm:rect.u1,vStartMm:rect.v0,vEndMm:rect.v1
    };
    return {
      id:`wall-${wall.toLowerCase()}-${index}`, wall,
      position:{x:wall === 'WEST' ? -room.widthMm/2 : room.widthMm/2, y, z:-room.depthMm/2 + uCenter},
      dimensionsMm:{x:room.wallThicknessMm,y:height,z:width}, uStartMm:rect.u0,uEndMm:rect.u1,vStartMm:rect.v0,vEndMm:rect.v1
    };
  });
}

export function roomSegments(room: Room): WallSegmentDescriptor[] {
  return (['NORTH','SOUTH','EAST','WEST'] as const).flatMap(wall => roomWallSegments(room, wall));
}

export function roomAabb(room: Room): Aabb {
  const halfWall = room.wallThicknessMm / 2;
  return {
    min:{x:-room.widthMm/2-halfWall,y:0,z:-room.depthMm/2-halfWall},
    max:{x:room.widthMm/2+halfWall,y:room.heightMm,z:room.depthMm/2+halfWall}
  };
}

export function roomWallAabbs(room: Room): Aabb[] {
  return roomSegments(room).map(segment => ({
    min: {
      x: segment.position.x - segment.dimensionsMm.x / 2,
      y: segment.position.y - segment.dimensionsMm.y / 2,
      z: segment.position.z - segment.dimensionsMm.z / 2
    },
    max: {
      x: segment.position.x + segment.dimensionsMm.x / 2,
      y: segment.position.y + segment.dimensionsMm.y / 2,
      z: segment.position.z + segment.dimensionsMm.z / 2
    }
  }));
}
