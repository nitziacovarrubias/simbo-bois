import { useState, type FormEvent } from 'react';
import { UserRound, LoaderCircle } from 'lucide-react';
import type { ClientRecord, ClientInput } from '../apiClient';
import SharedDialog from './SharedDialog';
import GoogleLocationPicker from './GoogleLocationPicker';

export default function ClientDialog({
  initial,
  onClose,
  onSave,
}: {
  initial?: ClientRecord;
  onClose: () => void;
  onSave: (data: ClientInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [taxId, setTaxId] = useState(initial?.taxId || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [placeId, setPlaceId] = useState(initial?.placeId || '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        taxId: taxId.trim() || null,
        address: address.trim() || null,
        placeId: placeId || null,
        active,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SharedDialog
      title={initial ? 'Editar cliente' : 'Nuevo cliente'}
      description="Datos de contacto y ubicación"
      icon={<UserRound />}
      width="wide"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button className="simbo-dialog-button" onClick={onClose} type="button" disabled={busy}>
            Cancelar
          </button>
          <button
            className="simbo-dialog-button simbo-dialog-button--primary"
            type="submit"
            form="simbo-client-form"
            disabled={busy}
          >
            {busy ? <LoaderCircle className="simbo-spin-icon" /> : null}
            {busy ? 'Guardando…' : 'Guardar cliente'}
          </button>
        </>
      }
    >
      <form
        id="simbo-client-form"
        className="simbo-management-form"
        onSubmit={(e) => void submit(e)}
      >
        {error && (
          <p className="project-error" role="alert">
            {error}
          </p>
        )}
        <label>
          Nombre del cliente *
          <input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="simbo-form-grid">
          <label>
            Teléfono
            <input
              type="tel"
              maxLength={32}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label>
            Correo electrónico
            <input
              type="email"
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <label>
          RFC (opcional)
          <input maxLength={32} value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </label>
        <GoogleLocationPicker
          address={address}
          placeId={placeId}
          onChange={(value, id) => {
            setAddress(value);
            setPlaceId(id);
          }}
        />
        {initial && (
          <label className="simbo-inline-checkbox">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
            Cliente activo
          </label>
        )}
      </form>
    </SharedDialog>
  );
}
