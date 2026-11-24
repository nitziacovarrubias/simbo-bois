/** Atajos de CAD que la aplicación realmente maneja. No captura Ctrl+C/V/F ni otros atajos del navegador. */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

const numericTools = new Set(['MOVE', 'ROTATE', 'MEASURE', 'GUIDE', 'PROTRACTOR']);
const editingTools = new Set(['MOVE', 'ROTATE', 'GUIDE', 'PROTRACTOR', 'AXES']);
const letterShortcuts = new Set(['s', 'm', 'r', 't', 'g', 'w', 'p', 'f']);

export function isEditorShortcut(event: KeyLike, activeTool: string): boolean {
  const key = event.key.toLowerCase();
  const mod = Boolean(event.ctrlKey || event.metaKey);
  if (mod) return (key === 'z' && !event.altKey) ||
    (key === 'k' && !event.altKey && !event.shiftKey) ||
    (key === 'p' && Boolean(event.shiftKey) && !event.altKey);
  if (event.altKey) return (key === 'arrowleft' || key === 'arrowright') && !event.shiftKey;
  if (key === 'escape') return true;
  if (key === 'delete' || key === 'backspace') return key === 'delete' ||
    (activeTool === 'SELECT' || numericTools.has(activeTool));
  if (numericTools.has(activeTool) && (key === 'enter' || /^[0-9.,<>+\-/]$/.test(event.key))) return true;
  if (editingTools.has(activeTool) && ['arrowleft', 'arrowup', 'arrowright'].includes(key)) return true;
  if (activeTool === 'MOVE' && key === 'control') return true;
  if (key === 'shift' && editingTools.has(activeTool)) return true;
  if (event.shiftKey) return ['s', 't', 'w'].includes(key);
  return letterShortcuts.has(key);
}

export function isEditorControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role="textbox"], [role="button"], [role="menu"], [role="dialog"]'));
}
