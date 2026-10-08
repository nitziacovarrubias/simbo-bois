import type { CutListResult } from '@simbo/shared-contracts';
import { uiLabel } from '../uiLabels';

export default function ManufacturingPartsTable({ result }: { result: CutListResult }) {
  return <section className="manufacturing-parts" aria-labelledby="manufacturing-parts-title">
    <div className="panel-subtitle" id="manufacturing-parts-title">Lista de piezas</div>
    {result.items.length === 0 ? <div className="empty-state-card" role="status">No hay piezas manufacturables en este diseño.</div> : <>
      <div className="table-wrap">
        <table className="manufacturing-parts-table">
          <caption className="sr-only">Piezas, medidas y trazabilidad de manufactura</caption>
          <thead><tr>
            <th scope="col">Pieza</th><th scope="col">Ancho</th><th scope="col">Alto</th><th scope="col">Grosor</th>
            <th scope="col">Material</th><th scope="col">Veta</th><th scope="col">Cantidad</th><th scope="col">Origen</th>
          </tr></thead>
          <tbody>{result.items.map(item => <tr key={item.id}>
            <td>{item.name}</td>
            <td>{item.widthMm} mm</td>
            <td>{item.heightMm} mm</td>
            <td>{item.thicknessMm} mm</td>
            <td>{item.materialName ?? 'No disponible'}</td>
            <td>{uiLabel(item.grainDirection)}</td>
            <td>{item.quantity}</td>
            <td><details>
              <summary>Ver origen ({item.origins.length})</summary>
              {item.origins.length === 0 ? <span>No hay orígenes disponibles.</span> : item.origins.map((origin, index) => <dl className="manufacturing-origin" key={`${origin.partId}-${index}`}>
                <dt>Pieza</dt><dd>{origin.partName} · {origin.partId}</dd>
                <dt>Ruta de ensamblaje</dt><dd>{origin.assemblyPath.length ? origin.assemblyPath.map(assembly => assembly.name).join(' / ') : 'Sin ensamblaje'}</dd>
                <dt>Instancia de módulo</dt><dd>{origin.moduleInstanceName ?? 'No disponible'}{origin.moduleInstanceId ? ` · ${origin.moduleInstanceId}` : ''}</dd>
                <dt>Definición de módulo</dt><dd>{origin.moduleDefinitionName ?? 'No disponible'}{origin.moduleDefinitionId ? ` · ${origin.moduleDefinitionId}` : ''}</dd>
                <dt>Versión de módulo</dt><dd>{origin.moduleVersionId ?? 'No disponible'}</dd>
                <dt>Pieza de origen</dt><dd>{origin.sourceModuleEntityName ?? 'No disponible'}{origin.sourceModuleEntityId ? ` · ${origin.sourceModuleEntityId}` : ''}</dd>
              </dl>)}</details></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="muted manufacturing-data-note">Se muestra una fila por pieza física existente; no se agrupan piezas ni se genera un despiece.</p>
    </>}
  </section>;
}