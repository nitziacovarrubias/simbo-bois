import type { MaterialDefinition } from '@simbo/design-domain';

/** Stored with the material so revisions and the saved design reproduce the same finish. */
export const MAX_TEXTURE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXTURE_DATA_CHARS = 900_000;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;

export function materialTextureSrc(material?: MaterialDefinition): string | undefined {
  const value = material?.metadata?.textureDataUrl;
  return typeof value === 'string' &&
    value.length <= MAX_TEXTURE_DATA_CHARS &&
    DATA_IMAGE.test(value)
    ? value
    : undefined;
}

export async function prepareTexture(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Selecciona una imagen PNG, JPG o WebP.');
  }
  if (file.size > MAX_TEXTURE_FILE_BYTES) throw new Error('La imagen debe pesar menos de 5 MB.');
  if (file.size === 0) throw new Error('La imagen está vacía.');

  const url = URL.createObjectURL(file);
  let image: HTMLImageElement | undefined;
  try {
    image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const result = new Image();
      result.onload = () => resolve(result);
      result.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
      result.src = url;
    });
    const maxSide = 1024;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo procesar la textura en este navegador.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Some browsers cannot encode WebP; use JPEG as a compatible fallback.
    for (const mime of ['image/webp', 'image/jpeg'] as const) {
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const data = canvas.toDataURL(mime, quality);
        if (data.startsWith(`data:${mime};`) && data.length <= MAX_TEXTURE_DATA_CHARS) return data;
      }
    }
    throw new Error('La textura sigue siendo demasiado grande; utiliza una imagen más sencilla.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
