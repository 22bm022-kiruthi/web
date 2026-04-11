import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCSV(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(l => {
    const parts = l.split(',');
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = parts[i];
    return obj;
  });
  return { headers, rows };
}

function compute(rows) {
  const intensityKey = ['Raman intensity', 'Raman Intensity', 'intensity', 'Intensity', 'y', 'Y'].find(k => rows[0] && rows[0][k] !== undefined) || Object.keys(rows[0]||{}).find(k => !isNaN(Number(rows[0][k])));
  if (!intensityKey) return null;
  const vals = rows.map(r => {
    const n = Number(r[intensityKey]);
    return isNaN(n) ? null : n;
  }).filter(v => v !== null);
  const n = vals.length;
  const sum = vals.reduce((a,b) => a + b, 0);
  const mean = n ? sum / n : 0;
  const min = n ? Math.min(...vals) : 0;
  const max = n ? Math.max(...vals) : 0;
  const variance = n ? vals.reduce((acc,v) => acc + Math.pow(v - mean, 2), 0) / n : 0;
  const std = Math.sqrt(variance);
  return { intensityKey, n, sum, mean, min, max, variance, std };
}

const file = path.join(__dirname, '..', 'sample_full_spectrum.csv');
const { rows } = readCSV(file);
const stats = compute(rows);
if (!stats) {
  console.error('No intensity column found');
  process.exit(2);
}
console.log('intensityKey', stats.intensityKey);
console.log('rows', stats.n);
console.log('mean', stats.mean);
console.log('sum', stats.sum);
console.log('min', stats.min);
console.log('max', stats.max);
console.log('std', stats.std);
