import { useState, type ChangeEvent } from 'react';
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import type { MaterialDefinition } from '@simbo/design-domain';
import { materialTextureSrc, prepareTexture } from '../materialTextures';
import './MaterialTextureField.css';

interface Props {
  material: MaterialDefinition;
  onChange: (dataUrl?: string) => void;
}
export default function MaterialTextureField({ material, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const src = materialTextureSrc(material);
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await prepareTexture(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar la textura.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="material-texture-field">
      <div className="material-texture-heading">
        <span>Textura de imagen</span>
        {src && (
          <button
            type="button"
            className="material-texture-remove"
            onClick={() => onChange(undefined)}
            title="Quitar textura"
          >
            <Trash2 size={14} /> Quitar
          </button>
        )}
      </div>
      {src && (
        <img
          className="material-texture-preview"
          src={src}
          alt={`Textura de ${material.name}`}
          onError={() => setError('La imagen guardada no se pudo mostrar. Vuelve a cargarla.')}
        />
      )}
      <label className="material-texture-upload">
        {busy ? <LoaderCircle size={17} className="simbo-spin-icon" /> : <ImagePlus size={17} />}
        {busy ? 'Procesando imagen…' : src ? 'Cambiar textura' : 'Subir textura'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={upload}
          aria-label={`Subir textura para ${material.name}`}
        />
      </label>
      {error && (
        <small className="material-texture-error" role="alert">
          {error}
        </small>
      )}
      <small className="material-texture-caption">
        PNG, JPG o WebP · máximo 5 MB. Se optimiza al guardar.
      </small>
    </div>
  );
}
