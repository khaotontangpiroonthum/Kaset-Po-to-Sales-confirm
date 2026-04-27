// Frontend logic: upload, render review form, edit fields, generate.
const $  = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

let state = { parsed: null, customer: null, edits: { lines: [] }, originals: null };

const HEADER_FIELDS = [
  ['po_number',           'PO Number'],
  ['po_date',             'PO Date'],
  ['buyer_name',          'Buyer'],
  ['buyer_attn',          'Attention'],
  ['sc_ref_no',           'SC Ref No.'],
  ['sc_date_iso',         'SC Date'],
];
const SHIPMENT_FIELDS = [
  ['incoterms',           'Incoterms'],
  ['payment_terms',       'Payment terms'],
  ['port_of_loading',     'Port of loading'],
  ['port_of_discharge',   'Port of discharge'],
  ['eta_text',            'ETA / ETD'],
  ['container',           'Container'],
  ['freight',             'Freight (USD)'],
];

function gotoStep(id) {
  $$('.step').forEach(s => s.classList.toggle('active', s.id === id));
}

$('#upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('#po-file').files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('po', file);
  $('#upload-status').textContent = 'Parsing…';
  $('#upload-status').className = 'status';
  try {
    const r = await fetch('/api/parse', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `error: ${r.status}`);
    initReview(data);
  } catch (err) {
    $('#upload-status').textContent = err.message;
    $('#upload-status').className = 'status error';
  }
});

function initReview({ parsed, customer, issues }) {
  state.parsed = parsed;
  state.customer = customer;
  state.originals = structuredClone(parsed);
  state.edits = {
    sc_date_iso:    new Date().toISOString().slice(0, 10),
    sc_ref_no:      `${customer.ref_prefix}???/${new Date().getFullYear()}`,
    buyer_attn:     parsed.buyer?.attn || customer.buyer.default_attn,
    incoterms:      parsed.shipment?.incoterms    || customer.default_incoterms,
    payment_terms:  parsed.shipment?.payment_terms || customer.default_payment_terms,
    port_of_loading:    customer.default_port_of_loading,
    port_of_discharge:  customer.default_port_of_discharge,
    eta_text:       parsed.shipment?.etd || '',
    container:      parsed.shipment?.container || '1 x 20ft FCL',
    freight:        0,
    lines:          structuredClone(parsed.lines || []),
  };
  renderHeader();
  renderShipment();
  renderItems();
  renderIssues(issues);
  renderClauses(parsed.special_clauses || []);
  $('#upload-status').textContent = `OK — detected: ${customer.name}`;
  $('#upload-status').className = 'status ok';
  gotoStep('step-review');
}

function renderHeader() {
  const host = $('#header-fields');
  host.innerHTML = '';
  for (const [k, label] of HEADER_FIELDS) {
    const v = state.edits[k] ?? state.parsed[k] ?? state.parsed.buyer?.[k] ?? '';
    host.append(field(k, label, v));
  }
  // Customer name (read-only)
  const cust = document.createElement('div');
  cust.className = 'field';
  cust.innerHTML = `<label>Customer</label><div>${state.customer.name} <small style="color:#6b7280">(${state.customer.country})</small></div>`;
  host.prepend(cust);
}

function renderShipment() {
  const host = $('#shipment-fields');
  host.innerHTML = '';
  for (const [k, label] of SHIPMENT_FIELDS) {
    const v = state.edits[k] ?? '';
    host.append(field(k, label, v));
  }
}

function field(key, label, value) {
  const el = document.createElement('div');
  el.className = 'field';
  const orig = originalFieldValue(key);
  const isChanged = orig != null && String(orig) !== String(value);
  el.innerHTML = `<label>${label}</label><input data-field="${key}" value="${escAttr(value ?? '')}" class="${isChanged ? 'changed' : ''}">`;
  el.querySelector('input').addEventListener('input', e => {
    state.edits[key] = e.target.value;
    e.target.classList.toggle('changed', String(originalFieldValue(key) ?? '') !== String(e.target.value));
  });
  return el;
}

function originalFieldValue(key) {
  switch (key) {
    case 'po_number': return state.originals?.po_number;
    case 'po_date':   return state.originals?.po_date;
    case 'buyer_attn': return state.originals?.buyer?.attn;
    case 'incoterms':  return state.originals?.shipment?.incoterms;
    case 'payment_terms': return state.originals?.shipment?.payment_terms;
    case 'eta_text':   return state.originals?.shipment?.etd;
    case 'container':  return state.originals?.shipment?.container;
  }
  return null;
}

function renderItems() {
  const tbody = $('#items tbody');
  tbody.innerHTML = '';
  state.edits.lines.forEach((ln, i) => tbody.append(itemRow(ln, i)));
  recalcTotals();
}

