import type { Id } from '@simbo/design-domain';
import { editorCommands, type EditorCommandContext } from './commands';
import { useEditor } from './store';

export function editorCommandContext(targetId?: Id): EditorCommandContext {
  const state = useEditor.getState();
  return targetId ? { ...state, commandTargetId: targetId } : state;
}

export function runEditorCommand(id: string, targetId?: Id): void {
  const context = editorCommandContext(targetId);
  if (!editorCommands.canExecute(id, context)) return;
  void editorCommands.execute(id, context);
}
