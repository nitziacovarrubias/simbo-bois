import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { MaterialDefinition } from '@simbo/design-domain';
import { materialTextureSrc } from '../materialTextures';

interface Props {
  material?: MaterialDefinition;
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  wireframe?: boolean;
  clippingPlanes?: THREE.Plane[];
  depthWrite?: boolean;
}
/** A material owns its optional image; the loader belongs to the scene and is disposed on change. */
export default function MaterialSurface({ material, color, roughness, metalness, ...rest }: Props) {
  const src = materialTextureSrc(material);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let active = true;
    setTexture(null);
    if (!src) return;
    let loaded: THREE.Texture | undefined;
    new THREE.TextureLoader().load(src, result => {
      if (!active) { result.dispose(); return; }
      loaded = result;
      result.colorSpace = THREE.SRGBColorSpace;
      result.anisotropy = 4;
      setTexture(result);
    }, undefined, () => { if (active) setTexture(null); });
    return () => { active = false; loaded?.dispose(); };
  }, [src]);
  return <meshStandardMaterial
    {...rest}
    color={texture ? '#FFFFFF' : color}
    map={texture}
    roughness={roughness ?? material?.roughness ?? .72}
    metalness={metalness ?? material?.metalness ?? 0}
  />;
}
