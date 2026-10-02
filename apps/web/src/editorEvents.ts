import type { DesignDocument, Id } from '@simbo/design-domain';

export type DesignEvent =
  | { type: 'design.loaded'; designId: Id; source: 'local' | 'demo' | 'external' }
  | { type: 'design.changed'; designId: Id; revision: number }
  | { type: 'design.saved'; designId: Id; target: 'local' | 'api' | 'version' }
  | { type: 'selection.changed'; designId: Id; selection: Id[] };

type DesignEventListener = (event: DesignEvent) => void;

class LocalDesignEventBus {
  private readonly listeners = new Set<DesignEventListener>();

  on(listener: DesignEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: DesignEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export const editorEvents = new LocalDesignEventBus();

export function changedEvent(design: DesignDocument): DesignEvent {
  return { type: 'design.changed', designId: design.id, revision: design.metadata.draftRevision };
}
