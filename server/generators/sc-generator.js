// SC Excel generator: opens the customer template, fills cells per the fill-spec, saves.
import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { FILL_SPECS, formatDate } from './fill-specs.js';

const TEMPLATES_DIR = path.resolve('templates');

export async function generateSC(parsed, customer, edits, outPath) {
  const spec = FILL_SPECS[customer.id];
  if (!spec) throw new Error(`No fill spec for customer ${customer.id}`);

  const templatePath = path.join(TEMPLATES_DIR, customer.template_file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const ws = wb.worksheets[spec.sheet_index];

  // Compute totals from edited lines (edits.lines may have updated qty/price).
  // Price model: rice is usually quoted per-MT, small items per-carton.
  // line_total = qty_mt * price_per_mt   (preferred when price_per_mt is set)
  //           OR qty    * price_per_unit (fallback)
  const lines = (edits.lines || parsed.lines || []).map((ln, i) => {
    const merged = { ...parsed.lines[i], ...ln };
    const qtyMt = merged.qty_mt != null ? merged.qty_mt
                  : (merged.qty != null && merged.packing?.totalKg ? (merged.qty * merged.packing.totalKg) / 1000 : null);
    let lineTotal = merged.line_total;
    if (lineTotal == null) {
      if (qtyMt != null && merged.price_per_mt != null) {
        lineTotal = +(qtyMt * merged.price_per_mt).toFixed(2);
      } else if (merged.qty != null && merged.price_per_unit != null) {
        lineTotal = +(merged.qty * merged.price_per_unit).toFixed(2);
      }
    }
    return { ...merged, qty_mt: qtyMt, line_total: lineTotal };
  });
  const totals = {
    total_mt:     +lines.reduce((s, l) => s + (l.qty_mt || 0), 0).toFixed(4),
    total_amount: +lines.reduce((s, l) => s + (l.line_total || 0), 0).toFixed(2),
  };

  const env = {
    sc_date_iso:    edits.sc_date_iso || new Date().toISOString().slice(0, 10),
    sc_ref_no:      edits.sc_ref_no   || `${customer.ref_prefix}???/${new Date().getFullYear()}`,
    payment_terms:  edits.payment_terms,
    eta_text:       edits.eta_text,
    container:      edits.container || '1 x 20ft FCL',
    freight:        edits.freight ?? 0,
  };

  // ---- Header ----
  for (const [key, def] of Object.entries(spec.header)) {
    let v;
    if (key === 'buyer_attn')      v = parsed.buyer?.attn       || customer.buyer.default_attn;
    else if (key === 'buyer_address') v = parsed.buyer?.address || customer.buyer.address;
    else if (key === 'buyer_phone')   v = parsed.buyer?.phone   || customer.buyer.phone;
    else if (key === 'sc_date')    v = formatDate(env.sc_date_iso);
    else if (key === 'sc_ref_no')  v = env.sc_ref_no;
    else if (key === 'po_number')  v = parsed.po_number;
    if (v == null) continue;
    setCell(ws, def.row, def.col, def.prefix ? `${def.prefix}${v}` : v);
  }

  // ---- Items ----
  const I = spec.items;
  for (let i = 0; i < Math.min(lines.length, I.max_items); i++) {
    const row = lines[i];
    const baseRow = I.first_row + i * I.rows_per_item;
    for (const [, cellDef] of Object.entries(I.cells)) {
      const value = cellDef.format(row, customer, env);
      if (value === undefined || value === null || value === '') continue;
      setCell(ws, baseRow + cellDef.row_offset, cellDef.col, value);
    }
  }
  // Blank out unused item rows in the template (when fewer lines than max_items)
  for (let i = lines.length; i < I.max_items; i++) {
    const baseRow = I.first_row + i * I.rows_per_item;
    for (let r = 0; r < I.rows_per_item; r++) {
      for (const [, cellDef] of Object.entries(I.cells)) {
        if (cellDef.row_offset === r) clearCell(ws, baseRow + r, cellDef.col);
      }
    }
  }

  // ---- Totals ----
  for (const [, def] of Object.entries(spec.totals || {})) {
    const v = def.format(totals, customer, env);
    if (v == null || v === '') continue;
    setCell(ws, def.row, def.col, v);
  }

  // ---- Footer ----
  for (const [, def] of Object.entries(spec.footer || {})) {
    const v = def.format(parsed, customer, env);
    if (v == null || v === '') continue;
    setCell(ws, def.row, def.col, v);
  }

  // Hide internal cost columns when sending to customer (Consumer Brands / Asia Express)
  if (customer.internal_gp_cols && edits.hide_internal_cols !== false) {
    for (const colLetter of ['L', 'M', 'N']) {
      const c = ws.getColumn(colLetter);
      if (c) c.hidden = true;
    }
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  return { outPath, totals, lines: lines.length };
}

function setCell(ws, row, col, value) {
  const cell = ws.getCell(row, col);
  // Don't overwrite cells inside a merge range that aren't the master cell
  if (cell.isMerged && cell.master !== cell) return;
  cell.value = value;
}

function clearCell(ws, row, col) {
  const cell = ws.getCell(row, col);
  if (cell.isMerged && cell.master !== cell) return;
  cell.value = null;
}
