// Parser for Fantasy Pvt. Ltd. (Maldives) POs.
// Layout: Cleaner table with quantity given as TOTAL KG (not cartons).
//   PO .NO : FAN/THA/002/26-27   DATE : Tuesday, March 31, 2026
//   SN | PRODUCT GROUP | PACKING | NEW ORDER | UNIT
import { num, parsePacking, findFirst, toIsoDate } from './util.js';

export function parse(text) {
  const po_number = findFirst(text, /PO\s*\.?\s*NO\s*:?\s*([A-Z0-9\/\-]+)/i);
  // PDF reflow puts the date BEFORE the "DATE :" label, so match a date string anywhere.
  const date_raw  = findFirst(text, /([A-Z][a-z]+,\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  const attn      = findFirst(text, /ATTN\s*:?\s*([A-Za-z. ()]+?)\s*(?:CONTACT|SUB|DATE|$)/i);
  const subject   = findFirst(text, /SUB\s*:?\s*([A-Z ]+?)\s*(?:DATE|PO|$)/i);

  const lines = [];
  // The PDF reflows item rows: PACKING+QTY+UNIT often appear together on one line,
  // SN on a previous line, product description on the next line.
  // We scan for `<packing> <qty> <unit>` rows and stitch SN + description from neighbors.
  const allLines = text.split(/\n/).map(l => l.trim());
  const dataRowRe = /^(\d+\s*[xX]\s*\d+\s*KG)\s+(\d+(?:[.,]\d+)?)\s+(KGS?|PCS|CV)$/i;
  for (let i = 0; i < allLines.length; i++) {
    const m = allLines[i].match(dataRowRe);
    if (!m) continue;
    const [, packingRaw, qtyStr, unit] = m;
    // Find SN (digit-only line) above
    let sn = null;
    for (let j = i - 1; j >= 0 && j > i - 6; j--) {
      if (/^\d+$/.test(allLines[j])) { sn = allLines[j]; break; }
    }
    // Find product description below (line of letters/spaces)
    let productRaw = null;
    for (let j = i + 1; j < allLines.length && j < i + 4; j++) {
      const candidate = allLines[j];
      if (candidate && /[A-Z]{3,}/.test(candidate) && !/^Total/i.test(candidate)) {
        productRaw = candidate;
        break;
      }
    }
    const description = (productRaw || '').replace(/\s+/g, ' ').trim();
    // Parse the packing: in Fantasy POs, format is "<sackcount>X<weightKg>KG"
    // e.g. "1X25KG" = 1 sack of 25kg, "20X1KG" = 20 bags per master sack of 1kg each
    const pkM = packingRaw.match(/(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*KG/i);
    const sacksOrBagsPerUnit = pkM ? Number(pkM[1]) : null;
    const weightKg            = pkM ? Number(pkM[2]) : null;
    const totalKg = Number(qtyStr.replace(',', '.'));
    // Derive unit count from total KG and packing
    const totalKgPerCarton = sacksOrBagsPerUnit && weightKg ? sacksOrBagsPerUnit * weightKg : null;
    const sacks_or_cartons = totalKgPerCarton ? totalKg / totalKgPerCarton : null;
    lines.push({
      item_code: sn,
      vendor_mat: null,
      description,
      brand: 'KASET BRAND',
      packing_raw: packingRaw,
      packing: { count: sacksOrBagsPerUnit, weightKg, totalKg: totalKgPerCarton, raw: packingRaw },
      qty: sacks_or_cartons,
      qty_unit: 'Sacks',
      qty_mt: totalKg / 1000,
      qty_kg_total: totalKg,
      price_per_unit: null,
      price_per_mt: null,
      line_total: null,
      old_price_mt: null,
    });
  }

  const total_kg = lines.reduce((s, l) => s + (l.qty_kg_total || 0), 0);

  const special = [];
  if (/Incoterm/i.test(text))            special.push('Invoice must show Incoterm, Payment Term, Country of Origin');
  if (/REGISTRATION NO\.?C-95/i.test(text)) special.push('Invoice must show Fantasy registration C-95/2005');
  if (/pork/i.test(text))                special.push('Halal: no pork, wine, alcohol, or amaretto');
  if (/Packing list.*English/i.test(text))      special.push('Packing list in English');
  if (/Expiry date.*Production/i.test(text))    special.push('Expiry & Production date on each product (Maldives Customs)');
  if (/labels.*English/i.test(text))     special.push('Labels in English (or with English translation)');
  if (/Packing list total.*B\/L/i.test(text))   special.push('Packing list total = B/L total');

  return {
    customer_id: 'fantasy',
    po_number,
    po_date: toIsoDate(date_raw),
    subject: subject || null,
    currency: 'USD',
    buyer: {
      name: 'Fantasy Private Limited',
      address: "M. Velaaluge 1st Floor, Fareedhee Magu, P.O. Box 20214, Male', Republic of Maldives",
      attn: null,                                // not on this PO (saved in customer config)
      phone: null,
    },
    shipment: {
      incoterms: null,
      payment_terms: null,
      port_of_discharge: "Male, Republic of Maldives",
      destination: "Male, Republic of Maldives",
      etd: null,
      container: '1 x 20ft FCL',
    },
    lines,
    totals: {
      total_qty_units: lines.reduce((s, l) => s + (l.qty || 0), 0),
      total_mt: total_kg / 1000,
      total_kg,
      total_amount: null,
      grand_total: null,
    },
    special_clauses: special,
  };
}
