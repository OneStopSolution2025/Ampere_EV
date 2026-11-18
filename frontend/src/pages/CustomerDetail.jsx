import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { CustomerForm, VehicleForm } from '../components/Pickers';
import { Badge, DataTable, Empty, Stat, useConfirm, useToast } from '../components/ui';
import { can } from '../permissions';
import { fmtDate, fmtDateTime, money, money0 } from '../utils';

export default function CustomerDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [c, setC] = useState(null);
  const [editing, setEditing] = useState(false);
  const [vehicle, setVehicle] = useState(null); // {} = new, object = edit

  const load = useCallback(() => api(`/customers/${id}`).then(setC).catch((e) => { toast(e.message, 'error'); nav('/customers'); }), [id, nav, toast]);
  useEffect(() => { load(); }, [load]);
  if (!c) return <div className="empty">Loading…</div>;

  const remove = async () => {
    if (!(await confirm(`Delete ${c.name}? This cannot be undone.`, { action: 'Delete', danger: true }))) return;
    try { await api(`/customers/${c.id}`, { method: 'DELETE' }); toast('Customer deleted'); nav('/customers'); } catch (e) { toast(e.message, 'error'); }
  };
  const removeVehicle = async (v) => {
    if (!(await confirm(`Remove vehicle ${v.reg_no}?`, { action: 'Remove', danger: true }))) return;
    try { await api(`/vehicles/${v.id}`, { method: 'DELETE' }); toast('Vehicle removed'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="stack">
      {confirmDialog}
      <div className="page-head">
        <div>
          <Link to="/customers" className="small row" style={{ gap: 4 }}><Icon name="back" size={14} />Customers</Link>
          <h1 style={{ marginTop: 6 }}>{c.name}</h1>
          <p>{[c.phone, c.email, c.state, c.gstin && `GSTIN ${c.gstin}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="row">
          {can.deleteCustomer(user.role) && <button className="btn ghost icon danger" onClick={remove} aria-label="Delete customer"><Icon name="trash" size={16} /></button>}
          <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Edit</button>
          <Link className="btn" to="/jobcards/new"><Icon name="wrench" size={16} />Job card</Link>
          <Link className="btn" to="/billing/new?category=spare">Spare bill</Link>
          <Link className="btn primary" to="/billing/new?category=vehicle"><Icon name="bolt" size={16} />Sell vehicle</Link>
        </div>
      </div>

      <div className="grid g3">
        <Stat label="Lifetime value" value={money0(c.lifetime_value)} />
        <Stat label="Outstanding" value={money0(c.outstanding)} />
        <Stat label="Visits" value={c.jobcards.length} hint={c.jobcards[0] ? `Last ${fmtDateTime(c.jobcards[0].created_at)}` : 'No job cards yet'} />
      </div>

      <div className="card">
        <div className="card-head"><h2>Vehicles</h2><button className="btn sm" onClick={() => setVehicle({})}><Icon name="plus" size={14} />Add vehicle</button></div>
        {c.vehicles.length ? c.vehicles.map((v) => (
          <div key={v.id} className="list-row">
            <div><b>{v.reg_no}</b> <span className="muted">{[v.make, v.model, v.variant].filter(Boolean).join(' ')}</span>
              <div className="small muted">{[v.fuel_type, v.year, v.odometer && `${v.odometer.toLocaleString('en-IN')} km`].filter(Boolean).join(' · ')}</div></div>
            <div className="row">
              <button className="btn ghost sm icon" onClick={() => setVehicle(v)} aria-label="Edit vehicle"><Icon name="edit" size={16} /></button>
              {can.deleteCustomer(user.role) && <button className="btn ghost sm icon danger" onClick={() => removeVehicle(v)} aria-label="Remove vehicle"><Icon name="trash" size={16} /></button>}
            </div>
          </div>
        )) : <Empty icon="car" title="No vehicles yet" />}
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h2>Bills & estimates</h2></div>
          <DataTable rows={c.invoices} onRowClick={(r) => nav(`/billing/${r.id}`)} empty={<Empty icon="receipt" title="No bills yet" />}
            columns={[
              { key: 'number', label: 'Number', primary: true },
              { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'total', label: 'Total', num: true, render: (r) => money(r.total) },
              { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
            ]} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Service history</h2></div>
          <DataTable rows={c.jobcards} onRowClick={(r) => nav(`/jobcards/${r.id}`)} empty={<Empty icon="wrench" title="No job cards yet" />}
            columns={[
              { key: 'number', label: 'Job card', primary: true },
              { key: 'vehicle', label: 'Vehicle' },
              { key: 'created_at', label: 'Opened', render: (r) => fmtDateTime(r.created_at) },
              { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
            ]} />
        </div>
      </div>

      {editing && <CustomerForm customer={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {vehicle && <VehicleForm customerId={c.id} vehicle={vehicle.id ? vehicle : null} onClose={() => setVehicle(null)} onSaved={() => { setVehicle(null); load(); }} />}
    </div>
  );
}
