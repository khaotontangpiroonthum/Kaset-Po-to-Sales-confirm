// Smoke-test: run all 4 parsers against the actual sample POs and dump JSON.
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractText } from '../server/pdf-text.js';
import { parsePO }     from '../server/parsers/index.js';

const samples = [
  ['samples/Cosumer Brand PO example.pdf', 'consumer-brands'],
  ['samples/Asia Express PO example.pdf',  'asia-express'],
  ['samples/FAN.THA.002.26-27.pdf',        'fantasy'],
  ['samples/ZZ_1059_25.pdf',               'de-care'],
];

for (const [file, expected] of samples) {
  const buf = await fs.readFile(path.resolve(file));
  const text = await extractText(buf);
  const parsed = parsePO(text);
  console.log('==============================');
  console.log('File:           ', file);
  console.log('Expected cust:  ', expected);
  console.log('Detected cust:  ', parsed.customer_id);
  console.log('PO Number:      ', parsed.po_number);
  console.log('PO Date:        ', parsed.po_date);
  console.log('Lines:          ', parsed.lines?.length);
  console.log('Total MT:       ', parsed.totals?.total_mt?.toFixed?.(4));
  console.log('Total amount:   ', parsed.totals?.total_amount);
  console.log('Special clauses:', parsed.special_clauses?.length);
  if (parsed.lines?.length) {
    console.log('First line:     ', JSON.stringify(parsed.lines[0]));
  } else {
    console.log('!! NO LINES PARSED');
    console.log(text.slice(0, 800));
  }
}
