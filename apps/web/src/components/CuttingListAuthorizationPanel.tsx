import { useEffect, useRef, useState } from 'react';
import type {
  CuttingListAuthorizationResponse,
  CuttingListResponse
} from '@simbo/shared-contracts';
import { ApiError, apiClient, type VersionSummary } from '../apiClient';
import './CuttingListAuthorizationPanel.css';

interface CuttingListAuthorizationPanelProps {
  projectId: string;
  projectName: string;
  version: VersionSummary;
  cuttingResult: CuttingListResponse | null;
  canAuthorize: boolean;
  onRefreshVersions?: () => void;
}

function AuthorizationCuttingTable({
  result,
  projectName
}: {
  result: CuttingListResponse;
  projectName: string;
}) {
  return (
    <div className="table-wrap cutting-auth-table-wrap">
      <table className="manufacturing-parts-table cutting-table cutting-auth-table">
        <caption className="cutting-table-caption">
          Despiece de {projectName}, revisión {result.source.revision}
        </caption>
        <thead>
          <tr>
            <th scope="col">Pieza</th>
            <th scope="col">Ancho</th>
            <th scope="col">Alto</th>
            <th scope="col">Grosor</th>
            <th scope="col">Material</th>
            <th scope="col">Cantidad</th>
            <th scope="col">Veta</th>
            <th scope="col">Orígenes</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
              <td className="cutting-table-concept">{row.name}</td>
              <td>{row.widthMm} mm</td>
              <td>{row.heightMm} mm</td>
              <td>{row.thicknessMm} mm</td>
              <td>{row.material.name}</td>
              <td className="cutting-table-quantity">{row.quantity}</td>
              <td>{row.grainDirection}</td>
              <td className="cutting-table-origins">
                <details>
                  <summary>Ver orígenes ({row.origins.length})</summary>
                  <ul>
                    {row.origins.map((origin, index) => (
                      <li key={`${origin.partId}-${index}`}>
                        <strong>Pieza:</strong> {origin.partId}
                        {origin.moduleInstanceId ? (
                          <> · <strong>Módulo:</strong> {origin.moduleInstanceId}</>
                        ) : null}
                        {origin.assemblyPath.length > 0 ? (
                          <> · <strong>Ensambles:</strong> {origin.assemblyPath.join(' / ')}</>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CuttingListAuthorizationPanel({
  projectId,
  projectName,
  version,
  cuttingResult,
  canAuthorize,
  onRefreshVersions
}: CuttingListAuthorizationPanelProps) {
  const [authorization, setAuthorization] = useState<CuttingListAuthorizationResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusChecked, setStatusChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const requestSeq = useRef(0);
  const submittingRef = useRef(false);

  const loadAuthorization = async () => {
    const seq = ++requestSeq.current;
    setStatusLoading(true);
    setStatusChecked(false);
    setError('');
    setSuccessMessage('');
    setConfirmOpen(false);
    setAuthorization(null);

    try {
      const response = await apiClient.getCuttingListAuthorization(projectId, version.id);
      if (seq !== requestSeq.current) return;
      if (response.authorized && response.authorization) {
        if (
          response.authorization.projectId !== projectId ||
          response.authorization.versionId !== version.id
        ) {
          throw new Error('La autorización recibida no corresponde a la versión seleccionada.');
        }
        setAuthorization(response.authorization);
      } else {
        setAuthorization(null);
      }
      setStatusChecked(true);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      if (err instanceof ApiError && err.status === 403) {
        setError('No tienes permisos para consultar o autorizar despieces.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo consultar el estado de autorización.');
      }
    } finally {
      if (seq === requestSeq.current) {
        setStatusLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadAuthorization();
    return () => {
      requestSeq.current += 1;
    };
  }, [projectId, version.id]);

  const validPreviewResult =
    cuttingResult &&
    cuttingResult.source.projectId === projectId &&
    cuttingResult.source.designVersionId === version.id &&
    cuttingResult.source.revision === version.revision
      ? cuttingResult
      : null;

  const canTriggerAuthorize =
    canAuthorize &&
    version.approvalStatus === 'APPROVED' &&
    version.current &&
    Boolean(validPreviewResult) &&
    statusChecked &&
    !statusLoading &&
    !authorization &&
    !submitting;

  const handleConfirmAuthorize = async () => {
    if (!canTriggerAuthorize || submittingRef.current) return;

    const seq = ++requestSeq.current;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const currentDesign = await apiClient.design(projectId);
      if (seq !== requestSeq.current) return;

      if (
        currentDesign.revision !== version.revision ||
        currentDesign.approvedVersionId !== version.id
      ) {
        setConfirmOpen(false);
        setError('El diseño cambió. Actualiza las versiones antes de autorizar el despiece.');
        return;
      }

      const saved = await apiClient.authorizeCuttingList(
        projectId,
        version.id,
        currentDesign.revision
      );
      if (seq !== requestSeq.current) return;

      if (saved.projectId !== projectId || saved.versionId !== version.id) {
        throw new Error('La autorización guardada no corresponde a la versión seleccionada.');
      }

      setAuthorization(saved);
      setConfirmOpen(false);
      setSuccessMessage('El despiece se autorizó correctamente.');
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setConfirmOpen(false);
      if (err instanceof ApiError && err.status === 409) {
        setError('El diseño cambió. Actualiza las versiones antes de autorizar el despiece.');
      } else if (err instanceof ApiError && err.status === 403) {
        setError('No tienes permisos para autorizar despieces.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo autorizar el despiece.');
      }
    } finally {
      submittingRef.current = false;
      if (seq === requestSeq.current) {
        setSubmitting(false);
      }
    }
  };

  const statusLabel = authorization
    ? version.current
      ? 'Autorizado · Vigente'
      : 'Autorizado · Histórico'
    : 'Pendiente de autorización';

  const statusModifier = authorization
    ? version.current
      ? 'cutting-auth-badge--current'
      : 'cutting-auth-badge--historic'
    : 'cutting-auth-badge--pending';

  return (
    <section
      className="cutting-auth-panel"
      aria-labelledby={`cutting-auth-title-${version.id}`}
    >
      <div className="cutting-auth-header">
        <div>
          <h3 id={`cutting-auth-title-${version.id}`}>
            Autorización de despiece — Revisión {version.revision}
          </h3>
          <p className="cutting-auth-subtitle">
            {version.approvalStatus === 'APPROVED' ? 'Versión aprobada' : 'Versión pendiente'} ·{' '}
            {version.current ? 'Vigente' : 'Histórica'}
          </p>
        </div>
        <span className={`cutting-auth-badge ${statusModifier}`}>
          Estado: {statusLabel}
        </span>
      </div>

      {statusLoading && (
        <p className="cutting-auth-status" role="status">
          Consultando estado de autorización…
        </p>
      )}

      {error && (
        <div className="cutting-auth-alert" role="alert">
          <p>{error}</p>
          <div className="cutting-auth-alert-actions">
            <button
              type="button"
              className="project-btn project-btn--refresh"
              onClick={() => void loadAuthorization()}
              disabled={statusLoading || submitting}
            >
              Reintentar
            </button>
            {onRefreshVersions && (
              <button
                type="button"
                className="project-btn project-btn--review"
                onClick={onRefreshVersions}
                disabled={statusLoading || submitting}
              >
                Actualizar versiones
              </button>
            )}
          </div>
        </div>
      )}

      {successMessage && (
        <p className="cutting-auth-success" role="status">
          {successMessage}
        </p>
      )}

      {!statusLoading && authorization && (
        <div className="cutting-auth-record">
          <dl className="cutting-auth-meta">
            <div>
              <dt>Estado</dt>
              <dd>{statusLabel}</dd>
            </div>
            <div>
              <dt>Versión</dt>
              <dd>Revisión {version.revision}</dd>
            </div>
            <div>
              <dt>Responsable</dt>
              <dd>{authorization.authorizedById}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{new Date(authorization.authorizedAt).toLocaleString()}</dd>
            </div>
          </dl>
          {!version.current && (
            <p className="cutting-auth-historic-note">
              Esta autorización pertenece a una versión histórica y se conserva solo para consulta.
            </p>
          )}
          <AuthorizationCuttingTable
            result={authorization.cuttingList}
            projectName={projectName}
          />
        </div>
      )}

      {!statusLoading && !authorization && statusChecked && (
        <div className="cutting-auth-pending">
          {version.approvalStatus !== 'APPROVED' && (
            <p className="cutting-auth-info">
              Esta versión está pendiente de aprobación. Solo pueden autorizarse despieces de versiones aprobadas y vigentes.
            </p>
          )}

          {version.approvalStatus === 'APPROVED' && !version.current && (
            <p className="cutting-auth-info">
              Esta versión es histórica y no cuenta con una autorización registrada. No se pueden registrar nuevas autorizaciones sobre versiones históricas.
            </p>
          )}

          {version.approvalStatus === 'APPROVED' && version.current && !validPreviewResult && (
            <p className="cutting-auth-info">
              Genera y revisa el despiece de esta versión antes de registrar su autorización.
            </p>
          )}

          {canTriggerAuthorize && (
            <div className="cutting-auth-actions">
              <button
                type="button"
                className="project-btn project-btn--approve"
                onClick={() => setConfirmOpen(true)}
                disabled={submitting}
              >
                Autorizar despiece
              </button>
            </div>
          )}
        </div>
      )}

      {confirmOpen && (
        <div
          className="cutting-auth-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`confirm-auth-title-${version.id}`}
        >
          <div className="cutting-auth-modal">
            <h4 id={`confirm-auth-title-${version.id}`}>
              ¿Autorizar este despiece? (Revisión {version.revision})
            </h4>
            <p>
              Se registrará la autorización de la versión seleccionada y se conservará la lista de piezas como información histórica.
            </p>
            <p>Esta operación no podrá modificarse desde esta función.</p>
            <div className="cutting-auth-modal-actions">
              <button
                type="button"
                className="project-btn project-btn--refresh"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="project-btn project-btn--approve"
                onClick={() => void handleConfirmAuthorize()}
                disabled={submitting}
              >
                {submitting ? 'Autorizando…' : 'Confirmar autorización'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}