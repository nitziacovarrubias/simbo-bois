import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Hammer,
  Layers,
  MapPin,
  Mail,
  Phone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ClientRecord, ProjectSummary, SessionUser, UserAccount } from '../apiClient';
import type { ProjectStage } from '@simbo/shared-contracts';

export const STAGE_LABELS: Record<ProjectStage, string> = {
  DESIGN: 'En diseño',
  CUTTING: 'Despiece',
  QUOTING: 'Cotización',
  MANUFACTURING: 'En fabricación',
  INSTALLATION: 'Instalación',
  COMPLETED: 'Finalizado',
};
export const STAGE_OPTIONS = Object.keys(STAGE_LABELS) as ProjectStage[];
export function StageFlag({ stage }: { stage: ProjectStage }) {
  return (
    <span className={`simbo-stage simbo-stage--${stage.toLowerCase()}`}>{STAGE_LABELS[stage]}</span>
  );
}
export function HomeDashboard({
  projects,
  user,
  onProjects,
  onDetails,
}: {
  projects: ProjectSummary[];
  user: SessionUser;
  onProjects: () => void;
  onDetails: (project: ProjectSummary) => void;
}) {
  const stats = [
    {
      label: 'Activos',
      value: projects.filter((p) => p.stage !== 'COMPLETED').length,
      icon: <FolderKanban />,
      key: 'active',
    },
    {
      label: 'En diseño',
      value: projects.filter((p) => p.stage === 'DESIGN').length,
      icon: <Layers />,
      key: 'design',
    },
    {
      label: 'En fabricación',
      value: projects.filter((p) => p.stage === 'MANUFACTURING').length,
      icon: <Hammer />,
      key: 'manufacturing',
    },
    {
      label: 'Finalizados',
      value: projects.filter((p) => p.stage === 'COMPLETED').length,
      icon: <CheckCircle2 />,
      key: 'completed',
    },
  ];
  return (
    <div className="simbo-home-page">
      <section className="simbo-home-hero">
        <div className="simbo-home-welcome">
          <span className="simbo-eyebrow">SIMBO · BOIS</span>
          <h1>Bienvenido a tu panel de control.</h1>
          <div className="simbo-home-rule" />
          <p>Consulta los proyectos y las actividades que requieren atención.</p>
          <button className="simbo-primary" onClick={onProjects}>
            Ir a proyectos
          </button>
        </div>
        <div className="simbo-home-photo" role="img" aria-label="Cocina moderna BOIS" />
      </section>
      <section className="simbo-home-stats" aria-label="Estado de los proyectos">
        {stats.map((item) => (
          <article key={item.key}>
            <span>{item.icon}</span>
            <h2>{item.label}</h2>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>
      <section className="simbo-home-recent">
        <div className="simbo-heading-row">
          <div>
            <span className="simbo-eyebrow">SEGUIMIENTO</span>
            <h2>Actividad reciente</h2>
          </div>
          <button className="simbo-outline" onClick={onProjects}>
            Ver proyectos
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="simbo-empty-state">No hay proyectos registrados todavía.</div>
        ) : (
          <div className="simbo-activity-list">
            {projects.slice(0, 5).map((p) => (
              <button key={p.id} onClick={() => onDetails(p)}>
                <span className="simbo-activity-icon">
                  <Activity size={18} />
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.responsible?.name || 'Sin responsable'} ·{' '}
                    {new Date(p.updatedAt).toLocaleDateString('es-MX')}
                  </small>
                </span>
                <StageFlag stage={p.stage} />
              </button>
            ))}
          </div>
        )}
      </section>
      <span className="simbo-screen-reader">Sesión: {user.name}</span>
    </div>
  );
}

