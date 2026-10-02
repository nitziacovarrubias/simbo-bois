import './NewProjectDialog.css';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FolderPlus, X } from 'lucide-react';

type Props = { onCancel:()=>void; onCreate:(name:string)=>void };

/** Dialogo UI local: delega la creacion real al mismo createProject del store. */
export default function NewProjectDialog({onCancel,onCreate}:Props) {
  const [name,setName]=useState('Proyecto cocina');
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{input.current?.focus();input.current?.select();},[]);
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    onCreate(name.trim() || 'Proyecto cocina');
  };
  return <div className="project-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onCancel();}}>
    <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onCancel();}}}>
      <button className="project-dialog-close" type="button" onClick={onCancel} aria-label="Cerrar"><X aria-hidden="true"/></button>
      <div className="project-dialog-symbol"><FolderPlus aria-hidden="true"/></div>
      <h2 id="project-dialog-title">Nuevo proyecto</h2>
      <p>Asigna un nombre para comenzar a diseñar.</p>
      <form onSubmit={submit}>
        <label htmlFor="new-project-name">Nombre del proyecto</label>
        <input ref={input} id="new-project-name" value={name} onChange={event=>setName(event.target.value)} maxLength={120} autoComplete="off"/>
        <div className="project-dialog-actions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button type="submit"><FolderPlus aria-hidden="true"/>Crear proyecto</button></div>
      </form>
    </section>
  </div>;
}
