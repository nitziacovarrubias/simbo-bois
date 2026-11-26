import { useEffect, useState, useRef, type FormEvent } from 'react';
import { createEmptyDesign } from '@simbo/design-domain';

import type {
  CuttingListResponse,
  DesignChangeProposal,
  ProjectStage,
} from '@simbo/shared-contracts';
import { exportCuttingListXlsx } from './cuttingListExcel';

import App from './App';

import NewProjectDialog, { PROJECT_TYPE_LABELS } from './components/NewProjectDialog';
import ClientDialog from './components/ClientDialog';
import UserAccountDialog from './components/UserAccountDialog';
import {
  HomeDashboard,
  ClientsBoard,
  SettingsBoard,
  ProjectOverview,
  ProjectClientInfo,
  StageFlag,
  STAGE_OPTIONS,
  STAGE_LABELS,
} from './components/WorkspaceSections';
import CollaboratorsDialog from './components/CollaboratorsDialog';
import CollaboratorViewer from './components/CollaboratorViewer';
import FeedbackToast from './components/FeedbackToast';
import DesignThumbnail from './components/DesignThumbnail';
import {
  ArrowLeft,
  FolderOpen,
  Info,
  MapPin,
  Pencil,
  Settings,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { CreateProjectRequest } from '@simbo/shared-contracts';

import CuttingListAuthorizationPanel from './components/CuttingListAuthorizationPanel';

import {
  apiClient,
  type AssignableUser,
  type CollaboratorUser,
  type DesignResponse,
  type ProjectSummary,
  type ClientRecord,
  type ClientInput,
  type UserAccount,
  type NewUserInput,
  type SessionUser,
  type VersionSummary,
} from './apiClient';

import { editorFacade } from './editorFacade';

import { autosaveNow, useEditor } from './store';

import QuotationPanel from './components/QuotationPanel';

import './ProjectWorkspace.css';
import './management-workspace.css';

type ActionIconName =
  | 'plus'
  | 'refresh'
  | 'logout'
  | 'open'
  | 'search'
  | 'check'
  | 'download'
  | 'excel'
  | 'monitor'
  | 'login';

function ActionIcon({ name }: { name: ActionIconName }) {
  const shared = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      {...shared}
    >
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'refresh' && (
        <>
          <path d="M20 11a8 8 0 0 0-14.9-3.5L3 10" />
          <path d="M3 4v6h6" />
          <path d="M4 13a8 8 0 0 0 14.9 3.5L21 14" />
          <path d="M21 20v-6h-6" />
        </>
      )}
      {name === 'logout' && (
        <>
          <path d="M10 17l5-5-5-5M15 12H3" />
          <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />
        </>
      )}
      {name === 'open' && (
        <>
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="m10 11 3 3 4-4" />
        </>
      )}
      {name === 'search' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      )}
      {name === 'check' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        </>
      )}
      {name === 'download' && (
        <>
          <path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" />
        </>
      )}
      {name === 'excel' && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="m8 9 4 6m0-6-4 6M15 8v8" />
        </>
      )}
      {name === 'monitor' && (
        <>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 22h8M12 18v4" />
        </>
      )}
      {name === 'login' && (
        <>
          <path d="M14 7l5 5-5 5M19 12H8" />
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" />
        </>
      )}
    </svg>
  );
}

