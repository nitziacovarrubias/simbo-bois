import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './SharedDialog.css';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  icon?: ReactNode;
  width?: 'normal' | 'wide';
  busy?: boolean;
  dismissOnBackdrop?: boolean;
}

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

export default function SharedDialog({ title, description, children, footer, onClose, icon, width = 'normal', busy = false, dismissOnBackdrop = false }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    // Esperar al montaje del portal antes de buscar elementos internos.
    const first = dialog?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)');
    (first ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!dialogRef.current) return;
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(element => element.getClientRects().length > 0);
      if (!elements.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault(); lastElement.focus();
      } else if (!event.shiftKey && (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault(); firstElement.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div className="simbo-dialog-overlay" data-simbo-modal="true" onMouseDown={event => {
      if (dismissOnBackdrop && event.target === event.currentTarget && !busy) onClose();
    }}>
      <section ref={dialogRef} tabIndex={-1} className={`simbo-dialog simbo-dialog--${width}`}
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}>
        <header className="simbo-dialog-heading">
          {icon && <div className="simbo-dialog-icon" aria-hidden="true">{icon}</div>}
          <div className="simbo-dialog-heading-text">
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className="simbo-dialog-close" type="button" aria-label="Cerrar ventana" onClick={onClose} disabled={busy}><X size={19} /></button>
        </header>
        <div className="simbo-dialog-body">{children}</div>
        {footer && <footer className="simbo-dialog-footer">{footer}</footer>}
      </section>
    </div>, document.body
  );
}
