// Parser for Asia Express Food B.V. (Netherlands) POs.
// Layout: SAP-style structured fields:
//   Document Number 4500054845 / Date 20.04.2026 / Vendor No. / Currency USD
//   Terms of payment, Terms of delivery, ETD, Port of destination
//   Item rows: <Material> <Qty>,<00> CV <Vend.Mat> <Description> <Volume> <Price> <Net>
import { num, parsePacking, findFirst, toIsoDate } from './util.js';

export function parse(text) {
  const po_number    = findFirst(text, /Document\s+Number\s+(\S+)/i);
  const po_date_raw  = findFirst(text, /^Date\s+(\d{1,2}\.\d{1,2}\.\d{4})/im);
  const currency     = findFirst(text, /Currency\s+([A-Z]{3})/i) || 'USD';
  const vendor_no    = findFirst(text, /Vendor\s+No\.?\s+(\S+)/i);
  const buyer_name_contact = findFirst(text, /Buyer\s+([A-Za-z. ]+)/i);
  const buyer_phone  = findFirst(text, /Phone\s+([+\d ]+)/i);
  const buyer_email  = findFirst(text, /Email\s+(\S+@\S+)/i);
  const payment      = findFirst(text, /Terms\s+of\s+payment:?\s+(.+?)(?:\s{2}|$)/im);
  const delivery     = findFirst(text, /Terms\s+of\s+delivery:?\s+(.+?)(?:\s{2}|$)/im);
  const etd          = findFirst(text, /ETD:?\s+(.+?)(?:\s{2}|$)/im);
  const port_dest    = findFirst(text, /Port\s+of\s+destination:?\s+(.+?)(?:\s{2}|$)/im);

  const lines = [];
  // Item row example: "607 48,00 CV Rice Roll Coconut Milk \"COCO JAS\" 12 X 100 G"
  const itemRe = /^([\w\-]+)\s+(\d+,\d{2})\s+CV\s+(.+?)\s+(\d+\s*[xX]\s*[\d.]+\s*(?:KG|G|KGS))\b/m;
  for (const line of text.split(/\n/)) {
    const m = line.match(itemRe);
    if (!m) continue;
    const [, material, qtyEU, description, volume] = m;
    const qty = Number(qtyEU.replace(',', '.'));
    const packing = parsePacking(volume);
    const desc = description.replace(/\s+/g, ' ').trim();
    const brandM = desc.match(/"([^"]+)"/);
    lines.push({
      item_code: material,
      vendor_mat: null,
      description: desc.replace(/\s*"[^"]*"\s*$/, '').trim(),
      brand: brandM ? brandM[1] : null,
      packing_raw: volume,
      packing,
      qty,
      qty_unit: 'Cartons',
      qty_mt: packing ? (qty * packing.totalKg) / 1000 : null,
      price_per_unit: null,                  // Asia Express PO never carries prices
      price_per_mt: null,
      line_total: null,
      old_price_mt: null,
    });
  }

  const total_qty_units = lines.reduce((s, l) => s + (l.qty || 0), 0);
  const total_mt        = lines.reduce((s, l) => s + (l.qty_mt || 0), 0);

  // Vendor instructions on page 2
  const special = [];
  const checks = [
    [/One BBD per product per batch/i,        'One BBD per product per batch'],
    [/No order bundling/i,                    'No order bundling — orders shipped separately'],
    [/Order confirmation within 48/i,         'Order confirmation within 48 hours'],
    [/Bank details must be included/i,        'Bank details on proforma & final invoice'],
    [/AEF order number/i,                     'AEF order number on all documents'],
    [/Booking confirmation/i,                 'Booking confirmation within 48h to import@asiaexpressfood.nl'],
    [/Copies of all documents/i,              'Copy docs within 5 working days after vessel departure'],
    [/Original documents/i,                   'Original docs received >= 10 days before ETA'],
    [/BBD and lot number/i,                   'BBD + lot number per batch on packing list'],
    [/Containers must be filled to maximum/i, 'Containers filled to max capacity (weight or volume)'],
    [/free of any phosphide/i,                'Containers free of phosphide residue'],
    [/scannable EAN/i,                        'Unique scannable EAN on outer carton AND consumer unit'],
    [/No samples may be sent/i,               'No samples without prior PD permission'],
  ];
  for (const [re, msg] of checks) if (re.test(text)) special.push(msg);

  return {
    customer_id: 'asia-express',
    po_number,
    po_date: toIsoDate(po_date_raw),
    currency,
    vendor_no_for_seller: vendor_no,
    buyer: {
      name: 'ASIA EXPRESS FOOD B.V.',
      address: 'Kilbystraat 1, 8263 CJ KAMPEN, Netherlands',
      attn: buyer_name_contact || null,
      phone: buyer_phone || null,
      email: buyer_email || null,
    },
    shipment: {
      incoterms: delivery,
      payment_terms: payment,
      port_of_discharge: port_dest || 'Rotterdam, Netherlands',
      destination: port_dest || 'Rotterdam, Netherlands',
      etd: etd,
      container: '1 x 20ft FCL',
    },
    lines,
    totals: {
      total_qty_units,
      total_mt,
      total_amount: null,
      grand_total: null,
    },
    special_clauses: special,
  };
}
