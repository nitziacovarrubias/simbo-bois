import './CADNumericField.css';
import { useEffect, useRef, useState } from 'react';
import { parseCadNumericInput } from '../cadVisualSystem';

export interface CADNumericFieldProps {
  label: string;
  value: number;
  unit?: 'mm' | 'deg' | 'none';
  step?: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}

export default function CADNumericField({
  label,
  value,
  unit = 'none',
  step = 1,
  min,
  max,
  onCommit,
}: CADNumericFieldProps) {
  const [raw, setRaw] = useState(String(Number(value.toFixed(3))));
  const [invalid, setInvalid] = useState(false);
  const skipBlur = useRef(false);
  useEffect(() => {
    if (document.activeElement?.getAttribute('data-cad-field') !== label)
      setRaw(String(Number(value.toFixed(3))));
  }, [label, value]);

  const commit = () => {
    const parsed = parseCadNumericInput(raw, unit);
    if (
      parsed === null ||
      (min !== undefined && parsed < min) ||
      (max !== undefined && parsed > max)
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(parsed);
    setRaw(String(Number(parsed.toFixed(3))));
  };
  const cancel = () => {
    setInvalid(false);
    setRaw(String(Number(value.toFixed(3))));
  };

  return (
    <label className={`cad-numeric-field ${invalid ? 'invalid' : ''}`}>
      <span className="cad-field-label">{label}</span>
      <span className="cad-field-input-wrap">
        <input
          data-cad-field={label}
          inputMode="decimal"
          value={raw}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setRaw(event.target.value);
            setInvalid(false);
          }}
          onBlur={() => {
            if (skipBlur.current) {
              skipBlur.current = false;
              return;
            }
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
              skipBlur.current = true;
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
              skipBlur.current = true;
              event.currentTarget.blur();
            }
            if (
              (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault();
              const current = parseCadNumericInput(raw, unit) ?? value;
              const next = current + (event.key === 'ArrowUp' ? step : -step);
              setRaw(String(Number(next.toFixed(3))));
            }
          }}
          aria-invalid={invalid}
        />
        {unit !== 'none' && <span className="cad-field-unit">{unit === 'deg' ? '°' : unit}</span>}
      </span>
    </label>
  );
}
