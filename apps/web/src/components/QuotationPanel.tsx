import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type {
  CuttingListResponse,
  QuotationDecisionAction,
  QuotationDecisionStatus,
  QuotationListResponse,
  QuotationResponse,
} from '@simbo/shared-contracts';
import { apiClient, ApiError, type SessionUser, type VersionSummary } from '../apiClient';
import './QuotationPanel.css';

interface QuotationPanelProps {
  projectId: string;
  projectName: string;
  version: VersionSummary | null;
  cuttingResult?: CuttingListResponse | null;
  canGenerate: boolean;
  currentUserRole: SessionUser['role'];
  currentApprovedVersionId: string | null;
  onRefreshVersions: () => void;
  onClose: () => void;
}

interface MaterialGroup {
  key: string;
  materialId: string;
  materialName: string;
  thicknessMm: number;
  pieceCount: number;
}

const DECISION_STATUS_META: Record<
  QuotationDecisionStatus,
  { label: string; badgeClass: string }
> = {
  PENDING: {
    label: 'Pendiente de decisión',
    badgeClass: 'status-badge status-badge--pending',
  },
  APPROVED: {
    label: 'Aprobada',
    badgeClass: 'status-badge status-badge--approved',
  },
  REJECTED: {
    label: 'Rechazada',
    badgeClass: 'status-badge status-badge--rejected',
  },
};

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function formatCents(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function pesosToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const [pesos, centavos = ''] = normalized.split('.');
  const amount = Number(pesos) * 100 + Number(centavos.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 2_147_483_647) {
    return null;
  }
  return amount;
}

function formatDecisionDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export default function QuotationPanel({
  projectId,
  projectName,
  version,
  cuttingResult,
  canGenerate,
  currentUserRole,
  currentApprovedVersionId,
  onRefreshVersions,
  onClose,
}: QuotationPanelProps) {
  // 1. Cutting list state (for extracting required material + thickness rates)
  const [localCuttingList, setLocalCuttingList] = useState<CuttingListResponse | null>(null);
  const [cuttingLoading, setCuttingLoading] = useState(false);
  const [cuttingError, setCuttingError] = useState('');

  // 2. Form state
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [laborInput, setLaborInput] = useState('0.00');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  // 3. Generation state
  const [generating, setGenerating] = useState(false);

  // 4. History list state
  const [quotations, setQuotations] = useState<QuotationListResponse>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // 5. Selected quotation detail state
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Request guards to prevent stale responses across project/version switches
  const cuttingReqId = useRef(0);
  const historyReqId = useRef(0);
  const detailReqId = useRef(0);
  const generatePending = useRef(false);

  const [pendingConfirmation, setPendingConfirmation] = useState<QuotationDecisionAction | null>(null);
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);

  useEffect(() => {
    setPendingConfirmation(null);
    setDecisionError(null);
    setDecisionSuccess(null);
  }, [projectId, selectedQuotation?.id]);

  const isSelectedQuotationCurrent = Boolean(
  selectedQuotation &&
    currentApprovedVersionId &&
    selectedQuotation.versionId === currentApprovedVersionId
);

  const canDecide = Boolean(
    selectedQuotation &&
      currentUserRole === 'SUPERVISOR' &&
      selectedQuotation.decisionStatus === 'PENDING' &&
      isSelectedQuotationCurrent
  );

  const syncQuotationInState = (updated: QuotationResponse) => {
    setSelectedQuotation(updated);
    setQuotations((prev) =>
      prev.map((item) =>
        item.id === updated.id
          ? {
              ...item,
              decisionStatus: updated.decisionStatus,
              decidedAt: updated.decidedAt,
              decidedById: updated.decidedById,
              decidedByName: updated.decidedByName ?? null,
            }
          : item
      )
    );
  };

  const refreshSelectedQuotation = async (quotationId: string) => {
    const reqId = ++detailReqId.current;
    try {
      const fresh = await apiClient.getQuotation(projectId, quotationId);
      if (reqId !== detailReqId.current) return;
      syncQuotationInState(fresh);
    } catch {
      // Keep existing UI state untouched if refresh fails
    }
  };

  const handleConfirmDecision = async () => {
    if (!selectedQuotation || !pendingConfirmation || decisionSubmitting) {
      return;
    }

    const targetQuotationId = selectedQuotation.id;
    const targetDecision = pendingConfirmation;

    setDecisionSubmitting(true);
    setDecisionError(null);
    setDecisionSuccess(null);

    try {
      const updated = await apiClient.decideQuotation(
        projectId,
        targetQuotationId,
        targetDecision
      );

      syncQuotationInState(updated);
      setPendingConfirmation(null);
      setDecisionSuccess(
        targetDecision === 'APPROVED'
          ? 'La cotización se aprobó correctamente.'
          : 'La cotización se rechazó correctamente.'
      );
    } catch (err) {
      setPendingConfirmation(null);

      if (err instanceof ApiError) {
        if (err.status === 401) {
          // apiClient already cleared session and dispatched 'simbo.session.expired'
          return;
        }
        if (err.status === 403) {
          setDecisionError(
            'No cuentas con permisos de Supervisor para registrar decisiones sobre cotizaciones.'
          );
        } else if (err.status === 409) {
          setDecisionError(
            err.message ||
              'No se pudo registrar la decisión porque la cotización ya fue decidida o corresponde a una versión desactualizada.'
          );
          onRefreshVersions();
          await refreshSelectedQuotation(targetQuotationId);
        } else if (err.status === 404) {
          setDecisionError(
            'No se encontró la cotización solicitada dentro del proyecto.'
          );
        } else {
          setDecisionError(
            err.message || 'Ocurrió un error al registrar la decisión.'
          );
        }
      } else {
        setDecisionError(
          'Error de conexión al comunicarse con el servidor. Verifica tu red e inténtalo de nuevo.'
        );
      }
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const canGenerateForVersion = Boolean(
    canGenerate && version && version.current && version.approvalStatus === 'APPROVED'
  );

  // Load project quotation history
  const loadHistory = async () => {
    const reqId = ++historyReqId.current;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const list = await apiClient.listQuotations(projectId);
      if (reqId !== historyReqId.current) return;
      setQuotations(list);
    } catch (err) {
      if (reqId !== historyReqId.current) return;
      setHistoryError(
        err instanceof Error ? err.message : 'No se pudieron consultar las cotizaciones.'
      );
    } finally {
      if (reqId === historyReqId.current) setHistoryLoading(false);
    }
  };

  useEffect(() => {
    setSelectedQuotation(null);
    setDetailError('');
    void loadHistory();
    return () => {
      historyReqId.current += 1;
      detailReqId.current += 1;
    };
  }, [projectId]);

  // Load cutting list when generating for an approved current version
  useEffect(() => {
    const reqId = ++cuttingReqId.current;
    setCuttingError('');
    setFormError('');
    setFieldErrors({});
    setRateInputs({});
    setLaborInput('0.00');

    if (!canGenerateForVersion || !version) {
      setLocalCuttingList(null);
      setCuttingLoading(false);
      return;
    }

    // Reuse cuttingResult if it already matches this project & version
    if (
      cuttingResult &&
      cuttingResult.source.projectId === projectId &&
      cuttingResult.source.designVersionId === version.id &&
      cuttingResult.source.revision === version.revision
    ) {
      setLocalCuttingList(cuttingResult);
      setCuttingLoading(false);
      return;
    }

    setCuttingLoading(true);
    setLocalCuttingList(null);

    apiClient
      .generateCuttingList(projectId, version.id)
      .then((result) => {
        if (reqId !== cuttingReqId.current) return;
        setLocalCuttingList(result);
      })
      .catch((err) => {
        if (reqId !== cuttingReqId.current) return;
        setCuttingError(
          err instanceof Error
            ? err.message
            : 'No se pudo obtener el despiece para cotizar.'
        );
      })
      .finally(() => {
        if (reqId === cuttingReqId.current) setCuttingLoading(false);
      });

    return () => {
      cuttingReqId.current += 1;
    };
  }, [projectId, version, canGenerateForVersion, cuttingResult]);

  // Group cutting list rows by material.id + thicknessMm
  const materialGroups = useMemo<MaterialGroup[]>(() => {
    if (!localCuttingList?.rows?.length) return [];
    const map = new Map<string, MaterialGroup>();

    for (const row of localCuttingList.rows) {
      const key = `${row.material.id}::${row.thicknessMm}`;
      const existing = map.get(key);
      if (existing) {
        existing.pieceCount += row.quantity;
      } else {
        map.set(key, {
          key,
          materialId: row.material.id,
          materialName: row.material.name || row.material.id,
          thicknessMm: row.thicknessMm,
          pieceCount: row.quantity,
        });
      }
    }
    return Array.from(map.values());
  }, [localCuttingList]);

  const handleSelectQuotation = async (quotationId: string) => {
    const reqId = ++detailReqId.current;
    setDetailLoading(true);
    setDetailError('');
    try {
      const detail = await apiClient.getQuotation(projectId, quotationId);
      if (reqId !== detailReqId.current) return;
      setSelectedQuotation(detail);
    } catch (err) {
      if (reqId !== detailReqId.current) return;
      setDetailError(
        err instanceof Error ? err.message : 'No se pudo cargar el detalle de la cotización.'
      );
    } finally {
      if (reqId === detailReqId.current) setDetailLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (generating || generatePending.current || !version || !canGenerateForVersion) return;

    const nextFieldErrors: Record<string, string> = {};
    const parsedRates: Array<{
      materialId: string;
      thicknessMm: number;
      pricePerSquareMeterCents: number;
    }> = [];

    for (const group of materialGroups) {
      const raw = rateInputs[group.key] ?? '';
      if (!raw.trim()) {
        nextFieldErrors[group.key] = 'Ingresa una tarifa en MXN por m².';
        continue;
      }
      const cents = pesosToCents(raw);
      if (cents === null || cents <= 0) {
        nextFieldErrors[group.key] = 'Debe ser un número mayor a 0 con máximo 2 decimales.';
        continue;
      }
      parsedRates.push({
        materialId: group.materialId,
        thicknessMm: group.thicknessMm,
        pricePerSquareMeterCents: cents,
      });
    }

    const laborCents = pesosToCents(laborInput);
    if (laborCents === null || laborCents < 0) {
      nextFieldErrors.labor = 'Debe ser un importe válido mayor o igual a 0 (máx. 2 decimales).';
    }

    if (Object.keys(nextFieldErrors).length > 0 || laborCents === null) {
      setFieldErrors(nextFieldErrors);
      setFormError('Corrige los campos marcados antes de generar la cotización.');
      return;
    }

    setFieldErrors({});
    setFormError('');
    setGenerating(true);
    generatePending.current = true;

    try {
      const created = await apiClient.generateQuotation(projectId, version.id, {
        rates: parsedRates,
        laborCostCents: laborCents,
      });
      setSelectedQuotation(created);
      await loadHistory();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo generar la cotización.';
      setFormError(message);

      // If version became stale/conflict (409), refresh versions list
      if (
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status?: number }).status === 409
      ) {
        onRefreshVersions();
      }
    } finally {
      generatePending.current = false;
      setGenerating(false);
    }
  };

  return (
    <section className="quotation-panel" aria-label={`Cotizaciones de ${projectName}`}>
      <header className="quotation-panel-header">
        <div>
          <h3>Cotizaciones — {projectName}</h3>
          {version && (
            <p className="quotation-panel-subtitle">
              Revisión {version.revision} ·{' '}
              {version.approvalStatus === 'APPROVED' ? 'Aprobada' : 'Pendiente'} ·{' '}
              {version.current ? 'Vigente' : 'Histórica'}
            </p>
          )}
        </div>
        <button type="button" className="project-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      {/* GENERATION FORM (Supervisor + Approved + Current version only) */}
      {canGenerateForVersion && version && (
        <section className="quotation-section" aria-labelledby="quotation-form-title">
          <h4 id="quotation-form-title">Materiales y costos (Revisión {version.revision})</h4>

          {cuttingLoading && (
            <p role="status">Consultando materiales del despiece...</p>
          )}

          {cuttingError && (
            <p className="project-error" role="alert">
              {cuttingError}
            </p>
          )}

          {!cuttingLoading && !cuttingError && localCuttingList && materialGroups.length === 0 && (
            <p className="project-error" role="alert">
              El despiece no contiene piezas fabricables. No es posible generar la cotización.
            </p>
          )}

          {!cuttingLoading && !cuttingError && materialGroups.length > 0 && (
            <form className="quotation-form" onSubmit={handleSubmit} noValidate>
              {formError && (
                <p className="project-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="quotation-rates-grid">
                {materialGroups.map((group) => {
                  const inputId = `rate-${group.key}`;
                  const errMsg = fieldErrors[group.key];
                  return (
                    <div className="quotation-field" key={group.key}>
                      <label htmlFor={inputId}>
                        <strong>{group.materialName}</strong> — {group.thicknessMm} mm{' '}
                        <small>({group.pieceCount} pzas) · Precio por m² (MXN)</small>
                      </label>
                      <input
                        id={inputId}
                        type="text"
                        inputMode="decimal"
                        placeholder="Ej. 600.00"
                        value={rateInputs[group.key] ?? ''}
                        disabled={generating}
                        aria-invalid={Boolean(errMsg)}
                        onChange={(e) => {
                          setRateInputs((prev) => ({ ...prev, [group.key]: e.target.value }));
                          if (errMsg) {
                            setFieldErrors((prev) => {
                              const copy = { ...prev };
                              delete copy[group.key];
                              return copy;
                            });
                          }
                        }}
                      />
                      {errMsg && (
                        <span className="quotation-field-error" role="alert">
                          {errMsg}
                        </span>
                      )}
                    </div>
                  );
                })}

                <div className="quotation-field">
                  <label htmlFor="quotation-labor-cost">
                    <strong>Mano de obra (MXN)</strong>
                  </label>
                  <input
                    id="quotation-labor-cost"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={laborInput}
                    disabled={generating}
                    aria-invalid={Boolean(fieldErrors.labor)}
                    onChange={(e) => {
                      setLaborInput(e.target.value);
                      if (fieldErrors.labor) {
                        setFieldErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.labor;
                          return copy;
                        });
                      }
                    }}
                  />
                  {fieldErrors.labor && (
                    <span className="quotation-field-error" role="alert">
                      {fieldErrors.labor}
                    </span>
                  )}
                </div>
              </div>

              <div className="quotation-form-actions">
                <button
                  type="submit"
                  className="project-btn project-btn--approve"
                  disabled={generating}
                >
                  {generating ? 'Generando cotización...' : 'Generar cotización'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* SELECTED QUOTATION DETAIL */}
      {detailLoading && <p role="status">Cargando detalle de cotización...</p>}
      {detailError && (
        <p className="project-error" role="alert">
          {detailError}
        </p>
      )}

      {selectedQuotation && (
        <section className="quotation-section quotation-result" aria-labelledby="quotation-detail-title">
          <h4 id="quotation-detail-title">
            Cotización #{selectedQuotation.id.slice(0, 8)}
          </h4>
          <p className="quotation-meta">
            <strong>Proyecto:</strong> {projectName} ·{' '}
            <strong>Versión:</strong> Revisión {selectedQuotation.revision} ·{' '}
            <strong>Fecha:</strong> {new Date(selectedQuotation.createdAt).toLocaleString('es-MX')}
          </p>

          <div className="table-wrap">
            <table className="quotation-table">
              <thead>
                <tr>
                  <th scope="col">Pieza</th>
                  <th scope="col">Material</th>
                  <th scope="col">Grosor</th>
                  <th scope="col">Cant.</th>
                  <th scope="col">Superficie (m²)</th>
                  <th scope="col">Tarifa / m²</th>
                  <th scope="col">Importe</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuotation.calculation.lines.map((line) => (
                  <tr key={line.cuttingListRowId}>
                    <td>{line.name}</td>
                    <td>{line.materialId}</td>
                    <td>{line.thicknessMm} mm</td>
                    <td>{line.quantity}</td>
                    <td>{line.areaM2.toFixed(4)}</td>
                    <td>{formatCents(line.pricePerSquareMeterCents)}</td>
                    <td>{formatCents(line.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="quotation-totals">
           <section
  className="quotation-section quotation-decision"
  aria-labelledby="quotation-decision-title"
>
  <h4 id="quotation-decision-title">Decisión de cotización</h4>

  <p className="quotation-meta">
    <strong>Estado:</strong>{' '}
    <span
      className={
        DECISION_STATUS_META[selectedQuotation.decisionStatus].badgeClass
      }
    >
      {DECISION_STATUS_META[selectedQuotation.decisionStatus].label}
    </span>
    {selectedQuotation.decisionStatus !== 'PENDING' &&
      (selectedQuotation.decidedByName || selectedQuotation.decidedById) && (
        <>
          {' · '}
          <strong>Responsable:</strong>{' '}
          {selectedQuotation.decidedByName || selectedQuotation.decidedById}
        </>
      )}
    {selectedQuotation.decisionStatus !== 'PENDING' &&
      selectedQuotation.decidedAt && (
        <>
          {' · '}
          <strong>Fecha:</strong>{' '}
          {formatDecisionDate(selectedQuotation.decidedAt)}
        </>
      )}
  </p>

  {selectedQuotation.decisionStatus === 'PENDING' &&
    currentUserRole === 'SUPERVISOR' &&
    !isSelectedQuotationCurrent && (
      <p className="quotation-meta">
        Esta cotización corresponde a una versión histórica del diseño y ya no
        admite decisiones.
      </p>
    )}

  {decisionSuccess && (
    <p role="status" className="quotation-decision-feedback">
      {decisionSuccess}
    </p>
  )}

  {decisionError && (
    <p className="project-error" role="alert">
      {decisionError}
    </p>
  )}

  {canDecide && !pendingConfirmation && (
    <div className="quotation-decision-actions">
      <button
        type="button"
        className="project-btn project-btn--approve"
        disabled={decisionSubmitting}
        onClick={() => {
          setDecisionError('');
          setDecisionSuccess('');
          setPendingConfirmation('APPROVED');
        }}
      >
        Aprobar cotización
      </button>

      <button
        type="button"
        className="project-btn"
        disabled={decisionSubmitting}
        onClick={() => {
          setDecisionError('');
          setDecisionSuccess('');
          setPendingConfirmation('REJECTED');
        }}
      >
        Rechazar cotización
      </button>
    </div>
  )}

  {canDecide && pendingConfirmation && (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-confirm-heading"
      aria-describedby="decision-confirm-body"
      className="quotation-decision-confirm"
    >
      <p id="decision-confirm-heading">
        <strong>
          {pendingConfirmation === 'APPROVED'
            ? '¿Aprobar esta cotización?'
            : '¿Rechazar esta cotización?'}
        </strong>
      </p>
      <p id="decision-confirm-body">
        {pendingConfirmation === 'APPROVED'
          ? 'Se registrará la aprobación y no podrá modificarse desde esta función.'
          : 'Se registrará el rechazo y no podrá modificarse desde esta función.'}
      </p>
      <div className="quotation-decision-actions">
        <button
          type="button"
          className="project-btn"
          disabled={decisionSubmitting}
          onClick={() => setPendingConfirmation(null)}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="project-btn project-btn--approve"
          disabled={decisionSubmitting}
          onClick={() => void handleConfirmDecision()}
        >
          {decisionSubmitting
            ? 'Registrando...'
            : pendingConfirmation === 'APPROVED'
              ? 'Confirmar aprobación'
              : 'Confirmar rechazo'}
        </button>
      </div>
    </div>
  )}
</section>
            <div>
              <dt>Subtotal materiales:</dt>
              <dd>{formatCents(selectedQuotation.materialSubtotalCents)}</dd>
            </div>
            <div>
              <dt>Mano de obra:</dt>
              <dd>{formatCents(selectedQuotation.laborCostCents)}</dd>
            </div>
            <div className="quotation-totals-grand">
              <dt>TOTAL:</dt>
              <dd>{formatCents(selectedQuotation.totalCents)} MXN</dd>
            </div>
          </dl>
        </section>
      )}

      {/* PROJECT QUOTATION HISTORY */}
      <section className="quotation-section" aria-labelledby="quotation-history-title">
        <div className="quotation-history-header">
          <h4 id="quotation-history-title">Cotizaciones del proyecto</h4>
          <button
            type="button"
            className="project-btn project-btn--refresh"
            disabled={historyLoading}
            onClick={() => void loadHistory()}
          >
            Actualizar
          </button>
        </div>

        {historyLoading && <p role="status">Cargando cotizaciones...</p>}

        {historyError && (
          <div role="alert" className="project-error">
            <p>{historyError}</p>
            <button type="button" className="project-btn" onClick={() => void loadHistory()}>
              Reintentar
            </button>
          </div>
        )}

        {!historyLoading && !historyError && quotations.length === 0 && (
          <p>No hay cotizaciones registradas para este proyecto.</p>
        )}

        {quotations.length > 0 && (
          <div className="table-wrap">
            <table className="quotation-table">
              <thead>
                <tr>
                  <th scope="col">Referencia</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Versión</th>
                  <th scope="col">Total</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((q) => (
                  <tr key={q.id}>
                    <td>{q.id.slice(0, 8)}</td>
                    <td>{new Date(q.createdAt).toLocaleString('es-MX')}</td>
                    <td>Revisión {q.revision}</td>
                    <td>{formatCents(q.totalCents)} MXN</td>
                    <td>
                      <button
                        type="button"
                        className="project-btn project-btn--review"
                        disabled={detailLoading}
                        onClick={() => void handleSelectQuotation(q.id)}
                      >
                        Ver detalle
                      </button>
                    </td>
                    <td>
  <span className={DECISION_STATUS_META[q.decisionStatus].badgeClass}>
    {DECISION_STATUS_META[q.decisionStatus].label}
  </span>
</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}