import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Badge, DataTable, Empty, Field, Modal, SearchBox, Stat, Tabs, useToast } from '../components/ui';
import { can } from '../permissions';
import { downloadCSV, fmtDate, INDIAN_STATES, money, money0 } from '../utils';

export function SubdealerForm({ dealer, onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(dealer || { name: '', contact_person: '', phone: '', email: '', gstin: '', state: 'Tamil Nadu', address: '', credit_limit: 0, is_active: true });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const body = { ...f, credit_limit: +f.credit_limit || 0 };
    try { onSaved(dealer ? await api(`/subdealers/${dealer.id}`, { method: 'PUT', body }) : await api('/subdealers', { method: 'POST', body })); toast('Sub-dealer saved'); }
    catch (err) { toast(err.message, 'error'); }
  };
  return (
    <Modal title={dealer ? 'Edit sub-dealer' : 'New sub-dealer'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="sdform">Save sub-dealer</button></>}>
      <form id="sdform" onSubmit={save} className="form-grid">
        <Field label="Business name *"><input className="input" required minLength={2} value={f.name} onChange={set('name')} /></Field>
        <Field label="Contact person"><input className="input" value={f.contact_person || ''} onChange={set('contact_person')} /></Field>
        <Field label="Phone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="GSTIN"><input className="input" maxLength={15} value={f.gstin || ''} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} /></Field>
        <Field label="State"><select className="input" value={f.state || ''} onChange={set('state')}><option value="">—</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Address" full><textarea className="input" value={f.address || ''} onChange={set('address')} /></Field>
        <Field label={`Credit limit ₹ ${can.setCreditLimit(user.role) ? '(0 = no limit)' : '(admin only)'}`}>
          <input className="input" type="number" min="0" step="1000" disabled={!can.setCreditLimit(user.role)} value={f.credit_limit} onChange={set('credit_limit')} />
        </Field>
        {dealer && <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Active</label>}
      </form>
    </Modal>
  );
}

export default function Subdealers() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState(null);
  const [sum, setSum] = useState(null);
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const load = () => {
    api('/subdealers', { params: { q, include_inactive: inactive || undefined } }).then(setList).catch(() => setList([]));
    api('/subdealers/summary').then(setSum).catch(() => {});
  };
  useEffect(load, [q, inactive]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Sub-dealers</h1><p>Network partners, their stock, credit and outstanding.</p></div>
        <div className="row">
          {list?.length > 0 && <button className="btn" onClick={() => downloadCSV('subdealers.csv', list.map(({ logins, ...r }) => r))}><Icon name="download" size={16} />Export</button>}
          {can.manageSubdealers(user.role) && <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />New sub-dealer</button>}
        </div>
      </div>
      {sum && (
        <div className="grid g4">
          <Stat label="Active sub-dealers" value={sum.active} />
          <Stat label="Vehicles in their stock" value={sum.vehicles_holding} hint="Billed, not yet retailed" />
          <Stat label="Billed this month" value={money0(sum.month_billed)} />
          <Stat label="Outstanding" value={money0(sum.outstanding)} />
        </div>
      )}
      <div className="between">
        <Tabs value={inactive ? 'all' : 'active'} onChange={(v) => setInactive(v === 'all')} options={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All' }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Name, phone or contact" />
      </div>
      <div className="card">
        <DataTable loading={!list} rows={list || []} onRowClick={(r) => nav(`/subdealers/${r.id}`)} empty={<Empty icon="store" title="No sub-dealers yet" />}
          columns={[
            { key: 'name', label: 'Sub-dealer', primary: true, render: (r) => <><b>{r.name}</b>{!r.is_active && <span className="badge gray" style={{ marginLeft: 6 }}>Inactive</span>}<div className="small muted">{[r.contact_person, r.phone].filter(Boolean).join(' · ')}</div></> },
            { key: 'state', label: 'State', hideSm: true },
            { key: 'vehicles_holding', label: 'Holding', num: true },
            { key: 'retailed_this_month', label: 'Retailed (month)', num: true, hideSm: true },
            { key: 'outstanding', label: 'Outstanding', num: true, render: (r) => (r.outstanding ? <b>{money(r.outstanding)}</b> : '—') },
            { key: 'credit', label: 'Credit left', num: true, render: (r) => (r.credit_limit ? <span style={{ color: r.credit_available < 0 ? 'var(--red)' : undefined }}>{money0(r.credit_available)}</span> : 'No limit') },
          ]} />
      </div>
      {adding && <SubdealerForm onClose={() => setAdding(false)} onSaved={(s) => { setAdding(false); nav(`/subdealers/${s.id}`); }} />}
    </div>
  );
}

