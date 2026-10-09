import { useEffect, useState, useRef, type FormEvent } from 'react';import { createEmptyDesign } from '@simbo/design-domain';
import type { CuttingListResponse } from '@simbo/shared-contracts';
import App from './App';
import NewProjectDialog from './components/NewProjectDialog';
import { apiClient, type ProjectSummary, type SessionUser, type VersionSummary } from './apiClient';
import { editorFacade } from './editorFacade';
import { autosaveNow, useEditor } from './store';
import './ProjectWorkspace.css';

function CuttingListTable({ result }: { result: CuttingListResponse }) {
  const rows = Array.isArray((result as any).items)
    ? (result as any).items
    : Array.isArray((result as any).parts)
      ? (result as any).parts
      : Array.isArray((result as any).cutParts)
        ? (result as any).cutParts
        : [];

  const columns = rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null
    ? Object.keys(rows[0] as Record<string, unknown>)
    : [];

  const toCell = (value: unknown) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  };

  return (
    <table>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => (
              <td key={`${index}-${column}`}>{toCell((row as Record<string, unknown>)[column])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
    const response = await apiClient.design(project.id); editorFacade.loadProject(project.id, user.id, response); setReview(null); setScreen('EDITOR');
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
  return <main className="project-workspace">
    <header><img src="/simbo-logo.svg" alt="SIMBO"/><div><h1>Proyectos SIMBO</h1><p>BOIS · Cocinas y Closets</p></div></header>
    {error&&<p className="project-error" role="alert">{error}</p>}
    {!user?<section className="project-login"><h2>Iniciar sesión</h2><form onSubmit={login}>
      <label>Correo<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label>
      <label>Contraseña<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>
      <button disabled={busy} type="submit">Entrar</button>
    </form></section>:<section>

<div className="project-actions">
  <span>{user.name} · {user.role === 'SUPERVISOR' ? 'Supervisor' : 'Arquitecto'}</span>
  <button disabled={busy || cuttingLoading} onClick={() => setNewProject(true)}>Nuevo proyecto</button>
  <button disabled={busy || cuttingLoading} onClick={() => { clearCuttingList(); setReview(null); setVersions([]); void run(list); }}>Actualizar</button>
  <button disabled={busy || cuttingLoading} onClick={() => void run(async () => { clearCuttingList(); try { await apiClient.logout(); } finally { setUser(null); setProjects([]); setReview(null); useEditor.setState({ remoteProject: undefined, projectId: undefined }); } })}>Cerrar sesión</button>
</div>    
    
    
    <div className="project-list">{projects.map(project=><article key={project.id}><h2>{project.name}</h2><p>Actualizado: {new Date(project.updatedAt).toLocaleString()}</p><button disabled={busy || cuttingLoading} onClick={()=>void run(()=>open(project))}>Abrir diseño</button><button disabled={busy || cuttingLoading} onClick={()=>void run(()=>showVersions(project))}>Revisar versiones</button></article>)}{!projects.length&&<p>No hay proyectos disponibles. Crea el primero.</p>}</div>
    
    
    
    {review&&<section className="project-versions"><h2>Versiones de {review.name}</h2><p>Abre el diseño para revisarlo. La aprobación exige que la versión coincida con el borrador vigente.</p>{versions.map(version=><article key={version.id}><strong>Revisión {version.revision}</strong><span>{version.approvalStatus==='APPROVED'?'Aprobada':'Pendiente'} · {version.current?'Vigente':'Histórica'}</span>{version.approvedAt&&<small>Aprobada: {new Date(version.approvedAt).toLocaleString()}</small>}{user.role==='SUPERVISOR'&&version.current&&version.approvalStatus!=='APPROVED'&&<button disabled={busy || cuttingLoading} onClick={()=>void run(()=>approve(version))}>Aprobar diseño</button>}{user.role === 'SUPERVISOR' && (<button type="button" disabled={busy || cuttingLoading || !version.current || version.approvalStatus !== 'APPROVED'} onClick={() => void generate(version)}>Generar despiece</button>)}</article>)}{!versions.length&&<p>Guarda una versión desde el editor antes de solicitar aprobación.</p>}{cuttingLoading && (<p role="status">Generando despiece...</p>)}{cuttingError && (<p className="project-error" role="alert">{cuttingError}</p>)}{cuttingResult && cuttingResult.source.projectId === review.id && (<><p>Versión fuente: {cuttingResult.source.designVersionId}</p><CuttingListTable result={cuttingResult} /></>)}</section>}
    </section>}    
    
    <button className="project-local" type="button" disabled={busy || cuttingLoading} onClick={local}>Abrir editor local</button>
    {newProject&&<NewProjectDialog onCancel={()=>setNewProject(false)} onCreate={create}/>}
  </main>;
}