function itemRow(ln, i) {
  const tr = document.createElement('tr');
  const cell = (key, val, opts={}) => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = opts.numeric ? 'number' : 'text';
    if (opts.numeric) input.step = 'any';
    input.value = val ?? '';
    input.dataset.line = i;
    input.dataset.key = key;
    input.addEventListener('input', () => {
      const v = opts.numeric ? (input.value === '' ? null : Number(input.value)) : input.value;
      state.edits.lines[i][key] = v;
      const orig = state.originals?.lines?.[i]?.[key];
      input.classList.toggle('changed', orig != null && String(orig) !== String(v));
      // Recompute derived fields when qty / price change
      if (key === 'qty' || key === 'price_per_unit') {
        const row = state.edits.lines[i];
        if (row.qty != null && row.price_per_unit != null) {
          row.line_total = +(row.qty * row.price_per_unit).toFixed(2);
        }
        if (row.packing?.totalKg && row.qty != null) {
          row.qty_mt = +(row.qty * row.packing.totalKg / 1000).toFixed(4);
        }
        if (row.packing?.totalKg && row.price_per_unit != null) {
          row.price_per_mt = +(row.price_per_unit * 1000 / row.packing.totalKg).toFixed(2);
        }
        renderItems();
      }
    });
    td.append(input);
    return td;
  };
  tr.append(td('#', i + 1));
  tr.append(cell('item_code', ln.item_code));
  tr.append(cell('description', ln.description));
  tr.append(cell('packing_raw', ln.packing_raw));
  tr.append(cell('qty', ln.qty, {numeric: true}));
  tr.append(cell('qty_unit', ln.qty_unit));
  tr.append(cell('qty_mt', ln.qty_mt, {numeric: true}));
  tr.append(cell('price_per_unit', ln.price_per_unit, {numeric: true}));
  tr.append(cell('price_per_mt', ln.price_per_mt, {numeric: true}));
  tr.append(cell('line_total', ln.line_total, {numeric: true}));
  const tdDel = document.createElement('td');
  tdDel.innerHTML = '<span class="del" title="Remove line">✕</span>';
  tdDel.querySelector('.del').addEventListener('click', () => {
    state.edits.lines.splice(i, 1);
    renderItems();
  });
  tr.append(tdDel);
  return tr;
}
function td(_, t) { const x = document.createElement('td'); x.textContent = t; return x; }

function recalcTotals() {
  const mt = state.edits.lines.reduce((s, l) => s + (Number(l.qty_mt) || 0), 0);
  const amt = state.edits.lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0);
  $('#t-mt').textContent = mt.toFixed(4);
  $('#t-amount').textContent = amt.toFixed(2);
}

$('#add-line').addEventListener('click', () => {
  state.edits.lines.push({
    item_code: '', description: '', packing_raw: '',
    qty: null, qty_unit: 'Cartons', qty_mt: null,
    price_per_unit: null, price_per_mt: null, line_total: null,
    packing: null,
  });
  renderItems();
});

function renderIssues(issues) {
  const ul = $('#issues');
  ul.innerHTML = '';
  if (!issues?.length) { ul.innerHTML = '<li class="sev-info">No issues 🎉</li>'; return; }
  for (const it of issues) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="tag ${it.severity}">${it.severity}</span><span class="sev-${it.severity}">${escapeHtml(it.code)}</span> — ${escapeHtml(it.message)}`;
    ul.append(li);
  }
}
function renderClauses(list) {
  const ul = $('#clauses');
  ul.innerHTML = '';
  if (!list.length) { ul.innerHTML = '<li class="sev-info">(none extracted)</li>'; return; }
  for (const c of list) { const li = document.createElement('li'); li.textContent = c; ul.append(li); }
}

$('#gen-btn').addEventListener('click', async () => {
  $('#gen-btn').disabled = true; $('#gen-btn').textContent = 'Generating…';
  try {
    const r = await fetch('/api/generate', {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({ parsed: state.parsed, edits: state.edits, what: ['sc', 'sap'] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `error: ${r.status}`);
    const ul = $('#output-files');
    ul.innerHTML = '';
    for (const f of data.files) {
      const li = document.createElement('li');
      const url = '/' + f.path.split(path.sep || '/').join('/');
      li.innerHTML = `<a href="${url}" target="_blank">${escapeHtml(f.kind.toUpperCase())} — ${escapeHtml(f.path)}</a>`;
      ul.append(li);
    }
    gotoStep('step-output');
  } catch (err) {
    alert('Generation failed: ' + err.message);
  } finally {
    $('#gen-btn').disabled = false; $('#gen-btn').textContent = 'Generate SC & SAP key-in';
  }
});

const path = { sep: '/' };

$('#restart').addEventListener('click', () => location.reload());
$('#restart2').addEventListener('click', () => location.reload());

$('#manual-mode').addEventListener('click', () => gotoStep('step-upload'));
$('#back-to-batch').addEventListener('click', () => gotoStep('step-batch'));
$('#batch-restart').addEventListener('click', () => location.reload());

$('#open-prices').addEventListener('click', async () => {
  await refreshPrices();
  resetPriceForm();
  gotoStep('step-prices');
});
$('#prices-back').addEventListener('click', () => gotoStep('step-batch'));
$('#price-cancel').addEventListener('click', (e) => { e.preventDefault(); resetPriceForm(); });

$('#price-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {};
  for (const el of form.querySelectorAll('[data-field]')) {
    const k = el.dataset.field;
    const v = el.value === '' ? null : el.value;
    if (v !== null) body[k] = v;
  }
  const status = $('#price-status');
  status.textContent = 'Saving…'; status.className = 'status';
  try {
    const r = await fetch('/api/prices', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `error: ${r.status}`);
    status.textContent = 'Saved.'; status.className = 'status ok';
    resetPriceForm();
    await refreshPrices();
  } catch (err) {
    status.textContent = err.message; status.className = 'status error';
  }
});

async function refreshPrices() {
  const r = await fetch('/api/prices');
  const data = await r.json();
  const tbody = $('#prices-table tbody');
  tbody.innerHTML = '';
  if (!data.prices?.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="sev-info">(no prices yet — add one above)</td></tr>';
    return;
  }
  for (const p of data.prices) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.customer_id)}</td>
      <td>${escapeHtml(p.item_code || '')}</td>
      <td>${escapeHtml(p.description_contains || '')}</td>
      <td>${p.packing_kg ?? ''}</td>
      <td style="text-align:right">${Number(p.price_per_mt).toFixed(2)}</td>
      <td>${escapeHtml(p.notes || '')}</td>
      <td>
        <button class="ghost edit-btn" type="button">Edit</button>
        <button class="ghost del-btn" type="button">Delete</button>
      </td>`;
    tr.querySelector('.edit-btn').addEventListener('click', () => loadPriceIntoForm(p));
    tr.querySelector('.del-btn').addEventListener('click', () => deletePrice(p.id));
    tbody.append(tr);
  }
}

