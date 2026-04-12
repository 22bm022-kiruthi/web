// Utility functions for signal feature extraction used by extraction widgets.
// Exports: findPeaks, calcStd, calcAUC, calcPeakFWHM, computeSignalMetrics

type Peak = {
  index: number;
  position: number; // x value (wavelength / frequency)
  value: number; // y value (intensity)
  fwhm?: number; // full-width at half-maximum in x-units
  auc?: number; // approximate area around the peak
};

export function calcStd(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function calcAUC(x: number[], y: number[]): number {
  if (!x || !y || x.length < 2 || x.length !== y.length) return 0;
  let area = 0;
  for (let i = 0; i < x.length - 1; i++) {
    const dx = x[i + 1] - x[i];
    area += dx * (y[i] + y[i + 1]) / 2;
  }
  return area;
}

// Simple local-maximum peak finder. Returns peaks with index and x/y position.
// options:
//  - minProminence: minimum y value relative to median to count as peak
//  - minDistance: minimum index distance between peaks
export function findPeaks(x: number[], y: number[], options?: { minProminence?: number; minDistance?: number }): Peak[] {
  const peaks: Peak[] = [];
  if (!x || !y || x.length < 3) return peaks;

  const minDistance = options?.minDistance ?? 1;
  const median = (() => {
    const copy = [...y].sort((a, b) => a - b);
    const m = Math.floor(copy.length / 2);
    return copy.length % 2 === 1 ? copy[m] : (copy[m - 1] + copy[m]) / 2;
  })();
  const minProminence = options?.minProminence ?? Math.max(0, median);

  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > y[i - 1] && y[i] > y[i + 1] && y[i] >= minProminence) {
      // ensure not too close to last peak
      if (peaks.length > 0 && i - peaks[peaks.length - 1].index < minDistance) {
        // keep the larger peak
        if (y[i] > peaks[peaks.length - 1].value) {
          peaks[peaks.length - 1] = { index: i, position: x[i], value: y[i] };
        }
      } else {
        peaks.push({ index: i, position: x[i], value: y[i] });
      }
    }
  }
  return peaks;
}

// Compute full-width at half-maximum (FWHM) for a peak at given index.
// Uses linear interpolation between samples to estimate the left and right half-max crossing.
export function calcPeakFWHM(x: number[], y: number[], peakIndex: number): number | null {
  if (!x || !y || peakIndex <= 0 || peakIndex >= y.length - 1) return null;
  const peakVal = y[peakIndex];
  const half = peakVal / 2;

  // find left crossing
  let left = null as number | null;
  for (let i = peakIndex; i > 0; i--) {
    if (y[i - 1] <= half && y[i] >= half) {
      // linear interp between (i-1) and i
      const t = (half - y[i - 1]) / (y[i] - y[i - 1]);
      left = x[i - 1] + t * (x[i] - x[i - 1]);
      break;
    }
  }

  // find right crossing
  let right = null as number | null;
  for (let i = peakIndex; i < y.length - 1; i++) {
    if (y[i + 1] <= half && y[i] >= half) {
      const t = (half - y[i + 1]) / (y[i] - y[i + 1]);
      right = x[i + 1] + t * (x[i] - x[i + 1]);
      break;
    }
  }

  if (left === null || right === null) return null;
  return Math.abs(right - left);
}

// Compute all requested metrics for a signal
export function computeSignalMetrics(x: number[], y: number[], options?: { minProminence?: number; minDistance?: number }) {
  const peaks = findPeaks(x, y, options);
  const std = calcStd(y);
  const auc = calcAUC(x, y);

  // enrich peaks with FWHM and local AUC (approx area within ±FWHM around the peak)
  const enriched = peaks.map(p => {
    const fwhm = calcPeakFWHM(x, y, p.index) ?? undefined;
    let localAuc: number | undefined = undefined;
    if (fwhm && fwhm > 0) {
      // find x-range around peak center approximately fwhm/2 on each side
      const half = fwhm / 2;
      const leftX = p.position - half;
      const rightX = p.position + half;
      // integrate over x within [leftX, rightX]
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < x.length; i++) {
        if (x[i] >= leftX && x[i] <= rightX) {
          xs.push(x[i]);
          ys.push(y[i]);
        }
      }
      if (xs.length >= 2) localAuc = calcAUC(xs, ys);
    }
    return { ...p, fwhm, auc: localAuc } as Peak;
  });

  return {
    peaks: enriched,
    std,
    auc
  };
}

export type { Peak };
