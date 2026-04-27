// Master price book: persistence, lookup, and application to parsed PO lines.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE      = path.join(__dirname, 'prices.json');

export async function loadPrices() {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.prices) ? data.prices : [];
  } catch {
    return [];
  }
}

export async function savePrices(prices) {
  const tmp = FILE + '.tmp';
  const body = JSON.stringify({ updated_at: new Date().toISOString(), prices }, null, 2) + '\n';
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, FILE);
}

export function newId() {
  return crypto.randomBytes(6).toString('hex');
}

// Match a single parsed line against a price entry.
// Returns a numeric score (number of specified criteria satisfied) or 0 if any specified criterion fails.
export function matchScore(price, line) {
  if (!line) return 0;
  let score = 0;

  if (price.item_code != null && price.item_code !== '') {
    const pCode = String(price.item_code).trim().toLowerCase();
    const lCode = String(line.item_code ?? '').trim().toLowerCase();
    const lVend = String(line.vendor_mat ?? '').trim().toLowerCase();
    if (lCode === pCode || lVend === pCode) score += 2; else return 0;
  }

  if (price.description_contains != null && price.description_contains !== '') {
    const needle = String(price.description_contains).trim().toLowerCase();
    const hay = [line.description, line.vendor_mat, line.brand]
      .filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(needle)) score += 1; else return 0;
  }

  if (price.packing_kg != null && price.packing_kg !== '') {
    const want = Number(price.packing_kg);
    if (!Number.isFinite(want)) return 0;
    const candidates = [
      line.packing?.weightKg,
      line.packing?.totalKg,
      // For De Care 1kg bags, totalKg is the carton total — also accept per-bag weight.
    ].filter(v => v != null && Number.isFinite(Number(v)));
    if (candidates.some(v => Math.abs(Number(v) - want) < 0.001)) score += 1; else return 0;
  }

  return score;
}

export function findPriceForLine(line, customerId, prices) {
  const candidates = prices
    .filter(p => p.customer_id === customerId)
    .map(p => ({ p, s: matchScore(p, line) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return candidates.length ? candidates[0].p : null;
}

// Mutate parsed.lines to fill price_per_unit / price_per_mt / line_total when missing.
// Only fills fields that are currently null/undefined — never overwrites existing values from the PO.
export function applyPrices(parsed, prices) {
  if (!parsed || !Array.isArray(parsed.lines)) return { applied: 0 };
  let applied = 0;
  for (const line of parsed.lines) {
    if (line.price_per_unit != null && line.line_total != null) continue;
    const match = findPriceForLine(line, parsed.customer_id, prices);
    if (!match) continue;

    const ppm = Number(match.price_per_mt);
    if (!Number.isFinite(ppm)) continue;

    if (line.price_per_mt == null) line.price_per_mt = ppm;
    const totalKgPerUnit = Number(line.packing?.totalKg);
    if (line.price_per_unit == null && Number.isFinite(totalKgPerUnit) && totalKgPerUnit > 0) {
      line.price_per_unit = +(ppm * totalKgPerUnit / 1000).toFixed(4);
    }
    if (line.line_total == null) {
      const qtyMt = Number(line.qty_mt);
      if (Number.isFinite(qtyMt)) line.line_total = +(qtyMt * ppm).toFixed(2);
    }
    line.price_source = { id: match.id, label: match.notes || null };
    applied++;
  }

  // Recompute totals
  if (parsed.totals) {
    parsed.totals.total_amount = parsed.lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0);
  }
  return { applied };
}

export function validatePriceEntry(p) {
  const errors = [];
  if (!p) return ['empty body'];
  if (!p.customer_id || typeof p.customer_id !== 'string') errors.push('customer_id is required');
  const ppm = Number(p.price_per_mt);
  if (!Number.isFinite(ppm) || ppm <= 0) errors.push('price_per_mt must be a positive number');
  const hasMatch =
    (p.item_code && String(p.item_code).trim()) ||
    (p.description_contains && String(p.description_contains).trim()) ||
    (p.packing_kg != null && p.packing_kg !== '');
  if (!hasMatch) errors.push('at least one of item_code / description_contains / packing_kg is required');
  return errors;
}
