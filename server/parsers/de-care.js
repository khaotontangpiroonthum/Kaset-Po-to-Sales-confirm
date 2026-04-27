// Parser for De Care Group Sp. z o.o. (Poland) POs.
// Layout: minimal one-line item table. Quantity is given in PCS (individual bags).
//   ORDER NO: ZZ/1 /25/001059   Order date: 18.11.2025   ETD date: 18.12.2025
//   Terms of delivery: FOB
//   No | Product Code | Name/Description | Quantity | Unit
import { num, numEU, findFirst, toIsoDate } from './util.js';

export function parse(text) {
  // De Care PO numbers look like "ZZ/1 /25/001059" — match anywhere in the text.
  const po_number = findFirst(text, /(ZZ\/\d+\s*\/\d+\/\d+)/i)?.replace(/\s+/g, '');
  // PDF text reflow puts the dates BEFORE their labels. They appear in document order:
  // [order_date, confirmation_date, etd_date].
  const allDates = [...text.matchAll(/(\d{1,2}\.\d{1,2}\.\d{4})/g)].map(m => m[1]);
  const order_date = allDates[0] || null;
  const conf_date  = allDates[1] || null;
  const etd_date   = allDates[2] || null;
  const supplier_no = findFirst(text, /SUPPLIER\s+(K\d+)/i);
  const vat_no      = findFirst(text, /VAT:?\s*(PL[\d ]+)/i);
  const incoterms   = findFirst(text, /Terms\s+of\s+delivery\s+([A-Z]+)/i);

  const lines = [];
  // Item row: "1 100% Jasmine Rice Thai Jasmine Rice \"SMART CHEF BRAND\" 10000,000 PCS"
  const itemRe = /^(\d+)\s+(.+?)\s+(.+?"[^"]+")\s+(\d+(?:[.,]\d+)?)\s+(PCS|CV|KGS?)\s*$/im;
  for (const line of text.split(/\n/)) {
    const m = line.match(itemRe);
    if (!m) continue;
    const [, sn, productCode, descRaw, qtyEU, unit] = m;
    const description = descRaw.replace(/\s+/g, ' ').trim();
    const brandM = description.match(/"([^"]+)"/);
    const qty = numEU(qtyEU);
    // PCS = individual 1kg bags. Default packing 1kg x 20 LL bags per carton.
    const bagsPerCarton = 20;
    const weightKgPerBag = 1;
    const cartons = unit === 'PCS' ? qty / bagsPerCarton : qty;
    const totalKg = qty * weightKgPerBag;
    lines.push({
      item_code: sn,
      vendor_mat: productCode.trim(),
      description: description.replace(/\s*"[^"]*"\s*$/, '').trim(),
      brand: brandM ? brandM[1] : null,
      packing_raw: '1kg x 20 LL bags',
      packing: { count: bagsPerCarton, weightKg: weightKgPerBag, totalKg: bagsPerCarton, raw: '1kg x 20 LL bags' },
      qty: cartons,
      qty_unit: 'Cartons',
      qty_mt: totalKg / 1000,
      qty_pcs: qty,
      price_per_unit: null,
      price_per_mt: null,
      line_total: null,
      old_price_mt: null,
    });
  }

  return {
    customer_id: 'de-care',
    po_number: po_number || null,
    po_date: toIsoDate(order_date),
    confirmation_date: toIsoDate(conf_date),
    currency: 'USD',
    supplier_code_for_them: supplier_no,
    buyer: {
      name: 'DE CARE GROUP SP. Z O.O. I WSPOLNICY S.K.A.',
      address: 'Pienkow 147A, 05-152 Czosnow, Poland',
      attn: null,                              // not on PO; saved in customer config
      phone: null,
      vat_no: vat_no ? vat_no.replace(/\s+/g, ' ').trim() : null,
    },
    shipment: {
      incoterms: incoterms || 'FOB',
      payment_terms: null,
      port_of_discharge: 'Blonie, Poland',
      destination: 'Blonie, Poland',
      etd: toIsoDate(etd_date),
      container: '1 x 20ft FCL',
    },
    lines,
    totals: {
      total_qty_units: lines.reduce((s, l) => s + (l.qty || 0), 0),
      total_mt: lines.reduce((s, l) => s + (l.qty_mt || 0), 0),
      total_amount: null,
      grand_total: null,
    },
    special_clauses: [
      "Buyer's General Terms and Conditions of Purchase apply",
    ],
  };
}
