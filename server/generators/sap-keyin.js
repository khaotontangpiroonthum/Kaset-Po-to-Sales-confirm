// SAP key-in helper: produces a clean single-page HTML in VA01 field order
// so the user can type the SO into SAP without cross-referencing the PO PDF.
import { formatDate } from './fill-specs.js';

export function generateSapKeyin(parsed, customer, edits) {
  const env = {
    sc_date_iso:    edits.sc_date_iso || new Date().toISOString().slice(0, 10),
    sc_ref_no:      edits.sc_ref_no   || `${customer.ref_prefix}???/${new Date().getFullYear()}`,
    payment_terms:  edits.payment_terms || customer.default_payment_terms,
    incoterms:      edits.incoterms    || customer.default_incoterms,
    eta_text:       edits.eta_text || '',
  };
  const lines = (edits.lines || parsed.lines || []).map((ln, i) => ({ ...parsed.lines[i], ...ln }));

  const rowsHtml = lines.map((l, i) => `
    <tr>
      <td>${i + 1}0</td>
      <td>${escape(l.item_code)}</td>
      <td>${escape(l.description)} ${escape(l.brand ? `"${l.brand}"` : '')}</td>
      <td>${escape(normalizePack(l.packing_raw))}</td>
      <td class="num">${fmt(l.qty)}</td>
      <td>${escape(l.qty_unit)}</td>
      <td class="num">${fmt(l.qty_mt, 4)}</td>
      <td class="num">${fmt(l.price_per_unit, 2)}</td>
      <td class="num">${fmt(l.price_per_mt, 2)}</td>
      <td class="num">${fmt(l.line_total, 2)}</td>
    </tr>`).join('');

  const totalMt     = lines.reduce((s, l) => s + (l.qty_mt || 0), 0);
  const totalAmount = lines.reduce((s, l) => s + (l.line_total || 0), 0);

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>SAP Key-in — ${escape(env.sc_ref_no)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial; font-size: 12px; color: #111; max-width: 900px; margin: 24px auto; padding: 0 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 18px 0 6px; padding: 4px 8px; background: #1f2937; color: white; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .field { display: grid; grid-template-columns: 180px 1fr; gap: 4px 12px; margin: 2px 0; }
  .field b { color: #444; font-weight: 600; }
  .note { font-size: 11px; color: #6b7280; margin-top: 4px; }
  @media print { body { margin: 0; } h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
<h1>SAP VA01 — Sales Order Key-in Sheet</h1>
<div class="note">${escape(customer.name)} • PO ${escape(parsed.po_number || '?')} • SC ${escape(env.sc_ref_no)} • Generated ${escape(env.sc_date_iso)}</div>

<h2>Sold-to / Ship-to</h2>
<div class="field"><b>Sold-to party:</b><span>${escape(customer.buyer.name)}</span></div>
<div class="field"><b>Address:</b><span>${escape(customer.buyer.address)}</span></div>
<div class="field"><b>Ship-to party:</b><span>${escape(customer.buyer.ship_to_address || customer.buyer.address)}</span></div>
<div class="field"><b>PO number:</b><span>${escape(parsed.po_number || '')}</span></div>
<div class="field"><b>PO date:</b><span>${escape(parsed.po_date || '[set in SAP]')}</span></div>
<div class="field"><b>Their supplier code:</b><span>${escape(customer.buyer.vendor_no_for_them || customer.buyer.supplier_code_for_them || '')}</span></div>

<h2>Header — Sales Order</h2>
<div class="field"><b>Currency:</b><span>${escape(parsed.currency || 'USD')}</span></div>
<div class="field"><b>Incoterms (1):</b><span>${escape(env.incoterms.split(' ')[0])}</span></div>
<div class="field"><b>Incoterms (2):</b><span>${escape(env.incoterms.split(' ').slice(1).join(' '))}</span></div>
<div class="field"><b>Payment terms:</b><span>${escape(env.payment_terms)}</span></div>
<div class="field"><b>Requested delivery date / ETD:</b><span>${escape(env.eta_text || parsed.shipment?.etd || '[set in SAP]')}</span></div>
<div class="field"><b>Port of loading:</b><span>${escape(customer.default_port_of_loading)}</span></div>
<div class="field"><b>Port of discharge:</b><span>${escape(customer.default_port_of_discharge)}</span></div>
<div class="field"><b>Sales Confirmation Ref:</b><span>${escape(env.sc_ref_no)}</span></div>

<h2>Items (VA01 grid)</h2>
<table>
  <thead><tr>
    <th>Item</th><th>Material (cust)</th><th>Description</th><th>Packing</th>
    <th>Qty</th><th>UoM</th><th>MT</th><th>Price/Unit</th><th>Price/MT</th><th>Net</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
  <tfoot>
    <tr><td colspan="6" class="num"><b>Total</b></td>
        <td class="num"><b>${fmt(totalMt, 4)}</b></td>
        <td colspan="2"></td>
        <td class="num"><b>${fmt(totalAmount, 2)}</b></td></tr>
  </tfoot>
</table>

<h2>Special instructions to copy into SAP texts</h2>
<ul>
${(parsed.special_clauses || []).map(s => `<li>${escape(s)}</li>`).join('\n')}
</ul>

<div class="note">Tip: open this next to SAP, open VA01, and tab through. Field order matches the standard "Create Sales Order: Initial Screen" + Item Overview.</div>
</body></html>`;
}

function escape(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmt(n, dp = 0) {
  if (n == null || n === '' || Number.isNaN(n)) return '';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function normalizePack(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, '');
}
