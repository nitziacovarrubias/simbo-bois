import { useState, type FormEvent } from 'react';
import { apiClient } from '../apiClient';
import type { DesignChangeProposal } from '@simbo/shared-contracts';

interface DesignChangeProposalFormProps {
  projectId: string;
  versionId: string;
  disabled?: boolean;
  onCreated: (proposal: DesignChangeProposal) => void;
}

export default function DesignChangeProposalForm({
  projectId,
  versionId,
  disabled = false,
  onCreated
}: DesignChangeProposalFormProps) {
  const [observation, setObservation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const trimmedObservation = observation.trim();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = observation.trim();
    setError('');
    setSuccess(false);

    if (!value) {
      setError('Escribe una observación antes de registrar la propuesta.');
      return;
    }
    if (value.length > 2000) {
      setError('La observación no puede superar los 2000 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const proposal = await apiClient.createProposal(projectId, versionId, value);
      setObservation('');
      setSuccess(true);
      onCreated(proposal);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : 'No se pudo registrar la propuesta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="project-proposal-form" onSubmit={submit}>
      <label htmlFor={`proposal-observation-${versionId}`}>Nueva observación</label>
      <textarea
        id={`proposal-observation-${versionId}`}
        value={observation}
        onChange={event => {
          setObservation(event.target.value);
          setError('');
          setSuccess(false);
        }}
        maxLength={2000}
        rows={3}
        placeholder="Describe el cambio que propones"
        disabled={disabled || submitting}
        aria-describedby={`proposal-observation-help-${versionId}`}
      />
      <small id={`proposal-observation-help-${versionId}`}>
        {observation.length > 0 && !trimmedObservation
          ? 'La observación no puede contener solo espacios.'
          : 'Escribe una observación de hasta 2000 caracteres para habilitar el registro.'}
      </small>
      {error && <p className="project-error" role="alert">{error}</p>}
      {success && <p className="project-proposal-success" role="status">Propuesta registrada.</p>}
      <button
        type="submit"
        className="project-btn project-btn--submit-proposal"
        disabled={disabled || submitting || !trimmedObservation || trimmedObservation.length > 2000}
      >
        {submitting ? 'Registrando…' : 'Registrar propuesta'}
      </button>
    </form>
  );
}
