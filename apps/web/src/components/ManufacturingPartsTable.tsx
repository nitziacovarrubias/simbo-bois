import type { ManufacturingPart, PartOrigin } from '@simbo/manufacturing-engine';
import { uiLabel } from '../uiLabels';

export interface ManufacturingPartRow {
  part: ManufacturingPart;
  origin: PartOrigin;
  assemblyPath: string[];
  moduleInstanceName?: string;
  moduleDefinitionName?: string;
  sourceEntityName?: string;
}

export default function ManufacturingPartsTable({ rows }: { rows: ManufacturingPartRow[] }) {
  return <section className="manufacturing-parts" aria-labelledby="manufacturing-parts-title">
    <div className="panel-subtitle" id="manufacturing-parts-title">Lista de piezas</div>
    {rows.length === 0 ? <div className="empty-state-card" role="status">No hay piezas manufacturables en este diseño.</div> : <>
      <div className="table-wrap">
        <table className="manufacturing-parts-table">
          <caption className="sr-only">Piezas, medidas y trazabilidad de manufactura</caption>
          <thead><tr>
            <th scope="col">Pieza</th><th scope="col">Ancho</th><th scope="col">Alto</th><th scope="col">Grosor</th>
            <th scope="col">Material</th><th scope="col">Veta</th><th scope="col">Cantidad</th><th scope="col">Origen</th>
          </tr></thead>
          <tbody>{rows.map(({ part, origin, assemblyPath, moduleInstanceName, moduleDefinitionName, sourceEntityName }) => <tr key={part.id}>
            <td>{part.name}</td>
            <td>{part.widthMm} mm</td>
            <td>{part.heightMm} mm</td>
            <td>{part.thicknessMm} mm</td>
            <td>{part.material?.name ?? 'No disponible'}</td>
            <td>{uiLabel(part.grainDirection)}</td>
            <td title="El contrato de manufactura no define cantidad por pieza">No disponible</td>
            <td><details>
              <summary>Ver origen</summary>
              <dl className="manufacturing-origin">
                <dt>ID de pieza</dt><dd>{origin.partId}</dd>
                <dt>Ruta de ensamblaje</dt><dd>{assemblyPath.length ? assemblyPath.join(' / ') : 'No disponible en el diseño'}</dd>
                <dt>Instancia de módulo</dt><dd>{moduleInstanceName ?? 'No disponible en el diseño'}{origin.moduleInstanceId ? ` · ${origin.moduleInstanceId}` : ''}</dd>
                <dt>Definición de módulo</dt><dd>{moduleDefinitionName ?? 'No disponible en el diseño'}{origin.moduleDefinitionId ? ` · ${origin.moduleDefinitionId}` : ''}</dd>
                <dt>Versión de módulo</dt><dd>{origin.moduleVersionId ?? 'No disponible en el diseño'}</dd>
                <dt>Pieza de origen</dt><dd>{sourceEntityName ?? (origin.sourceModuleEntityId ? `Nombre no disponible · ${origin.sourceModuleEntityId}` : 'No disponible en el diseño')}</dd>
              </dl>
            </details></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="muted manufacturing-data-note">La cantidad por pieza no está definida en el contrato de manufactura. Los datos de origen muestran la jerarquía y referencias disponibles en el diseño.</p>
    </>}
  </section>;
}