function CuttingListTable({
  result,
  projectName,
}: {
  result: CuttingListResponse;
  projectName: string;
}) {
  return (
    <section className="cutting-board" aria-label="Lista de despiece">
      <div className="cutting-board-toolbar">
        <div className="cutting-board-heading">
          <h3>Lista de despiece</h3>
          <span>
            Revisión {result.source.revision} · {result.rows.length} conceptos
          </span>
        </div>
        <button
          type="button"
          className="project-btn project-btn--excel"
          onClick={() => exportCuttingListXlsx(result, projectName)}
          disabled={result.rows.length === 0}
          title="Descargar la lista de despiece y sus orígenes en formato Excel (.xlsx)"
        >
          <ActionIcon name="excel" /> Exportar Excel
        </button>
      </div>
      <div className="table-wrap cutting-table-wrap">
        <table className="manufacturing-parts-table cutting-table">
          <caption className="cutting-table-caption">
            Despiece del proyecto {projectName}, revisión {result.source.revision}
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Concepto</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Material</th>
              <th scope="col">
                Medidas <small>ancho × alto (mm)</small>
              </th>
              <th scope="col">
                Grosor <small>mm</small>
              </th>
              <th scope="col">Veta</th>
              <th scope="col">Orígenes</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => (
              <tr key={row.id}>
                <td className="cutting-table-number">{index + 1}</td>
                <td className="cutting-table-concept">{row.name}</td>
                <td className="cutting-table-quantity">{row.quantity}</td>
                <td>{row.material.name}</td>
                <td className="cutting-table-dimensions">
                  {row.widthMm} × {row.heightMm}
                </td>
                <td>{row.thicknessMm}</td>
                <td>{row.grainDirection}</td>
                <td className="cutting-table-origins">
                  <details>
                    <summary>Ver orígenes ({row.origins.length})</summary>
                    <ul>
                      {row.origins.map((origin, originIndex) => (
                        <li key={`${origin.partId}-${originIndex}`}>
                          <strong>Pieza:</strong> {origin.partId}
                          {origin.moduleInstanceId ? (
                            <>
                              {' '}
                              · <strong>Módulo:</strong> {origin.moduleInstanceId}
                            </>
                          ) : null}
                          {origin.assemblyPath.length > 0 ? (
                            <>
                              {' '}
                              · <strong>Ensambles:</strong> {origin.assemblyPath.join(' / ')}
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cutting-board-note">
        Datos del diseño aprobado. Canteado y comentarios no disponibles.
      </p>
    </section>
  );
}

export default function ProjectWorkspace() {
  const [user, setUser] = useState<SessionUser | null>(null);

  const [screen, setScreen] = useState<
    'HOME' | 'PROJECTS' | 'DETAILS' | 'CLIENTS' | 'SETTINGS' | 'EDITOR' | 'VIEWER'
  >('HOME');
  const [detailTab, setDetailTab] = useState<'GENERAL' | 'CLIENT' | 'VERSIONS'>('GENERAL');
  const [readonlyProject, setReadonlyProject] = useState<{
    project: ProjectSummary;
    response: DesignResponse;
  } | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string>();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [clientDialog, setClientDialog] = useState<ClientRecord | 'NEW' | null>(null);
  const [accountDialog, setAccountDialog] = useState(false);

  const [newProject, setNewProject] = useState(false);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  const [collaboratorUsers, setCollaboratorUsers] = useState<CollaboratorUser[]>([]);
  const [assigning, setAssigning] = useState<ProjectSummary | null>(null);
  const [editing, setEditing] = useState<ProjectSummary | null>(null);
  const [success, setSuccess] = useState('');

  const [review, setReview] = useState<ProjectSummary | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [proposalHistory, setProposalHistory] = useState<Record<string, DesignChangeProposal[]>>(
    {},
  );
  const [expandedProposalVersionId, setExpandedProposalVersionId] = useState<string>();
  const [proposalLoadingVersionId, setProposalLoadingVersionId] = useState<string>();
  const [proposalHistoryError, setProposalHistoryError] = useState('');
  const proposalRequest = useRef(0);

  const remote = useEditor((state) => state.remoteProject);

  const [cuttingResult, setCuttingResult] = useState<CuttingListResponse | null>(null);

  const [cuttingLoading, setCuttingLoading] = useState(false);

  const [cuttingError, setCuttingError] = useState('');
  const [authVersion, setAuthVersion] = useState<VersionSummary | null>(null);
  const [quotationVersion, setQuotationVersion] = useState<VersionSummary | null>(null);
  const [showQuotations, setShowQuotations] = useState(false);
  const cuttingRequest = useRef(0);
  const cuttingPending = useRef(false);

  const clearCuttingList = () => {
    cuttingRequest.current += 1;
    cuttingPending.current = false;
    setCuttingResult(null);
    setCuttingError('');
    setCuttingLoading(false);
    setAuthVersion(null);
    setQuotationVersion(null);
    setShowQuotations(false);
  };

  useEffect(
    () => () => {
      cuttingRequest.current += 1;
    },
    [],
  );

  const list = async (actor: SessionUser | null = user) => {
    if (!actor) return;
    const [items, people, collaborators, clientList] = await Promise.all([
      apiClient.projects(),
      actor.role === 'COLLABORATOR' ? Promise.resolve([]) : apiClient.assignees(),
      actor.role === 'SUPERVISOR' ? apiClient.availableCollaborators() : Promise.resolve([]),
      apiClient.clients(),
    ]);
    setProjects(items);
    setAssignees(people);
    setCollaboratorUsers(collaborators);
    setClients(clientList);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo completar la operación');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;

    if (apiClient.hasSession())
      apiClient
        .me()
        .then(async (actor) => {
          if (!active) return;
          setUser(actor);
          const [items, people, collaborators, clientList] = await Promise.all([
            apiClient.projects(),
            actor.role === 'COLLABORATOR' ? Promise.resolve([]) : apiClient.assignees(),
            actor.role === 'SUPERVISOR' ? apiClient.availableCollaborators() : Promise.resolve([]),
            apiClient.clients(),
          ]);
          if (active) {
            setProjects(items);
            setAssignees(people);
            setCollaboratorUsers(collaborators);
            setClients(clientList);
          }
        })
        .catch((error) => {
          if (active)
            setError(error instanceof Error ? error.message : 'No se pudo recuperar la sesión');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    else setLoading(false);

    const expired = () => {
      clearCuttingList();
      setUser(null);
      setScreen('HOME');
      setReview(null);
      setError('La sesión venció. Inicia sesión nuevamente.');
    };

    window.addEventListener('simbo.session.expired', expired);

    return () => {
      active = false;
      window.removeEventListener('simbo.session.expired', expired);
    };
  }, []);

  const login = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const actor = await apiClient.login(email, password);
      setPassword('');
      setUser(actor);
      await list(actor);
    });
  };

  const open = async (project: ProjectSummary) => {
    clearCuttingList();
    if (!user) throw new Error('Inicia sesión');
    const response = await apiClient.design(project.id);
    if (user.role === 'COLLABORATOR') {
      setReadonlyProject({ project, response });
      setReview(null);
      setScreen('VIEWER');
      return;
    }
    editorFacade.loadProject(project.id, user.id, response);
    setActiveProjectName(project.name);
    setReview(null);
    setScreen('EDITOR');
  };

  const create = async (input: CreateProjectRequest) => {
    const project = await apiClient.createProject(input);
    setProjects((current) => [project, ...current]);
    setNewProject(false);
    // Si la carga del editor falla, conservar el proyecto creado en el listado.
    try {
      await open(project);
    } catch (cause) {
      setError(
        `Proyecto creado, pero no se pudo abrir: ${cause instanceof Error ? cause.message : 'Error desconocido'}`,
      );
    }
  };
  const updateProject = async (input: CreateProjectRequest) => {
    if (!editing) return;
    const project = await apiClient.updateProject(editing.id, input);
    setProjects((current) =>
      current.map((item) => (item.id === project.id ? { ...item, ...project } : item)),
    );
    setReview((current) => (current?.id === project.id ? { ...current, ...project } : current));
    setEditing(null);
    setSuccess('Datos del proyecto actualizados');
  };

  const back = () =>
    void run(async () => {
      clearCuttingList();
      if (user?.role !== 'COLLABORATOR') await autosaveNow();
      if (user) await list(user);
      setReadonlyProject(null);
      setReview(null);
      setScreen('PROJECTS');
    });

  const local = () => {
    clearCuttingList();

    useEditor.setState({ remoteProject: undefined, projectId: undefined });
    setActiveProjectName(undefined);

    const raw = localStorage.getItem('simbo.design.v1');
    editorFacade.loadDesign(raw ?? createEmptyDesign('Proyecto local'));
    setScreen('EDITOR');
    setError('');
  };

  const showVersions = async (project: ProjectSummary) => {
    clearCuttingList();

    proposalRequest.current += 1;

    setReview(null);

    setVersions([]);

    setProposalHistory({});

    setExpandedProposalVersionId(undefined);

    setProposalLoadingVersionId(undefined);

    setProposalHistoryError('');

    const items = await apiClient.versions(project.id);

    setVersions(items);

    setReview(project);
    setDetailTab('GENERAL');
    setScreen('DETAILS');
  };

  const toggleProposalHistory = async (version: VersionSummary) => {
    if (!review) return;

    if (expandedProposalVersionId === version.id) {
      setExpandedProposalVersionId(undefined);

      return;
    }

    setExpandedProposalVersionId(version.id);

    setProposalHistoryError('');

    if (Object.prototype.hasOwnProperty.call(proposalHistory, version.id)) return;

    const requestId = ++proposalRequest.current;

    const projectId = review.id;

    setProposalLoadingVersionId(version.id);

    try {
      const items = await apiClient.listProposals(projectId, version.id);

      if (requestId !== proposalRequest.current) return;

      setProposalHistory((current) => ({ ...current, [version.id]: items }));
    } catch (error) {
      if (requestId !== proposalRequest.current) return;

      setProposalHistoryError(
        error instanceof Error ? error.message : 'No se pudieron cargar las propuestas',
      );
    } finally {
      if (requestId === proposalRequest.current) setProposalLoadingVersionId(undefined);
    }
  };

  const approve = async (version: VersionSummary) => {
    clearCuttingList();

    if (!review) return;

    const current = await apiClient.design(review.id);
    await apiClient.approve(review.id, version.id, current.revision);
    await showVersions(review);
    setDetailTab('VERSIONS');
  };

  const generate = async (version: VersionSummary) => {
    if (busy || cuttingPending.current || !review || !user) return;

    if (user.role !== 'SUPERVISOR' || !version.current || version.approvalStatus !== 'APPROVED')
      return;

    const projectId = review.id;

    const requestId = ++cuttingRequest.current;

    cuttingPending.current = true;

    setCuttingLoading(true);

    setCuttingError('');

    setCuttingResult(null);

    try {
      const result = await apiClient.generateCuttingList(projectId, version.id);

      if (requestId !== cuttingRequest.current) return;

      if (
        result.source.projectId !== projectId ||
        result.source.designVersionId !== version.id ||
        result.source.revision !== version.revision
      ) {
        throw new Error('El resultado no corresponde a la versión seleccionada');
      }

      setCuttingResult(result);
      setAuthVersion(version);
    } catch (error) {
      if (requestId !== cuttingRequest.current) return;

      setCuttingError(error instanceof Error ? error.message : 'No se pudo generar el despiece');
    } finally {
      if (requestId === cuttingRequest.current) {
        cuttingPending.current = false;

        setCuttingLoading(false);
      }
    }
  };

  const updateStage = async (stage: ProjectStage) => {
    if (!review || user?.role !== 'SUPERVISOR') return;
    const updated = await apiClient.setProjectStage(review.id, stage);
    setReview((current) => (current ? { ...current, ...updated } : current));
    setProjects((current) =>
      current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    );
    setSuccess('Etapa del proyecto actualizada');
  };
  const saveClient = async (input: ClientInput) => {
    if (clientDialog && clientDialog !== 'NEW')
      await apiClient.updateClient(clientDialog.id, input);
    else await apiClient.createClient(input);
    setClientDialog(null);
    setSuccess('Cliente guardado correctamente');
    await list();
    if (review) {
      const items = await apiClient.projects();
      setReview(items.find((item) => item.id === review.id) || null);
    }
  };
  const saveAccount = async (input: NewUserInput) => {
    await apiClient.createUser(input);
    setAccountDialog(false);
    setSuccess('Cuenta creada correctamente');
    setAccounts(await apiClient.users());
    await list();
  };
  const toggleAccount = async (account: UserAccount) => {
    if (
      !window.confirm(`${account.active ? 'Desactivar' : 'Activar'} la cuenta de ${account.name}?`)
    )
      return;
    await run(async () => {
      await apiClient.updateUserAccess(account.id, !account.active);
      setAccounts(await apiClient.users());
      await list();
      setSuccess('Acceso actualizado');
    });
  };
  const navigate = (target: 'HOME' | 'PROJECTS' | 'CLIENTS' | 'SETTINGS') => {
    clearCuttingList();
    setReview(null);
    setScreen(target);
    setError('');
    if (target === 'SETTINGS' && user?.role === 'SUPERVISOR') {
      setAccountsLoading(true);
      void apiClient
        .users()
        .then(setAccounts)
        .catch((e) =>
          setError(e instanceof Error ? e.message : 'No se pudieron cargar las cuentas'),
        )
        .finally(() => setAccountsLoading(false));
    }
    if (target === 'CLIENTS')
      void apiClient
        .clients()
        .then(setClients)
        .catch((e) =>
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes'),
        );
  };

  if (loading)
    return (
      <main className="project-workspace">
        <p role="status" className="simbo-global-progress">
          <span className="simbo-spinner" aria-hidden="true" /> Cargando sesión…
        </p>
      </main>
    );

  if (screen === 'VIEWER' && readonlyProject)
    return (
      <CollaboratorViewer
        project={readonlyProject.project}
        response={readonlyProject.response}
        user={user!}
        onBack={back}
      />
    );

  if (screen === 'EDITOR')
    return (
      <App
        user={remote ? (user ?? undefined) : undefined}
        onProjects={back}
        onCreateProject={remote ? create : undefined}
        projectAssignees={assignees}
        projectName={activeProjectName}
      />
    );

  if (!user)
    return (
      <main className="simbo-login-page">
        <section className="simbo-login-brand" aria-label="Bienvenida a SIMBO">
          <div className="simbo-login-logo-row">
            <img src="/simbo-logo.svg" alt="SIMBO" className="login-brand-logo" />

            <span>SIMBO</span>
          </div>

          <h1>
            Bienvenido al
            <br />
            inicio de sesión.
          </h1>

          <p>Ingresa tus datos para poder tener acceso a SIMBO.</p>
        </section>

        <section className="simbo-login-card" aria-labelledby="login-title">
          <div className="simbo-login-card-header">
            <h2 id="login-title">Login</h2>
          </div>

          {error && (
            <p className="project-error simbo-login-error" role="alert">
              {error}
            </p>
          )}

          <form className="simbo-login-form" onSubmit={login}>
            <label>
              Correo o nombre de usuario
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="usuario o correo@ejemplo.com"
              />
            </label>

            <label>
              Contraseña
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="miContraseña"
              />
            </label>

            <div className="simbo-login-divider" />

            <div className="simbo-login-submit-row">
              <button disabled={busy} type="submit">
                <ActionIcon name="login" />{' '}
                {busy ? <span className="simbo-spinner" aria-hidden="true" /> : null}
                {busy ? 'Ingresando…' : 'Iniciar sesión'}
              </button>
            </div>
          </form>

          <button className="simbo-local-link" type="button" onClick={local}>
            <ActionIcon name="monitor" /> Abrir editor local
          </button>
        </section>
      </main>
    );

  return (
    <main className="project-workspace">
      <header className="project-navbar">
        <div className="project-navbar-brand">
          <img src="/simbo-logo.svg" alt="" />
          <span>SIMBO</span>
        </div>
        <nav className="project-navbar-nav" aria-label="Navegación principal">
          {(
            [
              ['HOME', 'INICIO'],
              ['PROJECTS', 'PROYECTOS'],
              ['CLIENTS', 'CLIENTES'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={
                screen === key || (key === 'PROJECTS' && screen === 'DETAILS') ? 'page' : undefined
              }
              className={
                screen === key || (key === 'PROJECTS' && screen === 'DETAILS')
                  ? 'project-navbar-active'
                  : ''
              }
              onClick={() => navigate(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="simbo-nav-account">
          <span>
            {user.name}{' '}
            <small>
              {user.role === 'SUPERVISOR'
                ? 'Supervisor'
                : user.role === 'ARCHITECT'
                  ? 'Arquitecto'
                  : 'Colaborador'}
            </small>
          </span>
          <button
            type="button"
            className={screen === 'SETTINGS' ? 'is-active' : ''}
            onClick={() => navigate('SETTINGS')}
            aria-label="Configuración y perfil"
            title="Configuración"
          >
            <Settings size={23} />
          </button>
        </div>
      </header>

      <div className="project-workspace-content">
        {(busy || cuttingLoading) && (
          <div role="status" aria-live="polite" className="simbo-global-progress">
            <span className="simbo-spinner" aria-hidden="true" />
            {cuttingLoading ? 'Generando despiece…' : 'Procesando solicitud…'}
          </div>
        )}
        {error && (
          <p className="project-error" role="alert">
            {error}
          </p>
        )}
        <FeedbackToast message={success} onDismiss={() => setSuccess('')} />

        {screen === 'HOME' && (
          <HomeDashboard
            projects={projects}
            user={user}
            onProjects={() => navigate('PROJECTS')}
            onDetails={(p) => void run(() => showVersions(p))}
          />
        )}
        {screen === 'CLIENTS' && (
          <ClientsBoard
            clients={clients}
            user={user}
            onCreate={() => setClientDialog('NEW')}
            onEdit={setClientDialog}
          />
        )}
        {screen === 'SETTINGS' && (
          <SettingsBoard
            user={user}
            accounts={accounts}
            accountsLoading={accountsLoading}
            onCreate={() => setAccountDialog(true)}
            onToggle={(a) => void toggleAccount(a)}
            onLogout={() =>
              void run(async () => {
                clearCuttingList();
                try {
                  await apiClient.logout();
                } finally {
                  setUser(null);
                  setProjects([]);
                  setReview(null);
                  setScreen('HOME');
                  useEditor.setState({
                    remoteProject: undefined,
                    projectId: undefined,
                  });
                }
              })
            }
          />
        )}
        {(screen === 'PROJECTS' || screen === 'DETAILS') && (
          <section
            className="project-board"
            aria-label={screen === 'PROJECTS' ? 'Listado de proyectos' : 'Expediente del proyecto'}
          >
            {screen === 'PROJECTS' && (
              <>
                <div className="project-board-intro">
                  <h1 id="project-board-title">PROYECTOS</h1>
                  <p>Abre un diseño o revisa sus versiones.</p>
                </div>

                <div className="project-actions">
                  <span
                    className="project-user"
                    aria-label={`Usuario activo: ${user.name}, ${user.role === 'SUPERVISOR' ? 'Supervisor' : user.role === 'ARCHITECT' ? 'Arquitecto' : 'Colaborador'}`}
                  >
                    {user.name} ·{' '}
                    {user.role === 'SUPERVISOR'
                      ? 'Supervisor'
                      : user.role === 'ARCHITECT'
                        ? 'Arquitecto'
                        : 'Colaborador'}
                  </span>
                  {user.role !== 'COLLABORATOR' && (
                    <button
                      disabled={busy || cuttingLoading}
                      className="project-btn project-btn--create"
                      onClick={() => setNewProject(true)}
                    >
                      <ActionIcon name="plus" /> Nuevo proyecto
                    </button>
                  )}
                  <button
                    disabled={busy || cuttingLoading}
                    className="project-btn project-btn--refresh"
                    onClick={() => {
                      clearCuttingList();
                      setReview(null);
                      setVersions([]);
                      void run(list);
                    }}
                  >
                    <ActionIcon name="refresh" /> Actualizar
                  </button>
                  <button
                    disabled={busy || cuttingLoading}
                    className="project-btn project-btn--logout"
                    onClick={() =>
                      void run(async () => {
                        clearCuttingList();
                        try {
                          await apiClient.logout();
                        } finally {
                          setUser(null);
                          setProjects([]);
                          setReview(null);
                          useEditor.setState({
                            remoteProject: undefined,
                            projectId: undefined,
                          });
                        }
                      })
                    }
                  >
                    <ActionIcon name="logout" /> Cerrar sesión
                  </button>
                </div>

                <div className="simbo-heading-row simbo-section-subhead">
                  <h2>Proyectos activos</h2>
                  <span>{projects.filter((p) => p.stage !== 'COMPLETED').length} proyectos</span>
                </div>
                <div className="project-list">
                  {projects
                    .filter((project) => project.stage !== 'COMPLETED')
                    .map((project) => (
                      <article className="project-card" key={project.id}>
                        <div className="project-card-visual" aria-hidden="true">
                          <DesignThumbnail
                            parts={project.previewParts ?? []}
                            label={`Vista del último diseño guardado de ${project.name}`}
                          />
                        </div>
                        <div className="project-card-details">
                          <StageFlag stage={project.stage} />
                          <div className="project-card-title-row">
                            <h2>{project.name}</h2>
                            <span className="project-card-type">
                              {project.projectType
                                ? PROJECT_TYPE_LABELS[project.projectType]
                                : 'Sin tipo'}
                            </span>
                          </div>
                          <div className="project-card-meta">
                            {user.role === 'COLLABORATOR' && (
                              <span className="project-card-access">Solo lectura</span>
                            )}
                            <p>
                              <UserRound size={15} aria-hidden="true" />
                              {project.responsible?.name || 'Sin responsable'}
                            </p>
                            {(project.client?.name || project.clientName) && (
                              <p className="project-card-client">
                                Cliente: {project.client?.name || project.clientName}
                              </p>
                            )}
                            {project.location && (
                              <p>
                                <MapPin size={15} aria-hidden="true" />
                                {project.location}
                              </p>
                            )}
                            <small>
                              Actualizado: {new Date(project.updatedAt).toLocaleString('es-MX')}
                            </small>
                          </div>
                        </div>
                        <div className="project-card-actions">
                          <button
                            disabled={busy || cuttingLoading}
                            className="project-btn project-btn--open"
                            onClick={() => void run(() => open(project))}
                          >
                            <ActionIcon name="open" />{' '}
                            {user.role === 'COLLABORATOR' ? 'Consultar diseño' : 'Abrir diseño'}
                          </button>
                          <button
                            disabled={busy || cuttingLoading}
                            className="project-btn project-btn--review"
                            onClick={() =>
                              void run(async () => {
                                await showVersions(project);
                                setDetailTab('VERSIONS');
                              })
                            }
                          >
                            <ActionIcon name="search" /> Revisar versiones
                          </button>
                          <div className="project-card-secondary-actions">
                            <button
                              type="button"
                              disabled={busy || cuttingLoading}
                              className="project-card-detail-button"
                              onClick={() => void run(() => showVersions(project))}
                            >
                              <Info size={15} /> Detalles
                            </button>
                            {user.role !== 'COLLABORATOR' && (
                              <button
                                type="button"
                                disabled={busy || cuttingLoading}
                                className="project-card-detail-button"
                                onClick={() => setEditing(project)}
                              >
                                <Pencil size={15} /> Editar
                              </button>
                            )}
                            {user.role === 'SUPERVISOR' && (
                              <button
                                type="button"
                                disabled={busy || cuttingLoading}
                                className="project-card-detail-button"
                                onClick={() => setAssigning(project)}
                              >
                                <UsersRound size={15} /> Equipo (
                                {project.collaborators?.length ?? 0})
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  {!projects.filter((project) => project.stage !== 'COMPLETED').length && (
                    <p className="project-empty">
                      {user.role === 'COLLABORATOR'
                        ? 'No tienes proyectos asignados. Consulta con tu Supervisor.'
                        : 'No hay proyectos disponibles. Crea el primero.'}
                    </p>
                  )}
                </div>
                {projects.some((p) => p.stage === 'COMPLETED') && (
                  <>
                    <div className="simbo-heading-row simbo-section-subhead">
                      <h2>Proyectos finalizados</h2>
                      <span>
                        {projects.filter((p) => p.stage === 'COMPLETED').length} proyectos
                      </span>
                    </div>
                    <div className="simbo-finished-grid">
                      {projects
                        .filter((p) => p.stage === 'COMPLETED')
                        .map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => void run(() => showVersions(project))}
                          >
                            <div className="simbo-finished-preview">
                              <DesignThumbnail
                                parts={project.previewParts ?? []}
                                label={project.name}
                              />
                            </div>
                            <strong>{project.name}</strong>
                            <span>
                              {project.client?.name || project.clientName || 'Sin cliente'}
                            </span>
                            <StageFlag stage={project.stage} />
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </>
            )}
            {screen === 'DETAILS' && review && (
              <>
                <div className="simbo-detail-header">
                  <button className="simbo-outline" onClick={() => navigate('PROJECTS')}>
                    <ArrowLeft size={17} /> Proyectos
                  </button>
                  <div>
                    <span className="simbo-eyebrow">EXPEDIENTE DEL PROYECTO</span>
                    <h1>{review.name}</h1>
                  </div>
                </div>
                <div className="simbo-detail-layout">
                  <div className="simbo-detail-left">
                    <nav className="simbo-detail-tabs" aria-label="Apartados del proyecto">
                      <button
                        className={detailTab === 'GENERAL' ? 'is-active' : ''}
                        onClick={() => setDetailTab('GENERAL')}
                      >
                        Información general
                      </button>
                      <button
                        className={detailTab === 'CLIENT' ? 'is-active' : ''}
                        onClick={() => setDetailTab('CLIENT')}
                      >
                        Datos del cliente
                      </button>
                      <button
                        className={detailTab === 'VERSIONS' ? 'is-active' : ''}
                        onClick={() => setDetailTab('VERSIONS')}
                      >
                        Revisión y despiece
                      </button>
                    </nav>
                    {detailTab === 'GENERAL' && <ProjectOverview project={review} />}
                    {detailTab === 'CLIENT' && (
                      <ProjectClientInfo
                        project={review}
                        onEdit={
                          user.role === 'SUPERVISOR' && review.client
                            ? () => {
                                const client = clients.find((item) => item.id === review.clientId);
                                if (client) setClientDialog(client);
                              }
                            : undefined
                        }
                      />
                    )}
                    {review && detailTab === 'VERSIONS' && (
                      <section className="project-versions">
                        <h2>Versiones de {review.name}</h2>

                        <button
                          type="button"
                          disabled={busy || cuttingLoading}
                          className="project-btn project-btn--review"
                          onClick={() => {
                            setQuotationVersion(null);
                            setShowQuotations(true);
                          }}
                        >
                          <ActionIcon name="excel" /> Ver cotizaciones
                        </button>

                        <p>Revisa las versiones, sus propuestas y la autorización del despiece.</p>

                        {versions.map((version) => (
                          <article className="project-version-card" key={version.id}>
                            <strong>Revisión {version.revision}</strong>

                            <span>
                              {version.approvalStatus === 'APPROVED' ? 'Aprobada' : 'Pendiente'} ·{' '}
                              {version.current ? 'Vigente' : 'Histórica'}
                            </span>

                            {version.approvedAt && (
                              <small>
                                Aprobada: {new Date(version.approvedAt).toLocaleString()}
                              </small>
                            )}

                            <button
                              type="button"
                              className="project-btn project-btn--proposals"
                              aria-expanded={expandedProposalVersionId === version.id}
                              aria-controls={`proposal-history-${version.id}`}
                              disabled={
                                busy ||
                                (proposalLoadingVersionId !== undefined &&
                                  proposalLoadingVersionId !== version.id)
                              }
                              onClick={() => void toggleProposalHistory(version)}
                            >
                              {proposalLoadingVersionId === version.id
                                ? 'Cargando…'
                                : expandedProposalVersionId === version.id
                                  ? 'Ocultar propuestas'
                                  : 'Ver propuestas'}
                            </button>

                            {user.role === 'SUPERVISOR' &&
                              version.current &&
                              version.approvalStatus !== 'APPROVED' && (
                                <button
                                  type="button"
                                  disabled={busy || cuttingLoading}
                                  className="project-btn project-btn--approve"
                                  onClick={() => void run(() => approve(version))}
                                >
                                  <ActionIcon name="check" /> Aprobar diseño
                                </button>
                              )}

                            {user.role === 'SUPERVISOR' && (
                              <button
                                type="button"
                                disabled={
                                  busy ||
                                  cuttingLoading ||
                                  !version.current ||
                                  version.approvalStatus !== 'APPROVED'
                                }
                                className="project-btn project-btn--generate"
                                onClick={() => void generate(version)}
                              >
                                <ActionIcon name="download" /> Generar despiece
                              </button>
                            )}

                            {user.role === 'SUPERVISOR' &&
                              version.approvalStatus === 'APPROVED' && (
                                <button
                                  type="button"
                                  disabled={busy || cuttingLoading}
                                  className="project-btn project-btn--review"
                                  onClick={() => setAuthVersion(version)}
                                >
                                  <ActionIcon name="search" /> Ver autorización
                                </button>
                              )}

                            {user.role === 'SUPERVISOR' &&
                              version.current &&
                              version.approvalStatus === 'APPROVED' && (
                                <button
                                  type="button"
                                  disabled={busy || cuttingLoading}
                                  className="project-btn project-btn--review"
                                  onClick={() => {
                                    setQuotationVersion(version);
                                    setShowQuotations(true);
                                  }}
                                >
                                  <ActionIcon name="excel" /> Generar cotización
                                </button>
                              )}

                            {expandedProposalVersionId === version.id && (
                              <section
                                className="project-proposal-history"
                                id={`proposal-history-${version.id}`}
                                aria-label={`Propuestas de la revisión ${version.revision}`}
                              >
                                {proposalHistoryError && (
                                  <p className="project-error" role="alert">
                                    {proposalHistoryError}
                                  </p>
                                )}

                                {proposalLoadingVersionId === version.id && (
                                  <p role="status">Cargando propuestas…</p>
                                )}

                                {proposalHistory[version.id]?.length === 0 && (
                                  <p>No hay propuestas registradas para esta versión.</p>
                                )}

                                {proposalHistory[version.id]?.map((proposal) => (
                                  <article className="project-proposal-entry" key={proposal.id}>
                                    <p>{proposal.observation}</p>
                                    <small>
                                      {proposal.author.name} ·{' '}
                                      {new Date(proposal.createdAt).toLocaleString()}
                                    </small>
                                  </article>
                                ))}
                              </section>
                            )}
                          </article>
                        ))}

                        {!versions.length && (
                          <p>Guarda una versión desde el editor antes de solicitar aprobación.</p>
                        )}

                        {cuttingLoading && <p role="status">Generando despiece...</p>}

                        {cuttingError && (
                          <p className="project-error" role="alert">
                            {cuttingError}
                          </p>
                        )}

                        {cuttingResult && cuttingResult.source.projectId === review.id && (
                          <>
                            <p
                              className="cutting-source"
                              title={`Versión: ${cuttingResult.source.designVersionId}`}
                            >
                              Despiece · revisión {cuttingResult.source.revision}
                            </p>

                            <CuttingListTable result={cuttingResult} projectName={review.name} />
                          </>
                        )}

                        {user.role === 'SUPERVISOR' && authVersion && (
                          <CuttingListAuthorizationPanel
                            key={`${review.id}-${authVersion.id}`}
                            projectId={review.id}
                            projectName={review.name}
                            version={authVersion}
                            cuttingResult={cuttingResult}
                            canAuthorize={user.role === 'SUPERVISOR'}
                            onRefreshVersions={() =>
                              void run(async () => {
                                await showVersions(review);
                                setDetailTab('VERSIONS');
                              })
                            }
                          />
                        )}
                      </section>
                    )}
                  </div>
                  <aside className="simbo-detail-side">
                    <div className="simbo-detail-preview">
                      <DesignThumbnail
                        parts={review.previewParts ?? []}
                        label={`Vista previa de ${review.name}`}
                      />
                    </div>
                    <div className="simbo-detail-summary">
                      <StageFlag stage={review.stage} />
                      <h2>{review.name}</h2>
                      <p>{review.description || 'Diseño de mobiliario BOIS'}</p>
                      <div className="simbo-detail-facts">
                        <span>
                          <UserRound size={15} />
                          {review.responsible?.name || 'Sin responsable'}
                        </span>
                        <span>
                          <MapPin size={15} />
                          {review.location || 'Sin ubicación'}
                        </span>
                      </div>
                      {user.role === 'SUPERVISOR' && (
                        <label className="simbo-stage-select">
                          Etapa del proyecto
                          <select
                            value={review.stage}
                            disabled={busy}
                            onChange={(e) =>
                              void run(() => updateStage(e.target.value as ProjectStage))
                            }
                          >
                            {STAGE_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {STAGE_LABELS[value]}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <button
                        className="simbo-primary"
                        onClick={() => void run(() => open(review))}
                      >
                        <FolderOpen size={17} />
                        {user.role === 'COLLABORATOR' ? 'Consultar diseño' : 'Abrir editor'}
                      </button>
                      {user.role !== 'COLLABORATOR' && (
                        <button className="simbo-outline" onClick={() => setEditing(review)}>
                          <Pencil size={15} /> Editar información
                        </button>
                      )}
                      {user.role === 'SUPERVISOR' && (
                        <button className="simbo-outline" onClick={() => setAssigning(review)}>
                          <UsersRound size={15} /> Gestionar equipo
                        </button>
                      )}
                    </div>
                  </aside>
                </div>
              </>
            )}

{review && showQuotations && (
  <QuotationPanel
    key={`${review.id}-${quotationVersion?.id ?? 'history'}`}
    projectId={review.id}
    projectName={review.name}
    version={quotationVersion}
    cuttingResult={cuttingResult}
    canGenerate={Boolean(
      user.role === 'SUPERVISOR' &&
      quotationVersion?.current &&
      quotationVersion?.approvalStatus === 'APPROVED'
    )}
    currentUserRole={user.role}
    currentApprovedVersionId={
      versions.find((v) => v.current && v.approvalStatus === 'APPROVED')?.id ?? null
    }
    onRefreshVersions={() =>
      void run(async () => {
        await showVersions(review);
        setDetailTab('VERSIONS');
      })
    }
    onClose={() => {
      setShowQuotations(false);
      setQuotationVersion(null);
    }}
  />
)}
          </section>
        )}

        {screen === 'PROJECTS' && user.role !== 'COLLABORATOR' && (
          <button
            className="project-local project-btn project-btn--local"
            type="button"
            disabled={busy || cuttingLoading}
            onClick={local}
          >
            <ActionIcon name="monitor" /> Abrir editor local
          </button>
        )}
      </div>
      {user.role !== 'COLLABORATOR' && newProject && (
        <NewProjectDialog
          assignees={assignees}
          clients={clients}
          currentUserId={user.id}
          onCancel={() => setNewProject(false)}
          onSave={create}
        />
      )}
      {user.role !== 'COLLABORATOR' && editing && (
        <NewProjectDialog
          initial={editing}
          assignees={assignees}
          clients={clients}
          currentUserId={user.id}
          onCancel={() => setEditing(null)}
          onSave={updateProject}
        />
      )}
      {clientDialog && (
        <ClientDialog
          initial={clientDialog === 'NEW' ? undefined : clientDialog}
          onClose={() => setClientDialog(null)}
          onSave={saveClient}
        />
      )}
      {user.role === 'SUPERVISOR' && accountDialog && (
        <UserAccountDialog onClose={() => setAccountDialog(false)} onSave={saveAccount} />
      )}
      {user.role === 'SUPERVISOR' && assigning && (
        <CollaboratorsDialog
          project={assigning}
          available={collaboratorUsers}
          onClose={() => setAssigning(null)}
          onSave={async (collaboratorIds) => {
            const updated = await apiClient.setCollaborators(assigning.id, collaboratorIds);
            setProjects((current) =>
              current.map((project) => (project.id === updated.id ? updated : project)),
            );
            setAssigning(null);
            setSuccess('Asignaciones actualizadas');
          }}
        />
      )}
    </main>
  );
}
