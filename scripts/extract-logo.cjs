// Generate two variants from public/logo.jpg:
// - public/logo_only.png : emblem preserved, background removed
// - public/logo_trans.png: emblem recolored for visibility, background removed
// Usage: node scripts/extract-logo.cjs
 (async () => {
  try {
    const mod = await import('jimp');
    const Jimp = mod.Jimp || mod.default || mod;

    const SRC = './public/logo.jpg';
    const OUT_ONLY = './public/logo_only.png';
    const OUT_TRANS = './public/logo_trans.png';

    const img = await Jimp.read(SRC);
    const w = img.bitmap.width;
    const h = img.bitmap.height;

    // sample center (assumed blue circle) color
    const patch = Math.max(6, Math.floor(Math.min(w, h) * 0.12));
    const cx = Math.floor(w / 2 - patch / 2);
    const cy = Math.floor(h / 2 - patch / 2);
    let sum = { r: 0, g: 0, b: 0 };
    let n = 0;
    for (let yy = cy; yy < cy + patch; yy++) {
      for (let xx = cx; xx < cx + patch; xx++) {
        const id = (w * yy + xx) << 2;
        sum.r += img.bitmap.data[id + 0];
        sum.g += img.bitmap.data[id + 1];
        sum.b += img.bitmap.data[id + 2];
        n++;
      }
    }
    const centerColor = { r: Math.round(sum.r / n), g: Math.round(sum.g / n), b: Math.round(sum.b / n) };

    const outOnly = img.clone();
    const outTrans = img.clone();

    // clear alpha channels
    for (let i = 3; i < outOnly.bitmap.data.length; i += 4) outOnly.bitmap.data[i] = 0;
    for (let i = 3; i < outTrans.bitmap.data.length; i += 4) outTrans.bitmap.data[i] = 0;

    const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const centerThresh = 100; // tune: distance to center color considered background
    const whiteLumThresh = 220; // treat near-white as emblem
    const target = { r: 11, g: 110, b: 246 }; // visible blue

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (w * y + x) << 2;
        const r = img.bitmap.data[idx + 0];
        const g = img.bitmap.data[idx + 1];
        const b = img.bitmap.data[idx + 2];
        const dCenter = Math.sqrt((r - centerColor.r) ** 2 + (g - centerColor.g) ** 2 + (b - centerColor.b) ** 2);
        const l = lum(r, g, b);

        // outOnly: keep non-center pixels
        if (dCenter > centerThresh) {
          outOnly.bitmap.data[idx + 0] = r;
          outOnly.bitmap.data[idx + 1] = g;
          outOnly.bitmap.data[idx + 2] = b;
          outOnly.bitmap.data[idx + 3] = 255;
        } else {
          outOnly.bitmap.data[idx + 3] = 0;
        }

        // outTrans: remove center but recolor very-bright emblem strokes for visibility
        if (dCenter > centerThresh) {
          if (l >= whiteLumThresh) {
            outTrans.bitmap.data[idx + 0] = target.r;
            outTrans.bitmap.data[idx + 1] = target.g;
            outTrans.bitmap.data[idx + 2] = target.b;
            outTrans.bitmap.data[idx + 3] = 255;
          } else {
            outTrans.bitmap.data[idx + 0] = r;
            outTrans.bitmap.data[idx + 1] = g;
            outTrans.bitmap.data[idx + 2] = b;
            outTrans.bitmap.data[idx + 3] = 255;
          }
        } else {
          outTrans.bitmap.data[idx + 3] = 0;
        }
      }
    }

    // write the results
    outOnly.write(OUT_ONLY, (err) => {
      if (err) console.error('Write logo_only err:', err);
      else console.log('Wrote', OUT_ONLY);
    });

    outTrans.write(OUT_TRANS, (err) => {
      if (err) {
        console.error('Write err:', err);
        process.exit(2);
      }
      console.log('Wrote', OUT_TRANS);
      process.exit(0);
    });
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(2);
  }
})();
