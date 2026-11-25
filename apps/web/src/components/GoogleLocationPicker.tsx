import { useEffect, useRef, useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';

const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
type GooglePlace = {
  id?: string;
  formattedAddress?: string;
  fetchFields: (args: { fields: string[] }) => Promise<void>;
};
type PlaceChoice = { placePrediction: { toPlace: () => GooglePlace } };
type AutocompleteNode = HTMLElement & { placeholder: string; includedRegionCodes?: string[] };
type MapsGlobal = Window & {
  google?: {
    maps: {
      importLibrary: (
        name: string,
      ) => Promise<{ PlaceAutocompleteElement: new () => AutocompleteNode }>;
    };
  };
};
let mapsPromise: Promise<void> | undefined;
function loadMaps(): Promise<void> {
  if (!key) return Promise.reject(new Error('Google Maps no está configurado'));
  if ((window as MapsGlobal).google?.maps.importLibrary) return Promise.resolve();
  if (!mapsPromise)
    mapsPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=places&language=es&region=MX`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No fue posible conectar con Google Maps'));
      document.head.appendChild(script);
    });
  return mapsPromise;
}

export default function GoogleLocationPicker({
  address,
  placeId,
  onChange,
}: {
  address: string;
  placeId: string;
  onChange: (address: string, placeId: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    let element: AutocompleteNode | undefined;
    void loadMaps()
      .then(async () => {
        const maps = (window as MapsGlobal).google?.maps;
        if (!alive || !maps) return;
        const { PlaceAutocompleteElement } = await maps.importLibrary('places');
        if (!alive || !host.current) return;
        element = new PlaceAutocompleteElement();
        element.placeholder = 'Buscar dirección en Google Maps';
        element.includedRegionCodes = ['mx'];
        element.addEventListener('gmp-select', (event: Event) => {
          const choice = event as unknown as PlaceChoice;
          void (async () => {
            try {
              const place = choice.placePrediction.toPlace();
              await place.fetchFields({ fields: ['id', 'formattedAddress'] });
              if (alive && place.formattedAddress) onChange(place.formattedAddress, place.id || '');
            } catch {
              if (alive)
                setError('No se pudo recuperar esta ubicación. Puedes escribirla manualmente.');
            }
          })();
        });
        host.current.replaceChildren(element);
      })
      .catch(() => {
        if (alive) setError('Google Maps no está disponible. Puedes escribir la dirección.');
      });
    return () => {
      alive = false;
      element?.remove();
    };
    // El widget no debe reiniciarse cada vez que cambie la dirección.
  }, []);
  const query = placeId ? `place_id:${placeId}` : address;
  return (
    <div className="simbo-location-picker">
      <label htmlFor="simbo-client-address">Dirección del cliente</label>
      <input
        id="simbo-client-address"
        maxLength={240}
        value={address}
        onChange={(e) => onChange(e.target.value, '')}
        placeholder="Calle, colonia, ciudad"
      />
      {key && (
        <div
          className="simbo-place-autocomplete"
          ref={host}
          aria-label="Buscar ubicación en Google Maps"
        />
      )}
      {!key && (
        <p className="simbo-location-note">
          La búsqueda en el mapa requiere configurar Google Maps. Puedes guardar la dirección
          manualmente.
        </p>
      )}
      {error && (
        <p className="simbo-location-note" role="status">
          {error}
        </p>
      )}
      {key && address ? (
        <iframe
          title="Vista previa de ubicación en Google Maps"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}`}
        />
      ) : (
        <div className="simbo-map-placeholder">
          <MapPin size={25} />
          <span>{address || 'Selecciona una ubicación para mostrarla aquí.'}</span>
        </div>
      )}
      {address && (
        <a
          className="simbo-map-open"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} /> Ver en Google Maps
        </a>
      )}
    </div>
  );
}
