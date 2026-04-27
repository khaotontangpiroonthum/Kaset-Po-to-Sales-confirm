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

function defaultEdits(parsed, customer) {
  return {
    sc_date_iso:    new Date().toISOString().slice(0, 10),
    sc_ref_no:      `${customer.ref_prefix}???/${new Date().getFullYear()}`,
    buyer_attn:     parsed.buyer?.attn || customer.buyer.default_attn,
    incoterms:      parsed.shipment?.incoterms    || customer.default_incoterms,
    payment_terms:  parsed.shipment?.payment_terms || customer.default_payment_terms,
    port_of_loading:    customer.default_port_of_loading,
    port_of_discharge:  customer.default_port_of_discharge,
    eta_text:       parsed.shipment?.etd || '',
    container:      parsed.shipment?.container || '1 x 20ft FCL',
    freight:        0,
    lines:          parsed.lines || [],
  };
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
    const refSafe  = (edits.sc_ref_no || `${customer.ref_prefix}TBD`).replace(/[\\/:*?"<>|]/g, '_');
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

app.post('/api/batch-generate', upload.array('po', 50), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'no files uploaded' });

  const batchStamp = Date.now();
  const batchId    = `batch-${batchStamp}`;
  const batchDir   = path.join(ROOT, 'output', batchId);
  await fs.mkdir(batchDir, { recursive: true });

  const results = [];
  for (const file of files) {
    const entry = { original_name: file.originalname, status: 'pending', files: [] };
    try {
      const text   = await extractText(file.buffer);
      const parsed = parsePO(text);
      if (parsed.error) throw new Error(parsed.error);

      const customer = await loadCustomer(parsed.customer_id);
      const edits    = defaultEdits(parsed, customer);
      const poSafe   = String(parsed.po_number || 'unknown').replace(/[\\/:*?"<>|]/g, '_');
      const subDir   = path.join(batchDir, `${customer.id}-${poSafe}`);
      await fs.mkdir(subDir, { recursive: true });
      const baseName = `${customer.ref_prefix}-${poSafe}`;

      const scPath = path.join(subDir, `${baseName}.xlsx`);
      const r      = await generateSC(parsed, customer, edits, scPath);
      entry.files.push({ kind: 'sc', path: path.relative(ROOT, scPath), totals: r.totals, lines: r.lines });

      const html    = generateSapKeyin(parsed, customer, edits);
      const sapPath = path.join(subDir, `${baseName}-SAP-keyin.html`);
      await fs.writeFile(sapPath, html, 'utf8');
      entry.files.push({ kind: 'sap', path: path.relative(ROOT, sapPath) });

      const audit = {
        generated_at: new Date().toISOString(),
        customer_id:  customer.id,
        po_number:    parsed.po_number,
        original:     parsed,
        edits,
      };
      const auditPath = path.join(subDir, 'audit.json');
      await fs.writeFile(auditPath, JSON.stringify(audit, null, 2), 'utf8');
      entry.files.push({ kind: 'audit', path: path.relative(ROOT, auditPath) });

      entry.customer_id   = customer.id;
      entry.customer_name = customer.name;
      entry.po_number     = parsed.po_number;
      entry.lines_count   = (parsed.lines || []).length;
      entry.totals        = r.totals;
      entry.status        = 'ok';
    } catch (e) {
      entry.status = 'error';
      entry.error  = String(e.message || e);
    }
    results.push(entry);
  }

  const manifestPath = path.join(batchDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({ batch_id: batchId, results }, null, 2), 'utf8');
  res.json({ batch_id: batchId, results });
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
