import './ModuleBuilder.css';
import { useMemo, useState } from 'react';
import {
  createId,
  type Binding,
  type ParameterDefinition,
  type ParameterType,
} from '@simbo/design-domain';
import { useEditor } from '../store';

const parameterTypeLabel: Record<ParameterType, string> = {
  NUMBER: 'Número',
  SELECT: 'Lista',
  BOOLEAN: 'Sí/No',
  COLOR: 'Color',
};

export function ParameterConfigurator() {
  const design = useEditor((state) => state.design);
  const update = useEditor((state) => state.setInstanceParameters);
  const [error, setError] = useState('');
  const change = (id: string, key: string, value: number | string | boolean) => {
    try {
      update(id, { [key]: value });
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Parámetro inválido');
    }
  };
  const detach = useEditor((state) => state.detachInstance);
  if (!design.moduleInstances.length)
    return <p className="muted">Inserta un módulo para configurar sus parámetros públicos.</p>;
  return (
    <div className="instances">
      {error && <p role="alert">{error}</p>}
      {design.moduleInstances.map((instance) => {
        const definition = design.moduleDefinitions.find(
          (value) => value.id === instance.definitionId,
        );
        if (!definition) return null;
        return (
          <div key={instance.id} className="card">
            <div className="row">
              <strong>{instance.name}</strong>
              <span className="badge">
                v{design.moduleVersions.find((value) => value.id === instance.versionId)?.version}
              </span>
              {instance.detached && <span className="badge danger">Independiente</span>}
            </div>
            {definition.parameterDefinitions.map((parameter) => (
              <ParameterField
                key={parameter.id}
                definition={parameter}
                value={instance.parameterValues[parameter.key] ?? parameter.defaultValue}
                onChange={(value) => change(instance.id, parameter.key, value)}
              />
            ))}
            {!instance.detached && (
              <button
                className="secondary"
                onClick={() => detach(instance.id)}
                title="Desvincular esta instancia del módulo original"
              >
                Desvincular
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ParameterField({
  definition,
  value,
  onChange,
}: {
  definition: ParameterDefinition;
  value: number | string | boolean;
  onChange: (value: number | string | boolean) => void;
}) {
  const parameter = definition;
  if (parameter.type === 'BOOLEAN')
    return (
      <label className="toggle">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {parameter.label}
      </label>
    );
  if (parameter.type === 'COLOR')
    return (
      <label>
        {parameter.label}
        <div className="row">
          <input
            aria-label={`Color ${parameter.label}`}
            type="color"
            value={String(value)}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
          <input value={String(value)} onChange={(event) => onChange(event.target.value)} />
        </div>
      </label>
    );
  if (parameter.type === 'SELECT')
    return (
      <label>
        {parameter.label}
        <select
          value={String(value)}
          onChange={(event) =>
            onChange(
              parameter.options?.find((option) => String(option.value) === event.target.value)
                ?.value ?? event.target.value,
            )
          }
        >
          {parameter.options?.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  if (parameter.ui === 'SLIDER')
    return (
      <label>
        {parameter.label}{' '}
        <b>
          {Number(value)} {parameter.unit === 'mm' ? 'mm' : ''}
        </b>
        <input
          type="range"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step ?? 1}
          value={Number(value)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    );
  return (
    <label>
      {parameter.label}
      <input
        type="number"
        min={parameter.min}
        max={parameter.max}
        step={parameter.step ?? 1}
        value={Number(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function ModuleBuilder() {
  const design = useEditor((state) => state.design);
  const ids = useEditor((state) => state.selectedIds);
  const save = useEditor((state) => state.saveSelectionAsModule);
  const insert = useEditor((state) => state.insertModule);
  const [name, setName] = useState('Módulo usuario');
  const [key, setKey] = useState('width');
  const [label, setLabel] = useState('Ancho');
  const [type, setType] = useState<ParameterType>('NUMBER');
  const [target, setTarget] = useState('dimensions.widthMm');
  const [definitions, setDefinitions] = useState<ParameterDefinition[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const selectedParts = useMemo(
    () => ids.map((id) => design.parts.find((part) => part.id === id)).filter(Boolean),
    [ids, design.parts],
  );
  const first = selectedParts[0];

  const addParameter = () => {
    const defaultValue: number | string | boolean =
      type === 'NUMBER'
        ? ((target === 'dimensions.heightMm'
            ? first?.dimensions.heightMm
            : target === 'dimensions.thicknessMm'
              ? first?.dimensions.thicknessMm
              : first?.dimensions.widthMm) ?? 0)
        : type === 'BOOLEAN'
          ? true
          : type === 'COLOR'
            ? '#FFFFFF'
            : 'GENERIC_PANEL';
    const definition: ParameterDefinition = {
      id: createId('param'),
      key,
      label,
      type,
      defaultValue,
      unit: type === 'NUMBER' ? 'mm' : 'none',
      min: type === 'NUMBER' ? 1 : undefined,
      max: type === 'NUMBER' ? 4000 : undefined,
      step: type === 'NUMBER' ? 1 : undefined,
      ui:
        type === 'NUMBER'
          ? 'INPUT'
          : type === 'BOOLEAN'
            ? 'TOGGLE'
            : type === 'COLOR'
              ? 'COLOR'
              : 'SELECT',
      options:
        type === 'SELECT'
          ? [
              { label: 'Genérico', value: 'GENERIC_PANEL' },
              { label: 'Repisa', value: 'SHELF' },
              { label: 'Puerta', value: 'DOOR' },
            ]
          : undefined,
    };
    setDefinitions((value) => [...value, definition]);
    if (first)
      setBindings((value) => [
        ...value,
        {
          id: createId('binding'),
          targetPath: `entities.${first.id}.${target}`,
          enabled: true,
          expression: { type: 'Reference', path: `params.${key}` },
        },
      ]);
  };

  return (
    <section className="panel module-builder">
      <div className="panel-title">Constructor de módulos</div>
      <p className="muted module-intro">
        Convierte una selección de piezas en un módulo reutilizable.
      </p>
      <label>
        Nombre
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="selection-note">{selectedParts.length} piezas seleccionadas</div>
      <div className="panel-subtitle">Parámetro público</div>
      <div className="field-grid">
        <label>
          Clave
          <input value={key} onChange={(event) => setKey(event.target.value.replace(/\s+/g, ''))} />
        </label>
        <label>
          Etiqueta
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Tipo
          <select
            value={type}
            onChange={(event) => {
              const next = event.target.value as ParameterType;
              setType(next);
              setTarget(
                next === 'NUMBER'
                  ? 'dimensions.widthMm'
                  : next === 'SELECT'
                    ? 'semanticRole'
                    : next === 'BOOLEAN'
                      ? 'metadata.publicFlag'
                      : 'metadata.colorHex',
              );
            }}
          >
            {(['NUMBER', 'SELECT', 'BOOLEAN', 'COLOR'] as ParameterType[]).map((value) => (
              <option key={value} value={value}>
                {parameterTypeLabel[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destino
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            {type === 'NUMBER' ? (
              <>
                <option value="dimensions.widthMm">Ancho de pieza</option>
                <option value="dimensions.heightMm">Alto de pieza</option>
                <option value="dimensions.thicknessMm">Grosor de pieza</option>
              </>
            ) : type === 'SELECT' ? (
              <option value="semanticRole">Rol semántico</option>
            ) : type === 'BOOLEAN' ? (
              <option value="metadata.publicFlag">Indicador de metadatos</option>
            ) : (
              <option value="metadata.colorHex">Color visual de pieza</option>
            )}
          </select>
        </label>
      </div>
      <button
        className="secondary"
        disabled={!first}
        onClick={addParameter}
        title="Añadir parámetro vinculado a la pieza seleccionada"
      >
        + Añadir parámetro
      </button>
      <div className="chips">
        {definitions.map((parameter) => (
          <span className="chip" key={parameter.id}>
            {parameter.label} · {parameterTypeLabel[parameter.type]}
          </span>
        ))}
      </div>
      <button
        disabled={!selectedParts.length}
        onClick={() => {
          save(name, definitions, bindings);
          setDefinitions([]);
          setBindings([]);
        }}
        title="Guardar módulo y crear una nueva versión"
      >
        Guardar módulo
      </button>
      <div className="panel-subtitle">Catálogo</div>
      <div className="catalog">
        {design.moduleDefinitions.map((definition) => (
          <button
            className="catalog-item"
            key={definition.id}
            onClick={() => insert(definition.id)}
          >
            <b>{definition.name}</b>
            <small>
              {definition.parameterDefinitions.length} parámetros · {definition.versionIds.length}{' '}
              versiones
            </small>
          </button>
        ))}
      </div>
      <div className="panel-subtitle">Instancias</div>
      <ParameterConfigurator />
    </section>
  );
}
