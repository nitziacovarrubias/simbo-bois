import './PresentationWorkspace.css';
import { useEffect } from 'react';
import Viewport, { exportViewportPng } from './Viewport';
import { useEditor } from '../store';

export default function PresentationWorkspace() {
  const design = useEditor(state => state.design);
  const activeSceneId = useEditor(state => state.activeSceneId);
  const playing = useEditor(state => state.presentationPlaying);
  const allowNavigation = useEditor(state => state.presentationAllowNavigation);
  const previous = useEditor(state => state.previousScene);
  const next = useEditor(state => state.nextScene);
  const exit = useEditor(state => state.exitPresentation);
  const setPlaying = useEditor(state => state.setPresentationPlaying);
  const setAllow = useEditor(state => state.setPresentationAllowNavigation);
  const scene = design.scenes.find(value => value.id === activeSceneId);

  useEffect(() => {
    if (!playing || design.scenes.length < 2) return;
    const timer = window.setInterval(() => useEditor.getState().nextScene(), 3200);
    return () => window.clearInterval(timer);
  }, [playing, design.scenes.length]);

  return <div className="presentation-shell">
    <div className="presentation-viewport"><Viewport /></div>
    <div className="presentation-controls" role="toolbar" aria-label="Controles de presentación">
      <span className="presentation-scene-name">{scene?.name ?? 'Presentación'}</span>
      <button onClick={previous} disabled={design.scenes.length < 2}>Anterior</button>
      <button onClick={() => setPlaying(!playing)} disabled={design.scenes.length < 2}>{playing ? 'Pausa' : 'Reproducir'}</button>
      <button onClick={next} disabled={design.scenes.length < 2}>Siguiente</button>
      <label className="toggle"><input type="checkbox" checked={allowNavigation} onChange={event => setAllow(event.target.checked)} />Navegación</label>
      <button onClick={() => exportViewportPng(1)}>PNG</button>
      <button className="presentation-exit" onClick={exit}>Salir</button>
    </div>
  </div>;
}