export function ClientsBoard({
  clients,
  user,
  onCreate,
  onEdit,
}: {
  clients: ClientRecord[];
  user: SessionUser;
  onCreate: () => void;
  onEdit: (client: ClientRecord) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () =>
      clients.filter((c) =>
        [c.name, c.email, c.phone, c.address].some((t) =>
          (t || '').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')),
        ),
      ),
    [clients, query],
  );
  return (
    <section className="simbo-management-page">
      <div className="simbo-page-title">
        <span className="simbo-eyebrow">BOIS · CONTACTOS</span>
        <h1>Listado de clientes</h1>
        <p>Datos, proyectos y seguimiento de tus clientes.</p>
      </div>
      <div className="simbo-heading-row simbo-management-actions">
        <label className="simbo-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o correo"
            aria-label="Buscar clientes"
          />
        </label>
        {user.role !== 'COLLABORATOR' && (
          <button className="simbo-primary" onClick={onCreate}>
            <Plus size={17} /> Nuevo cliente
          </button>
        )}
      </div>
      <div className="simbo-data-table-wrap">
        <table className="simbo-data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Correo electrónico</th>
              <th>Estado</th>
              <th>Proyectos</th>
              <th>Último proyecto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client) => (
              <tr key={client.id}>
                <td>
                  <strong>{client.name}</strong>
                  {client.address && (
                    <small>
                      <MapPin size={12} />
                      {client.address}
                    </small>
                  )}
                </td>
                <td>{client.phone || '—'}</td>
                <td>{client.email || '—'}</td>
                <td>
                  <span className={`simbo-state-pill ${client.active ? 'is-active' : ''}`}>
                    {client.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>{client.projects?.length ?? 0}</td>
                <td>
                  {client.projects?.[0] ? (
                    <StageFlag stage={client.projects[0].stage} />
                  ) : (
                    <span className="simbo-muted">Sin proyectos</span>
                  )}
                </td>
                <td>
                  {user.role === 'SUPERVISOR' && (
                    <button className="simbo-outline" onClick={() => onEdit(client)}>
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="simbo-empty-state">No se encontraron clientes.</div>
        )}
      </div>
    </section>
  );
}

export function SettingsBoard({
  user,
  accounts,
  accountsLoading,
  onCreate,
  onToggle,
  onLogout,
}: {
  user: SessionUser;
  accounts: UserAccount[];
  accountsLoading: boolean;
  onCreate: () => void;
  onToggle: (account: UserAccount) => void;
  onLogout: () => void;
}) {
  return (
    <section className="simbo-management-page">
      <div className="simbo-page-title">
        <span className="simbo-eyebrow">PREFERENCIAS</span>
        <h1>Configuración</h1>
        <p>Tu perfil y los accesos del equipo.</p>
      </div>
      <div className="simbo-settings-card">
        <div className="simbo-heading-row">
          <div className="simbo-settings-heading">
            <UserRound />
            <h2>Mi perfil</h2>
          </div>
          <button type="button" className="simbo-outline" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
        <dl className="simbo-profile-list">
          <div>
            <dt>Nombre</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Rol</dt>
            <dd>
              {user.role === 'SUPERVISOR'
                ? 'Supervisor'
                : user.role === 'ARCHITECT'
                  ? 'Arquitecto'
                  : 'Colaborador'}
            </dd>
          </div>
        </dl>
      </div>
      {user.role === 'SUPERVISOR' && (
        <div className="simbo-settings-card">
          <div className="simbo-heading-row">
            <div className="simbo-settings-heading">
              <ShieldCheck />
              <h2>Gestión de accesos</h2>
            </div>
            <button className="simbo-primary" onClick={onCreate}>
              <Plus size={17} /> Crear cuenta
            </button>
          </div>
          <p className="simbo-subtext">
            Crea cuentas de arquitectos y colaboradores, o desactiva accesos cuando sea necesario.
          </p>
          {accountsLoading ? (
            <p className="simbo-muted" role="status">
              Cargando cuentas…
            </p>
          ) : (
            <div className="simbo-data-table-wrap">
              <table className="simbo-data-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Acceso</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.name}</strong>
                        <small>@{account.username || 'sin usuario'}</small>
                      </td>
                      <td>{account.email}</td>
                      <td>
                        {account.role === 'SUPERVISOR'
                          ? 'Supervisor'
                          : account.role === 'ARCHITECT'
                            ? 'Arquitecto'
                            : 'Colaborador'}
                      </td>
                      <td>
                        <span className={`simbo-state-pill ${account.active ? 'is-active' : ''}`}>
                          {account.active ? 'Activo' : 'Desactivado'}
                        </span>
                      </td>
                      <td>
                        {account.id !== user.id && (
                          <button className="simbo-outline" onClick={() => onToggle(account)}>
                            {account.active ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {user.role !== 'SUPERVISOR' && (
        <div className="simbo-settings-card">
          <Settings2 size={22} />
          <p>La gestión de accesos está disponible para Supervisores.</p>
        </div>
      )}
    </section>
  );
}

export function ProjectOverview({ project }: { project: ProjectSummary }) {
  return (
    <section className="simbo-detail-content">
      <h2>Información general</h2>
      <p className="simbo-subtext">Datos y responsables del proyecto.</p>
      <div className="simbo-info-grid">
        <div>
          <span>Nombre</span>
          <strong>{project.name}</strong>
        </div>
        <div>
          <span>Tipo</span>
          <strong>
            {project.projectType === 'KITCHEN'
              ? 'Cocina'
              : project.projectType === 'CLOSET'
                ? 'Closet'
                : project.projectType === 'MIXED'
                  ? 'Cocina y closet'
                  : 'Otro'}
          </strong>
        </div>
        <div>
          <span>Responsable</span>
          <strong>{project.responsible?.name || 'Sin asignar'}</strong>
        </div>
        <div>
          <span>Fecha de creación</span>
          <strong>{new Date(project.createdAt).toLocaleDateString('es-MX')}</strong>
        </div>
        <div>
          <span>Ubicación del proyecto</span>
          <strong>{project.location || 'Sin registrar'}</strong>
        </div>
        <div>
          <span>Última actualización</span>
          <strong>{new Date(project.updatedAt).toLocaleDateString('es-MX')}</strong>
        </div>
      </div>
      <h3>Descripción</h3>
      <p>{project.description || 'Sin descripción adicional.'}</p>
    </section>
  );
}

export function ProjectClientInfo({
  project,
  onEdit,
}: {
  project: ProjectSummary;
  onEdit?: () => void;
}) {
  const client = project.client;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const address = client?.address || project.location || '';
  return (
    <section className="simbo-detail-content">
      <div className="simbo-heading-row">
        <h2>Datos del cliente</h2>
        {client && onEdit && (
          <button className="simbo-outline" onClick={onEdit}>
            Editar cliente
          </button>
        )}
      </div>
      {!client ? (
        <div className="simbo-empty-state">
          Este proyecto no tiene un cliente registrado. Puedes asociarlo desde Editar proyecto.
        </div>
      ) : (
        <>
          <div className="simbo-client-identity">
            <Users size={24} />
            <strong>{client.name}</strong>
            <span className={`simbo-state-pill ${client.active ? 'is-active' : ''}`}>
              {client.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div className="simbo-info-grid">
            <div>
              <span>Teléfono</span>
              <strong>
                <Phone size={15} />
                {client.phone || 'No registrado'}
              </strong>
            </div>
            <div>
              <span>Correo electrónico</span>
              <strong>
                <Mail size={15} />
                {client.email || 'No registrado'}
              </strong>
            </div>
            <div>
              <span>RFC</span>
              <strong>{client.taxId || 'No registrado'}</strong>
            </div>
            <div>
              <span>Dirección</span>
              <strong>
                <MapPin size={15} />
                {client.address || 'No registrada'}
              </strong>
            </div>
          </div>
          {key && address ? (
            <iframe
              className="simbo-detail-map"
              title="Ubicación del cliente"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(client.placeId ? `place_id:${client.placeId}` : address)}`}
            />
          ) : (
            <div className="simbo-map-placeholder">
              <MapPin />
              <span>
                {address || 'No se ha registrado una dirección.'}
                {!key ? ' · Google Maps requiere configuración.' : ''}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
