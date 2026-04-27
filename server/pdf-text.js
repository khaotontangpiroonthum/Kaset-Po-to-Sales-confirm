// Extract plain text from a PDF buffer using pdfjs-dist (no native deps).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractText(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    // Reconstruct lines using the y-coordinate of each text item.
    const rows = new Map();
    for (const item of tc.items) {
      const y = Math.round(item.transform[5] * 10) / 10;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], s: item.str });
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) =>
        items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()
      )
      .filter(l => l.length > 0);
    pages.push(lines.join('\n'));
  }
  return pages.join('\n\n--- PAGE BREAK ---\n\n');
}
