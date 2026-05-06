const fs = require('fs');
const path = require('path');

// ---- Utility clustering functions copied from widget ----
const euclidean = (a, b) => {
  let s = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const da = a[i] || 0; const db = b[i] || 0; const d = da - db; s += d * d;
  }
  return Math.sqrt(s);
};

const kmeans = (points, k, maxIter = 100) => {
  const n = points.length;
  if (k <= 0) return new Array(n).fill(0);
  if (k === 1) return new Array(n).fill(0);
  const cents = [];
  const used = new Set();
  while (cents.length < Math.min(k, n)) {
    const idx = Math.floor(Math.random() * n);
    if (!used.has(idx)) { used.add(idx); cents.push(points[idx].slice()); }
  }
  const labels = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0; let bestd = Infinity;
      for (let j = 0; j < cents.length; j++) {
        const d = euclidean(points[i], cents[j]); if (d < bestd) { bestd = d; best = j; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    const sums = new Array(cents.length).fill(0).map(() => []);
    const counts = new Array(cents.length).fill(0);
    for (let i = 0; i < n; i++) {
      const lab = labels[i]; counts[lab]++;
      for (let d = 0; d < points[i].length; d++) {
        sums[lab][d] = (sums[lab][d] || 0) + points[i][d];
      }
    }
    for (let j = 0; j < cents.length; j++) {
      if (counts[j] === 0) {
        cents[j] = points[Math.floor(Math.random() * n)].slice();
      } else {
        for (let d = 0; d < (sums[j] || []).length; d++) cents[j][d] = sums[j][d] / counts[j];
      }
    }
    if (!changed) break;
  }
  return labels.map(l => Math.min(l, k-1));
};

const bisectingKMeans = (points, k) => {
  const n = points.length;
  if (n === 0) return [];
  if (k <= 1) return new Array(n).fill(0);
  try {
    return kmeans(points, k, 60);
  } catch (e) {
    const labels = new Array(n).fill(0);
    for (let i = 0; i < n; i++) labels[i] = i % k;
    return labels;
  }
};

// ---- Read CSV ----
const csvPath = process.argv[2] || path.resolve('c:/Users/lashm/Downloads/ethanol_1.csv');
if (!fs.existsSync(csvPath)) {
  console.error('CSV not found at', csvPath);
  process.exit(2);
}
const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);
const header = lines[0].split(',').map(h => h.trim());
const rows = lines.slice(1).map(l => {
  const parts = l.split(',');
  const obj = {};
  for (let i = 0; i < header.length; i++) obj[header[i]] = Number(parts[i]);
  return obj;
});

console.log('Read', rows.length, 'rows, columns:', header.join(','));

// Build features as [wavenumber, intensity]
const features = rows.map(r => [Number(r['wavenumber'] || 0), Number(r['intensity'] || 0)]);
const k = 2;
const labels = bisectingKMeans(features, k);

// Diagnostics
const counts = {};
for (const lab of labels) counts[lab] = (counts[lab] || 0) + 1;

const clusterMeans = {};
for (let i = 0; i < labels.length; i++) {
  const lab = labels[i];
  clusterMeans[lab] = clusterMeans[lab] || { sumW: 0, sumI: 0, n: 0 };
  clusterMeans[lab].sumW += features[i][0];
  clusterMeans[lab].sumI += features[i][1];
  clusterMeans[lab].n += 1;
}
for (const kLab of Object.keys(clusterMeans)) {
  const v = clusterMeans[kLab];
  v.meanW = v.sumW / v.n;
  v.meanI = v.sumI / v.n;
}

console.log('Cluster counts:', counts);
console.log('Cluster mean wavenumber & intensity:', JSON.stringify(clusterMeans, null, 2));
console.log('First 30 labels:', labels.slice(0, 30).join(','));

// Simple sanity check: are clusters separated by mean intensity?
const meanIValues = Object.values(clusterMeans).map(v => v.meanI);
const diff = Math.abs(meanIValues[0] - meanIValues[1]);
console.log('Mean intensity difference between clusters:', diff.toFixed(6));
if (diff > 0.1) {
  console.log('Clusters show a substantial intensity separation (likely meaningful).');
} else {
  console.log('Clusters show small intensity separation; clustering may not be meaningful for this spectrum with k=2.');
}

process.exit(0);
