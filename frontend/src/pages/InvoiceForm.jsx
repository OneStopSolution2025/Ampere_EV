import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { blankLine, CustomerSelect, LineEditor, SubdealerSelect, toLinePayload, VehicleSelect } from '../components/Pickers';
import { Field, useToast } from '../components/ui';
import { CATEGORY } from '../permissions';
import { computeTotals, money, PAYMENT_MODES, today } from '../utils';

const KINDS = { vehicle: ['part'], spare: ['part'], service: ['part', 'service'] };

export default function InvoiceForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = Boolean(id);
  const { business } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [category, setCategory] = useState(['vehicle', 'spare', 'service'].includes(params.get('category')) ? params.get('category') : 'service');
  const [docType, setDocType] = useState(params.get('type') === 'estimate' ? 'estimate' : 'invoice');
  const [party, setParty] = useState('customer'); // customer | subdealer
  const [customer, setCustomer] = useState(null);
  const [subdealer, setSubdealer] = useState(null);
  const [vehicleId, setVehicleId] = useState(null);
  const [meta, setMeta] = useState({ date: today(), odometer: '', notes: '' });
  const [interstate, setInterstate] = useState(null);
  const [lines, setLines] = useState(category === 'vehicle' ? [] : [blankLine(category === 'spare' ? 'part' : 'service')]);
  const [collect, setCollect] = useState(false);
  const [pay, setPay] = useState({ amount: '', mode: 'cash', reference: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api(`/invoices/${id}`).then(async (inv) => {
      setDocType(inv.doc_type); setCategory(inv.category);
      if (inv.subdealer_id) {
        setParty('subdealer'); setSubdealer({ id: inv.subdealer_id, ...inv.customer });
      } else {
        setCustomer(await api(`/customers/${inv.customer_id}`));
        setVehicleId(inv.vehicle?.id || null);
      }
      setMeta({ date: inv.date, odometer: inv.odometer || '', notes: inv.notes || '' });
      setInterstate(inv.is_interstate);
      setLines(inv.lines.map((l) => ({ ...l, key: l.id })));
    }).catch((e) => toast(e.message, 'error'));
  }, [editing, id, toast]);

  const billTo = party === 'subdealer' ? subdealer : customer;
  const autoInterstate = Boolean(billTo?.state && business?.state && billTo.state.toLowerCase() !== business.state.toLowerCase());
  const isInter = interstate ?? autoInterstate;
  const valid = lines.filter((l) => l.description?.trim());
  const totals = useMemo(() => computeTotals(valid, isInter), [valid, isInter]);
  const cfg = CATEGORY[category];

  const submit = async (e) => {
    e.preventDefault();
    if (!billTo) return toast(party === 'subdealer' ? 'Select a sub-dealer' : 'Select a customer', 'error');
    if (category === 'service' && !vehicleId) return toast('Select the vehicle being serviced', 'error');
    if (category === 'vehicle' && !valid.some((l) => l.kind === 'vehicle')) return toast('Add at least one vehicle', 'error');
    if (!valid.length) return toast('Add at least one item', 'error');
    setBusy(true);
    try {
      const body = {
        doc_type: docType, category, date: meta.date,
        customer_id: party === 'customer' ? customer.id : null, subdealer_id: party === 'subdealer' ? subdealer.id : null,
        vehicle_id: party === 'customer' && category === 'service' ? vehicleId : null,
        odometer: meta.odometer ? +meta.odometer : null, notes: meta.notes || null, is_interstate: isInter,
        items: toLinePayload(valid),
        payment: !editing && docType === 'invoice' && collect && +pay.amount > 0 ? { ...pay, amount: +pay.amount } : null,
      };
      const inv = editing ? await api(`/invoices/${id}`, { method: 'PUT', body }) : await api('/invoices', { method: 'POST', body });
      toast(`${inv.number} saved`);
      nav(`/billing/${inv.id}`, { replace: true });
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="page-head">
        <div>
          <Link to={cfg.path} className="small row" style={{ gap: 4 }}><Icon name="back" size={14} />{cfg.label}</Link>
          <h1 style={{ marginTop: 6 }}>{editing ? 'Edit' : 'New'} {docType === 'invoice' ? cfg.single.toLowerCase() : category === 'vehicle' ? 'quotation' : 'estimate'}</h1>
        </div>
        {!editing && (
          <div className="tabs">
            <button type="button" className={docType === 'invoice' ? 'on' : ''} onClick={() => setDocType('invoice')}>Invoice</button>
            <button type="button" className={docType === 'estimate' ? 'on' : ''} onClick={() => setDocType('estimate')}>{category === 'vehicle' ? 'Quotation' : 'Estimate'}</button>
          </div>
        )}
      </div>

      <div className="grid g3">
        <div className="card card-pad stack span2">
          <div className="between">
            <h2>Bill to</h2>
            {category !== 'service' && !editing && (
              <div className="seg">
                <button type="button" className={party === 'customer' ? 'on' : ''} onClick={() => { setParty('customer'); setInterstate(null); }}>Customer</button>
                <button type="button" className={party === 'subdealer' ? 'on' : ''} onClick={() => { setParty('subdealer'); setInterstate(null); }}>Sub-dealer</button>
              </div>
            )}
          </div>
          {party === 'subdealer'
            ? <SubdealerSelect value={subdealer?.id} locked={editing} onChange={(s) => { setSubdealer(s); setInterstate(null); }} />
            : <CustomerSelect customer={customer} onChange={(c) => { setCustomer(c); setInterstate(null); setVehicleId(c?.vehicles.length === 1 ? c.vehicles[0].id : null); }} />}
          {category === 'service' && customer && <VehicleSelect customer={customer} value={vehicleId} onChange={setVehicleId} onCustomerUpdate={setCustomer} />}
          {category === 'vehicle' && party === 'customer' && <p className="small muted" style={{ margin: 0 }}>The vehicle is added to the customer's profile automatically for future service.</p>}
          {category === 'vehicle' && party === 'subdealer' && <p className="small muted" style={{ margin: 0 }}>Vehicles move to the sub-dealer's stock and are tracked until they report the retail sale.</p>}
        </div>
        <div className="card card-pad stack">
          <Field label="Date"><input className="input" type="date" required value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></Field>
          {category === 'service' && <Field label="Odometer (km)"><input className="input" type="number" value={meta.odometer} onChange={(e) => setMeta({ ...meta, odometer: e.target.value })} /></Field>}
          <label className="check">
            <input type="checkbox" checked={isInter} onChange={(e) => setInterstate(e.target.checked)} />
            Inter-state supply (IGST)
          </label>
          <span className="small muted" style={{ marginTop: -10 }}>{interstate === null ? 'Set automatically from the party’s state' : 'Set manually'}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>{category === 'vehicle' ? 'Vehicles & accessories' : category === 'spare' ? 'Spare parts' : 'Parts & labour'}</h2><span className="small muted">Rates are exclusive of GST</span></div>
        <div className="card-pad"><LineEditor lines={lines} setLines={setLines} kinds={KINDS[category]} vehicles={category === 'vehicle'} /></div>
      </div>

      <div className="grid g2">
        <div className="card card-pad stack">
          <Field label="Notes (printed on the bill)">
            <textarea className="input" value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} placeholder={category === 'vehicle' ? 'Finance, insurance, registration details…' : 'Warranty, next service due, etc.'} />
          </Field>
          {!editing && docType === 'invoice' && (
            <>
              <label className="check"><input type="checkbox" checked={collect} onChange={(e) => { setCollect(e.target.checked); if (e.target.checked && !pay.amount) setPay({ ...pay, amount: totals.total }); }} />Record payment now</label>
              {collect && (
                <div className="form-grid">
                  <Field label="Amount received"><input className="input" type="number" step="any" min="0" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
                  <Field label="Mode">
                    <select className="input" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                      {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </Field>
                  {pay.mode !== 'cash' && <Field label="Reference / UTR" full><input className="input" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>}
                </div>
              )}
            </>
          )}
        </div>
        <div className="card card-pad">
          <div className="totals">
            <div><span className="muted">Subtotal</span><span>{money(totals.subtotal)}</span></div>
            {totals.discount > 0 && <div><span className="muted">Discount</span><span>− {money(totals.discount)}</span></div>}
            <div><span className="muted">Taxable value</span><span>{money(totals.taxable)}</span></div>
            {isInter
              ? <div><span className="muted">IGST</span><span>{money(totals.igst)}</span></div>
              : <><div><span className="muted">CGST</span><span>{money(totals.cgst)}</span></div><div><span className="muted">SGST</span><span>{money(totals.sgst)}</span></div></>}
            {totals.round_off !== 0 && <div><span className="muted">Round off</span><span>{money(totals.round_off)}</span></div>}
            <div className="grand"><span>Total</span><span>{money(totals.total)}</span></div>
          </div>
          <button className="btn primary" style={{ width: '100%', marginTop: 20 }} disabled={busy}>
            {busy ? 'Saving…' : `Save ${docType === 'invoice' ? 'invoice' : category === 'vehicle' ? 'quotation' : 'estimate'}`}
          </button>
        </div>
      </div>
    </form>
  );
}
