import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { blankLine, CustomerSelect, LineEditor, toLinePayload, VehicleSelect } from '../components/Pickers';
import { Badge, Field, Modal, useConfirm, useToast } from '../components/ui';
import { can } from '../permissions';
import { computeTotals, fmtDateTime, money, PAYMENT_MODES } from '../utils';

const NEXT = {
  open: [['in_progress', 'Start work', 'primary']],
  in_progress: [['completed', 'Mark completed', 'primary'], ['open', 'Move back to open', '']],
  completed: [['in_progress', 'Reopen', '']],
  cancelled: [['open', 'Restore', '']],
};

function BillModal({ job, total, onClose, onDone }) {
  const [collect, setCollect] = useState(true);
  const [pay, setPay] = useState({ amount: total, mode: 'cash', reference: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      const body = collect && +pay.amount > 0 ? { ...pay, amount: +pay.amount } : undefined;
      const inv = await api(`/jobcards/${job.id}/invoice`, { method: 'POST', body });
      toast(`Invoice ${inv.number} created`); onDone(inv);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Create invoice" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={submit}>Create invoice</button></>}>
      <div className="stack">
        <div className="between"><span className="muted">Amount payable</span><b style={{ fontSize: 20 }}>{money(total)}</b></div>
        <label className="check"><input type="checkbox" checked={collect} onChange={(e) => setCollect(e.target.checked)} />Record payment now</label>
        {collect && (
          <div className="form-grid">
            <Field label="Amount received"><input className="input" type="number" step="any" min="0" max={total} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Mode">
              <select className="input" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            {pay.mode !== 'cash' && <Field label="Reference / UTR" full><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function JobCardDetail() {
  const { id } = useParams();
  const isNew = !id;
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [job, setJob] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({ vehicle_id: null, technician_id: '', odometer: '', fuel_level: '', complaints: '', diagnosis: '', estimated_delivery: '' });
  const [lines, setLines] = useState([]);
  const [techs, setTechs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState(false);

  const staff = can.createJob(user.role);
  const locked = job && ['invoiced', 'cancelled'].includes(job.status);
  const techLocked = user.role === 'technician' && job?.status === 'completed';
  const editable = !locked && !techLocked;

  useEffect(() => { api('/users/technicians').then(setTechs).catch(() => {}); }, []);

  useEffect(() => {
    if (isNew) { setLines([blankLine()]); return; }
    api(`/jobcards/${id}`).then(async (j) => {
      setJob(j);
      setForm({
        vehicle_id: j.vehicle_id, technician_id: j.technician_id || '', odometer: j.odometer || '', fuel_level: j.fuel_level || '',
        complaints: j.complaints || '', diagnosis: j.diagnosis || '', estimated_delivery: j.estimated_delivery || '',
      });
      setLines(j.items.map((i) => ({ ...i, key: i.id, discount: 0 })));
      if (staff) setCustomer(await api(`/customers/${j.customer_id}`));
    }).catch((e) => { toast(e.message, 'error'); nav('/jobcards'); });
  }, [id, isNew, staff, nav, toast]);

  const totals = useMemo(() => computeTotals(lines.filter((l) => l.description), false), [lines]);

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      let saved;
      if (staff) {
        if (!customer || !form.vehicle_id) throw new Error('Select a customer and vehicle');
        const body = {
          ...form, customer_id: customer.id, technician_id: form.technician_id ? +form.technician_id : null,
          odometer: form.odometer ? +form.odometer : null, estimated_delivery: form.estimated_delivery || null,
          items: toLinePayload(lines),
        };
        saved = isNew ? await api('/jobcards', { method: 'POST', body }) : await api(`/jobcards/${id}`, { method: 'PUT', body });
      } else {
        saved = await api(`/jobcards/${id}/work`, { method: 'PATCH', body: { diagnosis: form.diagnosis, items: toLinePayload(lines) } });
      }
      toast('Job card saved');
      if (isNew) nav(`/jobcards/${saved.id}`, { replace: true }); else setJob(saved);
      return true;
    } catch (err) { toast(err.message, 'error'); return false; } finally { setBusy(false); }
  };

  const changeStatus = async (status) => {
    if (status === 'cancelled' && !(await confirm('Cancel this job card? It can be restored later.', { action: 'Cancel job card', danger: true }))) return;
    try {
      if (status === 'completed' && editable && !(await save())) return;
      setJob(await api(`/jobcards/${id}/status`, { method: 'PATCH', body: { status } }));
      toast('Status updated');
    } catch (e) { toast(e.message, 'error'); }
  };

  const remove = async () => {
    if (!(await confirm('Delete this job card permanently?', { action: 'Delete', danger: true }))) return;
    try { await api(`/jobcards/${id}`, { method: 'DELETE' }); toast('Job card deleted'); nav('/jobcards'); } catch (e) { toast(e.message, 'error'); }
  };

  if (!isNew && !job) return <div className="empty">Loading…</div>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form className="stack" onSubmit={save}>
      {confirmDialog}
      <div className="page-head">
        <div>
          <Link to="/jobcards" className="small row" style={{ gap: 4 }}><Icon name="back" size={14} />Job cards</Link>
          <h1 style={{ marginTop: 6 }}>{isNew ? 'New job card' : job.number} {job && <Badge status={job.status} />}</h1>
          {job && <p>{job.vehicle_reg} · {job.customer_name}{job.customer_phone ? ` · ${job.customer_phone}` : ''} · Opened {fmtDateTime(job.created_at)}</p>}
        </div>
        <div className="row">
          {job && staff && !locked && <button type="button" className="btn ghost danger" onClick={() => changeStatus('cancelled')}>Cancel job</button>}
          {job && can.deleteJob(user.role) && job.status !== 'invoiced' && <button type="button" className="btn ghost icon danger" onClick={remove} aria-label="Delete"><Icon name="trash" size={16} /></button>}
          {job && (NEXT[job.status] || []).filter(() => staff || job.status !== 'cancelled').map(([s, label, cls]) => (
            <button type="button" key={s} className={`btn ${cls}`} onClick={() => changeStatus(s)}>{label}</button>
          ))}
          {job && staff && !locked && lines.length > 0 && <button type="button" className="btn dark" onClick={async () => { if (await save()) setBilling(true); }}><Icon name="receipt" size={16} />Create invoice</button>}
          {job?.invoice_id && staff && <Link className="btn primary" to={`/billing/${job.invoice_id}`}>View invoice</Link>}
        </div>
      </div>

      <div className="grid g3">
        <div className="card card-pad stack span2">
          <h2>Vehicle & customer</h2>
          {staff ? (
            <>
              <CustomerSelect customer={customer} onChange={(c) => { if (locked) return; setCustomer(c); setForm({ ...form, vehicle_id: c?.vehicles.length === 1 ? c.vehicles[0].id : null }); }} />
              {customer && <VehicleSelect customer={customer} value={form.vehicle_id} onChange={(v) => setForm({ ...form, vehicle_id: v })} onCustomerUpdate={setCustomer} />}
            </>
          ) : (
            <div><b>{job.vehicle_reg}</b> {job.vehicle_name}<div className="muted small">{job.customer_name}</div></div>
          )}
          <Field label="Customer complaints">
            <textarea className="input" disabled={!staff || locked} value={form.complaints} onChange={set('complaints')} placeholder="Range dropped, charger not working, brake noise…" />
          </Field>
          <Field label="Technician diagnosis / work notes">
            <textarea className="input" disabled={!editable} value={form.diagnosis} onChange={set('diagnosis')} placeholder="Findings and work performed" />
          </Field>
        </div>
        <div className="card card-pad stack">
          <h2>Job details</h2>
          <Field label="Technician">
            <select className="input" disabled={!staff || locked} value={form.technician_id} onChange={set('technician_id')}>
              <option value="">Unassigned</option>
              {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Odometer (km)"><input className="input" type="number" disabled={!staff || locked} value={form.odometer} onChange={set('odometer')} /></Field>
          <Field label="Battery charge at check-in">
            <select className="input" disabled={!staff || locked} value={form.fuel_level} onChange={set('fuel_level')}>
              <option value="">-</option>{['0-20%', '20-50%', '50-80%', '80-100%'].map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Promised delivery"><input className="input" type="date" disabled={!staff || locked} value={form.estimated_delivery} onChange={set('estimated_delivery')} /></Field>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Parts & labour</h2><span className="muted small">Estimate incl. GST: <b className="mono" style={{ color: 'var(--ink)' }}>{money(totals.total)}</b></span></div>
        <div className="card-pad"><LineEditor lines={lines} setLines={setLines} discount={false} readOnly={!editable} /></div>
      </div>

      {editable && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create job card' : 'Save changes'}</button>
        </div>
      )}
      {billing && <BillModal job={job} total={totals.total} onClose={() => setBilling(false)} onDone={(inv) => nav(`/billing/${inv.id}`)} />}
    </form>
  );
}
