// Validation rules — checks the parsed PO + the customer profile.
// Returns an array of { code, severity: 'error'|'warning'|'info', message, field? }.

export function validate(parsed, customer) {
  const issues = [];
  const push = (severity, code, message, field) =>
    issues.push({ code, severity, message, field: field || null });

  if (!parsed.po_number) push('error', 'PO_NO_MISSING', 'PO number could not be extracted from the document.');
  if (!parsed.po_date)   push('warning', 'PO_DATE_MISSING', 'PO date is not printed on the document — please set manually.', 'po_date');

  // Shipment terms
  if (!parsed.shipment?.payment_terms) {
    push('warning', 'PAYMENT_TERMS_MISSING',
      `Payment terms not on PO. Defaulting to: "${customer.default_payment_terms}".`,
      'shipment.payment_terms');
  }
  if (!parsed.shipment?.incoterms) {
    push('warning', 'INCOTERMS_MISSING',
      `Incoterms not on PO. Defaulting to: "${customer.default_incoterms}".`,
      'shipment.incoterms');
  }
  if (!parsed.shipment?.etd) {
    push('warning', 'ETD_MISSING', 'No ETD on PO — please set a firm shipment date.', 'shipment.etd');
  }

  // Lines
  if (!parsed.lines || parsed.lines.length === 0) {
    push('error', 'NO_LINES', 'No item lines could be extracted from the PO.');
  }

  // Per-line price/qty consistency
  for (const [i, ln] of (parsed.lines || []).entries()) {
    const prefix = `Line ${i + 1} (${ln.item_code || '?'})`;
    if (!ln.qty || ln.qty <= 0) {
      push('error', 'LINE_QTY_BAD', `${prefix}: quantity is 0 or missing.`, `lines.${i}.qty`);
    }
    if (customer.po_has_prices) {
      if (ln.price_per_unit == null) {
        push('warning', 'LINE_PRICE_MISSING', `${prefix}: PO carries prices but this line has none.`, `lines.${i}.price_per_unit`);
      }
      if (ln.qty != null && ln.price_per_unit != null && ln.line_total != null) {
        const calc = +(ln.qty * ln.price_per_unit).toFixed(2);
        if (Math.abs(calc - ln.line_total) > 0.01) {
          push('error', 'LINE_TOTAL_MISMATCH',
            `${prefix}: ${ln.qty} × ${ln.price_per_unit} = ${calc} but PO shows line total ${ln.line_total}.`,
            `lines.${i}.line_total`);
        }
      }
    } else {
      // PO has no prices — flag we need price-list lookup
      if (ln.price_per_unit == null) {
        push('info', 'LINE_PRICE_FROM_PRICELIST',
          `${prefix}: price not on PO — pull from saved price list before generating SC.`,
          `lines.${i}.price_per_unit`);
      }
    }
  }

  // Grand-total check (only if PO has prices)
  if (customer.po_has_prices && parsed.totals?.grand_total != null) {
    const sum = +(parsed.lines || []).reduce((s, l) => s + (l.line_total || 0), 0).toFixed(2);
    if (Math.abs(sum - parsed.totals.grand_total) > 0.01) {
      push('error', 'GRAND_TOTAL_MISMATCH',
        `Sum of lines (${sum}) does not match PO grand total (${parsed.totals.grand_total}).`);
    }
  }

  // Customer-specific reminders
  if (customer.internal_gp_cols) {
    push('info', 'HIDE_GP_COLS_ON_EXPORT',
      'Internal cost / %GP / GP columns must be hidden before sending to customer.');
  }
  if (customer.id === 'fantasy') {
    push('info', 'HALAL_NOTE',
      'Halal compliance reminder: products must NOT contain pork, wine, alcohol, or amaretto.');
  }
  if (customer.id === 'de-care') {
    push('info', 'CREDIT_TERM_NOTE',
      `Payment is on 45-day credit (${customer.default_payment_terms}). Confirm credit limit before accepting.`);
  }

  return issues;
}
