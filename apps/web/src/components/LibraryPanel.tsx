import './LibraryPanel.css';
import { useMemo, useState } from 'react';
import { Box, Search } from 'lucide-react';
import type { ApplianceCategory } from '@simbo/design-domain';
import { useEditor } from '../store';
import { uiLabel } from '../uiLabels';

type Tab = 'MODULES' | 'APPLIANCES' | 'MATERIALS' | 'HARDWARE';
const tabLabel: Record<Tab, string> = { MODULES:'Módulos', APPLIANCES:'Electrodomésticos', MATERIALS:'Materiales', HARDWARE:'Herrajes' };

export default function LibraryPanel() {
  const design = useEditor(state => state.design);
  const insertAppliance = useEditor(state => state.insertApplianceDefinition);
  const insertModule = useEditor(state => state.insertModule);
  const [tab, setTab] = useState<Tab>('APPLIANCES');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'ALL' | ApplianceCategory>('ALL');
  const q = query.trim().toLowerCase();
  const appliances = useMemo(() => design.applianceDefinitions.filter(definition => (category === 'ALL' || definition.category === category) && (!q || `${definition.name} ${definition.category} ${definition.manufacturer ?? ''} ${definition.model ?? ''}`.toLowerCase().includes(q))), [design.applianceDefinitions, category, q]);
  const categories = useMemo(() => ['ALL', ...new Set(design.applianceDefinitions.map(value => value.category))] as Array<'ALL' | ApplianceCategory>, [design.applianceDefinitions]);

  return <section className="panel library-panel">
    <div className="panel-heading"><div><span className="eyebrow">Local</span><div className="panel-title">Biblioteca</div></div><Box /></div>
    <div className="library-tabs">{(['MODULES','APPLIANCES','MATERIALS','HARDWARE'] as const).map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{tabLabel[value]}</button>)}</div>
    <label className="search"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar…" aria-label="Buscar en biblioteca" /></label>
    {tab === 'APPLIANCES' && <>
      <select className="library-category" aria-label="Categoría de electrodoméstico" value={category} onChange={event => setCategory(event.target.value as typeof category)}>{categories.map(value => <option key={value} value={value}>{uiLabel(value)}</option>)}</select>
      <div className="library-list">{appliances.map(definition => <article className="library-card" key={definition.id}><span className="library-swatch" style={{ background:definition.colorHex }} /><div><b>{definition.name}</b><small>{uiLabel(definition.category)} · {definition.dimensions.widthMm}×{definition.dimensions.heightMm}×{definition.dimensions.depthMm} mm</small>{definition.metadata.sourceType === 'DEMO' && <em>DEMO / GENÉRICO</em>}</div><button onClick={() => insertAppliance(definition.id)}>Insertar</button></article>)}{!appliances.length && <div className="muted">Sin resultados.</div>}</div>
    </>}
    {tab === 'MODULES' && <div className="library-list">{design.moduleDefinitions.filter(value => !q || value.name.toLowerCase().includes(q)).map(definition => <article className="library-card" key={definition.id}><div><b>{definition.name}</b><small>{definition.tags.join(' · ') || 'Módulo local'}</small></div><button onClick={() => insertModule(definition.id)}>Insertar</button></article>)}{!design.moduleDefinitions.length && <div className="muted">Guarda un conjunto como módulo para añadirlo aquí.</div>}</div>}
    {tab === 'MATERIALS' && <div className="library-list">{design.materials.filter(value => !q || value.name.toLowerCase().includes(q)).map(material => <article className="library-card" key={material.id}><span className="library-swatch" style={{ background:material.colorHex }} /><div><b>{material.name}</b><small>{material.thicknessMm ?? '—'} mm</small></div></article>)}</div>}
    {tab === 'HARDWARE' && <div className="library-list">{design.hardwareDefinitions.filter(value => !q || value.name.toLowerCase().includes(q)).map(definition => <article className="library-card" key={definition.id}><div><b>{definition.name}</b><small>{uiLabel(definition.category)}</small></div></article>)}{!design.hardwareDefinitions.length && <div className="muted">Sin herrajes definidos.</div>}</div>}
  </section>;
}
