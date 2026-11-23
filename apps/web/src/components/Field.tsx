import type { ReactNode } from 'react';

interface Props { id: string; label: string; required?: boolean; error?: string; children: ReactNode; help?: string; }
export default function Field({ id, label, required, error, children, help }: Props) {
  return <div className="simbo-form-field">
    <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {children}
    {error && <p className="simbo-form-error" id={`${id}-error`} role="alert">{error}</p>}
    {!error && help && <small className="simbo-form-help">{help}</small>}
  </div>;
}
