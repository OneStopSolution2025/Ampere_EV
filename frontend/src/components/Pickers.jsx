import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { Empty, Field, Modal, useToast } from './ui';
import { api } from '../api';
import { GST_RATES, INDIAN_STATES, money, r2 } from '../utils';

/* ---------- Customer selection ---------- */
export function CustomerSelect({ customer, onChange, locked }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [show, setShow] = useState(false);
  const [adding, setAdding] = useState(false);
  const timer = useRef();

  useEffect(() => {
    if (!show) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api('/customers', { params: { q, limit: 8 } }).then((r) => setResults(r.items)).catch(() => {});
    }, 200);
  }, [q, show]);

  if (customer) {
    return (
      <div className="card card-pad" style={{ padding: 14 }}>
        <div className="between">
          <div>
            <b>{customer.name}</b>
            <div className="small muted">{[customer.phone, customer.state, customer.gstin && `GSTIN ${customer.gstin}`].filter(Boolean).join(' · ')}</div>
          </div>
          {!locked && <button type="button" className="btn sm" onClick={() => onChange(null)}>Change</button>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="picker">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div className="search grow">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search customer by name, phone, reg. or chassis no." value={q}
              onFocus={() => setShow(true)} onBlur={() => setTimeout(() => setShow(false), 150)}
              onChange={(e) => setQ(e.target.value)} />
          </div>
          <button type="button" className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} /><span className="hide-sm">New</span></button>
        </div>
        {show && results.length > 0 && (
          <div className="picker-list">
            {results.map((c) => (
              <button type="button" key={c.id} onMouseDown={() => { onChange(c); setQ(''); }}>
                <span><b>{c.name}</b><br /><span className="small muted">{c.phone || 'No phone'}</span></span>
                <span className="small muted">{c.vehicles.map((v) => v.label).join(', ')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {adding && <CustomerForm onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); onChange(c); }} />}
    </>
  );
}

export function SubdealerSelect({ value, onChange, locked }) {
  const [list, setList] = useState([]);
  useEffect(() => { api('/subdealers').then(setList).catch(() => {}); }, []);
  const sel = list.find((s) => s.id === value);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <select className="input" value={value || ''} disabled={locked} onChange={(e) => onChange(e.target.value ? list.find((s) => s.id === +e.target.value) : null)}>
        <option value="">Select sub-dealer</option>
        {list.map((s) => <option key={s.id} value={s.id}>{s.name}{s.state ? ` · ${s.state}` : ''}</option>)}
      </select>
      {sel && (
        <div className="small muted">
          Outstanding <b style={{ color: 'var(--ink)' }}>{money(sel.outstanding)}</b>
          {sel.credit_limit > 0 && <> · Credit available <b style={{ color: sel.credit_available < 0 ? 'var(--red)' : 'var(--ink)' }}>{money(sel.credit_available)}</b></>}
          {' '}· Holding {sel.vehicles_holding} vehicle(s)
        </div>
      )}
    </div>
  );
}

export function VehicleSelect({ customer, value, onChange, onCustomerUpdate, locked }) {
  const [adding, setAdding] = useState(false);
  if (!customer) return null;
  return (
    <>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <select className="input grow" value={value || ''} disabled={locked} onChange={(e) => onChange(e.target.value ? +e.target.value : null)}>
          <option value="">Select vehicle</option>
          {customer.vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.label} {[v.make, v.model, v.color].filter(Boolean).join(' ')}</option>
          ))}
        </select>
        {!locked && <button type="button" className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={16} /><span className="hide-sm">Vehicle</span></button>}
      </div>
      {adding && (
        <VehicleForm customerId={customer.id} onClose={() => setAdding(false)}
          onSaved={(v) => { setAdding(false); onCustomerUpdate({ ...customer, vehicles: [...customer.vehicles, v] }); onChange(v.id); }} />
      )}
    </>
  );
}

/* ---------- Customer & vehicle forms ---------- */
const EMPTY_VEHICLE = { reg_no: '', make: 'Ampere', model: '', color: '', fuel_type: 'Electric', year: '', vin: '', motor_no: '', battery_no: '', odometer: '' };

