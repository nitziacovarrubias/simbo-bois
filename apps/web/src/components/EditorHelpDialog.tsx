import { Keyboard } from 'lucide-react';
import SharedDialog from './SharedDialog';
import './EditorHelpDialog.css';

export default function EditorHelpDialog({ onClose }: { onClose: () => void }) {
  return <SharedDialog title="Guía rápida del editor" description="Atajos y controles principales" icon={<Keyboard/>} onClose={onClose}
    footer={<button type="button" className="editor-help-close" onClick={onClose}>Entendido</button>}>
    <div className="editor-help-content">
      <section>
        <h3>Herramientas</h3>
        <div><span>Seleccionar</span><kbd>S</kbd></div>
        <div><span>Agregar panel</span><kbd>P</kbd></div>
        <div><span>Mover / Rotar</span><span><kbd>M</kbd> <kbd>R</kbd></span></div>
        <div><span>Medir</span><kbd>T</kbd></div>
      </section>
      <section>
        <h3>Trabajo con el diseño</h3>
        <div><span>Seleccionar varios elementos</span><kbd>Ctrl / Cmd + clic</kbd></div>
        <div><span>Deshacer / Rehacer</span><span><kbd>Ctrl/Cmd + Z</kbd> <kbd>Ctrl/Cmd + Shift + Z</kbd></span></div>
        <div><span>Buscar comandos</span><kbd>Ctrl/Cmd + K</kbd></div>
        <div><span>Cancelar herramienta</span><kbd>Esc</kbd></div>
      </section>
      <p>Para editar medidas, selecciona una pieza y abre <strong>Propiedades</strong>. Los valores del diseño se expresan en milímetros.</p>
    </div>
  </SharedDialog>;
}
