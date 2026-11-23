import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import './FeedbackToast.css';

interface Props {
  message: string;
  variant?: 'success' | 'error';
  onDismiss: () => void;
}

export default function FeedbackToast({ message, variant='success', onDismiss }: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message) return null;
  return <div className={`simbo-feedback-toast simbo-feedback-toast--${variant}`} role={variant==='error'?'alert':'status'}>
    {variant==='error' ? <AlertCircle size={18} aria-hidden="true"/> : <CheckCircle2 size={18} aria-hidden="true"/>}
    <span>{message}</span>
    <button type="button" aria-label="Cerrar notificación" onClick={onDismiss}><X size={17} /></button>
  </div>;
}
