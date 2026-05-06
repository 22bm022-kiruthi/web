import React from 'react';

const HeroSpectrum: React.FC = () => {
  const [points, setPoints] = React.useState<Array<{ x: number; y: number }>>([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await fetch('/sample_full_spectrum.csv');
        if (!resp.ok) return;
        const txt = await resp.text();
        const lines = txt.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) return;
        const headers = lines[0].split(',').map((h) => h.trim());
        const rows = lines.slice(1).map((line) => {
          const parts = line.split(',');
          const obj: any = {};
          headers.forEach((h, i) => { obj[h] = parts[i] !== undefined ? parts[i].trim() : ''; });
          return obj;
        });
        const pts = rows.map((r) => ({ x: Number(r[headers[0]]), y: Number(r[headers[1]]) }));
        if (mounted) setPoints(pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!points || points.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-white/80">Loading spectrum…</div>;
  }

  const width = 760;
  const height = 360;
  const padding = 24;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const scaleX = (v: number) => {
    if (maxX === minX) return padding;
    return padding + ((v - minX) / (maxX - minX)) * (width - padding * 2);
  };
  const scaleY = (v: number) => {
    if (maxY === minY) return height - padding;
    return height - padding - ((v - minY) / (maxY - minY)) * (height - padding * 2);
  };

  const d = points.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(' ');

  // ticks
  const xTicks = [] as number[];
  for (let t = Math.ceil(minX / 200) * 200; t <= maxX; t += 200) xTicks.push(t);
  const yTicks = [] as number[];
  const ySteps = 6;
  for (let i = 0; i <= ySteps; i++) yTicks.push(minY + ((maxY - minY) * i) / ySteps);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="rounded-lg shadow-lg bg-gradient-to-br from-slate-800/20 to-indigo-800/10">
      <defs>
        <linearGradient id="g1" x1="0" x2="1">
          <stop offset="0%" stopColor="#00f5ff" />
          <stop offset="60%" stopColor="#7c4dff" />
          <stop offset="100%" stopColor="#ff66b3" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height={height} rx="8" fill="#061028" opacity={0.85} />

      {/* grid lines and y ticks */}
      {yTicks.map((yt, i) => {
        const y = scaleY(yt);
        return (
          <line key={`yg-${i}`} x1={padding} x2={width - padding} y1={y} y2={y} stroke="#ffffff22" strokeWidth={1} />
        );
      })}

      {/* x ticks */}
      {xTicks.map((xt, i) => {
        const x = scaleX(xt);
        return (
          <line key={`xg-${i}`} x1={x} x2={x} y1={padding} y2={height - padding} stroke="#ffffff10" strokeWidth={1} />
        );
      })}

      {/* axes labels */}
      <text x={padding} y={padding - 6} fill="#cbd5e1" fontSize={12}>Intensity (a.u.)</text>
      <text x={width / 2} y={height - 6} fill="#cbd5e1" fontSize={12} textAnchor="middle">Wavelength (nm)</text>

      <polyline points={d} fill="none" stroke="url(#g1)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={d} fill="none" stroke="#00000055" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.1} />
    </svg>
  );
};

export default HeroSpectrum;
