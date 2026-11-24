import { useEffect, useState } from 'react';
import { AlertCircle, Info, X } from 'lucide-react';
import { onEditorFeedback, type EditorFeedback } from '../editorCommandFeedback';
import './EditorCommandNotices.css';

export default function EditorCommandNotices() {
  const [feedback, setFeedback] = useState<EditorFeedback>();
  useEffect(() => onEditorFeedback(setFeedback), []);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(current => current?.id === feedback.id ? undefined : current), 4800);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  if (!feedback) return null;
  return <div className={`editor-command-notice editor-command-notice--${feedback.variant}`} role={feedback.variant === 'error' ? 'alert' : 'status'}>
    {feedback.variant === 'error' ? <AlertCircle aria-hidden="true"/> : <Info aria-hidden="true"/>}
    <span>{feedback.message}</span>
    <button type="button" aria-label="Cerrar aviso" onClick={() => setFeedback(undefined)}><X aria-hidden="true"/></button>
  </div>;
}
