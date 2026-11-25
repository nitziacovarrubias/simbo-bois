export interface EditorFeedback {
  id: number;
  message: string;
  variant: 'info' | 'error';
}

type Listener = (feedback: EditorFeedback) => void;
const listeners = new Set<Listener>();
let nextId = 0;

export function publishEditorFeedback(
  message: string,
  variant: EditorFeedback['variant'] = 'info',
): void {
  const feedback = { id: ++nextId, message, variant };
  for (const listener of listeners) listener(feedback);
}

export function onEditorFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const selectionRequired = new Set([
  'editor.duplicate',
  'editor.group',
  'editor.ungroup',
  'editor.delete',
  'editor.hide',
  'editor.hideRest',
  'editor.isolate',
  'camera.focus',
  'editor.material',
  'editor.edit',
  'view.alignFace',
]);

export function commandUnavailableReason(
  id: string,
  selectedCount: number,
  undoCount = 0,
  redoCount = 0,
): string {
  if (id === 'editor.undo' && !undoCount) return 'No hay cambios para deshacer.';
  if (id === 'editor.redo' && !redoCount) return 'No hay cambios para rehacer.';
  if (selectionRequired.has(id) && !selectedCount)
    return 'Selecciona una pieza o módulo para utilizar esta acción.';
  if (id === 'editor.group') return 'Selecciona una o más piezas para crear un conjunto.';
  if (id === 'editor.ungroup') return 'Selecciona un conjunto para desagruparlo.';
  return 'Esta acción no está disponible para la selección actual.';
}
