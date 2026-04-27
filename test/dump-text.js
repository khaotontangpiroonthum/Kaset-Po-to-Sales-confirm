import fs from 'node:fs/promises';
import { extractText } from '../server/pdf-text.js';

const file = process.argv[2];
const buf  = await fs.readFile(file);
const text = await extractText(buf);
console.log(text);
