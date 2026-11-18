import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Badge, DataTable, Empty, Field, Modal, Pager, SearchBox, Stat, Tabs, useConfirm, useToast } from '../components/ui';
import { can } from '../permissions';
import { downloadCSV, fmtDate, money, money0, today } from '../utils';
import { ItemForm } from './Inventory';

const LIMIT = 25;

function UnitModal({ id, onClose, onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [u, setU] = useState(null);
  const [edit, setEdit] = useState(null);
  const [retail, setRetail] = useState(null);
  const mgmt = can.manageItems(user.role);

  useEffect(() => { api(`/vehicle-units/${id}`).then(setU).catch((e) => toast(e.message, 'error')); }, [id, toast]);
  const run = async (fn, msg) => { try { const r = await fn(); if (r) setU(r); toast(msg); onChanged(); } catch (e) { toast(e.message, 'error'); } };

  if (!u) return <Modal title="Vehicle" onClose={onClose}><div className="empty">Loading…</div></Modal>;
  const canRetail = u.status === 'with_subdealer' && (mgmt || user.role === 'subdealer');

  return (
    <Modal title={`${u.model} · ${u.color || ''}`} onClose={onClose}
      footer={<>
        {can.deleteVehicle(user.role) && u.status === 'in_stock' && !u.purchase && (
          <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => {
            if (await confirm(`Delete ${u.chassis_no} from stock?`, { action: 'Delete', danger: true })) { await run(() => api(`/vehicle-units/${u.id}`, { method: 'DELETE' }), 'Vehicle removed'); onClose(); }
          }}>Delete</button>)}
        {mgmt && u.status === 'sold' && u.subdealer_id && <button className="btn" onClick={() => run(() => api(`/vehicle-units/${u.id}/undo-retail`, { method: 'POST' }), 'Retail sale reversed')}>Undo retail</button>}
        {mgmt && !edit && <button className="btn" onClick={() => setEdit({ motor_no: u.motor_no || '', battery_no: u.battery_no || '', charger_no: u.charger_no || '', color: u.color || '', mfg_year: u.mfg_year || '' })}><Icon name="edit" size={16} />Edit</button>}
        {canRetail && !retail && <button className="btn primary" onClick={() => setRetail({ customer_name: '', phone: '', date: today() })}>Mark as sold to customer</button>}
        {!edit && !retail && <button className="btn" onClick={onClose}>Close</button>}
      </>}>
      {confirmDialog}
      <div className="stack">
        <div className="between"><Badge status={u.status} />{u.subdealer_name && <span className="small">Held by <b>{u.subdealer_name}</b></span>}</div>
        <dl className="kv">
          <dt>Chassis</dt><dd className="mono">{u.chassis_no}</dd>
          <dt>Motor</dt><dd className="mono">{u.motor_no || '—'}</dd>
          <dt>Battery</dt><dd className="mono">{u.battery_no || '—'}</dd>
          <dt>Charger</dt><dd className="mono">{u.charger_no || '—'}</dd>
          <dt>Year</dt><dd>{u.mfg_year || '—'}</dd>
          <dt>Received</dt><dd>{fmtDate(u.received_on)} · {u.age_days} days ago</dd>
          {user.role !== 'subdealer' && <><dt>Cost</dt><dd>{money(u.cost)}</dd><dt>Ex-showroom</dt><dd>{money(u.price)}</dd></>}
          {u.purchase && <><dt>Purchased</dt><dd><Link to={`/purchases/${u.purchase.id}`}>{u.purchase.number}</Link> · {u.purchase.supplier}{u.purchase.supplier_invoice_no ? ` · Bill ${u.purchase.supplier_invoice_no}` : ''}</dd></>}
          {u.invoice && <><dt>Invoiced</dt><dd><Link to={`/billing/${u.invoice.id}`}>{u.invoice.number}</Link> · {u.invoice.party} · {fmtDate(u.invoice.date)}</dd></>}
          {u.retail_customer && <><dt>Retailed to</dt><dd>{u.retail_customer}{u.retail_phone ? ` · ${u.retail_phone}` : ''} · {fmtDate(u.sold_on)}</dd></>}
        </dl>
        {edit && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api(`/vehicle-units/${u.id}`, { method: 'PUT', body: { ...edit, mfg_year: edit.mfg_year ? +edit.mfg_year : null } }), 'Vehicle updated').then(() => setEdit(null)); }}>
            <div className="form-grid">
              {['motor_no', 'battery_no', 'charger_no', 'color'].map((k) => (
                <Field key={k} label={{ motor_no: 'Motor no.', battery_no: 'Battery no.', charger_no: 'Charger no.', color: 'Colour' }[k]}>
                  <input className="input" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                </Field>
              ))}
              <Field label="Mfg. year"><input className="input" type="number" value={edit.mfg_year} onChange={(e) => setEdit({ ...edit, mfg_year: e.target.value })} /></Field>
            </div>
            <div className="row"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        )}
        {retail && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => api(`/vehicle-units/${u.id}/retail`, { method: 'POST', body: retail }), 'Retail sale recorded').then(() => setRetail(null)); }}>
            <h3>Retail sale details</h3>
            <div className="form-grid">
              <Field label="Customer name *"><input className="input" required minLength={2} value={retail.customer_name} onChange={(e) => setRetail({ ...retail, customer_name: e.target.value })} /></Field>
              <Field label="Phone"><input className="input" value={retail.phone} onChange={(e) => setRetail({ ...retail, phone: e.target.value })} /></Field>
              <Field label="Sale date"><input className="input" type="date" value={retail.date} onChange={(e) => setRetail({ ...retail, date: e.target.value })} /></Field>
            </div>
            <div className="row"><button className="btn primary">Confirm sale</button><button type="button" className="btn" onClick={() => setRetail(null)}>Cancel</button></div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function OpeningStock({ models, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ item_id: models[0]?.item_id || '', chassis_no: '', motor_no: '', battery_no: '', charger_no: '', color: '', mfg_year: new Date().getFullYear(), cost: '' });
  const [count, setCount] = useState(0);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api('/vehicle-units', { method: 'POST', body: { ...f, item_id: +f.item_id, mfg_year: f.mfg_year ? +f.mfg_year : null, cost: +f.cost || 0 } });
      toast(`${f.chassis_no} added`); setCount(count + 1); onSaved();
      setF({ ...f, chassis_no: '', motor_no: '', battery_no: '', charger_no: '' });
    } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <Modal title="Add opening stock" onClose={onClose}
      footer={<><span className="small muted" style={{ marginRight: 'auto' }}>{count ? `${count} added this session` : 'Use Purchases for new stock from the OEM'}</span><button className="btn" onClick={onClose}>Done</button><button className="btn primary" form="oform">Add vehicle</button></>}>
      <form id="oform" onSubmit={save} className="form-grid">
        <Field label="Model" full>
          <select className="input" required value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}>
            {models.map((m) => <option key={m.item_id} value={m.item_id}>{m.model}</option>)}
          </select>
        </Field>
        <Field label="Chassis no. *"><input className="input" required minLength={4} value={f.chassis_no} onChange={(e) => setF({ ...f, chassis_no: e.target.value.toUpperCase() })} /></Field>
        <Field label="Colour"><input className="input" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        <Field label="Motor no."><input className="input" value={f.motor_no} onChange={(e) => setF({ ...f, motor_no: e.target.value.toUpperCase() })} /></Field>
        <Field label="Battery no."><input className="input" value={f.battery_no} onChange={(e) => setF({ ...f, battery_no: e.target.value.toUpperCase() })} /></Field>
        <Field label="Charger no."><input className="input" value={f.charger_no} onChange={(e) => setF({ ...f, charger_no: e.target.value.toUpperCase() })} /></Field>
        <Field label="Cost (excl. GST)"><input className="input" type="number" step="any" min="0" value={f.cost} placeholder="Model default" onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

