import { UnprocessableEntityException } from '@nestjs/common';
import type { MaterialDefinition, Part } from '@simbo/design-domain';

const MAX_TEXTURE_DATA_CHARS = 900_000;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
/** Reject uncontrolled binary payloads in JSON revisions and catalogue entries. */
export function assertMaterialTextures(materials: MaterialDefinition[]): void {
  for (const material of materials) {
    const source = material.metadata?.textureDataUrl;
    if (source === undefined) continue;
    if (
      typeof source !== 'string' ||
      source.length > MAX_TEXTURE_DATA_CHARS ||
      !DATA_IMAGE.test(source)
    ) {
      throw new UnprocessableEntityException(
        `La textura del material «${material.name}» no es válida`,
      );
    }
  }
}

/** The per-piece finish lives in Part.metadata and must meet the same upload limits. */
export function assertPartAppearanceTextures(parts: Part[]): void {
  for (const part of parts) {
    const appearance = part.metadata?.appearanceOverride;
    if (appearance === undefined) continue;
    if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance))
      throw new UnprocessableEntityException(`La apariencia de «${part.name}» no es válida`);
    const source = (appearance as Record<string, unknown>).textureDataUrl;
    if (source === undefined || source === null) continue;
    if (
      typeof source !== 'string' ||
      source.length > MAX_TEXTURE_DATA_CHARS ||
      !DATA_IMAGE.test(source)
    )
      throw new UnprocessableEntityException(`La textura de «${part.name}» no es válida`);
  }
}
