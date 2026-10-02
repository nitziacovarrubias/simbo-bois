import './CommandPalette.css';
import { useEffect, useState } from 'react';
import { editorCommands } from '../commands';
import { useEditor } from '../store';

export default function CommandPalette() {
  const open = useEditor(state => state.commandPaletteOpen);
  const setOpen = useEditor(state => state.setCommandPaletteOpen);
  const selectedCount = useEditor(state => state.selectedIds.length);
  const tool = useEditor(state => state.activeTool);
  const [query, setQuery] = useState('');
  useEffect(() => { if (open) setQuery(''); }, [open]);
  if (!open) return null;
  const results = editorCommands.search(query, useEditor.getState()).slice(0, 18);
  return <div className="command-palette-backdrop" onMouseDown={() => setOpen(false)}>
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="Paleta de comandos" onMouseDown={event => event.stopPropagation()}>
      <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar: Mover, Rotar, Vista frontal, Aislar…" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }} />
      <div className="command-results">{results.map(command => {
        const enabled = editorCommands.canExecute(command.id, useEditor.getState());
        return <button key={command.id} disabled={!enabled} onClick={() => { if (!enabled) return; void editorCommands.execute(command.id, useEditor.getState()); setOpen(false); }}><span>{command.label}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>;
      })}{!results.length && <div className="command-empty">Sin comandos para “{query}”</div>}</div>
      <small>{selectedCount} seleccionados · herramienta {tool}</small>
    </div>
  </div>;
}