export default function VehicleStock({ mine = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const mgmt = can.manageItems(user.role);
  const [sum, setSum] = useState(null);
  const [status, setStatus] = useState(mine ? 'with_subdealer' : 'in_stock');
  const [itemId, setItemId] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [modelForm, setModelForm] = useState(null);
  const [opening, setOpening] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => { if (!mine) api('/vehicle-units/summary').then(setSum).catch(() => {}); }, [mine, tick]);
  useEffect(() => {
    setLoading(true);
    api('/vehicle-units', { params: { status, item_id: itemId, q, limit: LIMIT, offset } })
      .then(setData).catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [status, itemId, q, offset, tick, toast]);

  const tabs = mine
    ? [{ value: 'with_subdealer', label: 'In my stock' }, { value: 'sold', label: 'Sold' }, { value: '', label: 'All' }]
    : [{ value: 'in_stock', label: 'In showroom' }, { value: 'with_subdealer', label: 'With sub-dealers' }, { value: 'sold', label: 'Sold' }, { value: '', label: 'All' }];

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{mine ? 'My vehicles' : 'Vehicle stock'}</h1><p>{mine ? 'Vehicles billed to you. Mark each one as sold when you deliver it to a customer.' : 'Chassis-wise stock across the showroom and sub-dealers.'}</p></div>
        {!mine && (
          <div className="row">
            <button className="btn" onClick={() => downloadCSV('vehicle-stock.csv', data.items.map(({ id, item_id, subdealer_id, invoice_id, ...r }) => r))}><Icon name="download" size={16} />Export</button>
            {mgmt && <button className="btn" onClick={() => setOpening(true)}>Opening stock</button>}
            {mgmt && <Link to="/purchases/new" className="btn"><Icon name="truck" size={16} />Purchase</Link>}
            <Link to="/billing/new?category=vehicle" className="btn primary"><Icon name="bolt" size={16} />Sell vehicle</Link>
          </div>
        )}
      </div>

      {sum && (
        <>
          <div className="grid g4">
            <Stat label="In showroom" value={sum.in_stock} hint={`Stock value ${money0(sum.stock_value)}`} />
            <Stat label="With sub-dealers" value={sum.with_subdealer} hint="Billed, awaiting retail" />
            <Stat label="Sold this month" value={sum.sold_this_month} hint={`${sum.sold} sold in total`} />
            <Stat label="Ageing over 60 days" value={sum.aged_60} hint={sum.aged_60 ? 'Prioritise these units' : 'Stock is fresh'} trend={sum.aged_60 ? 'down' : ''} />
          </div>
          <div className="card">
            <div className="card-head"><h2>Model-wise position</h2>{mgmt && <button className="btn sm" onClick={() => setModelForm({})}><Icon name="plus" size={14} />New model</button>}</div>
            <DataTable rows={sum.by_model.map((m) => ({ ...m, id: m.item_id }))} empty={<Empty icon="scooter" title="No vehicle models yet" />}
              onRowClick={(r) => { setItemId(String(r.item_id)); setStatus('in_stock'); setOffset(0); }}
              columns={[
                { key: 'model', label: 'Model', primary: true, render: (r) => <b>{r.model}</b> },
                { key: 'price', label: 'Ex-showroom', num: true, render: (r) => money(r.price) },
                { key: 'in_stock', label: 'Showroom', num: true, render: (r) => (r.low ? <Badge tone="red">{r.in_stock}</Badge> : r.in_stock) },
                { key: 'with_subdealer', label: 'Sub-dealers', num: true },
                { key: 'sold_this_month', label: 'Sold (month)', num: true },
                ...(mgmt ? [{ key: 'edit', label: '', num: true, render: (r) => <button className="btn ghost sm icon" aria-label="Edit model" onClick={async (e) => { e.stopPropagation(); const items = await api('/items', { params: { kind: 'vehicle', include_inactive: true } }); setModelForm(items.find((i) => i.id === r.item_id)); }}><Icon name="edit" size={16} /></button> }] : []),
              ]} />
          </div>
        </>
      )}

      <div className="between">
        <Tabs value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={tabs} />
        <div className="row grow" style={{ justifyContent: 'flex-end' }}>
          {sum && (
            <select className="input" style={{ width: 'auto' }} value={itemId} onChange={(e) => { setItemId(e.target.value); setOffset(0); }} aria-label="Model">
              <option value="">All models</option>
              {sum.by_model.map((m) => <option key={m.item_id} value={m.item_id}>{m.model}</option>)}
            </select>
          )}
          <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Chassis, motor, battery, colour" />
        </div>
      </div>
      <div className="card">
        <DataTable loading={loading} rows={data.items} onRowClick={(r) => setOpen(r.id)}
          empty={<Empty icon="scooter" title="No vehicles here" />}
          columns={[
            { key: 'chassis_no', label: 'Chassis', primary: true, render: (r) => <><b className="mono">{r.chassis_no}</b><div className="small muted">{r.model} · {r.color || '—'}</div></> },
            { key: 'battery_no', label: 'Battery', hideSm: true, render: (r) => <span className="mono">{r.battery_no || '—'}</span> },
            { key: 'where', label: 'Location', render: (r) => r.status === 'in_stock' ? 'Showroom' : r.subdealer_name || (r.retail_customer ? `Retail · ${r.retail_customer}` : 'Customer') },
            { key: 'age_days', label: 'Age', num: true, render: (r) => (r.status === 'sold' ? fmtDate(r.sold_on) : `${r.age_days} d`) },
            { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        <Pager total={data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
      </div>

      {open && <UnitModal id={open} onClose={() => setOpen(null)} onChanged={refresh} />}
      {modelForm && <ItemForm item={modelForm.id ? modelForm : null} kind="vehicle" onClose={() => setModelForm(null)} onSaved={() => { setModelForm(null); refresh(); }} />}
      {opening && sum && <OpeningStock models={sum.by_model} onClose={() => setOpening(false)} onSaved={refresh} />}
    </div>
  );
}
