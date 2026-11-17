import { useEffect, useState, useRef, type FormEvent } from 'react';import { createEmptyDesign } from '@simbo/design-domain';

import type { CuttingListResponse } from '@simbo/shared-contracts';
import { exportCuttingListXlsx } from './cuttingListExcel';

import App from './App';

import NewProjectDialog from './components/NewProjectDialog';

import { apiClient, type ProjectSummary, type SessionUser, type VersionSummary } from './apiClient';

import { editorFacade } from './editorFacade';

import { autosaveNow, useEditor } from './store';

import './ProjectWorkspace.css';



type ActionIconName = 'plus' | 'refresh' | 'logout' | 'open' | 'search' | 'check' | 'download' | 'excel' | 'monitor' | 'login';

function ActionIcon({ name }: { name: ActionIconName }) {
  const shared = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" {...shared}>
      {name === 'plus' && <path d="M12 5v14M5 12h14" />}
      {name === 'refresh' && <><path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/></>}
      {name === 'logout' && <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></>}
      {name === 'open' && <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m10 11 3 3 4-4"/></>}
      {name === 'search' && <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>}
      {name === 'check' && <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>}
      {name === 'download' && <><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></>}
      {name === 'excel' && <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 9 4 6m0-6-4 6M15 8v8"/></>}
      {name === 'monitor' && <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></>}
      {name === 'login' && <><path d="M14 7l5 5-5 5M19 12H8"/><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/></>}
    </svg>
  );
}

function CuttingListTable({ result, projectName }: { result: CuttingListResponse; projectName: string }) {
  return (
    <section className="cutting-board" aria-label="Lista de despiece">
      <div className="cutting-board-toolbar">
        <div className="cutting-board-heading">
          <h3>Lista de despiece</h3>
          <span>Revisión {result.source.revision} · {result.rows.length} conceptos</span>
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
          <caption className="cutting-table-caption">Despiece del proyecto {projectName}, revisión {result.source.revision}</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Concepto</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Material</th>
              <th scope="col">Medidas <small>ancho × alto (mm)</small></th>
              <th scope="col">Grosor <small>mm</small></th>
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
                <td className="cutting-table-dimensions">{row.widthMm} × {row.heightMm}</td>
                <td>{row.thicknessMm}</td>
                <td>{row.grainDirection}</td>
                <td className="cutting-table-origins">
                  <details>
                    <summary>Ver orígenes ({row.origins.length})</summary>
                    <ul>
                      {row.origins.map((origin, originIndex) => (
                        <li key={`${origin.partId}-${originIndex}`}>
                          <strong>Pieza:</strong> {origin.partId}
                          {origin.moduleInstanceId ? <> · <strong>Módulo:</strong> {origin.moduleInstanceId}</> : null}
                          {origin.assemblyPath.length > 0 ? <> · <strong>Ensambles:</strong> {origin.assemblyPath.join(' / ')}</> : null}
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
      <p className="cutting-board-note">Datos del diseño aprobado. Canteado y comentarios no disponibles.</p>
    </section>
  );
}


export default function ProjectWorkspace() {

  const [user,setUser]=useState<SessionUser|null>(null);

  const [screen,setScreen]=useState<'PROJECTS'|'EDITOR'>('PROJECTS');

  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');

  const [email,setEmail]=useState('');const [password,setPassword]=useState('');

  const [projects,setProjects]=useState<ProjectSummary[]>([]);

  const [newProject,setNewProject]=useState(false);

  const [review,setReview]=useState<ProjectSummary|null>(null);const [versions,setVersions]=useState<VersionSummary[]>([]);

  const remote=useEditor(state=>state.remoteProject);



  const [cuttingResult, setCuttingResult] = useState<CuttingListResponse | null>(null);

  const [cuttingLoading, setCuttingLoading] = useState(false);

  const [cuttingError, setCuttingError] = useState('');

  const cuttingRequest = useRef(0);

  const cuttingPending = useRef(false);

  const clearCuttingList = () => {

  cuttingRequest.current += 1;

  cuttingPending.current = false;

  setCuttingResult(null);

  setCuttingError('');

  setCuttingLoading(false);

};

useEffect(() => () => { cuttingRequest.current += 1; }, []);





  const list=async()=>setProjects(await apiClient.projects());

  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(error){setError(error instanceof Error?error.message:'No se pudo completar la operación');}finally{setBusy(false);}};



  useEffect(()=>{

    let active=true;

    if(apiClient.hasSession())apiClient.me().then(async actor=>{if(!active)return;setUser(actor);const items=await apiClient.projects();if(active)setProjects(items);}).catch(error=>{if(active)setError(error instanceof Error?error.message:'No se pudo recuperar la sesión');}).finally(()=>{if(active)setLoading(false);});

    else setLoading(false);





    const expired = () => { clearCuttingList(); setUser(null); setScreen('PROJECTS'); setReview(null); setError('La sesión venció. Inicia sesión nuevamente.'); };







    window.addEventListener('simbo.session.expired',expired);

    return()=>{active=false;window.removeEventListener('simbo.session.expired',expired);};

  },[]);



  const login=(event:FormEvent)=>{event.preventDefault();void run(async()=>{const actor=await apiClient.login(email,password);setPassword('');setUser(actor);await list();});};





  const open = async (project: ProjectSummary) => {
    clearCuttingList();
    if (!user) throw new Error('Inicia sesión');
    const response = await apiClient.design(project.id);
    editorFacade.loadProject(project.id, user.id, response);
    setReview(null);
    setScreen('EDITOR');
  };

  const create=async(name:string)=>{const project=await apiClient.createProject(name);await open(project);setNewProject(false);};



  const back = () => void run(async () => { clearCuttingList(); await autosaveNow(); if (user) await list(); setReview(null); setScreen('PROJECTS'); });





const local = () => {

    clearCuttingList();

    useEditor.setState({ remoteProject: undefined, projectId: undefined });

    const raw = localStorage.getItem('simbo.design.v1'); editorFacade.loadDesign(raw ?? createEmptyDesign('Proyecto local')); setScreen('EDITOR'); setError('');

  };



const showVersions = async (project: ProjectSummary) => {

    clearCuttingList();

    setReview(null);

    setVersions([]);

    const items = await apiClient.versions(project.id);

    setVersions(items);

    setReview(project);

  };





const approve = async (version: VersionSummary) => {

    clearCuttingList();

    if (!review) return;

    const current = await apiClient.design(review.id); await apiClient.approve(review.id, version.id, current.revision); await showVersions(review);

  };





const generate = async (version: VersionSummary) => {

    if (busy || cuttingPending.current || !review || !user) return;

    if (user.role !== 'SUPERVISOR' || !version.current || version.approvalStatus !== 'APPROVED') return;



    const projectId = review.id;

    const requestId = ++cuttingRequest.current;

    cuttingPending.current = true;

    setCuttingLoading(true);

    setCuttingError('');

    setCuttingResult(null);



    try {

      const result = await apiClient.generateCuttingList(projectId, version.id);

      if (requestId !== cuttingRequest.current) return;

      if (result.source.projectId !== projectId

        || result.source.designVersionId !== version.id

        || result.source.revision !== version.revision) {

        throw new Error('El resultado no corresponde a la versión seleccionada');

      }

      setCuttingResult(result);

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







  if(loading)return <main className="project-workspace"><p role="status">Cargando sesión…</p></main>;

  if(screen==='EDITOR')return <App user={remote?user??undefined:undefined} onProjects={back} onCreateProject={remote?create:undefined}/>;



  if(!user)return <main className="simbo-login-page">

    <section className="simbo-login-brand" aria-label="Bienvenida a SIMBO">

      <div className="simbo-login-logo-row">

        <img
          src="/simbo-logo.svg"
          alt="SIMBO"
          className="login-brand-logo"
        />

        <span>SIMBO</span>

      </div>

      <h1>Bienvenido al<br/>inicio de sesión.</h1>

      <p>Ingresa tus datos para poder tener acceso a SIMBO.</p>

    </section>



    <section className="simbo-login-card" aria-labelledby="login-title">

      <div className="simbo-login-card-header">

        <h2 id="login-title">Login</h2>

      </div>



      {error&&<p className="project-error simbo-login-error" role="alert">{error}</p>}



      <form className="simbo-login-form" onSubmit={login}>

        <label>

          Correo electrónico

          <input

            type="email"

            required

            value={email}

            onChange={e=>setEmail(e.target.value)}

            autoComplete="username"

            placeholder="miCorreo"

          />

        </label>



        <label>

          Contraseña

          <input

            type="password"

            required

            value={password}

            onChange={e=>setPassword(e.target.value)}

            autoComplete="current-password"

            placeholder="miContraseña"

          />

        </label>



        <div className="simbo-login-divider"/>



        <div className="simbo-login-submit-row">

          <button disabled={busy} type="submit"><ActionIcon name="login" /> {busy?'Ingresando…':'Iniciar sesión'}</button>

        </div>

      </form>



      <button className="simbo-local-link" type="button" onClick={local}><ActionIcon name="monitor" /> Abrir editor local</button>

    </section>

  </main>;



  return <main className="project-workspace">
    <header className="project-navbar">
      <div className="project-navbar-brand">
        <img src="/simbo-logo.svg" alt="" />
        <span>SIMBO</span>
      </div>
      <nav className="project-navbar-nav" aria-label="Navegación principal">
        <span className="project-navbar-active" aria-current="page">PROYECTOS</span>
      </nav>
      <div className="project-navbar-spacer" aria-hidden="true" />
    </header>

    <div className="project-workspace-content">
      {error&&<p className="project-error" role="alert">{error}</p>}

      <section className="project-board" aria-labelledby="project-board-title">
        <div className="project-board-intro">
          <h1 id="project-board-title">PROYECTOS</h1>
          <p>Abre un diseño o revisa sus versiones.</p>
        </div>

        <div className="project-actions">
          <span className="project-user">{user.name} · {user.role === 'SUPERVISOR' ? 'Supervisor' : 'Arquitecto'}</span>
          <button disabled={busy || cuttingLoading} className="project-btn project-btn--create" onClick={() => setNewProject(true)}><ActionIcon name="plus" /> Nuevo proyecto</button>
          <button disabled={busy || cuttingLoading} className="project-btn project-btn--refresh" onClick={() => { clearCuttingList(); setReview(null); setVersions([]); void run(list); }}><ActionIcon name="refresh" /> Actualizar</button>
          <button disabled={busy || cuttingLoading} className="project-btn project-btn--logout" onClick={() => void run(async () => { clearCuttingList(); try { await apiClient.logout(); } finally { setUser(null); setProjects([]); setReview(null); useEditor.setState({ remoteProject: undefined, projectId: undefined }); } })}><ActionIcon name="logout" /> Cerrar sesión</button>
        </div>

        <div className="project-list">
          {projects.map(project=><article className="project-card" key={project.id}>
            <div className="project-card-visual" aria-hidden="true">
              <div className="project-kitchen-wall" />
              <div className="project-kitchen-upper" />
              <div className="project-kitchen-backsplash" />
              <div className="project-kitchen-counter" />
              <div className="project-kitchen-lower" />
              <div className="project-kitchen-island" />
              <span className="project-card-visual-caption">SIMBO · DISEÑO</span>
            </div>
            <div className="project-card-details">
              <h2>{project.name}</h2>
              <p>Actualizado: {new Date(project.updatedAt).toLocaleString()}</p>
            </div>
            <div className="project-card-actions">
              <button disabled={busy || cuttingLoading} className="project-btn project-btn--open" onClick={()=>void run(()=>open(project))}><ActionIcon name="open" /> Abrir diseño</button>
              <button disabled={busy || cuttingLoading} className="project-btn project-btn--review" onClick={()=>void run(()=>showVersions(project))}><ActionIcon name="search" /> Revisar versiones</button>
            </div>
          </article>)}
          {!projects.length&&<p className="project-empty">No hay proyectos disponibles. Crea el primero.</p>}
        </div>

        {review&&<section className="project-versions"><h2>Versiones de {review.name}</h2><p>Revisa las versiones y aprueba la vigente.</p>{versions.map(version=><article key={version.id}><strong>Revisión {version.revision}</strong><span>{version.approvalStatus==='APPROVED'?'Aprobada':'Pendiente'} · {version.current?'Vigente':'Histórica'}</span>{version.approvedAt&&<small>Aprobada: {new Date(version.approvedAt).toLocaleString()}</small>}{user.role==='SUPERVISOR'&&version.current&&version.approvalStatus!=='APPROVED'&&<button disabled={busy || cuttingLoading} className="project-btn project-btn--approve" onClick={()=>void run(()=>approve(version))}><ActionIcon name="check" /> Aprobar diseño</button>}{user.role === 'SUPERVISOR' && (<button type="button" disabled={busy || cuttingLoading || !version.current || version.approvalStatus !== 'APPROVED'} className="project-btn project-btn--generate" onClick={() => void generate(version)}><ActionIcon name="download" /> Generar despiece</button>)}</article>)}{!versions.length&&<p>Guarda una versión desde el editor antes de solicitar aprobación.</p>}{cuttingLoading && (<p role="status">Generando despiece...</p>)}{cuttingError && (<p className="project-error" role="alert">{cuttingError}</p>)}{cuttingResult && cuttingResult.source.projectId === review.id && (<><p className="cutting-source" title={`Versión: ${cuttingResult.source.designVersionId}`}>Despiece · revisión {cuttingResult.source.revision}</p><CuttingListTable result={cuttingResult} projectName={review.name} /></>)}</section>}
      </section>

      <button className="project-local project-btn project-btn--local" type="button" disabled={busy || cuttingLoading} onClick={local}><ActionIcon name="monitor" /> Abrir editor local</button>
    </div>
    {newProject&&<NewProjectDialog onCancel={()=>setNewProject(false)} onCreate={create}/>}
  </main>;
}
