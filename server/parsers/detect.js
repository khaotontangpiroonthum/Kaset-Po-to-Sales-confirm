// Auto-detect which customer a PO PDF belongs to from its text content.

const SIGNATURES = [
  { id: 'consumer-brands', patterns: [/CONSUMER\s+BRANDS\s+LTD/i, /THAIHA\d{4}-\d{2}[A-Z]?/i] },
  { id: 'asia-express',    patterns: [/ASIA\s+EXPRESS\s+FOOD/i, /asiaexpressfood\.nl/i] },
  { id: 'fantasy',         patterns: [/FANTASY\s+PVT\.?\s+LTD/i, /fantasy\.com\.mv/i, /FAN\/THA\/\d+/i] },
  { id: 'de-care',         patterns: [/DE\s*CARE\s+GROUP/i, /decare\.pl/i, /ZZ\/\d+\s*\/\d+\/\d+/i] },
];

export function detectCustomer(text) {
  for (const { id, patterns } of SIGNATURES) {
    if (patterns.some(p => p.test(text))) return id;
  }
  return null;
}
