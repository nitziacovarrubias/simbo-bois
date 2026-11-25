import { editorCommands, type EditorCommandContext } from './commands';
import { EXPOSED_EDITOR_COMMANDS } from './exposedEditorCommands';

const TOOLBAR = new Set([
  'editor.select',
  'editor.addPart',
  'editor.move',
  'editor.rotate',
  'editor.measure',
  'editor.undo',
  'editor.redo',
  'camera.fitAll',
  'camera.fitRoom',
  'camera.focus',
  'view.top',
  'view.front',
  'view.back',
  'view.left',
  'view.right',
  'view.bottom',
  'view.isometric',
  'view.previous',
  'view.next',
  'view.projection',
]);
const OVERFLOW = new Set([
  'editor.duplicate',
  'editor.group',
  'editor.ungroup',
  'editor.isolate',
  'editor.hide',
  'editor.showAll',
  'camera.focus',
  'palette.toggle',
]);
const CONTEXT_MENU = new Set([
  'editor.edit',
  'editor.enterContext',
  'editor.move',
  'editor.rotate',
  'editor.duplicate',
  'editor.group',
  'editor.ungroup',
  'editor.isolate',
  'editor.hide',
  'editor.material',
  'editor.delete',
  'editor.setAxes',
  'module.saveAssembly',
  'module.makeUnique',
  'module.setOrigin',
  'guide.delete',
  'guide.hide',
  'section.toggle',
  'section.invert',
  'section.look',
  'section.delete',
  'appliance.delete',
  'cutout.create',
  'clearance.toggle',
]);

export interface CommandUiCoverageRow {
  commandId: string;
  label: string;
  shortcut?: string;
  toolbar: boolean;
  overflow: boolean;
  contextMenu: boolean;
  commandPalette: boolean;
  enabled: boolean;
}

export function commandUiCoverage(context: EditorCommandContext): CommandUiCoverageRow[] {
  return editorCommands.list().map((command) => ({
    commandId: command.id,
    label: command.label,
    shortcut: command.shortcut,
    toolbar: TOOLBAR.has(command.id),
    overflow: OVERFLOW.has(command.id),
    contextMenu: CONTEXT_MENU.has(command.id),
    commandPalette: EXPOSED_EDITOR_COMMANDS.has(command.id),
    enabled: editorCommands.canExecute(command.id, context),
  }));
}
