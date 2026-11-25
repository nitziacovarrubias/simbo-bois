import './App.css';
import { DEMO_FOCUSED_UI } from './demoUiConfig';
import './demo-ui-polish.css';
import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Box,
  Camera,
  ChevronDown,
  CircleCheck,
  Cuboid,
  DoorOpen,
  FolderTree,
  FolderPlus,
  History,
  Layers3,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Scissors,
  Settings2,
  Wrench,
  ArrowLeft,
} from 'lucide-react';
import Viewport from './components/Viewport';
import EditorCommandNotices from './components/EditorCommandNotices';
import { isEditorShortcut, isEditorControlTarget } from './editorShortcutPolicy';
import Outliner from './components/Outliner';
import Inspector from './components/Inspector';
import ModuleBuilder from './components/ModuleBuilder';
import JoineryPanel from './components/JoineryPanel';
import ManufacturingPanel from './components/ManufacturingPanel';
import ScenesPanel from './components/ScenesPanel';
import HealthPanel from './components/HealthPanel';
import SharedDialog from './components/SharedDialog';
import RoomPanel from './components/RoomPanel';
import LibraryPanel from './components/LibraryPanel';
import ModuleWorkshop from './components/ModuleWorkshop';
import {
  installPortableModule,
  prepareWorkshopModuleVersion,
  updateWorkshopModule,
} from '@simbo/module-engine';
import type { ModuleDefinition, ModuleVersion } from '@simbo/design-domain';
import EditorToolbar from './components/EditorToolbar';
import ViewControls from './components/ViewControls';
import StatusBar from './components/StatusBar';
import ToolOptions from './components/ToolOptions';
import ViewGizmo from './components/ViewGizmo';
import EditContextBreadcrumb from './components/EditContextBreadcrumb';
import CommandPalette from './components/CommandPalette';
import EntityContextMenu from './components/EntityContextMenu';
import PresentationWorkspace from './components/PresentationWorkspace';
import NewProjectDialog from './components/NewProjectDialog';
import ConfirmDialog from './components/ConfirmDialog';
import { autosaveNow, editorInput, useEditor } from './store';
import { apiClient, type AssignableUser, type SessionUser } from './apiClient';
import type { CreateProjectRequest } from '@simbo/shared-contracts';
import type { DesignChangeProposal } from '@simbo/shared-contracts';
import { editorFacade } from './editorFacade';
import './editor-surface.css';
import './editor-usability.css';

type ActivePanel = ReturnType<typeof useEditor.getState>['activePanel'];

