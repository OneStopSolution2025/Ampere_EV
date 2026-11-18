import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Field, useToast } from '../components/ui';
import { computeTotals, GST_RATES, money, PAYMENT_MODES, r2, today } from '../utils';
import { SupplierForm } from './Purchases';

const blankUnit = () => ({ chassis_no: '', motor_no: '', battery_no: '', charger_no: '', color: '' });

function CatalogueSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const [items, setItems] = useState([]);
  const t = useRef();
  useEffect(() => {
    if (!show) return;
    clearTimeout(t.current);
    t.current = setTimeout(() => api('/items', { params: { q, limit: 15 } }).then((r) => setItems(r.filter((i) => i.kind !== 'service'))).catch(() => {}), 150);
  }, [q, show]);
  return (
    <div className="picker">
      <div className="search"><Icon name="search" size={16} />
        <input className="input" value={q} placeholder="Add vehicle model or spare part…" onFocus={() => setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 150)} onChange={(e) => setQ(e.target.value)} />
      </div>
      {show && items.length > 0 && (
        <div className="picker-list">
          {items.map((it) => (
            <button type="button" key={it.id} onMouseDown={() => { onPick(it); setQ(''); }}>
              <span>{it.name}<br /><span className="small muted">{it.kind === 'vehicle' ? 'Vehicle model' : 'Spare part'} · Stock {it.stock}</span></span>
              <span className="mono">{money(it.cost_price || 0)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PurchaseForm() {
  const nav = useNavigate();
  const toast = useToast();
  const { business } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [meta, setMeta] = useState({ supplier_invoice_no: '', date: today(), notes: '' });
  const [interstate, setInterstate] = useState(null);
  const [lines, setLines] = useState([]);
  const [collect, setCollect] = useState(false);
  const [pay, setPay] = useState({ amount: '', mode: 'bank', reference: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/suppliers').then((s) => { setSuppliers(s); if (s.length === 1) setSupplierId(String(s[0].id)); }).catch(() => {}); }, []);
  const supplier = suppliers.find((s) => String(s.id) === String(supplierId));
  const isInter = interstate ?? Boolean(supplier?.state && business?.state && supplier.state.toLowerCase() !== business.state.toLowerCase());
  const totals = useMemo(() => computeTotals(lines, isInter), [lines, isInter]);

  const add = (it) => setLines([...lines, {
    key: Math.random(), item_id: it.id, kind: it.kind, description: it.name, qty: 1, unit_price: it.cost_price || 0,
    discount: 0, gst_rate: it.gst_rate, units: it.kind === 'vehicle' ? [blankUnit()] : [],
  }]);
  const update = (i, patch) => setLines(lines.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, ...patch };
    if (n.kind === 'vehicle' && 'qty' in patch) {
      const q = Math.max(1, Math.min(100, parseInt(patch.qty, 10) || 1));
      n.qty = q;
      n.units = Array.from({ length: q }, (_, k) => l.units[k] || blankUnit());
    }
    return n;
  }));
  const setUnit = (i, k, patch) => update(i, { units: lines[i].units.map((u, x) => (x === k ? { ...u, ...patch } : u)) });

  const submit = async (e) => {
    e.preventDefault();
    if (!supplierId) return toast('Select a supplier', 'error');
    if (!lines.length) return toast('Add at least one item', 'error');
    setBusy(true);
    try {
      const p = await api('/purchases', {
        method: 'POST', body: {
          supplier_id: +supplierId, supplier_invoice_no: meta.supplier_invoice_no || null, date: meta.date, notes: meta.notes || null,
          is_interstate: isInter,
          items: lines.map((l) => ({ item_id: l.item_id, qty: +l.qty, unit_price: +l.unit_price, discount: +l.discount || 0, gst_rate: +l.gst_rate, units: l.kind === 'vehicle' ? l.units : [] })),
          payment: collect && +pay.amount > 0 ? { ...pay, amount: +pay.amount } : null,
        },
      });
      toast(`Purchase ${p.number} saved · stock updated`);
      nav(`/purchases/${p.id}`, { replace: true });
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="page-head">
        <div>
          <Link to="/purchases" className="small row" style={{ gap: 4 }}><Icon name="back" size={14} />Purchases</Link>
          <h1 style={{ marginTop: 6 }}>New purchase</h1>
          <p>Enter the supplier's bill. Each vehicle needs its chassis number.</p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Field label="Supplier *">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select className="input grow" required value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setInterstate(null); }}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button type="button" className="btn icon" onClick={() => setAddingSupplier(true)} aria-label="New supplier"><Icon name="plus" size={16} /></button>
            </div>
          </Field>
          <Field label="Supplier bill no."><input className="input" value={meta.supplier_invoice_no} onChange={(e) => setMeta({ ...meta, supplier_invoice_no: e.target.value })} /></Field>
          <Field label="Bill date"><input className="input" type="date" required value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></Field>
          <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={isInter} onChange={(e) => setInterstate(e.target.checked)} />Inter-state (IGST)</label>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Items received</h2><span className="small muted">Rates excl. GST · cost updates the catalogue</span></div>
        <div className="card-pad stack">
          {lines.map((l, i) => {
            const taxable = r2(l.qty * l.unit_price - (+l.discount || 0));
            return (
              <div key={l.key} className="card card-pad" style={{ padding: 14 }}>
                <div className="between">
                  <div><b>{l.description}</b> <span className={`badge ${l.kind === 'vehicle' ? 'blue' : 'gray'}`}>{l.kind === 'vehicle' ? 'Vehicle' : 'Spare'}</span></div>
                  <button type="button" className="btn ghost sm icon danger" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="trash" size={16} /></button>
                </div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginTop: 10 }}>
                  <Field label="Qty"><input className="input" type="number" min="1" step={l.kind === 'vehicle' ? 1 : 'any'} required value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} /></Field>
                  <Field label="Rate"><input className="input" type="number" min="0" step="any" required value={l.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} /></Field>
                  <Field label="Discount ₹"><input className="input" type="number" min="0" step="any" value={l.discount} onChange={(e) => update(i, { discount: e.target.value })} /></Field>
                  <Field label="GST %"><select className="input" value={l.gst_rate} onChange={(e) => update(i, { gst_rate: +e.target.value })}>{GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}</select></Field>
                  <Field label="Amount"><div className="input" style={{ background: 'var(--line-2)', fontWeight: 600 }}>{money(taxable * (1 + l.gst_rate / 100))}</div></Field>
                </div>
                {l.kind === 'vehicle' && (
                  <div style={{ marginTop: 10 }}>
                    <div className="small muted" style={{ fontWeight: 600 }}>Chassis details</div>
                    {l.units.map((u, k) => (
                      <div key={k} className="unit-grid">
                        <input className="input" required minLength={4} placeholder={`Chassis no. ${k + 1} *`} value={u.chassis_no} onChange={(e) => setUnit(i, k, { chassis_no: e.target.value.toUpperCase() })} />
                        <input className="input" placeholder="Motor no." value={u.motor_no} onChange={(e) => setUnit(i, k, { motor_no: e.target.value.toUpperCase() })} />
                        <input className="input" placeholder="Battery no." value={u.battery_no} onChange={(e) => setUnit(i, k, { battery_no: e.target.value.toUpperCase() })} />
                        <input className="input" placeholder="Charger no." value={u.charger_no} onChange={(e) => setUnit(i, k, { charger_no: e.target.value.toUpperCase() })} />
                        <input className="input" placeholder="Colour" value={u.color} onChange={(e) => setUnit(i, k, { color: e.target.value })} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <CatalogueSearch onPick={add} />
          <span className="small muted">New model or part? Add it first in Vehicle Stock or Spares & Labour.</span>
        </div>
      </div>

      <div className="grid g2">
        <div className="card card-pad stack">
          <Field label="Notes"><textarea className="input" value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} placeholder="Transporter, LR number, remarks" /></Field>
          <label className="check"><input type="checkbox" checked={collect} onChange={(e) => { setCollect(e.target.checked); if (e.target.checked && !pay.amount) setPay({ ...pay, amount: totals.total }); }} />Record payment to supplier</label>
          {collect && (
            <div className="form-grid">
              <Field label="Amount paid"><input className="input" type="number" step="any" min="0" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field label="Mode"><select className="input" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
              <Field label="Reference / UTR" full><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
            </div>
          )}
        </div>
        <div className="card card-pad">
          <div className="totals">
            <div><span className="muted">Subtotal</span><span>{money(totals.subtotal)}</span></div>
            {totals.discount > 0 && <div><span className="muted">Discount</span><span>− {money(totals.discount)}</span></div>}
            <div><span className="muted">Taxable value</span><span>{money(totals.taxable)}</span></div>
            {isInter ? <div><span className="muted">IGST</span><span>{money(totals.igst)}</span></div>
              : <><div><span className="muted">CGST</span><span>{money(totals.cgst)}</span></div><div><span className="muted">SGST</span><span>{money(totals.sgst)}</span></div></>}
            {totals.round_off !== 0 && <div><span className="muted">Round off</span><span>{money(totals.round_off)}</span></div>}
            <div className="grand"><span>Bill total</span><span>{money(totals.total)}</span></div>
          </div>
          <button className="btn primary" style={{ width: '100%', marginTop: 20 }} disabled={busy}>{busy ? 'Saving…' : 'Save purchase & update stock'}</button>
        </div>
      </div>
      {addingSupplier && <SupplierForm onClose={() => setAddingSupplier(false)} onSaved={(s) => { setSuppliers([...suppliers, s]); setSupplierId(String(s.id)); setAddingSupplier(false); }} />}
    </form>
  );
}
