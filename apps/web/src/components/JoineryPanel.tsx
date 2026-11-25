import './JoineryPanel.css';
import { useMemo, useState } from 'react';
import { suggestJointTypes } from '@simbo/joinery-engine';
import { createHardwareDefinition } from '@simbo/hardware-engine';
import { sampleMotionCollisions } from '@simbo/kinematics-engine';
import { useEditor } from '../store';
import { uiLabel } from '../uiLabels';

export default function JoineryPanel() {
  const design = useEditor((state) => state.design);
  const ids = useEditor((state) => state.selectedIds);
  const mutate = useEditor((state) => state.mutate);
  const screw = useEditor((state) => state.screw);
  const dowel = useEditor((state) => state.dowel);
  const hinge = useEditor((state) => state.hinge);
  const slide = useEditor((state) => state.slide);
  const setKinematic = useEditor((state) => state.setKinematic);
  const [type, setType] = useState('SCREW');
  const suggestions = useMemo(
    () =>
      ids.length === 2 &&
      design.parts.some((part) => part.id === ids[0]) &&
      design.parts.some((part) => part.id === ids[1])
        ? suggestJointTypes(design, ids[0]!, ids[1]!)
        : [],
    [design, ids],
  );
  const [customName, setCustomName] = useState('Herraje personalizado');
  const [customCategory, setCustomCategory] = useState<
    'SCREW' | 'DOWEL' | 'HINGE' | 'DRAWER_SLIDE' | 'GENERIC'
  >('GENERIC');
  const [customSize, setCustomSize] = useState(20);
  const [diameter, setDiameter] = useState(4);
  const [length, setLength] = useState(50);
  const [quantity, setQuantity] = useState(3);
  const [spacing, setSpacing] = useState(150);
  const [offset, setOffset] = useState(0);
  const [opening, setOpening] = useState(110);
  const [cup, setCup] = useState(35);
  const [cupDepth, setCupDepth] = useState(12);
  const [extension, setExtension] = useState(430);

  const create = () => {
    if (type === 'SCREW')
      screw({
        diameterMm: diameter,
        lengthMm: length,
        quantity,
        spacingMm: spacing,
        startOffsetMm: offset,
        head: 'COUNTERSUNK',
        orientation: 'AUTO',
        generatePilotHole: true,
        pilotDiameterMm: Math.max(1, diameter * 0.7),
      });
    else if (type === 'DOWEL')
      dowel({
        diameterMm: diameter,
        lengthMm: length,
        quantity,
        spacingMm: spacing,
        startOffsetMm: offset,
        depthAMm: length / 2,
        depthBMm: length / 2,
      });
    else if (type === 'HINGE')
      hinge({
        quantity,
        verticalOffsetMm: offset || 100,
        spacingMm: spacing,
        openingAngleDeg: opening,
        cupDiameterMm: cup,
        cupDepthMm: cupDepth,
        mountingHoleDiameterMm: 5,
      });
    else if (type === 'DRAWER_SLIDE')
      slide({
        lengthMm: length,
        offsetMm: offset,
        clearanceMm: 12.5,
        extensionDistanceMm: extension,
      });
  };
  const selectedNames = ids
    .map((id) => design.parts.find((part) => part.id === id)?.name ?? id)
    .join(' + ');

  return (
    <section className="panel joinery-panel">
      <div className="panel-title">Uniones y herrajes</div>
      <p className="muted">Selecciona dos piezas para configurar su unión.</p>
      <div className="selection-note">{selectedNames || 'Sin selección'}</div>
      {suggestions.length > 0 && (
        <div className="chips">
          Sugerencias:{' '}
          {suggestions.map((suggestion) => (
            <button className="chip-button" key={suggestion} onClick={() => setType(suggestion)}>
              {uiLabel(suggestion)}
            </button>
          ))}
        </div>
      )}
      <label>
        Método
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {['SCREW', 'DOWEL', 'HINGE', 'DRAWER_SLIDE'].map((value) => (
            <option key={value} value={value}>
              {uiLabel(value)}
            </option>
          ))}
        </select>
      </label>
      {(type === 'SCREW' || type === 'DOWEL') && (
        <div className="field-grid">
          <label>
            Diámetro mm
            <input
              type="number"
              value={diameter}
              onChange={(event) => setDiameter(Number(event.target.value))}
            />
          </label>
          <label>
            Longitud mm
            <input
              type="number"
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            />
          </label>
          <label>
            Cantidad
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label>
            Separación mm
            <input
              type="number"
              value={spacing}
              onChange={(event) => setSpacing(Number(event.target.value))}
            />
          </label>
          <label>
            Desplazamiento mm
            <input
              type="number"
              value={offset}
              onChange={(event) => setOffset(Number(event.target.value))}
            />
          </label>
        </div>
      )}
      {type === 'HINGE' && (
        <div className="field-grid">
          <label>
            Cantidad
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label>
            Desplazamiento vertical mm
            <input
              type="number"
              value={offset || 100}
              onChange={(event) => setOffset(Number(event.target.value))}
            />
          </label>
          <label>
            Separación mm
            <input
              type="number"
              value={spacing}
              onChange={(event) => setSpacing(Number(event.target.value))}
            />
          </label>
          <label>
            Ángulo máximo°
            <input
              type="number"
              value={opening}
              onChange={(event) => setOpening(Number(event.target.value))}
            />
          </label>
          <label>
            Cazoleta Ø mm
            <input
              type="number"
              value={cup}
              onChange={(event) => setCup(Number(event.target.value))}
            />
          </label>
          <label>
            Profundidad mm
            <input
              type="number"
              value={cupDepth}
              onChange={(event) => setCupDepth(Number(event.target.value))}
            />
          </label>
        </div>
      )}
      {type === 'DRAWER_SLIDE' && (
        <div className="field-grid">
          <label>
            Longitud mm
            <input
              type="number"
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            />
          </label>
          <label>
            Extensión mm
            <input
              type="number"
              value={extension}
              onChange={(event) => setExtension(Number(event.target.value))}
            />
          </label>
          <label>
            Desplazamiento mm
            <input
              type="number"
              value={offset}
              onChange={(event) => setOffset(Number(event.target.value))}
            />
          </label>
        </div>
      )}
      <button
        disabled={ids.length !== 2}
        onClick={create}
        title="Crear unión con los parámetros seleccionados"
      >
        Crear unión
      </button>
      <div className="panel-subtitle">Uniones del diseño</div>
      {design.joints.map((joint) => (
        <div className="joint-row" key={joint.id}>
          <span>
            <b>{uiLabel(joint.type)}</b> ·{' '}
            {design.parts.find((part) => part.id === joint.partAId)?.name} ↔{' '}
            {design.parts.find((part) => part.id === joint.partBId)?.name}
          </span>
          <small>
            {joint.hardwareInstanceIds.length} herrajes · {joint.machiningFeatureIds.length}{' '}
            mecanizados
          </small>
        </div>
      ))}
      <div className="panel-subtitle">Movimiento</div>
      {design.kinematics.map((kinematic) => {
        const value = useEditor.getState().kinematicValues[kinematic.id] ?? kinematic.currentValue;
        const collisions = sampleMotionCollisions(design, kinematic.id, 8);
        return (
          <div className="card" key={kinematic.id}>
            <div className="row">
              <b>{uiLabel(kinematic.type)}</b>
              <span className="badge">
                {design.parts.find((part) => part.id === kinematic.movingEntityId)?.name}
              </span>
            </div>
            <input
              aria-label="Posición de movimiento"
              type="range"
              min={kinematic.minValue}
              max={kinematic.maxValue}
              value={value}
              onChange={(event) => setKinematic(kinematic.id, Number(event.target.value))}
            />
            <div className="row">
              <button
                className="secondary"
                onClick={() =>
                  animate(kinematic.id, kinematic.minValue, kinematic.maxValue, setKinematic)
                }
              >
                Abrir
              </button>
              <button
                className="secondary"
                onClick={() =>
                  animate(kinematic.id, kinematic.maxValue, kinematic.minValue, setKinematic)
                }
              >
                Cerrar
              </button>
              <span>
                {Math.round(value)} {kinematic.type === 'REVOLUTE' ? '°' : 'mm'}
              </span>
            </div>
            {collisions.length > 0 && <div className="warning">⚠ {collisions[0]?.message}</div>}
          </div>
        );
      })}
      <div className="panel-subtitle">Catálogo de herrajes</div>
      {design.hardwareDefinitions.map((hardware) => (
        <div className="joint-row" key={hardware.id}>
          <span>
            <b>{hardware.name}</b> · {uiLabel(hardware.category)}
          </span>
          <small>
            {Object.entries(hardware.dimensions)
              .map(([key, value]) => `${key}: ${value}`)
              .join(' · ')}
          </small>
        </div>
      ))}
      <div className="card">
        <b>Crear herraje personalizado</b>
        <div className="field-grid">
          <label>
            Nombre
            <input value={customName} onChange={(event) => setCustomName(event.target.value)} />
          </label>
          <label>
            Categoría
            <select
              value={customCategory}
              onChange={(event) => setCustomCategory(event.target.value as typeof customCategory)}
            >
              {['GENERIC', 'SCREW', 'DOWEL', 'HINGE', 'DRAWER_SLIDE'].map((value) => (
                <option key={value} value={value}>
                  {uiLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Medida principal mm
            <input
              type="number"
              value={customSize}
              onChange={(event) => setCustomSize(Number(event.target.value))}
            />
          </label>
        </div>
        <button
          className="secondary"
          onClick={() =>
            mutate((doc) =>
              doc.hardwareDefinitions.push(
                createHardwareDefinition({
                  name: customName,
                  category: customCategory,
                  dimensions: { sizeMm: customSize },
                  colorHex: '#777777',
                  metadata: { custom: true },
                }),
              ),
            )
          }
        >
          Guardar herraje
        </button>
      </div>
    </section>
  );
}

function animate(
  id: string,
  from: number,
  to: number,
  setValue: (id: string, value: number) => void,
) {
  const start = performance.now();
  const duration = 500;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const easing = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    setValue(id, from + (to - from) * easing);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
