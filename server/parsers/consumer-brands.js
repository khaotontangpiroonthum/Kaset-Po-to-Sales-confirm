// Parser for Consumer Brands Ltd. (Jamaica) POs.
// Layout (page 1):
//   PURCHASE ORDER NO. THAIHA2026-03B
//   Then 5-column item rows: <MAT> <GK> <Product...> <Packing> <Qty> <OldM/T> <Price> <US$>
import { num, parsePacking, findFirst } from './util.js';

export function parse(text) {
  const po_number = findFirst(text, /PURCHASE\s+ORDER\s+NO\.?\s*([A-Z0-9-]+)/i);
  const attn      = findFirst(text, /Attention:\s*([A-Za-z. ]+)/i);

  const lines = [];
  // The PDF reflows item rows in two shapes:
  //   (a) <MAT> <GK> <Description...> <Packing> <Qty> <OldMT> <Price> <Total>
  //   (b) Description sits on the previous line; the data row is just:
  //       <MAT> <GK> <Packing> <Qty> <OldMT> <Price> <Total>
  // We try (a) first; if the description capture is empty/blank, look one line up.
  const itemReA = /^(\d{6})\s+(\d{5})\s+(.+?)\s+(\d+\s*[*xX×]\s*[\d.]+\s*kg)\s+(\d+)\s+([\d,]+\.\d{2})\s+([\d.]+)\s+([\d,]+\.\d{2})$/i;
  const itemReB = /^(\d{6})\s+(\d{5})\s+(\d+\s*[*xX×]\s*[\d.]+\s*kg)\s+(\d+)\s+([\d,]+\.\d{2})\s+([\d.]+)\s+([\d,]+\.\d{2})$/i;
  const allLines = text.split(/\n/);
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    let mat, gk, productRaw, packingRaw, qtyStr, oldMtStr, priceStr, totalStr;
    let m = line.match(itemReA);
    if (m) {
      [, mat, gk, productRaw, packingRaw, qtyStr, oldMtStr, priceStr, totalStr] = m;
    } else if ((m = line.match(itemReB))) {
      [, mat, gk, packingRaw, qtyStr, oldMtStr, priceStr, totalStr] = m;
      // Description lives on the previous non-blank line above this row
      for (let j = i - 1; j >= 0 && j > i - 4; j--) {
        const prev = allLines[j].trim();
        if (prev && !/^[-_=]+$/.test(prev) && !/^\d/.test(prev)) {
          productRaw = prev;
          break;
        }
      }
    } else {
      continue;
    }
    const packing = parsePacking(packingRaw);
    const qty = num(qtyStr);
    const price = num(priceStr);
    const lineTotal = num(totalStr);
    const description = (productRaw || '').replace(/\s+/g, ' ').trim();
    lines.push({
      item_code: gk,
      vendor_mat: mat,
      description,
      brand: 'KASET BRAND',
      is_brown: /brown/i.test(description),
      packing_raw: packingRaw,
      packing,
      qty,
      qty_unit: /sack|11\.34/i.test(packingRaw) ? 'Sacks' : 'Cartons',
      qty_mt: packing ? (qty * packing.totalKg) / 1000 : null,
      price_per_unit: price,
      price_per_mt: packing ? (price * 1000) / packing.totalKg : null,
      line_total: lineTotal,
      old_price_mt: num(oldMtStr),
    });
  }

  const grand = num(findFirst(text, /\$([\d,]+\.\d{2})\s*$/m));
  const total_qty_units = lines.reduce((s, l) => s + (l.qty || 0), 0);
  const total_mt = lines.reduce((s, l) => s + (l.qty_mt || 0), 0);
  const total_amount = lines.reduce((s, l) => s + (l.line_total || 0), 0);

  // Special clauses present in this PO
  const special = [];
  if (/Phytosanitary/i.test(text))       special.push('Phytosanitary + Fumigation Certificate per container');
  if (/Best Before/i.test(text))         special.push('Coding must show Expiry/Best-Before (month & year)');
  if (/New Crop 2025/i.test(text))       special.push('Do NOT put "New Crop 2025" stickers');
  if (/1 year and 6 months/i.test(text)) special.push('Minimum shelf life 1 year 6 months at date of report');
  if (/vent holes/i.test(text))          special.push('Vent holes sealed; Corrosive/Dangerous sticker outside container');
  if (/Seven point inspection/i.test(text)) special.push('Seven-point inspection + high-security seal');
  if (/separate invoice/i.test(text))    special.push('Samples & promo materials on separate invoice (free of charge)');
  if (/CANCELS ALL PREVIOUS/i.test(text)) special.push('THIS ORDER CANCELS ALL PREVIOUS ORDERS');

  return {
    customer_id: 'consumer-brands',
    po_number,
    po_date: null,                              // not printed on Consumer Brands PO
    currency: 'USD',
    buyer: {
      name: 'CONSUMER BRANDS LTD.',
      address: '34 Hagley Park Road, Kingston 10, Jamaica W.I.',
      attn: attn || null,
      phone: null,
    },
    shipment: {
      incoterms: null,
      payment_terms: null,
      port_of_discharge: 'Kingston, Jamaica',
      destination: 'Kingston, Jamaica',
      etd: null,
      container: '1 x 20ft FCL',
    },
    lines,
    totals: {
      total_qty_units,
      total_mt,
      total_amount,
      grand_total: grand,
    },
    special_clauses: special,
  };
}
