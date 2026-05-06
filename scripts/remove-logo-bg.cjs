// Replace background color (sampled from image corners) with transparency.
// Usage: node scripts/remove-logo-bg.cjs

const SRC = './public/logo.jpg';
const DST = './public/logo.png';

function colorDist(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function avgSample(img, x0, y0, w, h) {
  const s = { r: 0, g: 0, b: 0 };
  let n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) continue;
      const idx = (img.bitmap.width * y + x) << 2;
      s.r += img.bitmap.data[idx + 0];
      s.g += img.bitmap.data[idx + 1];
      s.b += img.bitmap.data[idx + 2];
      n++;
    }
  }
  if (n === 0) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(s.r / n), g: Math.round(s.g / n), b: Math.round(s.b / n) };
}

(async () => {
  try {
    const mod = await import('jimp');
    const Jimp = (mod && mod.Jimp) ? mod.Jimp : (mod && mod.default ? mod.default : mod);

    const img = await Jimp.read(SRC);
    const w = img.bitmap.width;
    const h = img.bitmap.height;

    // sample small patches in four corners to estimate background color
    const patch = 10;
    const c1 = await avgSample(img, 0, 0, patch, patch);
    const c2 = await avgSample(img, w - patch, 0, patch, patch);
    const c3 = await avgSample(img, 0, h - patch, patch, patch);
    const c4 = await avgSample(img, w - patch, h - patch, patch, patch);
    const bg = {
      r: Math.round((c1.r + c2.r + c3.r + c4.r) / 4),
      g: Math.round((c1.g + c2.g + c3.g + c4.g) / 4),
      b: Math.round((c1.b + c2.b + c3.b + c4.b) / 4),
    };

    // threshold: pixels within this distance to bg will be made transparent
    const THRESH = 80; // increased to be more aggressive

    img.scan(0, 0, w, h, function (x, y, idx) {
      const px = { r: this.bitmap.data[idx + 0], g: this.bitmap.data[idx + 1], b: this.bitmap.data[idx + 2] };
      const d = colorDist(px, bg);
      if (d <= THRESH) {
        // set alpha to 0
        this.bitmap.data[idx + 3] = 0;
      }
    });

    // Note: do NOT remove the center/logo color here — we only want to strip
    // the outer background (sampled from the corners). Removing center color
    // would erase the dark disk and emblem; avoid that.

    // write result to a final file
    const FINAL = './public/logo_final.png';

    img.write(FINAL, (err) => {
      if (err) {
        console.error('Write err:', err);
        process.exit(2);
      }
      console.log('Wrote', FINAL);
      process.exit(0);
    });
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(2);
  }
})();
