// Express server: serves the UI and exposes /api/parse and /api/generate.
import express from 'express';
import multer  from 'multer';
import path    from 'node:path';
import fs      from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extractText }   from './pdf-text.js';
import { parsePO }       from './parsers/index.js';
import { validate }      from './validate.js';
import { generateSC }    from './generators/sc-generator.js';
import { generateSapKeyin } from './generators/sap-keyin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const upload    = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const app       = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(ROOT, 'public')));

const customerCache = new Map();
async function loadCustomer(id) {
  if (customerCache.has(id)) return customerCache.get(id);
  const c = JSON.parse(await fs.readFile(path.join(ROOT, 'server/customers', `${id}.json`), 'utf8'));
  customerCache.set(id, c);
  return c;
}
async function loadSeller() {
  return JSON.parse(await fs.readFile(path.join(ROOT, 'server/customers/_seller.json'), 'utf8'));
}

app.post('/api/parse', upload.single('po'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    const text   = await extractText(req.file.buffer);
    const parsed = parsePO(text);
    if (parsed.error) return res.status(422).json(parsed);
    const customer = await loadCustomer(parsed.customer_id);
    const issues   = validate(parsed, customer);
    res.json({ parsed, customer, issues });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const { parsed, edits = {}, what = ['sc', 'sap'] } = req.body;
    if (!parsed?.customer_id) return res.status(400).json({ error: 'parsed.customer_id required' });
    const customer = await loadCustomer(parsed.customer_id);
    const refSafe  = (edits.sc_ref_no || `${customer.ref_prefix}TBD`).replace(/[\\/]/g, '_');
    const stamp    = Date.now();
    const outDir   = path.join(ROOT, 'output', `${refSafe}-${stamp}`);
    await fs.mkdir(outDir, { recursive: true });

    const result = { files: [] };
    if (what.includes('sc')) {
      const scPath = path.join(outDir, `${refSafe}.xlsx`);
      const r = await generateSC(parsed, customer, edits, scPath);
      result.files.push({ kind: 'sc', path: path.relative(ROOT, scPath), totals: r.totals, lines: r.lines });
    }
    if (what.includes('sap')) {
      const html = generateSapKeyin(parsed, customer, edits);
      const sapPath = path.join(outDir, `${refSafe}-SAP-keyin.html`);
      await fs.writeFile(sapPath, html, 'utf8');
      result.files.push({ kind: 'sap', path: path.relative(ROOT, sapPath) });
    }
    // Audit trail
    const audit = {
      generated_at: new Date().toISOString(),
      customer_id:  customer.id,
      po_number:    parsed.po_number,
      original:     parsed,
      edits,
    };
    const auditPath = path.join(outDir, 'audit.json');
    await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8');
    result.files.push({ kind: 'audit', path: path.relative(ROOT, auditPath) });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e), stack: e.stack });
  }
});

// Serve generated files for download
app.get('/output/*', async (req, res) => {
  const rel = req.path.replace(/^\/output\//, '');
  const full = path.join(ROOT, 'output', rel);
  if (!full.startsWith(path.join(ROOT, 'output'))) return res.status(403).end();
  try {
    await fs.access(full);
    res.sendFile(full);
  } catch {
    res.status(404).end();
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Sales Confirmation platform on http://localhost:${port}`));
