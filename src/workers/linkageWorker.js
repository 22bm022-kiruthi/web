// linkageWorker.js
// Runs a simple agglomerative clustering linkage computation in a Web Worker.
// Receives: { features: number[][] }
// Responds: { linkage: Array<[a,b,d,size]>, order: number[], heights: number[] }

function euclid(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

onmessage = function (ev) {
  const { features } = ev.data || {};
  if (!Array.isArray(features)) {
    postMessage({ error: 'invalid_features' });
    return;
  }
  const n = features.length;
  if (n === 0) { postMessage({ linkage: [], order: [], heights: [] }); return; }
  // simple agglomerative single-linkage
  let clusters = [];
  for (let i = 0; i < n; i++) clusters.push({ id: i, members: [i] });
  const linkage = [];
  let nextId = n;
  // cache pairwise distances
  const distCache = new Map();
  const pairDist = (i, j) => {
    const key = i < j ? i + '_' + j : j + '_' + i;
    if (distCache.has(key)) return distCache.get(key);
    const d = euclid(features[i], features[j]);
    distCache.set(key, d);
    return d;
  };

  const clusterDist = (c1, c2) => {
    let best = Infinity;
    for (let ii = 0; ii < c1.length; ii++) {
      for (let jj = 0; jj < c2.length; jj++) {
        const d = pairDist(c1[ii], c2[jj]);
        if (d < best) best = d;
      }
    }
    return best;
  };

  while (clusters.length > 1) {
    let bestI = 0, bestJ = 1; let bestD = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = clusterDist(clusters[i].members, clusters[j].members);
        if (d < bestD) { bestD = d; bestI = i; bestJ = j; }
      }
    }
    const a = clusters[bestI];
    const b = clusters[bestJ];
    const mergedMembers = a.members.concat(b.members);
    linkage.push([a.id, b.id, bestD, mergedMembers.length]);
    if (bestJ > bestI) { clusters.splice(bestJ, 1); clusters.splice(bestI, 1); }
    else { clusters.splice(bestI, 1); clusters.splice(bestJ, 1); }
    clusters.push({ id: nextId++, members: mergedMembers });
  }
  const order = Array.from({ length: n }, (_, i) => i);
  const heights = linkage.map(l => l[2]);
  postMessage({ linkage, order, heights });
};