function loadPriceIntoForm(p) {
  const form = $('#price-form');
  for (const el of form.querySelectorAll('[data-field]')) {
    const k = el.dataset.field;
    el.value = p[k] ?? '';
  }
  $('#price-status').textContent = `Editing ${p.id}`;
  $('#price-status').className = 'status';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetPriceForm() {
  const form = $('#price-form');
  form.reset();
  for (const el of form.querySelectorAll('[data-field]')) el.value = '';
  $('#price-status').textContent = '';
  $('#price-status').className = 'status';
}

async function deletePrice(id) {
  if (!confirm('Delete this price?')) return;
  const r = await fetch(`/api/prices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (r.ok) await refreshPrices();
  else alert('Delete failed: ' + r.status);
}

$('#batch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = $('#batch-files').files;
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('po', f);

  const status = $('#batch-status');
  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  status.textContent = `Generating ${files.length} sales confirmation${files.length === 1 ? '' : 's'}…`;
  status.className = 'status';

  try {
    const r = await fetch('/api/batch-generate', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `error: ${r.status}`);
    renderBatchResults(data.results);
    const okCount  = data.results.filter(x => x.status === 'ok').length;
    const errCount = data.results.length - okCount;
    status.textContent = errCount === 0
      ? `Done — ${okCount} generated.`
      : `${okCount} generated, ${errCount} failed.`;
    status.className = errCount === 0 ? 'status ok' : 'status error';
  } catch (err) {
    status.textContent = err.message;
    status.className = 'status error';
  } finally {
    submitBtn.disabled = false;
  }
});

function renderBatchResults(results) {
  const tbody = $('#batch-results tbody');
  tbody.innerHTML = '';
  for (const r of results) {
    const tr = document.createElement('tr');
    if (r.status === 'error') {
      tr.innerHTML = `
        <td>${escapeHtml(r.original_name)}</td>
        <td colspan="4" class="sev-error">${escapeHtml(r.error || 'failed')}</td>
        <td><span class="tag error">error</span></td>
        <td></td>`;
    } else {
      const links = (r.files || [])
        .map(f => `<a href="/${escAttr(f.path.split(/[\\/]/).join('/'))}" target="_blank">${escapeHtml(f.kind.toUpperCase())}</a>`)
        .join(' &middot; ');
      tr.innerHTML = `
        <td>${escapeHtml(r.original_name)}</td>
        <td>${escapeHtml(r.customer_name || r.customer_id || '')}</td>
        <td>${escapeHtml(r.po_number || '')}</td>
        <td>${r.lines_count ?? ''}</td>
        <td style="text-align:right">${r.totals?.total_amount?.toFixed?.(2) ?? ''}</td>
        <td><span class="tag info">ok</span></td>
        <td>${links}</td>`;
    }
    tbody.append(tr);
  }
  $('#batch-results-wrap').hidden = false;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function escAttr(s) { return escapeHtml(s); }