function VehicleFields({ v, set, optional }) {
  const up = (k) => (e) => set({ ...v, [k]: e.target.value.toUpperCase() });
  return (
    <div className="form-grid">
      <Field label="Registration number"><input className="input" value={v.reg_no || ''} placeholder="TN57AB1234 (if registered)" onChange={up('reg_no')} /></Field>
      <Field label={`Chassis no. / VIN${optional ? '' : ' (if not registered)'}`}><input className="input" value={v.vin || ''} onChange={up('vin')} /></Field>
      <Field label="Make"><input className="input" value={v.make || ''} onChange={(e) => set({ ...v, make: e.target.value })} /></Field>
      <Field label="Model"><input className="input" value={v.model || ''} placeholder="Magnus EX" onChange={(e) => set({ ...v, model: e.target.value })} /></Field>
      <Field label="Colour"><input className="input" value={v.color || ''} onChange={(e) => set({ ...v, color: e.target.value })} /></Field>
      <Field label="Powertrain">
        <select className="input" value={v.fuel_type || ''} onChange={(e) => set({ ...v, fuel_type: e.target.value })}>
          {['Electric', 'Hybrid', 'Petrol', 'Diesel', 'CNG'].map((f) => <option key={f}>{f}</option>)}
        </select>
      </Field>
      <Field label="Battery no."><input className="input" value={v.battery_no || ''} onChange={up('battery_no')} /></Field>
      <Field label="Motor no."><input className="input" value={v.motor_no || ''} onChange={up('motor_no')} /></Field>
      <Field label="Year"><input className="input" type="number" value={v.year || ''} onChange={(e) => set({ ...v, year: e.target.value })} /></Field>
      <Field label="Odometer (km)"><input className="input" type="number" value={v.odometer ?? ''} onChange={(e) => set({ ...v, odometer: e.target.value })} /></Field>
    </div>
  );
}

const cleanVehicle = (v) => ({
  ...v, reg_no: v.reg_no || null, vin: v.vin || null, year: v.year ? +v.year : null,
  odometer: v.odometer === '' || v.odometer === null || v.odometer === undefined ? null : +v.odometer,
});

export function VehicleForm({ customerId, vehicle, onClose, onSaved }) {
  const [v, setV] = useState(vehicle || EMPTY_VEHICLE);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const saved = vehicle
        ? await api(`/vehicles/${vehicle.id}`, { method: 'PUT', body: cleanVehicle(v) })
        : await api(`/customers/${customerId}/vehicles`, { method: 'POST', body: cleanVehicle(v) });
      toast('Vehicle saved'); onSaved(saved);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title={vehicle ? 'Edit vehicle' : 'Add vehicle'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="vform" disabled={busy}>Save vehicle</button></>}>
      <form id="vform" onSubmit={save}><VehicleFields v={v} set={setV} /></form>
    </Modal>
  );
}

