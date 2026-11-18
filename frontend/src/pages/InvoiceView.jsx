import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Badge, Field, Modal, useConfirm, useToast } from '../components/ui';
import { can, CATEGORY } from '../permissions';
import { amountInWords, amt, fmtDate, modeLabel, money, n2, PAYMENT_MODES, today } from '../utils';

function PaymentModal({ inv, onClose, onSaved }) {
  const balance = Math.round((inv.total - inv.paid) * 100) / 100;
  const [p, setP] = useState({ amount: balance, mode: 'cash', reference: '', date: today() });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { onSaved(await api(`/invoices/${inv.id}/payments`, { method: 'POST', body: { ...p, amount: +p.amount } })); toast('Payment recorded'); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Record payment" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="pform" disabled={busy}>Save payment</button></>}>
      <form id="pform" onSubmit={save} className="form-grid">
        <Field label={`Amount (balance ${money(balance)})`}><input className="input" type="number" step="any" min="0.01" max={balance} required value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} /></Field>
        <Field label="Date"><input className="input" type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
        <Field label="Mode">
          <select className="input" value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value })}>
            {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Reference / UTR"><input className="input" value={p.reference} onChange={(e) => setP({ ...p, reference: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

export default function InvoiceView() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [inv, setInv] = useState(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => { api(`/invoices/${id}`).then(setInv).catch((e) => toast(e.message, 'error')); }, [id, toast]);
  if (!inv) return <div className="empty">Loading…</div>;

  const b = inv.business;
  const isInvoice = inv.doc_type === 'invoice';
  const active = inv.status !== 'cancelled';
  const staff = can.bill(user.role);
  const canEdit = staff && active && inv.status !== 'converted' && (!isInvoice || inv.payments.length === 0 || can.editPaidInvoice(user.role));
  const cat = CATEGORY[inv.category] || CATEGORY.service;
  const backTo = user.role === 'subdealer' ? '/my-bills' : `${cat.path}${isInvoice ? '' : '?type=estimate'}`;

  const act = async (fn, msg) => { try { const r = await fn(); if (r) setInv(r); toast(msg); return r; } catch (e) { toast(e.message, 'error'); } };
  const cancel = async () => {
    if (await confirm(`Cancel ${inv.number}? Stock will be restored. This cannot be undone.`, { action: 'Cancel document', danger: true }))
      act(() => api(`/invoices/${inv.id}/cancel`, { method: 'POST' }), 'Document cancelled');
  };
  const convert = async () => {
    const r = await act(() => api(`/invoices/${inv.id}/convert`, { method: 'POST' }), 'Converted to invoice');
    if (r) nav(`/billing/${r.id}`);
  };
  const removePayment = async (pid) => {
    if (await confirm('Delete this payment entry?', { action: 'Delete', danger: true }))
      act(() => api(`/payments/${pid}`, { method: 'DELETE' }), 'Payment removed');
  };
  const share = () => {
    const balance = inv.total - inv.paid;
    const text = [
      `${b.name}`, `${isInvoice ? 'Invoice' : 'Estimate'} ${inv.number} dated ${fmtDate(inv.date)}`,
      inv.vehicle ? `Vehicle: ${inv.vehicle.reg_no || inv.vehicle.vin}` : '', `Amount: ${money(inv.total)}`,
      isInvoice && balance > 0 ? `Balance due: ${money(balance)}` : '', b.upi_id && isInvoice && balance > 0 ? `Pay via UPI: ${b.upi_id}` : '',
      'Thank you for your business.',
    ].filter(Boolean).join('\n');
    const phone = (inv.customer.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const taxRows = Object.values(inv.lines.reduce((acc, l) => {
    const k = l.gst_rate;
    acc[k] = acc[k] || { rate: k, taxable: 0, tax: 0 };
    acc[k].taxable += l.taxable; acc[k].tax += l.tax;
    return acc;
  }, {}));

  return (
    <div className="stack">
      {confirmDialog}
      <div className="page-head no-print">
        <div>
          <Link to={backTo} className="small row" style={{ gap: 4 }}><Icon name="back" size={14} />{user.role === 'subdealer' ? 'Bills & Ledger' : cat.label}</Link>
          <h1 style={{ marginTop: 6 }}>{inv.number} <Badge status={inv.status} /></h1>
          {isInvoice && active && <p>Paid {money(inv.paid)} of {money(inv.total)}{inv.balance > 0 ? ` · Balance ${money(inv.balance)}` : ''}</p>}
          {inv.converted_to_id && <p><Link to={`/billing/${inv.converted_to_id}`}>View converted invoice →</Link></p>}
        </div>
        <div className="row">
          {staff && active && can.cancelInvoice(user.role) && <button className="btn ghost danger" onClick={cancel}>Cancel</button>}
          {canEdit && <Link to={`/billing/${inv.id}/edit`} className="btn"><Icon name="edit" size={16} />Edit</Link>}
          {staff && <button className="btn" onClick={share}><Icon name="share" size={16} />WhatsApp</button>}
          <button className="btn" onClick={() => window.print()}><Icon name="print" size={16} />Print / PDF</button>
          {staff && !isInvoice && inv.status === 'open' && <button className="btn primary" onClick={convert}>Convert to invoice</button>}
          {staff && isInvoice && active && inv.balance > 0 && <button className="btn primary" onClick={() => setPaying(true)}><Icon name="rupee" size={16} />Record payment</button>}
        </div>
      </div>

      <article className="doc">
        <header className="doc-head">
          <div>
            <h2>{b.name}</h2>
            {b.tagline && <div className="small muted">{b.tagline}</div>}
            <div className="small" style={{ whiteSpace: 'pre-line', marginTop: 6 }}>{b.address}</div>
            <div className="small">{[b.phone, b.email].filter(Boolean).join(' · ')}</div>
            {b.gstin && <div className="small"><b>GSTIN:</b> {b.gstin} · State: {b.state} ({b.state_code})</div>}
          </div>
          <div className="doc-title">
            <h1>{isInvoice ? 'Tax Invoice' : inv.category === 'vehicle' ? 'Quotation' : 'Estimate'}</h1>
            <div className="small muted">{cat.single}</div>
            <div className="small" style={{ marginTop: 6 }}><b>{inv.number}</b></div>
            <div className="small">Date: {fmtDate(inv.date)}</div>
            {inv.status === 'cancelled' && <div className="badge red" style={{ marginTop: 6 }}>CANCELLED</div>}
          </div>
        </header>

        <section className="doc-meta">
          <div>
            <h4>Bill to{inv.customer.is_subdealer ? ' · Sub-dealer' : ''}</h4>
            <b>{inv.customer.name}</b>
            {inv.customer.address && <div className="small">{inv.customer.address}</div>}
            <div className="small">{inv.customer.phone}</div>
            {inv.customer.gstin && <div className="small"><b>GSTIN:</b> {inv.customer.gstin}</div>}
            <div className="small">Place of supply: {inv.customer.state || b.state}</div>
          </div>
          {inv.vehicle && (
            <div>
              <h4>Vehicle</h4>
              <b>{inv.vehicle.reg_no || `Chassis ${inv.vehicle.vin}`}</b>
              <div className="small">{[inv.vehicle.make, inv.vehicle.model, inv.vehicle.variant].filter(Boolean).join(' ')}</div>
              <div className="small">{[inv.vehicle.color, inv.vehicle.fuel_type, inv.vehicle.year].filter(Boolean).join(' · ')}</div>
              {inv.vehicle.battery_no && <div className="small">Battery: {inv.vehicle.battery_no}</div>}
              {inv.odometer && <div className="small">Odometer: {n2(inv.odometer)} km</div>}
              {inv.vehicle.vin && inv.vehicle.reg_no && <div className="small">Chassis: {inv.vehicle.vin}</div>}
            </div>
          )}
        </section>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Description</th><th className="hide-sm">HSN/SAC</th><th className="num">Qty</th><th className="num">Rate</th><th className="num hide-sm">Disc.</th><th className="num">GST</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={l.id}>
                  <td>{i + 1}</td>
                  <td>{l.description}<div className="small muted">{l.kind === 'vehicle' ? 'Vehicle' : l.kind === 'part' ? 'Part' : 'Labour'}</div>{l.unit && <div className="small mono" style={{ lineHeight: 1.6 }}>Chassis {l.unit.chassis_no}{l.unit.motor_no ? <><br />Motor {l.unit.motor_no}</> : ''}{l.unit.battery_no ? <><br />Battery {l.unit.battery_no}</> : ''}{l.unit.charger_no ? <><br />Charger {l.unit.charger_no}</> : ''}{l.unit.color ? <><br />Colour {l.unit.color}</> : ''}</div>}</td>
                  <td className="hide-sm">{l.hsn_sac || '—'}</td>
                  <td className="num">{n2(l.qty)}</td>
                  <td className="num">{amt(l.unit_price)}</td>
                  <td className="num hide-sm">{l.discount ? amt(l.discount) : '—'}</td>
                  <td className="num">{l.gst_rate}%</td>
                  <td className="num">{amt(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="doc-foot">
          <div>
            <table>
              <thead><tr><th>GST rate</th><th className="num">Taxable</th>{inv.is_interstate ? <th className="num">IGST</th> : <><th className="num">CGST</th><th className="num">SGST</th></>}</tr></thead>
              <tbody>
                {taxRows.map((t) => (
                  <tr key={t.rate}>
                    <td>{t.rate}%</td><td className="num">{amt(t.taxable)}</td>
                    {inv.is_interstate ? <td className="num">{amt(t.tax)}</td> : <><td className="num">{amt(t.tax / 2)}</td><td className="num">{amt(t.tax / 2)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="words"><b>Amount in words:</b> {amountInWords(inv.total)}</div>
            {inv.notes && <p className="small"><b>Notes:</b> {inv.notes}</p>}
            {b.bank_details && <p className="small" style={{ whiteSpace: 'pre-line' }}><b>Bank details:</b><br />{b.bank_details}</p>}
            {b.upi_id && isInvoice && <p className="small"><b>UPI:</b> {b.upi_id}</p>}
            {b.terms && <p className="small muted" style={{ whiteSpace: 'pre-line' }}><b>Terms:</b><br />{b.terms}</p>}
          </div>
          <div>
            <div className="totals">
              <div><span>Subtotal</span><span>{money(inv.subtotal)}</span></div>
              {inv.discount > 0 && <div><span>Discount</span><span>− {money(inv.discount)}</span></div>}
              <div><span>Taxable value</span><span>{money(inv.taxable)}</span></div>
              {inv.is_interstate
                ? <div><span>IGST</span><span>{money(inv.igst)}</span></div>
                : <><div><span>CGST</span><span>{money(inv.cgst)}</span></div><div><span>SGST</span><span>{money(inv.sgst)}</span></div></>}
              {inv.round_off !== 0 && <div><span>Round off</span><span>{money(inv.round_off)}</span></div>}
              <div className="grand"><span>Total</span><span>{money(inv.total)}</span></div>
              {isInvoice && inv.paid > 0 && <div><span>Paid</span><span>{money(inv.paid)}</span></div>}
              {isInvoice && active && inv.balance > 0 && <div><b>Balance due</b><b>{money(inv.balance)}</b></div>}
            </div>
            <div className="sign"><div>For {b.name}<br />Authorised signatory</div></div>
          </div>
        </section>
      </article>

      {isInvoice && inv.payments.length > 0 && (
        <div className="card no-print">
          <div className="card-head"><h2>Payments</h2></div>
          {inv.payments.map((p) => (
            <div key={p.id} className="list-row">
              <div><b>{money(p.amount)}</b> <span className="muted">· {modeLabel(p.mode)}{p.reference ? ` · ${p.reference}` : ''}</span><div className="small muted">{fmtDate(p.date)}</div></div>
              {can.deletePayment(user.role) && active && <button className="btn ghost sm icon danger" onClick={() => removePayment(p.id)} aria-label="Delete payment"><Icon name="trash" size={16} /></button>}
            </div>
          ))}
        </div>
      )}
      {paying && <PaymentModal inv={inv} onClose={() => setPaying(false)} onSaved={(r) => { setInv(r); setPaying(false); }} />}
    </div>
  );
}
