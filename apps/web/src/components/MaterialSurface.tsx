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
  dimensionsMm?: { widthMm: number; heightMm: number; thicknessMm: number };
}
/** A material owns its optional image; the loader belongs to the scene and is disposed on change. */
export default function MaterialSurface({
  material,
  color,
  roughness,
  metalness,
  dimensionsMm,
  ...rest
}: Props) {
  const src = materialTextureSrc(material);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let active = true;
    setTexture(null);
    if (!src) return;
    let loaded: THREE.Texture | undefined;
    new THREE.TextureLoader().load(
      src,
      (result) => {
        if (!active) {
          result.dispose();
          return;
        }
        loaded = result;
        result.colorSpace = THREE.SRGBColorSpace;
        result.anisotropy = 4;
        // Apply a repeat in physical units instead of stretching one image over a large panel.
        // A Three.js box reuses UVs on all faces; the long faces receive the primary finish.
        if (dimensionsMm) {
          const scale = Math.max(
            100,
            Math.min(2000, Number(material?.metadata.textureScaleMm) || 600),
          );
          result.wrapS = THREE.RepeatWrapping;
          result.wrapT = THREE.RepeatWrapping;
          result.repeat.set(
            Math.max(1, dimensionsMm.widthMm / scale),
            Math.max(1, dimensionsMm.heightMm / scale),
          );
        }
        const angle = Number(material?.metadata.textureRotationDeg);
        if (Number.isFinite(angle) && angle !== 0) {
          result.center.set(0.5, 0.5);
          result.rotation = (angle * Math.PI) / 180;
        }
        result.needsUpdate = true;
        setTexture(result);
      },
      undefined,
      () => {
        if (active) setTexture(null);
      },
    );
    return () => {
      active = false;
      loaded?.dispose();
    };
  }, [
    src,
    dimensionsMm?.widthMm,
    dimensionsMm?.heightMm,
    material?.metadata.textureScaleMm,
    material?.metadata.textureRotationDeg,
  ]);
  return (
    <meshStandardMaterial
      {...rest}
      color={texture ? '#FFFFFF' : color}
      map={texture}
      roughness={roughness ?? material?.roughness ?? 0.72}
      metalness={metalness ?? material?.metalness ?? 0}
    />
  );
}