export function CustomerForm({ customer, onClose, onSaved }) {
  const [c, setC] = useState(customer || { name: '', phone: '', email: '', address: '', gstin: '', state: 'Tamil Nadu' });
  const [v, setV] = useState(EMPTY_VEHICLE);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...c, gstin: c.gstin?.toUpperCase() || null, vehicles: !customer && (v.reg_no || v.vin) ? [cleanVehicle(v)] : [] };
      const saved = customer
        ? await api(`/customers/${customer.id}`, { method: 'PUT', body })
        : await api('/customers', { method: 'POST', body });
      toast('Customer saved'); onSaved(saved);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title={customer ? 'Edit customer' : 'New customer'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="cform" disabled={busy}>Save customer</button></>}>
      <form id="cform" onSubmit={save} className="stack">
        <div className="form-grid">
          <Field label="Full name *"><input className="input" required minLength={2} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
          <Field label="Mobile number"><input className="input" type="tel" inputMode="tel" value={c.phone || ''} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={c.email || ''} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
          <Field label="GSTIN (business customers)"><input className="input" value={c.gstin || ''} maxLength={15} onChange={(e) => setC({ ...c, gstin: e.target.value.toUpperCase() })} /></Field>
          <Field label="State (place of supply)">
            <select className="input" value={c.state || ''} onChange={(e) => setC({ ...c, state: e.target.value })}>
              <option value="">Not specified</option>
              {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Address"><input className="input" value={c.address || ''} onChange={(e) => setC({ ...c, address: e.target.value })} /></Field>
        </div>
        {!customer && (
          <div className="stack" style={{ gap: 10 }}>
            <h3>Vehicle for service <span className="muted small">(optional. Vehicles bought here are added automatically.)</span></h3>
            <VehicleFields v={v} set={setV} />
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ---------- Showroom vehicle (chassis) picker ---------- */
export function UnitPicker({ exclude = [], onPick, onClose }) {
  const [q, setQ] = useState('');
  const [units, setUnits] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => api('/invoices/units/available', { params: { q } }).then(setUnits).catch(() => setUnits([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  const list = (units || []).filter((u) => !exclude.includes(u.id));
  return (
    <Modal title="Select vehicle from showroom stock" onClose={onClose} wide>
      <div className="stack">
        <div className="search"><Icon name="search" size={16} />
          <input className="input" autoFocus placeholder="Model, colour, chassis or battery no." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {units === null ? <div className="empty">Loading…</div> : list.length === 0 ? <Empty icon="scooter" title="No matching vehicles in showroom stock" /> : (
          <div className="card">
            {list.map((u) => (
              <button type="button" key={u.id} className="list-row" style={{ width: '100%', border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => onPick(u)}>
                <div>
                  <b>{u.model}</b> <span className="muted">· {u.color || '-'}</span>
                  <div className="small muted mono">Chassis {u.chassis_no}{u.battery_no ? ` · Battery ${u.battery_no}` : ''}</div>
                </div>
                <b className="mono">{money(u.price)}</b>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- Line item editor with catalogue search ---------- */
function ItemSearch({ value, kinds, onText, onPick }) {
  const [show, setShow] = useState(false);
  const [items, setItems] = useState([]);
  const [hl, setHl] = useState(0);
  const timer = useRef();
  const kindKey = kinds.join(',');
  useEffect(() => {
    if (!show) return;
    clearTimeout(timer.current);
    const allowed = kindKey.split(',');
    const kind = allowed.length === 1 ? allowed[0] : '';
    timer.current = setTimeout(() => api('/items', { params: { q: value, kind, limit: 12 } })
      .then((r) => setItems(r.filter((i) => allowed.includes(i.kind)))).catch(() => {}), 150);
  }, [value, show, kindKey]);
  const pick = (it) => { onPick(it); setShow(false); };
  return (
    <div className="picker">
      <input className="input" value={value} placeholder={kinds.includes('service') ? 'Search part or labour, or type a description' : 'Search spare part'} required
        onFocus={() => setShow(true)} onBlur={() => setTimeout(() => setShow(false), 150)}
        onChange={(e) => { onText(e.target.value); setShow(true); setHl(0); }}
        onKeyDown={(e) => {
          if (!show || !items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, items.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); pick(items[hl]); }
        }} />
      {show && items.length > 0 && (
        <div className="picker-list">
          {items.map((it, i) => (
            <button type="button" key={it.id} className={i === hl ? 'hl' : ''} onMouseDown={() => pick(it)}>
              <span>{it.name}<br /><span className="small muted">{it.kind === 'part' ? `Part · Stock ${it.stock} ${it.unit}` : 'Labour / Service'}{it.sku ? ` · ${it.sku}` : ''}</span></span>
              <span className="mono">{money(it.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const blankLine = (kind = 'service') => ({ key: Math.random(), item_id: null, vehicle_unit_id: null, kind, description: '', hsn_sac: '', qty: 1, unit_price: 0, discount: 0, gst_rate: 18 });

export const unitLine = (u) => ({
  key: Math.random(), item_id: u.item_id, vehicle_unit_id: u.id, kind: 'vehicle', description: u.model,
  hsn_sac: u.hsn_sac || '', qty: 1, unit_price: u.price, discount: 0, gst_rate: u.gst_rate,
  unit: { chassis_no: u.chassis_no, motor_no: u.motor_no, battery_no: u.battery_no, color: u.color },
});

/**
 * kinds: which catalogue kinds may be searched ('part', 'service').
 * vehicles: allow adding showroom vehicles by chassis.
 */
export function LineEditor({ lines, setLines, discount = true, readOnly = false, kinds = ['part', 'service'], vehicles = false }) {
  const [picking, setPicking] = useState(false);
  const update = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i) => setLines(lines.filter((_, j) => j !== i));
  const nd = discount ? '' : ' nodisc';
  return (
    <div className="lines">
      <div className={`line-head${nd}`}>
        <span>Item</span><span>Qty</span><span>Rate</span>{discount && <span>Discount</span>}<span>GST %</span><span className="right">Amount</span><span />
      </div>
      {lines.map((l, i) => {
        const taxable = r2((+l.qty || 0) * (+l.unit_price || 0) - (+l.discount || 0));
        const amount = r2(taxable * (1 + (+l.gst_rate || 0) / 100));
        const isVehicle = l.kind === 'vehicle';
        return (
          <div className={`line${nd}`} key={l.key ?? l.id ?? i}>
            <div>
              {readOnly || isVehicle ? <b>{l.description}</b> : (
                <ItemSearch value={l.description} kinds={kinds}
                  onText={(t) => update(i, { description: t, item_id: null })}
                  onPick={(it) => update(i, { item_id: it.id, kind: it.kind, description: it.name, hsn_sac: it.hsn_sac || '', unit_price: it.price, gst_rate: it.gst_rate })} />
              )}
              <div className="small muted" style={{ marginTop: 4 }}>
                {isVehicle ? (
                  l.unit ? <span className="mono">Chassis {l.unit.chassis_no}{l.unit.color ? ` · ${l.unit.color}` : ''}{l.unit.battery_no ? ` · Battery ${l.unit.battery_no}` : ''}</span>
                    : <span style={{ color: 'var(--amber)' }}>No chassis selected</span>
                ) : readOnly || l.item_id || kinds.length === 1 ? (l.kind === 'part' ? 'Part' : 'Labour') : (
                  <select style={{ border: 0, background: 'none', color: 'var(--accent)', font: 'inherit', padding: 0 }}
                    value={l.kind} onChange={(e) => update(i, { kind: e.target.value })}>
                    <option value="service">Labour</option><option value="part">Part</option>
                  </select>
                )}
                {l.hsn_sac ? ` · HSN/SAC ${l.hsn_sac}` : ''}
              </div>
            </div>
            <div><span className="lbl">Qty</span><input className="input" type="number" step="any" min="0.01" required disabled={readOnly || isVehicle} value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} /></div>
            <div><span className="lbl">Rate</span><input className="input" type="number" step="any" min="0" required disabled={readOnly} value={l.unit_price} onChange={(e) => update(i, { unit_price: e.target.value })} /></div>
            {discount && <div><span className="lbl">Discount ₹</span><input className="input" type="number" step="any" min="0" disabled={readOnly} value={l.discount} onChange={(e) => update(i, { discount: e.target.value })} /></div>}
            <div><span className="lbl">GST %</span>
              <select className="input" disabled={readOnly} value={l.gst_rate} onChange={(e) => update(i, { gst_rate: +e.target.value })}>
                {GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
              </select>
            </div>
            <div className="amt">{money(amount)}</div>
            {!readOnly && <button type="button" className="btn ghost sm icon danger" onClick={() => remove(i)} aria-label="Remove line"><Icon name="trash" size={16} /></button>}
          </div>
        );
      })}
      {!readOnly && (
        <div className="row" style={{ paddingTop: 10 }}>
          {vehicles && <button type="button" className="btn sm primary" onClick={() => setPicking(true)}><Icon name="scooter" size={16} />Add vehicle</button>}
          <button type="button" className="btn sm" onClick={() => setLines([...lines, blankLine(kinds[0] === 'part' && kinds.length === 1 ? 'part' : 'service')])}>
            <Icon name="plus" size={16} />{vehicles ? 'Add accessory / part' : 'Add line'}
          </button>
        </div>
      )}
      {picking && <UnitPicker exclude={lines.map((l) => l.vehicle_unit_id).filter(Boolean)} onClose={() => setPicking(false)}
        onPick={(u) => { setLines([...lines.filter((l) => l.description || l.kind === 'vehicle'), unitLine(u)]); setPicking(false); }} />}
    </div>
  );
}

export const toLinePayload = (lines) => lines.filter((l) => l.description?.trim()).map((l) => ({
  item_id: l.item_id || null, vehicle_unit_id: l.vehicle_unit_id || null, kind: l.kind, description: l.description.trim(),
  hsn_sac: l.hsn_sac || null, qty: +l.qty, unit_price: +l.unit_price, discount: +(l.discount || 0), gst_rate: +l.gst_rate,
}));
