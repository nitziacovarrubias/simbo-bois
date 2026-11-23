import { AlertTriangle } from 'lucide-react';
import SharedDialog from './SharedDialog';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
  destructive?: boolean;
}
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, busy, error, destructive }: Props) {
  return <SharedDialog title={title} icon={<AlertTriangle />} onClose={onCancel} busy={busy}
    footer={<>
      <button className="simbo-dialog-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
      <button className={`simbo-dialog-button ${destructive ? 'simbo-dialog-button--danger' : 'simbo-dialog-button--primary'}`}
        type="button" onClick={() => void onConfirm()} disabled={busy}>{busy ? 'Procesando…' : confirmLabel}</button>
    </>}>
    <p className="simbo-dialog-note">{message}</p>
    {error && <p className="simbo-dialog-error" role="alert">{error}</p>}
  </SharedDialog>;
}
