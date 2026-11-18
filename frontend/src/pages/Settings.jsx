import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field, useToast, PasswordInput } from '../components/ui';
import { INDIAN_STATES } from '../utils';

const STATE_CODES = {
  'Andhra Pradesh': '37', 'Arunachal Pradesh': '12', Assam: '18', Bihar: '10', Chhattisgarh: '22', Goa: '30', Gujarat: '24',
  Haryana: '06', 'Himachal Pradesh': '02', Jharkhand: '20', Karnataka: '29', Kerala: '32', 'Madhya Pradesh': '23',
  Maharashtra: '27', Manipur: '14', Meghalaya: '17', Mizoram: '15', Nagaland: '13', Odisha: '21', Punjab: '03',
  Rajasthan: '08', Sikkim: '11', 'Tamil Nadu': '33', Telangana: '36', Tripura: '16', 'Uttar Pradesh': '09',
  Uttarakhand: '05', 'West Bengal': '19', 'Andaman and Nicobar Islands': '35', Chandigarh: '04',
  'Dadra and Nagar Haveli and Daman and Diu': '26', Delhi: '07', 'Jammu and Kashmir': '01', Ladakh: '38',
  Lakshadweep: '31', Puducherry: '34',
};

export function PasswordCard({ plain = false }) {
  const [f, setF] = useState({ current_password: '', new_password: '' });
  const toast = useToast();
  const save = async (e) => {
    e.preventDefault();
    try { await api('/auth/change-password', { method: 'POST', body: f }); toast('Password changed'); setF({ current_password: '', new_password: '' }); }
    catch (err) { toast(err.message, 'error'); }
  };
  return (
    <form className={plain ? 'stack' : 'card card-pad stack'} onSubmit={save}>
      {!plain && <h2>Change your password</h2>}
      <div className="form-grid">
        <Field label="Current password"><PasswordInput required value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></Field>
        <Field label="New password"><PasswordInput minLength={6} required value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></Field>
      </div>
      <div><button className="btn">Update password</button></div>
    </form>
  );
}

export default function Settings() {
  const { setBusiness } = useAuth();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { api('/settings').then(setF).catch((e) => toast(e.message, 'error')); }, [toast]);
  if (!f) return <div className="empty">Loading…</div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api('/settings', { method: 'PUT', body: f }); setF(r); setBusiness(r); toast('Settings saved'); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Settings</h1><p>These details print on every invoice and estimate.</p></div></div>
      <form className="stack" onSubmit={save}>
        <div className="card card-pad stack">
          <h2>Business profile</h2>
          <div className="form-grid">
            <Field label="Business name *"><input className="input" required value={f.name} onChange={set('name')} /></Field>
            <Field label="Tagline"><input className="input" value={f.tagline || ''} onChange={set('tagline')} placeholder="Electric Vehicle Sales & Service" /></Field>
            <Field label="GSTIN"><input className="input" maxLength={15} value={f.gstin || ''} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} /></Field>
            <Field label="State">
              <select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value, state_code: STATE_CODES[e.target.value] || f.state_code })}>
                {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Phone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
            <Field label="Email"><input className="input" type="email" value={f.email || ''} onChange={set('email')} /></Field>
            <Field label="Address" full><textarea className="input" value={f.address || ''} onChange={set('address')} /></Field>
          </div>
        </div>
        <div className="card card-pad stack">
          <h2>Numbering & payments</h2>
          <div className="form-grid">
            <Field label="Vehicle sale prefix"><input className="input" required maxLength={10} value={f.vehicle_prefix} onChange={set('vehicle_prefix')} /></Field>
            <Field label="Spare bill prefix"><input className="input" required maxLength={10} value={f.spare_prefix} onChange={set('spare_prefix')} /></Field>
            <Field label="Service bill prefix"><input className="input" required maxLength={10} value={f.service_prefix} onChange={set('service_prefix')} /></Field>
            <Field label="Estimate / quotation prefix"><input className="input" required maxLength={10} value={f.estimate_prefix} onChange={set('estimate_prefix')} /></Field>
            <Field label="Job card prefix"><input className="input" required maxLength={10} value={f.jobcard_prefix} onChange={set('jobcard_prefix')} /></Field>
            <Field label="Purchase prefix"><input className="input" required maxLength={10} value={f.purchase_prefix} onChange={set('purchase_prefix')} /></Field>
            <Field label="UPI ID"><input className="input" value={f.upi_id || ''} onChange={set('upi_id')} placeholder="garage@okaxis" /></Field>
            <Field label="Bank details" full><textarea className="input" value={f.bank_details || ''} onChange={set('bank_details')} placeholder="Account name, number, IFSC" /></Field>
            <Field label="Terms & conditions" full><textarea className="input" value={f.terms || ''} onChange={set('terms')} placeholder="Goods once sold will not be taken back…" /></Field>
          </div>
          <span className="small muted">Each business line has its own series and numbers reset every financial year, e.g. {f.vehicle_prefix}/26-27/0001, {f.spare_prefix}/26-27/0001, {f.service_prefix}/26-27/0001.</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy}>Save settings</button></div>
      </form>
      <PasswordCard />
    </div>
  );
}
