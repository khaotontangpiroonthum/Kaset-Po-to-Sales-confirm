// Per-customer fill specifications. Each spec describes WHERE in the template
// to write each piece of data when generating a Sales Confirmation.
//
// Coordinates are 1-indexed (row, col). All cells are derived from the actual
// template files in templates/ — see the analysis dumps in samples/.

export const FILL_SPECS = {
  'consumer-brands': {
    sheet_index: 0,
    header: {
      buyer_attn:           { row: 8,  col: 2, prefix: ': ' },
      sc_date:              { row: 11, col: 2, prefix: ': ' },
      sc_ref_no:            { row: 10, col: 9, prefix: ': ' },
      po_number:            { row: 11, col: 9, prefix: ':' },
    },
    items: {
      first_row:    16,    // first item starts at row 16 ("Cus Item:" label)
      rows_per_item: 3,    // each item spans 3 rows
      max_items:    5,
      cells: {
        cus_item_label: { col: 1, row_offset: 0, format: r => `Cus Item: ${r.item_code}` },
        brand:          { col: 3, row_offset: 0, format: r => `"${r.brand || 'KASET BRAND'}"` },
        packing:        { col: 1, row_offset: 1, format: r => normalizePacking(r.packing_raw) },
        description:    { col: 3, row_offset: 1, format: r => r.description },
        qty:            { col: 6, row_offset: 1, format: r => r.qty },
        qty_unit:       { col: 7, row_offset: 1, format: r => r.qty_unit },
        price_per_mt:   { col: 8, row_offset: 1, format: r => r.price_per_mt },
        line_total:     { col: 9, row_offset: 1, format: r => r.line_total },
        prime_quality:  { col: 3, row_offset: 2, format: () => 'Prime Quality' },
        qty_mt:         { col: 6, row_offset: 2, format: r => r.qty_mt },
        qty_unit_mt:    { col: 7, row_offset: 2, format: () => 'MT' },
      },
    },
    totals: {
      total_mt_label:   { row: 31, col: 1, format: () => 'Total ' },
      total_mt:         { row: 31, col: 6, format: t => t.total_mt },
      total_mt_unit:    { row: 31, col: 7, format: () => 'MT' },
      total_fob_label:  { row: 31, col: 8, format: () => 'Total FOB' },
      total_fob:        { row: 31, col: 9, format: t => t.total_amount },
      freight_label:    { row: 32, col: 6, format: (_, c) => c.freight_label },
      freight_amount:   { row: 32, col: 9, format: (t, _, e) => e.freight || 0 },
      grand_label:      { row: 33, col: 6, format: (_, c) => `CIF ${c.default_destination.toUpperCase()}` },
      grand_total:      { row: 33, col: 9, format: (t, _, e) => (t.total_amount || 0) + (e.freight || 0) },
    },
    footer: {
      remark:           { row: 36, col: 2, format: (_, c, e) => `${e.container || '1 x 20ft Container'}, ETA to ${c.country} ${e.eta_text || ''}`.trim() },
      payment:          { row: 38, col: 2, format: (_, c, e) => e.payment_terms || c.default_payment_terms },
      ship_to:          { row: 39, col: 2, format: (_, c) => c.default_destination.toUpperCase() },
      place_delivery:   { row: 40, col: 3, format: (_, c) => c.default_destination.toUpperCase() },
      port_discharge:   { row: 41, col: 3, format: (_, c) => c.default_destination.toUpperCase() },
      signer_date:      { row: 45, col: 1, format: (_, c, e) => `${c.default_seller_signer} ${formatDate(e.sc_date_iso)}` },
    },
  },

  'asia-express': {
    sheet_index: 0,
    header: {
      buyer_address:        { row: 5,  col: 2 },
      buyer_attn:           { row: 7,  col: 2 },
      buyer_phone:          { row: 8,  col: 2 },
      sc_date:              { row: 10, col: 2 },
      po_number:            { row: 9,  col: 9, prefix: ': ' },
      sc_ref_no:            { row: 10, col: 9, prefix: ': ' },
    },
    items: {
      first_row:    14,
      rows_per_item: 3,
      max_items:    10,
      cells: {
        cus_item_label: { col: 1, row_offset: 0, format: r => `Cus. Item: ${r.item_code}` },
        brand:          { col: 3, row_offset: 0, format: r => `"${r.brand || 'KASET'}" BRAND` },
        qty:            { col: 6, row_offset: 0, format: r => r.qty },
        qty_unit:       { col: 7, row_offset: 0, format: r => r.qty_unit },
        price_per_mt:   { col: 8, row_offset: 0, format: r => r.price_per_mt },
        line_total:     { col: 9, row_offset: 0, format: r => r.line_total },
        packing:        { col: 1, row_offset: 1, format: r => normalizePacking(r.packing_raw) },
        description:    { col: 3, row_offset: 1, format: r => r.description },
        qty_mt:         { col: 6, row_offset: 1, format: r => r.qty_mt },
        qty_unit_mt:    { col: 7, row_offset: 1, format: () => 'MT' },
      },
    },
    totals: {
      grand_total:      { row: 44, col: 9, format: t => t.total_amount },
    },
    footer: {
      shipment:         { row: 47, col: 2, format: () => 'Ship Via Asia Express Food' },
      container:        { row: 48, col: 2, format: (_, __, e) => e.container || '1x20 FCL' },
      etd_note:         { row: 49, col: 2, format: (_, __, e) => `ETD ${e.eta_text || ''}`.trim() },
      payment:          { row: 50, col: 2, format: (_, c, e) => e.payment_terms || c.default_payment_terms },
      port_delivery:    { row: 52, col: 1, format: (_, c) => `Port of Delivery: ${c.default_destination}` },
      port_discharge:   { row: 53, col: 1, format: (_, c) => `Port of Discharge: ${c.default_destination}` },
      docs:             { row: 55, col: 1, format: (_, c) => `Documents Required: ${c.documents_required}` },
      signer_date:      { row: 58, col: 1, format: (_, c, e) => `${c.default_seller_signer} ${formatDate(e.sc_date_iso)}` },
    },
  },

  'fantasy': {
    sheet_index: 0,
    header: {
      buyer_attn:           { row: 5,  col: 2, prefix: ': ' },
      sc_date:              { row: 8,  col: 2, prefix: ':' },
      sc_ref_no:            { row: 8,  col: 9, prefix: ': ' },
      po_number:            { row: 9,  col: 9, prefix: ': ' },
    },
    items: {
      first_row:    12,
      rows_per_item: 3,
      max_items:    2,
      cells: {
        packing:        { col: 1, row_offset: 0, format: r => normalizePacking(r.packing_raw) },
        brand:          { col: 3, row_offset: 0, format: r => `"${r.brand || 'KASET BRAND'}"` },
        price_per_mt:   { col: 8, row_offset: 0, format: r => r.price_per_mt },
        line_total:     { col: 9, row_offset: 0, format: r => r.line_total },
        remarks:        { col: 10, row_offset: 0, format: () => 'This Price is' },
        description:    { col: 3, row_offset: 1, format: r => r.description },
        qty:            { col: 5, row_offset: 1, format: r => r.qty },
        qty_unit:       { col: 6, row_offset: 1, format: r => r.qty_unit },
        remarks_inco:   { col: 10, row_offset: 1, format: (_, c) => c.default_incoterms },
        bag_count_label:{ col: 1, row_offset: 2, format: r => r.qty_pcs ? `${r.qty_pcs} bags` : '' },
        qty_mt:         { col: 5, row_offset: 2, format: r => r.qty_mt },
        qty_unit_mt:    { col: 6, row_offset: 2, format: () => 'MT' },
      },
    },
    totals: {
      total_mt_label:   { row: 17, col: 1, format: () => 'Total 1 container' },
      total_mt:         { row: 17, col: 5, format: t => t.total_mt },
      total_mt_unit:    { row: 17, col: 6, format: () => 'MT' },
      grand_label:      { row: 17, col: 8, format: () => 'Grand Total' },
      grand_total:      { row: 17, col: 9, format: t => t.total_amount },
      cnf_label:        { row: 18, col: 5, format: (_, c) => c.freight_label },
      cnf_freight:      { row: 18, col: 9, format: (_, __, e) => e.freight || 0 },
      cnf_grand_label:  { row: 19, col: 5, format: () => 'Grand Total' },
      cnf_grand:        { row: 19, col: 9, format: (t, _, e) => (t.total_amount || 0) + (e.freight || 0) },
      amount_in_words:  { row: 20, col: 1, format: (t, _, e) => `USD: ${numberToEnglishWords((t.total_amount || 0) + (e.freight || 0))} US DOLLARS` },
    },
    footer: {
      shipment:         { row: 22, col: 2, format: (_, __, e) => `ETD ${e.eta_text || 'within ' + monthYear(e.sc_date_iso)}`.trim() },
      payment:          { row: 23, col: 2, format: (_, c, e) => e.payment_terms || c.default_payment_terms },
      place_delivery:   { row: 24, col: 3, format: (_, c) => c.default_destination },
      signer_date:      { row: 28, col: 1, format: (_, c, e) => `${c.default_seller_signer} ${formatDateShort(e.sc_date_iso)}` },
    },
  },

  'de-care': {
    sheet_index: 0,
    header: {
      buyer_attn:           { row: 9,  col: 2, prefix: ': ' },
      sc_date:              { row: 12, col: 2, prefix: ':' },
      sc_ref_no:            { row: 12, col: 9, prefix: ': ' },
      po_number:            { row: 13, col: 9, prefix: ': ' },
    },
    items: {
      first_row:    18,
      rows_per_item: 2,
      max_items:    1,
      cells: {
        packing:        { col: 1, row_offset: 0, format: r => normalizePacking(r.packing_raw) },
        brand:          { col: 3, row_offset: 0, format: r => `" ${r.brand || 'SMART CHEF BRAND'} "` },
        qty:            { col: 6, row_offset: 0, format: r => r.qty },
        qty_unit:       { col: 7, row_offset: 0, format: r => r.qty_unit },
        price_per_mt:   { col: 8, row_offset: 0, format: r => r.price_per_mt },
        line_total:     { col: 9, row_offset: 0, format: r => r.line_total },
        remarks:        { col: 10, row_offset: 0, format: (_, c) => `This Price is ${c.default_incoterms.split(' ')[0]}` },
        description:    { col: 3, row_offset: 1, format: r => r.description || 'Thai Hommali Rice' },
        qty_mt:         { col: 6, row_offset: 1, format: r => r.qty_mt },
        qty_unit_mt:    { col: 7, row_offset: 1, format: () => 'MT' },
        bags_label:     { col: 1, row_offset: 1, format: r => r.qty_pcs ? `${r.qty_pcs.toLocaleString()} ll bags` : '' },
      },
    },
    totals: {
      total_mt:         { row: 20, col: 6, format: t => t.total_mt },
      total_mt_unit:    { row: 20, col: 7, format: () => 'MT' },
      grand_label:      { row: 20, col: 8, format: () => 'Grand Total' },
      grand_total:      { row: 20, col: 9, format: t => t.total_amount },
    },
    footer: {
      remark:           { row: 22, col: 2, format: (_, __, e) => `20' x 1 Container, ETD ${e.eta_text || 'within ' + monthYear(e.sc_date_iso)}` },
      payment:          { row: 25, col: 2, format: (_, c, e) => `:${e.payment_terms || c.default_payment_terms}` },
      ship_to:          { row: 26, col: 2, format: (_, c) => c.buyer.name },
      place_delivery:   { row: 30, col: 3, format: (_, c) => c.default_destination.toUpperCase() },
      port_discharge:   { row: 31, col: 3, format: (_, c) => c.default_destination.toUpperCase() },
      signer_date:      { row: 33, col: 1, format: (_, c, e) => `${c.default_seller_signer} ${formatDateShort(e.sc_date_iso)}` },
    },
  },
};

