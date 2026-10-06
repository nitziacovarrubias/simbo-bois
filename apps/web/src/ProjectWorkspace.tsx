import { useEffect, useState, type FormEvent } from 'react';
import { createEmptyDesign } from '@simbo/design-domain';
import App from './App';
import NewProjectDialog from './components/NewProjectDialog';
import { apiClient, type ProjectSummary, type SessionUser, type VersionSummary } from './apiClient';
import { editorFacade } from './editorFacade';
import { autosaveNow, useEditor } from './store';
import './ProjectWorkspace.css';

export default function ProjectWorkspace() {
  const [user,setUser]=useState<SessionUser|null>(null);
  const [screen,setScreen]=useState<'PROJECTS'|'EDITOR'>('PROJECTS');
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [projects,setProjects]=useState<ProjectSummary[]>([]);
  const [newProject,setNewProject]=useState(false);
  const [review,setReview]=useState<ProjectSummary|null>(null);const [versions,setVersions]=useState<VersionSummary[]>([]);
  const remote=useEditor(state=>state.remoteProject);
  const list=async()=>setProjects(await apiClient.projects());
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(error){setError(error instanceof Error?error.message:'No se pudo completar la operación');}finally{setBusy(false);}};
  useEffect(()=>{
    let active=true;
    if(apiClient.hasSession())apiClient.me().then(async actor=>{if(!active)return;setUser(actor);const items=await apiClient.projects();if(active)setProjects(items);}).catch(error=>{if(active)setError(error instanceof Error?error.message:'No se pudo recuperar la sesión');}).finally(()=>{if(active)setLoading(false);});
    else setLoading(false);
    const expired=()=>{setUser(null);setScreen('PROJECTS');setReview(null);setError('La sesión venció. Inicia sesión nuevamente.');};
    window.addEventListener('simbo.session.expired',expired);
    return()=>{active=false;window.removeEventListener('simbo.session.expired',expired);};
  },[]);
  const login=(event:FormEvent)=>{event.preventDefault();void run(async()=>{const actor=await apiClient.login(email,password);setPassword('');setUser(actor);await list();});};
  const open=async(project:ProjectSummary)=>{
    if(!user)throw new Error('Inicia sesión');
    const response=await apiClient.design(project.id);editorFacade.loadProject(project.id,user.id,response);setReview(null);setScreen('EDITOR');
  };
  const create=async(name:string)=>{const project=await apiClient.createProject(name);await open(project);setNewProject(false);};
  const back=()=>void run(async()=>{await autosaveNow();if(user)await list();setReview(null);setScreen('PROJECTS');});
  const local=()=>{
    useEditor.setState({remoteProject:undefined,projectId:undefined});
    const raw=localStorage.getItem('simbo.design.v1');editorFacade.loadDesign(raw??createEmptyDesign('Proyecto local'));setScreen('EDITOR');setError('');
  };
  const showVersions=async(project:ProjectSummary)=>{setVersions(await apiClient.versions(project.id));setReview(project);};
  const approve=async(version:VersionSummary)=>{
    if(!review)return;
    const current=await apiClient.design(review.id);await apiClient.approve(review.id,version.id,current.revision);await showVersions(review);
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
      <div className="project-actions"><span>{user.name} · {user.role==='SUPERVISOR'?'Supervisor':'Arquitecto'}</span><button disabled={busy} onClick={()=>setNewProject(true)}>Nuevo proyecto</button><button disabled={busy} onClick={()=>void run(list)}>Actualizar</button><button disabled={busy} onClick={()=>void run(async()=>{await apiClient.logout();setUser(null);setProjects([]);setReview(null);useEditor.setState({remoteProject:undefined,projectId:undefined});})}>Cerrar sesión</button></div>
      <div className="project-list">{projects.map(project=><article key={project.id}><h2>{project.name}</h2><p>Actualizado: {new Date(project.updatedAt).toLocaleString()}</p><button disabled={busy} onClick={()=>void run(()=>open(project))}>Abrir diseño</button><button disabled={busy} onClick={()=>void run(()=>showVersions(project))}>Revisar versiones</button></article>)}{!projects.length&&<p>No hay proyectos disponibles. Crea el primero.</p>}</div>
      {review&&<section className="project-versions"><h2>Versiones de {review.name}</h2><p>Abre el diseño para revisarlo. La aprobación exige que la versión coincida con el borrador vigente.</p>{versions.map(version=><article key={version.id}><strong>Revisión {version.revision}</strong><span>{version.approvalStatus==='APPROVED'?'Aprobada':'Pendiente'} · {version.current?'Vigente':'Histórica'}</span>{version.approvedAt&&<small>Aprobada: {new Date(version.approvedAt).toLocaleString()}</small>}{user.role==='SUPERVISOR'&&version.current&&version.approvalStatus!=='APPROVED'&&<button disabled={busy} onClick={()=>void run(()=>approve(version))}>Aprobar diseño</button>}</article>)}{!versions.length&&<p>Guarda una versión desde el editor antes de solicitar aprobación.</p>}</section>}
    </section>}
    <button className="project-local" type="button" onClick={local}>Abrir editor local</button>
    {newProject&&<NewProjectDialog onCancel={()=>setNewProject(false)} onCreate={create}/>}
  </main>;
}
