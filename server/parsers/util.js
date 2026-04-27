// Shared parsing helpers.

export function num(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[, ]/g, '').replace(/[^\d.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// European decimal-comma form (e.g. "10000,000" -> 10000.0)
export function numEU(s) {
  if (s == null) return null;
  const cleaned = String(s).trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function findFirst(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

// Parse a packing string like "20*1kg" or "10*2kg" or "1*11.34kg" or "20X1KG" -> { units, weightKg }
export function parsePacking(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)\s*(kg|KG|g|G)?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const unit = (m[3] || 'kg').toLowerCase();
  // The PO sometimes orders units-first ("20*1kg") and sometimes weight-first ("1X25KG").
  // Heuristic: the smaller of the two with explicit kg unit is the per-unit weight; the other is the count.
  // Fallback: assume "<count>*<weightKg>".
  let count, weightKg;
  if (unit === 'g') {
    weightKg = b / 1000;
    count = a;
  } else {
    // Default convention used by Consumer Brands ("20*1kg" = 20 bags x 1kg) vs De Care ("1X25KG" = 1 sack x 25kg)
    count = a;
    weightKg = b;
  }
  return { count, weightKg, totalKg: count * weightKg, raw: s };
}

// Convert a date in various formats to ISO YYYY-MM-DD; returns null if unparseable.
export function toIsoDate(s) {
  if (!s) return null;
  s = String(s).trim();
  // DD.MM.YYYY
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // "Tuesday, March 31, 2026" or "March 31, 2026" or "April 21, 2026"
  m = s.match(/(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const mi = months.indexOf(m[1].toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  return null;
}