// ----- Helpers -----

function normalizePacking(raw) {
  if (!raw) return raw;
  // Convert "20*1kg" / "10X2KG" / "1X25KG" into the SC's expected style
  const m = String(raw).match(/(\d+)\s*[xX*×]\s*([\d.]+)\s*(KG|G|kg|g)?/);
  if (!m) return raw;
  const a = m[1], b = m[2], unit = (m[3] || 'kg').toLowerCase();
  // Heuristic: if a > b and unit is kg, treat "a*b" as "<bag count> x <weight>" in LL bag form
  if (Number(a) === 1) return `${b}kg PP Sack`;        // e.g. 1X25KG -> "25kg PP Sack"
  if (unit === 'kg' && Number(a) >= 2 && Number(b) >= 1) return `${b}Kg LL bag x ${a}`;
  return raw;
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[+m - 1]} ${+d}, ${y}`;
}

export function formatDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${+d}/${+m}/${y}`;
}

export function monthYear(iso) {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[+m - 1]} ${y}`;
}

// Convert number to English words (US-style). Used by Fantasy SC.
export function numberToEnglishWords(n) {
  if (n == null || isNaN(n)) return '';
  const ones = ['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE',
                'TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  const tens = ['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
  const intPart = Math.floor(n);
  const cents = Math.round((n - intPart) * 100);
  function under1000(x) {
    if (x < 20) return ones[x];
    if (x < 100) return (tens[Math.floor(x/10)] + (x%10 ? '-' + ones[x%10] : '')).trim();
    return ones[Math.floor(x/100)] + ' HUNDRED' + (x%100 ? ' AND ' + under1000(x%100) : '');
  }
  function under1M(x) {
    if (x < 1000) return under1000(x);
    return under1000(Math.floor(x/1000)) + ' THOUSAND' + (x%1000 ? ' ' + under1000(x%1000) : '');
  }
  const main = intPart === 0 ? 'ZERO' : under1M(intPart).trim();
  return cents > 0 ? `${main} AND ${cents}/100` : main;
}
