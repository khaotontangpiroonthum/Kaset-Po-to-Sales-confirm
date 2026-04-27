// End-to-end test: parse each sample PO, generate SC + SAP keyin, verify outputs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractText }      from '../server/pdf-text.js';
import { parsePO }          from '../server/parsers/index.js';
import { validate }         from '../server/validate.js';
import { generateSC }       from '../server/generators/sc-generator.js';
import { generateSapKeyin } from '../server/generators/sap-keyin.js';

const ROOT = path.resolve('.');

const cases = [
  { file: 'samples/Cosumer Brand PO example.pdf', edits: { sc_ref_no: 'SR004/2026', freight: 4130 } },
  { file: 'samples/Asia Express PO example.pdf',  edits: {
      sc_ref_no: 'EX006/2026', eta_text: 'around June 8-12, 2026',
      lines: undefined, // will be filled with parsed lines + manual prices below
  }},
  { file: 'samples/FAN.THA.002.26-27.pdf',        edits: { sc_ref_no: 'FS003/2026', freight: 2760 } },
  { file: 'samples/ZZ_1059_25.pdf',               edits: { sc_ref_no: 'DC007/2025' } },
];

let pass = 0, fail = 0;
for (const tc of cases) {
  const buf  = await fs.readFile(path.join(ROOT, tc.file));
  const text = await extractText(buf);
  const parsed = parsePO(text);
  const customer = JSON.parse(await fs.readFile(path.join(ROOT, 'server/customers', `${parsed.customer_id}.json`), 'utf8'));
  const issues   = validate(parsed, customer);

  // For customers without prices on the PO, simulate price-list lookup
  if (!customer.po_has_prices) {
    // Price-list lookup. Rice is per-MT; small items per-carton.
    const fallback = {
      'asia-express': {
        '7050': { ppm: 1275 }, '7051': { ppm: 1305 }, '7052': { ppm: 1335 }, '7054': { ppm: 1415 },
        '607':  { ppu: 13.2 }, '609':  { ppu: 13.2 },
        '7519': { ppu: 56 }, '7519-1': { ppu: 27 }, '7519-2': { ppu: 49 }, '7519-3': { ppu: 47 },
      },
      'fantasy': { '1': { ppm: 1265 }, '2': { ppm: 1400 } },
      'de-care': { '1': { ppm: 1170 } },
    }[parsed.customer_id] || {};
    tc.edits.lines = parsed.lines.map(l => {
      const p = fallback[l.item_code] || {};
      const ppu = p.ppu ?? l.price_per_unit;
      const ppm = p.ppm ?? l.price_per_mt;
      let lt = null;
      if (ppm != null && l.qty_mt != null) lt = +(ppm * l.qty_mt).toFixed(2);
      else if (ppu != null && l.qty != null) lt = +(ppu * l.qty).toFixed(2);
      return { ...l, price_per_unit: ppu, price_per_mt: ppm, line_total: lt };
    });
  }

  const refSafe = (tc.edits.sc_ref_no || 'TBD').replace(/[\\/]/g, '_');
  const outDir  = path.join(ROOT, 'output', `e2e-${refSafe}`);
  await fs.mkdir(outDir, { recursive: true });
  const scPath  = path.join(outDir, `${refSafe}.xlsx`);
  const sapPath = path.join(outDir, `${refSafe}-SAP-keyin.html`);

  try {
    const r = await generateSC(parsed, customer, tc.edits, scPath);
    await fs.writeFile(sapPath, generateSapKeyin(parsed, customer, tc.edits), 'utf8');
    const sst = await fs.stat(scPath);
    const ssz = await fs.stat(sapPath);
    console.log(`\n✓ ${tc.file}`);
    console.log(`  customer: ${customer.name}`);
    console.log(`  PO#:      ${parsed.po_number}`);
    console.log(`  Lines:    ${parsed.lines.length}`);
    console.log(`  Issues:   ${issues.filter(i=>i.severity==='error').length} errors / ${issues.filter(i=>i.severity==='warning').length} warnings / ${issues.filter(i=>i.severity==='info').length} info`);
    console.log(`  Total MT: ${r.totals.total_mt}  Total $: ${r.totals.total_amount}`);
    console.log(`  SC:       ${path.relative(ROOT, scPath)} (${sst.size} bytes)`);
    console.log(`  SAP:      ${path.relative(ROOT, sapPath)} (${ssz.size} bytes)`);
    pass++;
  } catch (e) {
    console.log(`\n✗ ${tc.file}: ${e.message}`);
    console.log(e.stack);
    fail++;
  }
}
console.log(`\nE2E: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
