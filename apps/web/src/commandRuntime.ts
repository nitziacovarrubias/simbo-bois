import type { Id } from '@simbo/design-domain';
import { editorCommands, type EditorCommandContext } from './commands';
import { useEditor } from './store';
import { commandUnavailableReason, publishEditorFeedback } from './editorCommandFeedback';

export function editorCommandContext(targetId?: Id): EditorCommandContext {
  const state = useEditor.getState();
  return targetId ? { ...state, commandTargetId: targetId } : state;
}

export function runEditorCommand(id: string, targetId?: Id): boolean {
  const context = editorCommandContext(targetId);
  const command = editorCommands.get(id);
  if (!command) {
    publishEditorFeedback('La herramienta solicitada no está disponible.', 'error');
    return false;
  }
  if (!editorCommands.canExecute(id, context)) {
    publishEditorFeedback(
      commandUnavailableReason(
        id,
        context.selectedIds.length || Number(Boolean(targetId)),
        context.undoStack?.length,
        context.redoStack?.length,
      ),
    );
    return false;
  }
  try {
    const result = editorCommands.execute(id, context);
    if (result instanceof Promise)
      void result.catch((error) => {
        publishEditorFeedback(
          error instanceof Error ? error.message : 'La operación no pudo completarse.',
          'error',
        );
      });
    return true;
  } catch (error) {
    publishEditorFeedback(
      error instanceof Error ? error.message : 'La operación no pudo completarse.',
      'error',
    );
    return false;
  }
}
