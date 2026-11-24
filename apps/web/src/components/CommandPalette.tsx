import './CommandPalette.css';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Command, Search, X } from 'lucide-react';
import { editorCommands } from '../commands';
import { commandUnavailableReason } from '../editorCommandFeedback';
import { runEditorCommand } from '../commandRuntime';
import { useEditor } from '../store';
import { EXPOSED_EDITOR_COMMANDS } from '../exposedEditorCommands';

export default function CommandPalette() {
  const open = useEditor(state => state.commandPaletteOpen);
  const setOpen = useEditor(state => state.setCommandPaletteOpen);
  const context = useEditor(state => state);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const modalKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); setOpen(false);
      } else if (event.key === 'Tab') {
        const dialog = inputRef.current?.closest('.command-palette');
        if (!dialog) return;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)'));
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
      }
    };
    document.addEventListener('keydown', modalKeys, true);
    return () => { document.removeEventListener('keydown', modalKeys, true);document.body.style.overflow = previousOverflow; priorFocus?.focus(); };
  }, [open]);

  if (!open) return null;
  const results = editorCommands.search(query, context).filter(command => EXPOSED_EDITOR_COMMANDS.has(command.id)).slice(0, 20);
  const canRun = (id: string) => editorCommands.canExecute(id, context);
  const firstAvailable = results.findIndex(command => canRun(command.id));
  const focusIndex = activeIndex < results.length && canRun(results[activeIndex]?.id ?? '') ? activeIndex : firstAvailable;
  const run = (id: string) => { if (runEditorCommand(id)) setOpen(false); };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {event.preventDefault();setOpen(false);return;}
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const start = focusIndex < 0 ? (direction === 1 ? -1 : 0) : focusIndex;
      for (let step = 1; step <= results.length; step++) {
        const index = (start + direction * step + results.length * 2) % results.length;
        if (canRun(results[index]!.id)) {setActiveIndex(index);break;}
      }
    }
    if (event.key === 'Enter' && focusIndex >= 0) {event.preventDefault();run(results[focusIndex]!.id);}
  };

  return <div className="command-palette-backdrop" data-simbo-modal="true" onMouseDown={() => setOpen(false)}>
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="Buscar comandos CAD" onMouseDown={event => event.stopPropagation()}>
      <div className="command-palette-heading"><Command aria-hidden="true"/><strong>Comandos del editor</strong><button type="button" aria-label="Cerrar búsqueda" onClick={() => setOpen(false)}><X aria-hidden="true"/></button></div>
      <div className="command-palette-search"><Search aria-hidden="true"/><input ref={inputRef} type="search" value={query} onChange={event => {setQuery(event.target.value);setActiveIndex(0);}}
        onKeyDown={onKeyDown} placeholder="Buscar herramienta o vista…" aria-label="Buscar comandos"/></div>
      <div className="command-results" role="group" aria-label="Comandos encontrados">{results.map((command,index) => {
        const enabled = canRun(command.id);
        return <button type="button" key={command.id} className={index===focusIndex?'keyboard-active':''} disabled={!enabled}
          title={enabled?command.label:commandUnavailableReason(command.id,context.selectedIds.length,context.undoStack?.length,context.redoStack?.length)}
          onMouseEnter={() => setActiveIndex(index)} onClick={() => run(command.id)}>
          <span>{command.label}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}
        </button>;
      })}{!results.length && <div className="command-empty">Sin resultados para “{query}”</div>}</div>
      <small>{context.selectedIds.length} seleccionados · ↑↓ navegar · Enter ejecutar · Esc cerrar</small>
    </div>
  </div>;
}