/** Used for staff (/subdealers/:id) and for the sub-dealer's own portal (/my-bills). */
export function SubdealerDetail({ portal = false }) {
  const params = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const sid = portal ? user.subdealer_id : params.id;
  const [d, setD] = useState(null);
  const [tab, setTab] = useState(portal ? 'invoices' : 'stock');
  const [units, setUnits] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = () => {
    api(`/subdealers/${sid}`).then(setD).catch((e) => { toast(e.message, 'error'); if (!portal) nav('/subdealers'); });
    if (!portal) api('/vehicle-units', { params: { subdealer_id: sid, limit: 200 } }).then((r) => setUnits(r.items)).catch(() => {});
    api('/invoices', { params: { subdealer_id: sid, doc_type: 'invoice', limit: 100 } }).then((r) => setInvoices(r.items)).catch(() => {});
    api(`/subdealers/${sid}/ledger`).then(setLedger).catch(() => {});
  };
  useEffect(load, [sid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="empty">Loading…</div>;

  const tabs = [
    ...(!portal ? [{ value: 'stock', label: `Vehicles (${units.length})` }] : []),
    { value: 'invoices', label: 'Invoices' }, { value: 'ledger', label: 'Ledger' },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          {!portal && <Link to="/subdealers" className="small row" style={{ gap: 4 }}><Icon name="back" size={14} />Sub-dealers</Link>}
          <h1 style={{ marginTop: 6 }}>{portal ? 'Bills & ledger' : d.name} {!d.is_active && <Badge tone="gray">Inactive</Badge>}</h1>
          <p>{[d.contact_person, d.phone, d.state, d.gstin && `GSTIN ${d.gstin}`].filter(Boolean).join(' · ')}</p>
        </div>
        {!portal && (
          <div className="row">
            {can.manageSubdealers(user.role) && <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Edit</button>}
            <Link to="/billing/new?category=spare" className="btn">Bill spares</Link>
            <Link to="/billing/new?category=vehicle" className="btn primary"><Icon name="bolt" size={16} />Bill vehicles</Link>
          </div>
        )}
      </div>
      <div className="grid g4">
        <Stat label="Outstanding" value={money0(d.outstanding)} hint={d.outstanding > 0 ? `Oldest unpaid bill ${d.oldest_due_days} days` : 'All settled'} trend={d.oldest_due_days > 30 ? 'down' : ''} />
        <Stat label="Credit limit" value={d.credit_limit ? money0(d.credit_limit) : 'No limit'} hint={d.credit_limit ? `Available ${money0(d.credit_available)}` : ''} />
        <Stat label="Vehicles holding" value={d.vehicles_holding} hint={`${d.retailed_this_month} retailed this month`} />
        <Stat label="Billed this month" value={money0(d.month_billed)} hint={`Lifetime ${money0(d.lifetime_billed)}`} />
      </div>
      {!portal && d.logins.length === 0 && user.role === 'admin' && (
        <div className="card card-pad between"><span className="muted">This sub-dealer has no portal login yet. They can see their stock, bills and ledger once you create one.</span><Link to="/users" className="btn sm">Create login</Link></div>
      )}
      <Tabs value={tab} onChange={setTab} options={tabs} />
      {tab === 'stock' && (
        <div className="card">
          <DataTable rows={units} empty={<Empty icon="scooter" title="No vehicles billed to this sub-dealer" />} columns={[
            { key: 'chassis_no', label: 'Chassis', primary: true, render: (r) => <><b className="mono">{r.chassis_no}</b><div className="small muted">{r.model} · {r.color || '—'}</div></> },
            { key: 'retail', label: 'Retail customer', render: (r) => r.retail_customer || '—' },
            { key: 'age_days', label: 'Since', num: true, render: (r) => (r.status === 'sold' ? fmtDate(r.sold_on) : `${r.age_days} d`) },
            { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        </div>
      )}
      {tab === 'invoices' && (
        <div className="card">
          <DataTable rows={invoices} onRowClick={(r) => nav(`/billing/${r.id}`)} empty={<Empty icon="receipt" title="No invoices yet" />} columns={[
            { key: 'number', label: 'Invoice', primary: true },
            { key: 'category', label: 'Type', render: (r) => (r.category === 'vehicle' ? 'Vehicles' : 'Spares') },
            { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'total', label: 'Total', num: true, render: (r) => money(r.total) },
            { key: 'balance', label: 'Balance', num: true, render: (r) => (r.balance > 0 ? <b>{money(r.balance)}</b> : '—') },
            { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        </div>
      )}
      {tab === 'ledger' && ledger && (
        <div className="card">
          <div className="card-head"><h2>Account statement</h2><div className="row"><span className="small muted">Closing balance <b style={{ color: 'var(--ink)' }}>{money(ledger.closing_balance)}</b></span>
            <button className="btn sm" onClick={() => downloadCSV(`ledger-${d.name}.csv`, ledger.entries.map(({ invoice_id, ...r }) => r))}><Icon name="download" size={14} />CSV</button></div></div>
          <DataTable rows={ledger.entries.map((e, i) => ({ ...e, id: i }))} empty={<Empty title="No transactions yet" />} columns={[
            { key: 'date', label: 'Date', primary: true, render: (r) => fmtDate(r.date) },
            { key: 'ref', label: 'Reference', render: (r) => <Link to={`/billing/${r.invoice_id}`}>{r.ref}</Link> },
            { key: 'detail', label: 'Details', hideSm: true },
            { key: 'debit', label: 'Debit', num: true, render: (r) => (r.debit ? money(r.debit) : '') },
            { key: 'credit', label: 'Credit', num: true, render: (r) => (r.credit ? money(r.credit) : '') },
            { key: 'balance', label: 'Balance', num: true, render: (r) => <b>{money(r.balance)}</b> },
          ]} />
        </div>
      )}
      {editing && <SubdealerForm dealer={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
}
