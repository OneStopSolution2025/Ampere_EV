import { useEffect, useState } from 'react';
import { api } from '../api';
import Icon from '../components/Icon';
import { Badge, DataTable, Field, Modal, useToast, PasswordInput } from '../components/ui';
import { ROLE_LABELS } from '../permissions';

const ROLE_HELP = {
  admin: 'Full access, including users and business settings.',
  manager: 'Billing, job cards, inventory, reports. Can cancel invoices.',
  cashier: 'Customers, job cards, billing and payments. No reports.',
  technician: 'Sees only assigned job cards. Records diagnosis, parts and progress.',
  subdealer: 'Portal for a sub-dealer: their vehicles, bills and ledger only. Can mark vehicles as retailed.',
};

function UserForm({ user, onClose, onSaved }) {
  const [f, setF] = useState(user ? { ...user, password: '' } : { name: '', email: '', phone: '', role: 'cashier', subdealer_id: null, is_active: true, password: '' });
  const [dealers, setDealers] = useState([]);
  useEffect(() => { api('/subdealers', { params: { include_inactive: true } }).then(setDealers).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    const body = { ...f, password: f.password || null, subdealer_id: f.role === 'subdealer' ? f.subdealer_id : null };
    try { onSaved(user ? await api(`/users/${user.id}`, { method: 'PUT', body }) : await api('/users', { method: 'POST', body })); toast('User saved'); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title={user ? 'Edit user' : 'New user'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="uform" disabled={busy}>Save user</button></>}>
      <form id="uform" onSubmit={save} className="form-grid">
        <Field label="Full name *"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email (login) *" full><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role" full>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="small muted" style={{ fontWeight: 400 }}>{ROLE_HELP[f.role]}</span>
        </Field>
        {f.role === 'subdealer' && (
          <Field label="Sub-dealer *" full>
            <select className="input" required value={f.subdealer_id || ''} onChange={(e) => setF({ ...f, subdealer_id: e.target.value ? +e.target.value : null })}>
              <option value="">Select sub-dealer</option>
              {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={user ? 'New password (leave blank to keep)' : 'Password *'} full>
          <PasswordInput minLength={6} required={!user} value={f.password} autoComplete="new-password" onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <label className="check full"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />Active (can sign in)</label>
      </form>
    </Modal>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/users').then(setUsers).catch((e) => toast(e.message, 'error')); }, [toast]);
  const upsert = (u) => setUsers((l) => (l.some((x) => x.id === u.id) ? l.map((x) => (x.id === u.id ? u : x)) : [...l, u]));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Users & roles</h1><p>Each role sees a dashboard and menu tailored to its work. Administrators see and control everything.</p></div>
        <button className="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={16} />New user</button>
      </div>
      <div className="grid g3">
        {Object.entries(ROLE_HELP).map(([k, v]) => (
          <div key={k} className="card card-pad"><b>{ROLE_LABELS[k]}</b><div className="small muted" style={{ marginTop: 4 }}>{v}</div>
            <div className="small" style={{ marginTop: 8 }}>{users.filter((u) => u.role === k).length} user(s)</div></div>
        ))}
      </div>
      <div className="card">
        <DataTable rows={users} onRowClick={setEditing} columns={[
          { key: 'name', label: 'Name', primary: true, render: (r) => <b>{r.name}</b> },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone', hideSm: true },
          { key: 'role', label: 'Role', render: (r) => <><Badge tone="blue">{ROLE_LABELS[r.role]}</Badge>{r.subdealer_name && <div className="small muted">{r.subdealer_name}</div>}</> },
          { key: 'is_active', label: 'Status', render: (r) => <Badge tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'Active' : 'Disabled'}</Badge> },
        ]} />
      </div>
      {editing && <UserForm user={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={(u) => { upsert(u); setEditing(null); }} />}
    </div>
  );
}
