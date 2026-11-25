import { useState, type FormEvent } from 'react';
import { UserPlus, LoaderCircle } from 'lucide-react';
import type { NewUserInput } from '../apiClient';
import SharedDialog from './SharedDialog';

export default function UserAccountDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: NewUserInput) => Promise<void>;
}) {
  const [name, setName] = useState(''),
    [username, setUsername] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [role, setRole] = useState<NewUserInput['role']>('ARCHITECT');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        password,
        role,
      });
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear la cuenta');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SharedDialog
      title="Nueva cuenta"
      description="Solo el Supervisor puede administrar accesos"
      icon={<UserPlus />}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="simbo-dialog-button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            form="simbo-create-account"
            type="submit"
            className="simbo-dialog-button simbo-dialog-button--primary"
            disabled={busy}
          >
            {busy ? <LoaderCircle className="simbo-spin-icon" /> : null}
            {busy ? 'Creando…' : 'Crear cuenta'}
          </button>
        </>
      }
    >
      <form
        id="simbo-create-account"
        className="simbo-management-form"
        onSubmit={(e) => void submit(e)}
        autoComplete="off"
      >
        {error && (
          <p className="project-error" role="alert">
            {error}
          </p>
        )}
        <label>
          Nombre completo *
          <input
            required
            maxLength={120}
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Usuario *
          <input
            required
            pattern="[a-z][a-z0-9._-]{2,39}"
            title="3 a 40 caracteres. Empieza con una letra y usa minúsculas, números, punto, guion o guion bajo."
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            autoComplete="off"
          />
        </label>
        <label>
          Correo electrónico *
          <input
            required
            type="email"
            maxLength={160}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Contraseña temporal *
          <input
            required
            type="password"
            minLength={12}
            maxLength={256}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <small>Mínimo 12 caracteres. Compártela de forma segura con el usuario.</small>
        </label>
        <label>
          Rol *
          <select value={role} onChange={(e) => setRole(e.target.value as NewUserInput['role'])}>
            <option value="ARCHITECT">Arquitecto</option>
            <option value="COLLABORATOR">Colaborador</option>
          </select>
        </label>
      </form>
    </SharedDialog>
  );
}
