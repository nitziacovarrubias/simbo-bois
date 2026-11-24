import { UnprocessableEntityException } from '@nestjs/common';
import type { MaterialDefinition } from '@simbo/design-domain';

const MAX_TEXTURE_DATA_CHARS=900_000;
const DATA_IMAGE=/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
/** Reject uncontrolled binary payloads in JSON revisions and catalogue entries. */
export function assertMaterialTextures(materials:MaterialDefinition[]):void {
  for(const material of materials){
    const source=material.metadata?.textureDataUrl;
    if(source===undefined)continue;
    if(typeof source!=='string'||source.length>MAX_TEXTURE_DATA_CHARS||!DATA_IMAGE.test(source)){
      throw new UnprocessableEntityException(`La textura del material «${material.name}» no es válida`);
    }
  }
}
