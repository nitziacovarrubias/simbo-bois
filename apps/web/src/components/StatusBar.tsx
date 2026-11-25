import './StatusBar.css';
import { useMemo } from 'react';
import { ArrowLeft, ArrowRight, Compass, Layers, Plus, ScanLine } from 'lucide-react';
import { DEMO_FOCUSED_UI } from '../demoUiConfig';
import { measurePartsWorld } from '@simbo/editor-engine';
import { useEditor } from '../store';
import { runEditorCommand } from '../commandRuntime';

function toolLabel(tool: ReturnType<typeof useEditor.getState>['activeTool']): string {
  if (tool === 'SELECT') return 'Seleccionar';
  if (tool === 'MOVE') return 'Mover';
  if (tool === 'ROTATE') return 'Rotar';
  if (tool === 'MEASURE') return 'Medir';
  if (tool === 'GUIDE') return 'Guía';
  if (tool === 'PROTRACTOR') return 'Transportador';
  if (tool === 'WALK') return 'Recorrer';
  if (tool === 'LOOK') return 'Mirar';
  return tool;
}

function statusHint(
  tool: ReturnType<typeof useEditor.getState>['activeTool'],
  phase: ReturnType<typeof useEditor.getState>['toolPhase'],
): string {
  if (tool === 'SELECT')
    return 'Clic selecciona · Ctrl/Cmd añade · arrastra vacío para ventana · arrastra entidad para mover';
  if (tool === 'MOVE')
    return phase === 'PICK_REFERENCE'
      ? 'Clic izquierdo: punto base · también puedes arrastrar'
      : 'Mueve el mouse y haz clic para confirmar · Esc cancela';
  if (tool === 'ROTATE')
    return phase === 'PICK_PIVOT'
      ? 'Selecciona pivote'
      : phase === 'PICK_REFERENCE'
        ? 'Selecciona referencia angular'
        : 'Gira con ajuste angular · Enter confirma';
  if (tool === 'MEASURE')
    return phase === 'PICK_SECOND_POINT'
      ? 'Selecciona segundo punto · escribe distancia para crear guía'
      : 'Selecciona primer punto';
  if (tool === 'GUIDE') return 'Selecciona referencia · escribe distancia · Enter';
  if (tool === 'PROTRACTOR')
    return phase === 'PICK_REFERENCE'
      ? 'Selecciona dirección base'
      : 'Selecciona centro · dirección base · ángulo';
  if (tool === 'WALK') return 'WASD mover · arrastra para mirar · Esc salir';
  if (tool === 'LOOK') return 'Arrastra para mirar · Esc salir';
  if (tool === 'AXES') return 'Origen · dirección X · orientación Y/Z';
  if (tool === 'SECTION') return 'Elige X/Y/Z y coloca el plano';
  return 'Esc cancela la operación actual';
}

export default function StatusBar() {
  const design = useEditor((state) => state.design);
  const selected = useEditor((state) => state.selectedIds);
  const tool = useEditor((state) => state.activeTool);
  const toolPhase = useEditor((state) => state.toolPhase);
  const inferenceCandidate = useEditor((state) => state.inferenceCandidate);
  const axisLock = useEditor((state) => state.axisLock);
  const measurementRaw = useEditor((state) => state.measurementRaw);
  const measurementNormalized = useEditor((state) => state.measurementNormalized);
  const measurementError = useEditor((state) => state.measurementError);
  const measureResult = useEditor((state) => state.measureResult);
  const addGuide = useEditor((state) => state.addGuideAtMeasurePoint);
  const exploded = useEditor((state) => state.exploded);
  const setExploded = useEditor((state) => state.setExploded);

  const distance = useMemo(() => {
    if (selected.length !== 2) return null;
    const [firstId, secondId] = selected;
    if (!firstId || !secondId) return null;
    if (
      !design.parts.some((part) => part.id === firstId) ||
      !design.parts.some((part) => part.id === secondId)
    )
      return null;
    return measurePartsWorld(design, firstId, secondId);
  }, [design, selected]);

  return (
    <div className="viewbar" role="status" aria-live="polite">
      <div className="status-context">
        <b>{toolLabel(tool)}</b>
        <span title={statusHint(tool, toolPhase)}>{statusHint(tool, toolPhase)}</span>
      </div>
      <div className="status-signals">
        <span>{inferenceCandidate?.label ?? 'Sin inferencia'}</span>
        {axisLock && <span className="signal-accent">Eje {axisLock.toUpperCase()}</span>}
        <span>{selected.length} sel.</span>
      </div>
      <div className="status-measurement">
        <span className={measurementError ? 'error' : ''}>
          {measurementNormalized ||
            measurementRaw ||
            (measureResult
              ? `${measureResult.distanceMm.toFixed(2)} mm`
              : distance
                ? `${distance.distanceMm.toFixed(2)} mm`
                : '—')}
        </span>
        {measureResult && (
          <button onClick={addGuide} aria-label="Añadir guía" title="Añadir guía">
            <Plus aria-hidden="true" />
          </button>
        )}
        <button
          title="Cambiar proyección"
          aria-label="Cambiar proyección"
          onClick={() => runEditorCommand('view.projection')}
        >
          <Compass aria-hidden="true" />
        </button>
        <button
          title="Vista anterior"
          aria-label="Vista anterior"
          onClick={() => runEditorCommand('view.previous')}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <button
          title="Vista siguiente"
          aria-label="Vista siguiente"
          onClick={() => runEditorCommand('view.next')}
        >
          <ArrowRight aria-hidden="true" />
        </button>
        <button
          className={exploded ? 'active' : ''}
          title="Vista explosionada"
          aria-label="Vista explosionada"
          aria-pressed={exploded}
          onClick={() => setExploded(!exploded)}
        >
          <Layers aria-hidden="true" />
        </button>
        {!DEMO_FOCUSED_UI && (
          <button
            title="Crear sección"
            aria-label="Crear sección"
            onClick={() => runEditorCommand('section.create')}
          >
            <ScanLine aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
