import './ManufacturingPanel.css';
import { useMemo } from 'react';
import { useEditor } from '../store';
import type { EdgeBanding } from '@simbo/design-domain';
import { CutListResultSchema, type CutListResult } from '@simbo/shared-contracts';
import { uiLabel } from '../uiLabels';
import { getPartOrigin } from '@simbo/manufacturing-engine';
import ManufacturingPartsTable from './ManufacturingPartsTable';

export default function ManufacturingPanel() {
  const design = useEditor((state) => state.design);
  const data = useMemo(() => useEditor.getState().manufacturing(), [design]);
  const cutListResult = useMemo<CutListResult>(() => {
    const assemblies = new Map(design.assemblies.map((assembly) => [assembly.id, assembly]));
    const moduleInstances = new Map(
      design.moduleInstances.map((instance) => [instance.id, instance]),
    );
    const moduleDefinitions = new Map(
      design.moduleDefinitions.map((definition) => [definition.id, definition]),
    );
    const moduleVersions = new Map(design.moduleVersions.map((version) => [version.id, version]));
    return CutListResultSchema.parse({
      items: data.parts.map((part) => {
        const origin = getPartOrigin(design, part.id);
        const version = origin.moduleVersionId
          ? moduleVersions.get(origin.moduleVersionId)
          : undefined;
        const sourceEntity =
          version && origin.sourceModuleEntityId
            ? (version.snapshot.parts.find(
                (candidate) => candidate.id === origin.sourceModuleEntityId,
              ) ??
              version.snapshot.assemblies.find(
                (candidate) => candidate.id === origin.sourceModuleEntityId,
              ))
            : undefined;
        return {
          id: part.id,
          name: part.name,
          widthMm: part.widthMm,
          heightMm: part.heightMm,
          thicknessMm: part.thicknessMm,
          materialName: part.material?.name,
          grainDirection: part.grainDirection,
          quantity: 1,
          origins: [
            {
              partId: origin.partId,
              partName: part.name,
              assemblyPath: origin.assemblyPath.map((id) => ({
                id,
                name: assemblies.get(id)?.name ?? id,
              })),
              moduleInstanceId: origin.moduleInstanceId,
              moduleInstanceName: origin.moduleInstanceId
                ? moduleInstances.get(origin.moduleInstanceId)?.name
                : undefined,
              moduleDefinitionId: origin.moduleDefinitionId,
              moduleDefinitionName: origin.moduleDefinitionId
                ? moduleDefinitions.get(origin.moduleDefinitionId)?.name
                : undefined,
              moduleVersionId: origin.moduleVersionId,
              sourceModuleEntityId: origin.sourceModuleEntityId,
              sourceModuleEntityName: sourceEntity?.name,
            },
          ],
        };
      }),
    });
  }, [data.parts, design]);
  return (
    <section className="panel manufacturing">
      <div className="panel-title">Datos de manufactura</div>
      <div className="stats">
        <div>
          <b>{data.summary.partCount}</b>
          <span>Piezas</span>
        </div>
        <div>
          <b>{data.summary.hardwareCount}</b>
          <span>Herrajes</span>
        </div>
        <div>
          <b>{data.summary.machiningCount}</b>
          <span>Mecanizados</span>
        </div>
      </div>
      <p className="muted manufacturing-note">Piezas y herrajes del diseño actual.</p>
      <ManufacturingPartsTable result={cutListResult} />
      <div className="panel-subtitle">Detalles de manufactura</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Pieza</th>
              <th scope="col">Rol</th>
              <th scope="col">Canteado</th>
              <th scope="col">Mecanizado</th>
            </tr>
          </thead>
          <tbody>
            {data.parts.map((part) => (
              <tr key={part.id}>
                <td>{part.name}</td>
                <td>{uiLabel(part.semanticRole)}</td>
                <td>
                  {Object.entries(part.edgeBanding as EdgeBanding)
                    .filter(([, value]) => value.mode === 'EDGE_BAND')
                    .map(([key]) => key)
                    .join(', ') || '—'}
                </td>
                <td>{part.machiningFeatures.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-subtitle">Lista de herrajes</div>
      {data.hardware.map((hardware) => (
        <div
          key={`${hardware.definitionId}${JSON.stringify(hardware.parameters)}`}
          className="joint-row"
        >
          <span>
            {hardware.quantity} × <b>{hardware.name}</b>
          </span>
          <small>
            {Object.entries(hardware.parameters)
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join(' · ')}
          </small>
        </div>
      ))}
    </section>
  );
}
