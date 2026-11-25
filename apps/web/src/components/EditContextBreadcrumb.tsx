import './EditContextBreadcrumb.css';
import { useEditor } from '../store';

export default function EditContextBreadcrumb() {
  const design = useEditor((state) => state.design);
  const path = useEditor((state) => state.editContextPath);
  const exit = useEditor((state) => state.exitEditContext);
  if (!path.length) return null;
  const name = (id: string) =>
    design.moduleInstances.find((value) => value.id === id)?.name ??
    design.assemblies.find((value) => value.id === id)?.name ??
    id;
  return (
    <div className="edit-context-breadcrumb">
      <span>Diseño</span>
      {path.map((id) => (
        <span key={id}>› {name(id)}</span>
      ))}
      <button onClick={exit}>Atrás · Esc</button>
    </div>
  );
}
