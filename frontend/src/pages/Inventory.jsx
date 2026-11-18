import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Badge, DataTable, Empty, Field, Modal, SearchBox, Tabs, useConfirm, useToast } from '../components/ui';
import { can } from '../permissions';
import { downloadCSV, fmtDateTime, GST_RATES, money, n2, titleCase } from '../utils';

const EMPTY = { kind: 'part', name: '', sku: '', brand: '', hsn_sac: '', unit: 'Nos', price: '', cost_price: '', gst_rate: 18, stock: 0, reorder_level: 0, is_active: true };

export function ItemForm({ item, kind, onClose, onSaved }) {
  const [f, setF] = useState(item ? { ...item } : kind === 'vehicle' ? { ...EMPTY, kind: 'vehicle', brand: 'Ampere', hsn_sac: '87116010', gst_rate: 5, reorder_level: 2 } : EMPTY);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    const body = { ...f, price: +f.price, cost_price: +f.cost_price || 0, gst_rate: +f.gst_rate, stock: +f.stock || 0, reorder_level: +f.reorder_level || 0, sku: f.sku || null };
    try { onSaved(item ? await api(`/items/${item.id}`, { method: 'PUT', body }) : await api('/items', { method: 'POST', body })); toast('Item saved'); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const part = f.kind === 'part';
  const veh = f.kind === 'vehicle';
  return (
    <Modal title={item ? `Edit ${veh ? 'model' : 'item'}` : veh ? 'New vehicle model' : 'New item'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="iform" disabled={busy}>Save item</button></>}>
      <form id="iform" onSubmit={save} className="form-grid">
        <Field label="Type">
          <select className="input" value={f.kind} disabled={!!item || veh} onChange={(e) => setF({ ...f, kind: e.target.value, unit: e.target.value === 'part' ? 'Nos' : 'Job' })}>
            <option value="part">Spare part (stock tracked)</option><option value="service">Labour / service</option>
            {veh && <option value="vehicle">Vehicle model (chassis-wise stock)</option>}
          </select>
        </Field>
        <Field label={veh ? 'Model name *' : 'Name *'}><input className="input" required minLength={2} value={f.name} onChange={set('name')} /></Field>
        <Field label="SKU / part number"><input className="input" value={f.sku || ''} onChange={set('sku')} /></Field>
        <Field label="Brand"><input className="input" value={f.brand || ''} onChange={set('brand')} /></Field>
        <Field label={part || veh ? 'HSN code' : 'SAC code'}><input className="input" value={f.hsn_sac || ''} onChange={set('hsn_sac')} placeholder={veh ? '87116010' : part ? '87149990' : '998714'} /></Field>
        <Field label="Unit"><input className="input" value={f.unit} onChange={set('unit')} /></Field>
        <Field label={veh ? 'Ex-showroom price (excl. GST) *' : 'Selling price (excl. GST) *'}><input className="input" type="number" step="any" min="0" required value={f.price} onChange={set('price')} /></Field>
        <Field label="GST rate">
          <select className="input" value={f.gst_rate} onChange={set('gst_rate')}>{GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}</select>
        </Field>
        {veh && <>
          <Field label="Dealer cost (excl. GST)"><input className="input" type="number" step="any" min="0" value={f.cost_price} onChange={set('cost_price')} /></Field>
          <Field label="Minimum showroom stock"><input className="input" type="number" step="1" min="0" value={f.reorder_level} onChange={set('reorder_level')} /></Field>
        </>}
        {part && <>
          <Field label="Purchase cost"><input className="input" type="number" step="any" min="0" value={f.cost_price} onChange={set('cost_price')} /></Field>
          <Field label="Reorder level"><input className="input" type="number" step="any" min="0" value={f.reorder_level} onChange={set('reorder_level')} /></Field>
          {!item && <Field label="Opening stock"><input className="input" type="number" step="any" value={f.stock} onChange={set('stock')} /></Field>}
        </>}
        {item && <label className="check full"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Active (available for billing)</label>}
      </form>
    </Modal>
  );
}

function StockModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ direction: 'in', qty: '', reason: 'purchase', reference: '' });
  const [moves, setMoves] = useState([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { api(`/items/${item.id}/moves`).then(setMoves).catch(() => {}); }, [item.id]);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const qty = (f.direction === 'in' ? 1 : -1) * Math.abs(+f.qty);
      onSaved(await api(`/items/${item.id}/stock`, { method: 'POST', body: { qty, reason: f.reason, reference: f.reference || null } }));
      toast('Stock updated');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Stock · ${item.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" form="sform" disabled={busy}>Update stock</button></>}>
      <div className="stack">
        <div className="between"><span className="muted">Current stock</span><b style={{ fontSize: 20 }}>{n2(item.stock)} {item.unit}</b></div>
        <form id="sform" onSubmit={save} className="form-grid">
          <Field label="Movement">
            <select className="input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value, reason: e.target.value === 'in' ? 'purchase' : 'damage' })}>
              <option value="in">Stock in (+)</option><option value="out">Stock out (−)</option>
            </select>
          </Field>
          <Field label="Quantity"><input className="input" type="number" step="any" min="0.01" required value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
          <Field label="Reason">
            <select className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
              {['purchase', 'return', 'adjustment', 'damage'].map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
            </select>
          </Field>
          <Field label="Reference (bill no., supplier)"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </form>
        <div>
          <h3 style={{ marginBottom: 8 }}>Recent movements</h3>
          {moves.length ? moves.slice(0, 15).map((m) => (
            <div key={m.id} className="between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
              <span>{titleCase(m.reason)}{m.reference ? ` · ${m.reference}` : ''}<br /><span className="muted">{fmtDateTime(m.created_at)}</span></span>
              <b style={{ color: m.qty > 0 ? 'var(--green)' : 'var(--red)' }}>{m.qty > 0 ? '+' : ''}{n2(m.qty)}</b>
            </div>
          )) : <span className="small muted">No movements yet.</span>}
        </div>
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState(params.get('low') ? 'low' : 'part');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {} new | item
  const [stockItem, setStockItem] = useState(null);
  const manage = can.manageItems(user.role);

  const load = () => {
    setLoading(true);
    api('/items', { params: { q, kind: tab === 'low' ? 'part' : tab, low_stock: tab === 'low' || undefined, include_inactive: manage || undefined } })
      .then(setItems).catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
  };
  useEffect(load, [tab, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsert = (it) => setItems((list) => (list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [it, ...list]));
  const deactivate = async (it) => {
    if (!(await confirm(`Deactivate ${it.name}? It will no longer appear when billing.`, { action: 'Deactivate', danger: true }))) return;
    try { await api(`/items/${it.id}`, { method: 'DELETE' }); upsert({ ...it, is_active: false }); toast('Item deactivated'); } catch (e) { toast(e.message, 'error'); }
  };

  const columns = [
    { key: 'name', label: 'Item', primary: true, render: (r) => <><b>{r.name}</b>{!r.is_active && <span className="badge gray" style={{ marginLeft: 6 }}>Inactive</span>}<div className="small muted">{[r.sku, r.brand].filter(Boolean).join(' · ')}</div></> },
    { key: 'hsn_sac', label: tab === 'service' ? 'SAC' : 'HSN', hideSm: true },
    { key: 'price', label: 'Price', num: true, render: (r) => money(r.price) },
    { key: 'gst_rate', label: 'GST', num: true, render: (r) => `${r.gst_rate}%` },
    ...(tab !== 'service' ? [{ key: 'stock', label: 'Stock', num: true, render: (r) => <>{r.low_stock ? <Badge tone="red">{n2(r.stock)} {r.unit}</Badge> : `${n2(r.stock)} ${r.unit}`}</> }] : []),
    ...(manage ? [{
      key: 'actions', label: '', num: true, render: (r) => (
        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          {r.kind === 'part' && <button className="btn sm" onClick={() => setStockItem(r)}>Stock</button>}
          <button className="btn ghost sm icon" onClick={() => setEditing(r)} aria-label="Edit"><Icon name="edit" size={16} /></button>
          {r.is_active && <button className="btn ghost sm icon danger" onClick={() => deactivate(r)} aria-label="Deactivate"><Icon name="trash" size={16} /></button>}
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="stack">
      {confirmDialog}
      <div className="page-head">
        <div><h1>Spares & labour</h1><p>Spare parts stock, accessories and labour rates. Vehicles are managed in Vehicle Stock.</p></div>
        <div className="row">
          <button className="btn" onClick={() => downloadCSV(`inventory-${tab}.csv`, items.map(({ low_stock, is_active, ...r }) => r))}><Icon name="download" size={16} />Export</button>
          {manage && <button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={16} />New item</button>}
        </div>
      </div>
      <div className="between">
        <Tabs value={tab} onChange={setTab} options={[{ value: 'part', label: 'Spare parts' }, { value: 'service', label: 'Labour & services' }, { value: 'low', label: 'Low stock' }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Name, SKU or brand" />
      </div>
      <div className="card">
        <DataTable loading={loading} rows={items} columns={columns} onRowClick={manage ? (r) => setEditing(r) : undefined}
          empty={<Empty icon="box" title={tab === 'low' ? 'All parts are above reorder level' : 'No items yet'} />} />
      </div>
      {editing && <ItemForm item={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={(it) => { upsert(it); setEditing(null); }} />}
      {stockItem && <StockModal item={stockItem} onClose={() => setStockItem(null)} onSaved={(it) => { upsert(it); setStockItem(null); }} />}
    </div>
  );
}
