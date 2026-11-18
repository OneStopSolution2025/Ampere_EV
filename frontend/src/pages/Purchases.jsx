import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import { Badge, DataTable, Empty, Field, Modal, Pager, SearchBox, Stat, Tabs, useToast } from '../components/ui';
import { fmtDate, INDIAN_STATES, money, money0 } from '../utils';

const LIMIT = 25;

export function SupplierForm({ supplier, onClose, onSaved }) {
  const [f, setF] = useState(supplier || { name: '', phone: '', email: '', gstin: '', state: 'Tamil Nadu', address: '' });
  const toast = useToast();
  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { ...f, gstin: f.gstin?.toUpperCase() || null };
      onSaved(supplier ? await api(`/suppliers/${supplier.id}`, { method: 'PUT', body }) : await api('/suppliers', { method: 'POST', body }));
      toast('Supplier saved');
    } catch (err) { toast(err.message, 'error'); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={supplier ? 'Edit supplier' : 'New supplier'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="supform">Save supplier</button></>}>
      <form id="supform" onSubmit={save} className="form-grid">
        <Field label="Name *" full><input className="input" required minLength={2} value={f.name} onChange={set('name')} /></Field>
        <Field label="Phone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="GSTIN"><input className="input" maxLength={15} value={f.gstin || ''} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} /></Field>
        <Field label="State">
          <select className="input" value={f.state || ''} onChange={set('state')}><option value="">-</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Address" full><textarea className="input" value={f.address || ''} onChange={set('address')} /></Field>
      </form>
    </Modal>
  );
}

function Suppliers() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => api('/suppliers').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  return (
    <div className="card">
      <div className="card-head"><h2>Suppliers</h2><button className="btn sm" onClick={() => setEdit({})}><Icon name="plus" size={14} />New supplier</button></div>
      <DataTable loading={!list} rows={list || []} onRowClick={setEdit} empty={<Empty icon="truck" title="No suppliers yet" />} columns={[
        { key: 'name', label: 'Supplier', primary: true, render: (r) => <b>{r.name}</b> },
        { key: 'phone', label: 'Phone' },
        { key: 'gstin', label: 'GSTIN', hideSm: true },
        { key: 'state', label: 'State', hideSm: true },
        { key: 'payable', label: 'Payable', num: true, render: (r) => (r.payable ? <b>{money(r.payable)}</b> : '-') },
      ]} />
      {edit && <SupplierForm supplier={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

export default function Purchases() {
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [sum, setSum] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api('/purchases/summary').then(setSum).catch(() => {}); }, []);
  useEffect(() => {
    if (tab === 'suppliers') return;
    setLoading(true);
    api('/purchases', { params: { status: tab, q, limit: LIMIT, offset } }).then(setData).catch((e) => toast(e.message, 'error')).finally(() => setLoading(false));
  }, [tab, q, offset, toast]);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Purchases</h1><p>Vehicles and spares received from the OEM and suppliers. Stock updates the moment a bill is saved.</p></div>
        <Link to="/purchases/new" className="btn primary"><Icon name="plus" size={16} />New purchase</Link>
      </div>
      {sum && (
        <div className="grid g4">
          <Stat label="Purchased this month" value={money0(sum.month_total)} hint={`${sum.month_count} bills`} />
          <Stat label="Vehicles received" value={sum.month_vehicles} hint="This month" />
          <Stat label="Spares received" value={money0(sum.month_parts_value)} hint="Taxable value, this month" />
          <Stat label="Payable to suppliers" value={money0(sum.payable_total)} hint={`${sum.payable_count} unpaid bills`} />
        </div>
      )}
      <div className="between">
        <Tabs value={tab} onChange={(v) => { setTab(v); setOffset(0); }} options={[{ value: '', label: 'All' }, { value: 'due', label: 'Payable' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'suppliers', label: 'Suppliers' }]} />
        {tab !== 'suppliers' && <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Number, supplier, bill no." />}
      </div>
      {tab === 'suppliers' ? <Suppliers /> : (
        <div className="card">
          <DataTable loading={loading} rows={data.items} onRowClick={(r) => nav(`/purchases/${r.id}`)} empty={<Empty icon="truck" title="No purchases yet" />}
            columns={[
              { key: 'supplier_name', label: 'Supplier', primary: true, render: (r) => <><b>{r.supplier_name}</b>{r.supplier_invoice_no && <span className="muted small"> · Bill {r.supplier_invoice_no}</span>}</> },
              { key: 'number', label: 'Number' },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'contents', label: 'Received', render: (r) => [r.vehicles && `${r.vehicles} vehicle${r.vehicles > 1 ? 's' : ''}`, r.parts && `${r.parts} spares`].filter(Boolean).join(' · ') || '-' },
              { key: 'total', label: 'Total', num: true, render: (r) => money(r.total) },
              { key: 'balance', label: 'Balance', num: true, render: (r) => (r.balance > 0 ? <b>{money(r.balance)}</b> : '-') },
              { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
            ]} />
          <Pager total={data.total} offset={offset} limit={LIMIT} onChange={setOffset} />
        </div>
      )}
    </div>
  );
}
