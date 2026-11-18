import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Badge, DataTable, Field, Modal, useConfirm, useToast } from '../components/ui';
import { amt, fmtDate, modeLabel, money, n2, PAYMENT_MODES, today } from '../utils';

export default function PurchaseView() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [p, setP] = useState(null);
  const [paying, setPaying] = useState(null);

  useEffect(() => { api(`/purchases/${id}`).then(setP).catch((e) => toast(e.message, 'error')); }, [id, toast]);
  if (!p) return <div className="empty">Loading…</div>;
  const active = p.status !== 'cancelled';
  const act = async (fn, msg) => { try { setP(await fn()); toast(msg); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div className="stack">
      {confirmDialog}
      <div className="page-head">
        <div>
          <Link to="/purchases" className="small row" style={{ gap: 4 }}><Icon name="back" size={14} />Purchases</Link>
          <h1 style={{ marginTop: 6 }}>{p.number} <Badge status={p.status} /></h1>
          <p>{p.supplier.name}{p.supplier_invoice_no ? ` · Bill ${p.supplier_invoice_no}` : ''} · {fmtDate(p.date)}</p>
        </div>
        <div className="row">
          {active && <button className="btn ghost danger" onClick={async () => {
            if (await confirm('Cancel this purchase? Spares are deducted and vehicles removed from stock. Vehicles already sold block cancellation.', { action: 'Cancel purchase', danger: true }))
              act(() => api(`/purchases/${p.id}/cancel`, { method: 'POST' }), 'Purchase cancelled');
          }}>Cancel</button>}
          <button className="btn" onClick={() => window.print()}><Icon name="print" size={16} />Print</button>
          {active && p.balance > 0 && <button className="btn primary" onClick={() => setPaying({ amount: p.balance, mode: 'bank', reference: '', date: today() })}><Icon name="rupee" size={16} />Pay supplier</button>}
        </div>
      </div>

      <div className="grid g4">
        <div className="card stat"><div className="label">Bill total</div><div className="value">{money(p.total)}</div></div>
        <div className="card stat"><div className="label">Taxable</div><div className="value">{money(p.taxable)}</div><div className="hint">GST {money(p.cgst + p.sgst + p.igst)}{p.is_interstate ? ' (IGST)' : ''}</div></div>
        <div className="card stat"><div className="label">Paid</div><div className="value">{money(p.paid)}</div></div>
        <div className="card stat"><div className="label">Balance</div><div className="value">{money(p.balance)}</div></div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Items</h2></div>
        <DataTable rows={p.lines} columns={[
          { key: 'description', label: 'Item', primary: true, render: (r) => <><b>{r.description}</b> <span className="small muted">{r.kind === 'vehicle' ? 'Vehicle' : 'Spare'}</span></> },
          { key: 'hsn_sac', label: 'HSN', hideSm: true },
          { key: 'qty', label: 'Qty', num: true, render: (r) => n2(r.qty) },
          { key: 'unit_price', label: 'Rate', num: true, render: (r) => amt(r.unit_price) },
          { key: 'gst_rate', label: 'GST', num: true, render: (r) => `${r.gst_rate}%` },
          { key: 'total', label: 'Amount', num: true, render: (r) => amt(r.total) },
        ]} />
      </div>

      {p.units.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Vehicles received ({p.units.length})</h2><Link to="/vehicle-stock" className="small">Vehicle stock</Link></div>
          <DataTable rows={p.units} columns={[
            { key: 'chassis_no', label: 'Chassis', primary: true, render: (r) => <b className="mono">{r.chassis_no}</b> },
            { key: 'model', label: 'Model' },
            { key: 'color', label: 'Colour' },
            { key: 'battery_no', label: 'Battery', hideSm: true, render: (r) => <span className="mono">{r.battery_no || '—'}</span> },
            { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
          ]} />
        </div>
      )}

      {p.payments.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Payments to supplier</h2></div>
          {p.payments.map((x) => (
            <div key={x.id} className="list-row">
              <div><b>{money(x.amount)}</b> <span className="muted">· {modeLabel(x.mode)}{x.reference ? ` · ${x.reference}` : ''}</span><div className="small muted">{fmtDate(x.date)}</div></div>
              {user.role === 'admin' && active && <button className="btn ghost sm icon danger" aria-label="Delete payment" onClick={async () => {
                if (await confirm('Delete this supplier payment?', { action: 'Delete', danger: true })) act(() => api(`/purchases/payments/${x.id}`, { method: 'DELETE' }), 'Payment removed');
              }}><Icon name="trash" size={16} /></button>}
            </div>
          ))}
        </div>
      )}
      {p.notes && <div className="card card-pad"><b>Notes:</b> {p.notes}</div>}

      {paying && (
        <Modal title="Pay supplier" onClose={() => setPaying(null)}
          footer={<><button className="btn" onClick={() => setPaying(null)}>Cancel</button><button className="btn primary" onClick={() => act(() => api(`/purchases/${p.id}/payments`, { method: 'POST', body: { ...paying, amount: +paying.amount } }), 'Payment recorded').then(() => setPaying(null))}>Save payment</button></>}>
          <div className="form-grid">
            <Field label={`Amount (balance ${money(p.balance)})`}><input className="input" type="number" step="any" value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: e.target.value })} /></Field>
            <Field label="Date"><input className="input" type="date" value={paying.date} onChange={(e) => setPaying({ ...paying, date: e.target.value })} /></Field>
            <Field label="Mode"><select className="input" value={paying.mode} onChange={(e) => setPaying({ ...paying, mode: e.target.value })}>{PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
            <Field label="Reference / UTR"><input className="input" value={paying.reference} onChange={(e) => setPaying({ ...paying, reference: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
