import {
  cloneDesign,
  deserializeDesign,
  migrateDesign,
  validateDesignStructural,
  type DesignDocument,
  type Id,
  type ValidationIssue
} from '@simbo/design-domain';
import { createDemoDesign } from './demoDesign';
import { editorEvents, changedEvent } from './editorEvents';
import { useEditor } from './store';

export interface EditorFacadeApi {
  getDesign(): DesignDocument;
  loadDesign(input: string | DesignDocument): void;
  loadDemo(): void;
  getSelection(): Id[];
  selectEntity(id: Id): void;
  focusEntity(id: Id): void;
  undo(): void;
  redo(): void;
  saveLocal(): void;
  validate(): ValidationIssue[];
  readonly events: typeof editorEvents;
}

let previousDesign = useEditor.getState().design;
let previousSelection = useEditor.getState().selectedIds;
useEditor.subscribe(state => {
  if (state.design !== previousDesign) {
    previousDesign = state.design;
    editorEvents.emit(changedEvent(state.design));
  }
  if (state.selectedIds !== previousSelection) {
    previousSelection = state.selectedIds;
    editorEvents.emit({ type: 'selection.changed', designId: state.design.id, selection: [...state.selectedIds] });
  }
});

function resetForLoadedDesign(design: DesignDocument, source: 'local' | 'demo' | 'external'): void {
  useEditor.setState({
    design,
    projectId: design.metadata.projectId,
    selectedIds: [],
    isolatedIds: null,
    activeSectionId: design.sectionPlanes.find(section => section.enabled)?.id,
    activeSceneId: design.activeSceneId,
    selectedSectionId: undefined,
    sectionDraft: undefined,
    undoStack: [],
    redoStack: [],
    saveStatus: source === 'local' ? 'GUARDADO' : 'PENDIENTE'
  });
  editorEvents.emit({ type: 'design.loaded', designId: design.id, source });
}

export const editorFacade: EditorFacadeApi = {
  getDesign: () => cloneDesign(useEditor.getState().design),
  loadDesign: input => resetForLoadedDesign(typeof input === 'string' ? deserializeDesign(input) : migrateDesign(input), 'external'),
  loadDemo: () => resetForLoadedDesign(createDemoDesign(), 'demo'),
  getSelection: () => [...useEditor.getState().selectedIds],
  selectEntity: id => useEditor.getState().select(id),
  focusEntity: id => {
    const state = useEditor.getState();
    state.select(id);
    queueMicrotask(() => useEditor.getState().focusSelected());
  },
  undo: () => useEditor.getState().undo(),
  redo: () => useEditor.getState().redo(),
  saveLocal: () => useEditor.getState().saveLocal(),
  validate: () => validateDesignStructural(useEditor.getState().design),
  events: editorEvents
};
