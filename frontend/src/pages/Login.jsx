import { useState } from 'react';
import { useAuth } from '../auth';
import { Field } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand" style={{ padding: 0 }}>
          <img src="/pwa-192.png" alt="" /><div><b>Ampere EV</b><span>Sales & service</span></div>
        </div>
        <div>
          <h2>Every service, bill and part — in one place.</h2>
          <p>GST-ready invoicing, job tracking and inventory for Ampere EV sales and service.</p>
          <ul>
            <li>Job card to invoice in one tap</li>
            <li>CGST, SGST and IGST handled automatically</li>
            <li>Live stock of batteries, chargers and spares</li>
            <li>Dashboards for owners, cashiers and technicians</li>
          </ul>
        </div>
        <span className="small" style={{ color: '#64748b' }}>Works on desktop, tablet and phone. Install it like an app.</span>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ margin: '4px 0 0' }}>Use the account your administrator created for you.</p>
          </div>
          <Field label="Email">
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <div className="badge red" style={{ borderRadius: 8, padding: '8px 12px' }}>{error}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </div>
  );
}