export default function App({
  user,
  onProjects,
  onCreateProject,
  projectAssignees = [],
  projectName,
}: {
  user?: SessionUser;
  onProjects?: () => void;
  onCreateProject?: (input: CreateProjectRequest) => Promise<void>;
  projectAssignees?: AssignableUser[];
  projectName?: string;
}) {
  const design = useEditor((state) => state.design);
  const panel = useEditor((state) => state.activePanel);
  const setPanel = useEditor((state) => state.setActivePanel);
  const saveStatus = useEditor((state) => state.saveStatus);
  const saveError = useEditor((state) => state.saveError);
  const [notice, setNotice] = useState('');
  const remoteProject = useEditor((state) => state.remoteProject);
  const displayedProjectName = (remoteProject && projectName) || design.metadata.name;
  const workspace = useEditor((state) => state.workspace);
  const setPanelCollapsed = useEditor((state) => state.setPanelCollapsed);
  const setPanelWidth = useEditor((state) => state.setPanelWidth);
  const createProject = useEditor((state) => state.createProject);
  const createVersion = useEditor((state) => state.createVersion);
  const presentationMode = useEditor((state) => state.presentationMode);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [moduleWorkshopOpen, setModuleWorkshopOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<{
    definition: ModuleDefinition;
    version: ModuleVersion;
    shared?: boolean;
    updatedAt?: string;
  }>();
  const [validationOpen, setValidationOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [versionBusy, setVersionBusy] = useState(false);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');
  const openDemo = async () => {
    setDemoLoading(true);
    setDemoError('');
    try {
      await autosaveNow();
      editorFacade.loadDemo();
      setDemoConfirmOpen(false);
      setNotice('Demostración cargada en modo local');
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : 'No se pudo guardar el diseño actual');
    } finally {
      setDemoLoading(false);
    }
  };
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalObservation, setProposalObservation] = useState('');
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const [createdProposal, setCreatedProposal] = useState<DesignChangeProposal>();

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!remoteProject) return;
    setProposalSubmitting(true);
    setProposalError('');
    setCreatedProposal(undefined);
    try {
      await autosaveNow();
      if (useEditor.getState().remoteProject?.connectionId !== remoteProject.connectionId) {
        throw new Error('El proyecto activo cambió; vuelve a intentarlo');
      }
      const versions = await apiClient.versions(remoteProject.projectId);
      const currentVersion = versions.find((version) => version.current);
      if (!currentVersion) {
        throw new Error('Guarda una versión vigente del diseño antes de registrar una propuesta');
      }
      if (currentVersion.approvalStatus !== 'DRAFT') {
        throw new Error(
          'La versión vigente ya está aprobada; crea una versión nueva antes de proponer cambios',
        );
      }
      const proposal = await apiClient.createProposal(
        remoteProject.projectId,
        currentVersion.id,
        proposalObservation.trim(),
      );
      setCreatedProposal(proposal);
      setProposalObservation('');
      setNotice(`Propuesta registrada · revisión ${currentVersion.revision}`);
    } catch (error) {
      setProposalError(
        error instanceof Error ? error.message : 'No se pudo registrar la propuesta',
      );
    } finally {
      setProposalSubmitting(false);
    }
  };

  useEffect(() => {
    if (saveStatus !== 'PENDIENTE') return;
    const timer = window.setTimeout(() => void autosaveNow().catch(() => {}), 700);
    return () => window.clearTimeout(timer);
  }, [design.metadata.draftRevision, saveStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target instanceof HTMLElement ? event.target : undefined;
      const tag = element?.tagName;
      if (document.querySelector('[data-simbo-modal="true"]')) return;
      if (
        isEditorControlTarget(event.target) ||
        element?.isContentEditable ||
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA'
      )
        return;
      if (!isEditorShortcut(event, useEditor.getState().activeTool)) return;
      event.preventDefault();
      editorInput.keyDown({
        key: event.key,
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        repeat: event.repeat,
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const startResize = (side: 'left' | 'right', event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === 'left' ? workspace.leftPanelWidth : workspace.rightPanelWidth;
    const move = (pointer: PointerEvent) =>
      setPanelWidth(side, startWidth + (pointer.clientX - startX) * (side === 'left' ? 1 : -1));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing-panels');
    };
    document.body.classList.add('resizing-panels');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const openPanel = (next: ActivePanel) => {
    setPanel(next);
    setPanelCollapsed('right', false);
  };
  const leftWidth = workspace.leftPanelCollapsed ? 0 : workspace.leftPanelWidth;
  const rightWidth = workspace.rightPanelCollapsed ? 0 : workspace.rightPanelWidth;

  if (moduleWorkshopOpen)
    return (
      <ModuleWorkshop
        key={editingModule?.definition.id ?? 'new'}
        editing={editingModule}
        canPublish={
          user?.role === 'SUPERVISOR' || (user?.role === 'ARCHITECT' && !editingModule?.shared)
        }
        onClose={() => {
          setModuleWorkshopOpen(false);
          setEditingModule(undefined);
        }}
        onSave={async (definition: ModuleDefinition, version: ModuleVersion, publish: boolean) => {
          const existing = useEditor
            .getState()
            .design.moduleDefinitions.some((item) => item.id === definition.id);
          const prepared = editingModule ? prepareWorkshopModuleVersion(version) : version;
          // First validate the full local mutation before a remote publication.
          if (editingModule) {
            const check = structuredClone(useEditor.getState().design);
            if (!existing)
              installPortableModule(check, editingModule.definition, editingModule.version);
            updateWorkshopModule(check, definition, prepared);
          }
          if (publish) {
            if (editingModule?.shared) {
              if (user?.role !== 'SUPERVISOR' || !editingModule.updatedAt)
                throw new Error('Solo el Supervisor puede actualizar un módulo compartido.');
              await apiClient.updateSharedModule(definition, prepared, editingModule.updatedAt);
            } else await apiClient.publishModule(definition, prepared);
          }
          useEditor.getState().mutate((doc) => {
            if (editingModule && existing) updateWorkshopModule(doc, definition, prepared);
            else if (editingModule) {
              installPortableModule(doc, editingModule.definition, editingModule.version);
              updateWorkshopModule(doc, definition, prepared);
            } else installPortableModule(doc, definition, prepared);
          });
          setModuleWorkshopOpen(false);
          setEditingModule(undefined);
          setNotice(
            `Módulo «${definition.name}» ${editingModule ? 'actualizado' : 'guardado'} en la biblioteca`,
          );
          setPanel('LIBRARY');
          setPanelCollapsed('right', false);
        }}
      />
    );

  if (presentationMode) return <PresentationWorkspace />;

  const shellSizes = {
    '--left-panel-width': `${leftWidth}px`,
    '--right-panel-width': `${rightWidth}px`,
  } as CSSProperties;

  return (
    <div className="app-shell" style={shellSizes}>
      <header className="topbar" aria-label={user ? `Editor SIMBO · ${user.name}` : 'Editor SIMBO'}>
        <div className="brand" aria-label="SIMBO">
          <span className="brand-icon" aria-hidden="true">
            <img
              src="/simbo-logo.svg"
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
            <Layers3 className="brand-logo-fallback" />
          </span>
          <div className="brand-copy">
            <strong>SIMBO</strong>
          </div>
        </div>
        <div
          className="project-name"
          title={`${displayedProjectName} · Revisión ${design.metadata.draftRevision}`}
        >
          <span>{displayedProjectName}</span>
        </div>
        <div className="topbar-actions">
          {user && (
            <span className="topbar-role" title={user.email}>
              {user.name} ·{' '}
              {user.role === 'SUPERVISOR'
                ? 'Supervisor'
                : user.role === 'ARCHITECT'
                  ? 'Arquitecto'
                  : 'Colaborador'}
            </span>
          )}
          <span className="topbar-sr-only" role="status">
            Estado de guardado: {saveStatus}
          </span>
          <button
            type="button"
            className="top-action top-save"
            disabled={saveBusy || saveStatus === 'GUARDANDO'}
            onClick={() => {
              setSaveBusy(true);
              void autosaveNow()
                .catch((error) =>
                  setNotice(error instanceof Error ? error.message : 'No se pudo guardar'),
                )
                .finally(() => setSaveBusy(false));
            }}
            aria-label="Guardar diseño"
            title="Guardar diseño"
          >
            {saveBusy || saveStatus === 'GUARDANDO' ? (
              <span className="simbo-spinner simbo-spinner-inline" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="top-action secondary-dark"
            disabled={versionBusy}
            onClick={() => {
              setVersionBusy(true);
              setNotice('');
              void createVersion()
                .then(() => setNotice('Versión creada'))
                .catch((error) =>
                  setNotice(error instanceof Error ? error.message : 'No se pudo crear la versión'),
                )
                .finally(() => setVersionBusy(false));
            }}
            title="Guardar nueva versión"
            aria-label="Guardar nueva versión"
          >
            {versionBusy ? (
              <span className="simbo-spinner simbo-spinner-inline" aria-hidden="true" />
            ) : (
              <History aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="top-action top-validate"
            onClick={() => setValidationOpen(true)}
            title="Validar diseño"
            aria-label="Validar diseño"
          >
            <CircleCheck aria-hidden="true" />
            <span>Validar diseño</span>
          </button>
          {user?.role === 'ARCHITECT' && remoteProject && (
            <button
              type="button"
              className="top-action top-proposal"
              onClick={() => {
                setProposalError('');
                setCreatedProposal(undefined);
                setProposalObservation('');
                setProposalOpen((value) => !value);
              }}
              title="Registrar propuesta"
              aria-label="Registrar propuesta"
            >
              <MessageSquarePlus aria-hidden="true" />
            </button>
          )}
          {onProjects && (
            <button
              type="button"
              className="top-action top-back"
              onClick={onProjects}
              title="Volver a proyectos"
              aria-label="Volver a proyectos"
            >
              <ArrowLeft aria-hidden="true" />
              <span>Volver a proyectos</span>
            </button>
          )}
        </div>
        {(saveError || notice) && (
          <span className="topbar-notice" role="status" title={saveError || notice}>
            {saveError || notice}
          </span>
        )}
      </header>

      <aside className="left-rail" aria-label="Áreas del editor">
        {!DEMO_FOCUSED_UI && (
          <button
            title="Nuevo proyecto"
            aria-label="Nuevo proyecto"
            onClick={() => setNewProjectOpen(true)}
          >
            <FolderPlus />
          </button>
        )}
        <button
          title="Abrir demo oficial"
          aria-label="Abrir demo oficial"
          onClick={() => {
            setDemoError('');
            setDemoConfirmOpen(true);
          }}
        >
          <Layers3 />
        </button>
        <button
          className={panel === 'INSPECTOR' ? 'active' : ''}
          title="Propiedades"
          aria-label="Propiedades"
          onClick={() => openPanel('INSPECTOR')}
        >
          <Settings2 />
        </button>
        <button
          className={panel === 'LIBRARY' ? 'active' : ''}
          title="Biblioteca"
          aria-label="Biblioteca"
          onClick={() => openPanel('LIBRARY')}
        >
          <Box />
        </button>
        {!DEMO_FOCUSED_UI && (
          <button
            className={panel === 'MODULE' ? 'active' : ''}
            title="Constructor de módulos"
            aria-label="Constructor de módulos"
            onClick={() => openPanel('MODULE')}
          >
            <Cuboid />
          </button>
        )}
        {!DEMO_FOCUSED_UI && (
          <button
            className={panel === 'JOINERY' ? 'active' : ''}
            title="Uniones"
            aria-label="Uniones"
            onClick={() => openPanel('JOINERY')}
          >
            <Wrench />
          </button>
        )}
        <button
          className={panel === 'MANUFACTURING' ? 'active' : ''}
          title="Manufactura"
          aria-label="Manufactura"
          onClick={() => openPanel('MANUFACTURING')}
        >
          <Scissors />
        </button>
        <button
          className={panel === 'SCENES' ? 'active' : ''}
          title="Escenas y secciones"
          aria-label="Escenas y secciones"
          onClick={() => openPanel('SCENES')}
        >
          <Camera />
        </button>
      </aside>

      <aside
        className={`left-panel ${workspace.leftPanelCollapsed ? 'collapsed' : ''}`}
        aria-label="Panel de escena y habitación"
      >
        <div className="panel-shell-heading">
          <span>Diseño y escena</span>
          <button
            type="button"
            aria-label="Cerrar panel izquierdo"
            title="Cerrar panel"
            onClick={() => setPanelCollapsed('left', true)}
          >
            <PanelLeftClose aria-hidden="true" />
          </button>
        </div>
        <nav className="scene-tree" aria-label="Estructura del diseño">
          <details open className="scene-tree-group">
            <summary>
              <ChevronDown className="tree-chevron" size={16} />
              <FolderTree size={17} />
              <span>Elementos del diseño</span>
              <small>{design.parts.length}</small>
            </summary>
            <div className="scene-tree-content">
              <Outliner />
            </div>
          </details>
          <details open className="scene-tree-group">
            <summary>
              <ChevronDown className="tree-chevron" size={16} />
              <DoorOpen size={17} />
              <span>Habitación</span>
              <small>{design.room.openings.length}</small>
            </summary>
            <div className="scene-tree-content">
              <RoomPanel />
            </div>
          </details>
        </nav>
      </aside>

      <main className="viewport-area">
        {proposalOpen && (
          <section className="proposal-panel" aria-labelledby="proposal-title">
            <div className="proposal-panel-heading">
              <h2 id="proposal-title">Registrar propuesta</h2>
              <button
                type="button"
                aria-label="Cerrar formulario de propuesta"
                onClick={() => setProposalOpen(false)}
              >
                ×
              </button>
            </div>
            {proposalError && (
              <p className="proposal-error" role="alert">
                {proposalError}
              </p>
            )}
            {createdProposal && (
              <div className="proposal-confirmation" role="status">
                <strong>Propuesta registrada</strong>
                <p>{createdProposal.observation}</p>
                <small>
                  {createdProposal.author.name} ·{' '}
                  {new Date(createdProposal.createdAt).toLocaleString()}
                </small>
              </div>
            )}
            <form onSubmit={submitProposal}>
              <label htmlFor="proposal-observation">Observación</label>
              <textarea
                id="proposal-observation"
                required
                maxLength={2000}
                rows={4}
                value={proposalObservation}
                onChange={(event) => setProposalObservation(event.target.value)}
                placeholder="Describe el cambio que propones"
              />
              <div className="proposal-panel-actions">
                <button
                  type="button"
                  className="proposal-cancel"
                  onClick={() => setProposalOpen(false)}
                >
                  Cerrar
                </button>
                <button type="submit" disabled={proposalSubmitting}>
                  {proposalSubmitting ? 'Registrando…' : 'Registrar propuesta'}
                </button>
              </div>
            </form>
          </section>
        )}
        {!workspace.leftPanelCollapsed && (
          <div
            className="panel-resizer panel-resizer-left"
            onPointerDown={(event) => startResize('left', event)}
          />
        )}
        {!workspace.rightPanelCollapsed && (
          <div
            className="panel-resizer panel-resizer-right"
            onPointerDown={(event) => startResize('right', event)}
          />
        )}
        <button
          className="panel-toggle panel-toggle-left"
          aria-label={
            workspace.leftPanelCollapsed ? 'Mostrar panel izquierdo' : 'Ocultar panel izquierdo'
          }
          title={
            workspace.leftPanelCollapsed ? 'Mostrar panel izquierdo' : 'Ocultar panel izquierdo'
          }
          onClick={() => setPanelCollapsed('left', !workspace.leftPanelCollapsed)}
        >
          {workspace.leftPanelCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
        <button
          className="panel-toggle panel-toggle-right"
          aria-label={
            workspace.rightPanelCollapsed
              ? 'Mostrar panel de propiedades'
              : 'Ocultar panel de propiedades'
          }
          title={
            workspace.rightPanelCollapsed
              ? 'Mostrar panel de propiedades'
              : 'Ocultar panel de propiedades'
          }
          onClick={() => setPanelCollapsed('right', !workspace.rightPanelCollapsed)}
        >
          {workspace.rightPanelCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
        </button>
        <div className="editor-command-dock">
          <EditorToolbar />
          <ViewControls />
        </div>
        <Viewport />
        <EditContextBreadcrumb />
        <ViewGizmo />
        <ToolOptions />
      </main>

      <CommandPalette />
      <EntityContextMenu />
      <EditorCommandNotices />

      <aside
        className={`right-panel ${workspace.rightPanelCollapsed ? 'collapsed' : ''}`}
        aria-label="Panel de herramientas y propiedades"
      >
        <div className="panel-shell-heading">
          <span>
            {panel === 'INSPECTOR'
              ? 'Propiedades'
              : panel === 'MODULE'
                ? 'Módulos'
                : panel === 'JOINERY'
                  ? 'Uniones'
                  : panel === 'MANUFACTURING'
                    ? 'Manufactura'
                    : panel === 'SCENES'
                      ? 'Escenas'
                      : panel === 'HEALTH'
                        ? 'Validación'
                        : 'Biblioteca'}
          </span>
          <button
            type="button"
            aria-label="Cerrar panel derecho"
            title="Cerrar panel"
            onClick={() => setPanelCollapsed('right', true)}
          >
            <PanelRightClose aria-hidden="true" />
          </button>
        </div>
        {panel === 'INSPECTOR' && <Inspector />}
        {panel === 'MODULE' && <ModuleBuilder />}
        {panel === 'JOINERY' && <JoineryPanel />}
        {panel === 'MANUFACTURING' && <ManufacturingPanel />}
        {panel === 'SCENES' && <ScenesPanel />}
        {panel === 'HEALTH' && <HealthPanel />}
        {panel === 'LIBRARY' && (
          <LibraryPanel
            onCreateModule={() => {
              setEditingModule(undefined);
              setModuleWorkshopOpen(true);
            }}
            onEditModule={(definition, version, shared, updatedAt) => {
              setEditingModule({ definition, version, shared, updatedAt });
              setModuleWorkshopOpen(true);
            }}
          />
        )}
      </aside>
      <StatusBar />
      {validationOpen && (
        <SharedDialog
          title="Validación del diseño"
          description="Incidencias detectadas en el modelo actual."
          width="wide"
          onClose={() => setValidationOpen(false)}
          footer={
            <button
              type="button"
              className="simbo-dialog-button simbo-dialog-button--primary"
              onClick={() => setValidationOpen(false)}
            >
              Cerrar
            </button>
          }
        >
          <HealthPanel
            expandAll
            onIssueSelect={() => {
              setValidationOpen(false);
              setPanel('INSPECTOR');
              setPanelCollapsed('right', false);
            }}
          />
        </SharedDialog>
      )}
      {newProjectOpen && (
        <NewProjectDialog
          assignees={projectAssignees}
          currentUserId={user?.id}
          localOnly={!onCreateProject}
          onCancel={() => setNewProjectOpen(false)}
          onSave={async (input) => {
            if (onCreateProject) await onCreateProject(input);
            else createProject(input.name);
            setNewProjectOpen(false);
          }}
        />
      )}
      {demoConfirmOpen && (
        <ConfirmDialog
          title="Abrir demostración"
          confirmLabel={remoteProject ? 'Guardar y abrir' : 'Abrir demostración'}
          message={
            remoteProject
              ? 'Se guardarán los cambios del proyecto antes de cambiar al diseño de demostración en modo local.'
              : 'La demostración reemplazará el diseño local visible. Exporta una copia del diseño actual si deseas conservarlo.'
          }
          onCancel={() => setDemoConfirmOpen(false)}
          onConfirm={openDemo}
          busy={demoLoading}
          error={demoError}
        />
      )}
    </div>
  );
}
