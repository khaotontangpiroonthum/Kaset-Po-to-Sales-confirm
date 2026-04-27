# Kaset PO → Sales Confirmation

Internal tool for **Thai Ha Public Company Limited**: upload a customer Purchase
Order PDF, auto-detect the customer, review extracted fields, and generate
both the Sales Confirmation Excel (in the customer's template) and a SAP VA01
key-in cheat sheet — all in one pass.

## Status

MVP. Supported customers (out of the box):

| Customer | Country | SC Ref prefix | PO has prices? | Freight |
|---|---|---|---|---|
| Consumer Brands Ltd. | Jamaica | `SR` | ✅ yes | CIF |
| Asia Express Food B.V. | Netherlands | `EX` | ❌ no | FOB only |
| Fantasy Pvt. Ltd. | Maldives | `FS` | ❌ no | CNF |
| De Care Group Sp. z o.o. | Poland | `DC` | ❌ no | FOB only |

Adding a fifth customer = drop a sample PO + filled SC, add a JSON profile +
parser + fill-spec. ~30 minutes per customer once you've seen the layout.

## Run

```bash
npm install
npm start                        # http://localhost:3000
# or
npm run dev                      # auto-reload
npm run test:e2e                 # sanity-check all 4 sample POs
```

Then open http://localhost:3000, drag in a PO PDF, review the extracted
fields, and click **Generate**. Outputs land in `output/<ref>-<ts>/`:

- `<ref>.xlsx` — Sales Confirmation, opened from the customer template (styling
  preserved). Internal cost / %GP / GP columns are hidden when the customer
  template carries them.
- `<ref>-SAP-keyin.html` — single-page cheat sheet in SAP VA01 field order.
  Open next to SAP and tab through the fields. No SAP API needed.
- `audit.json` — original parsed PO + every edit you made, for traceability.

## Layout

```
samples/                  reference POs and SCs (one each per customer)
templates/                customer-specific SC templates (filled by the generator)
server/
  index.js                Express server
  pdf-text.js             PDF -> plain text via pdfjs-dist
  parsers/
    detect.js             customer auto-detect
    consumer-brands.js    \
    asia-express.js       |  4 customer-specific PO parsers
    fantasy.js            |  return a normalized PO object
    de-care.js            /
    util.js               shared helpers (numbers, dates, packing)
  customers/              JSON profiles (saved addresses, defaults, signers)
    _seller.json          Thai Ha's own header & bank details
  validate.js             validation rules + warnings
  generators/
    fill-specs.js         where in each template each field goes
    sc-generator.js       opens template, fills cells, writes new file
    sap-keyin.js          renders the SAP key-in HTML
public/                   minimal vanilla-JS UI (upload + edit + generate)
test/
  parse-samples.js        smoke test: parse the 4 sample POs
  e2e.js                  full pipeline test: parse + generate for all 4
output/                   generated files (gitignored)
```

## Validation

Per the merchant rule "do not invent missing data", the parser leaves anything
absent from the PO as `null` and the validator flags it. Examples:

- `PO_DATE_MISSING` — the PO doesn't print a date (Consumer Brands, Fantasy).
- `INCOTERMS_MISSING` / `PAYMENT_TERMS_MISSING` — defaulted from the customer
  profile, but flagged so the operator confirms.
- `LINE_TOTAL_MISMATCH` — qty × unit_price ≠ printed line total.
- `LINE_PRICE_FROM_PRICELIST` — the PO has no prices; price list lookup needed.
- `HIDE_GP_COLS_ON_EXPORT` — reminder for Consumer Brands / Asia Express.
- `HALAL_NOTE` — Fantasy: no pork / wine / alcohol / amaretto.
- `CREDIT_TERM_NOTE` — De Care: 45-day credit term.

## Adding a new customer

1. Drop the sample PO (PDF) and a filled SC (xlsx) into `samples/`.
2. Copy the SC into `templates/<id>-template.xlsx`.
3. Create `server/customers/<id>.json` (mirror an existing one).
4. Create `server/parsers/<id>.js` and add it to `server/parsers/index.js`.
5. Add a signature in `server/parsers/detect.js`.
6. Add a fill-spec in `server/generators/fill-specs.js`.
7. `npm run test:e2e` to verify.

## Known limits

- The Fantasy template uses an irregular 2-row layout for the second item.
  The generator writes the standard 3-row layout for all items; tidy the
  second item's row in Excel after generating if you have ≥2 lines.
- The SC templates use static cell values. Live formulas (in Asia Express
  template) are preserved unless we overwrite the cell.
- No SAP API integration — by design, since SAP charges for it.
- Price list lookup is in-test only (`test/e2e.js`); production needs a
  per-customer price list at `server/pricelist/<id>.json`.

## Why this exists

A Sales Confirmation today is a manual job: read PO, type into the customer's
SC template, type into SAP, sanity-check. This tool collapses that into:
*upload, review, click*. The SAP key-in stays a manual paste — no API fees,
no IT ticket, no integration.
