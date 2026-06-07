import { dct8 } from './stegoUtils';

export interface HeatmapGrid {
  grid: number[][];   // rows × cols, values 0–1
  rows: number;
  cols: number;
  blockSize: number;
}

/** LSB anomaly: deviation of LSB density from expected 0.5 */
export function buildLSBHeatmap(imageData: ImageData, blockSize = 8): HeatmapGrid {
  const { data, width, height } = imageData;
  const cols = Math.ceil(width / blockSize);
  const rows = Math.ceil(height / blockSize);
  const grid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let lsbSum = 0, count = 0;
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const px = Math.min(c * blockSize + dx, width - 1);
          const py = Math.min(r * blockSize + dy, height - 1);
          const i = (py * width + px) * 4;
          lsbSum += (data[i] & 1) + (data[i + 1] & 1) + (data[i + 2] & 1);
          count += 3;
        }
      }
      const density = lsbSum / count;
      grid[r][c] = Math.abs(density - 0.5) * 2; // 0=normal, 1=extreme
    }
  }
  return { grid, rows, cols, blockSize };
}

/** DCT anomaly: mid-frequency AC coefficient variance per 8×8 block */
export function buildDCTHeatmap(imageData: ImageData, blockSize = 8): HeatmapGrid {
  const { data, width, height } = imageData;
  const cols = Math.ceil(width / blockSize);
  const rows = Math.ceil(height / blockSize);
  const grid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const block: number[] = [];
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const px = Math.min(c * blockSize + dx, width - 1);
          const py = Math.min(r * blockSize + dy, height - 1);
          const i = (py * width + px) * 4;
          // Luminance
          block.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
      }
      const coeffs = dct8(block);
      // Mid-frequency: coefficients [1..15], skip DC[0]
      const mid = coeffs.slice(1, 16);
      const mean = mid.reduce((a, b) => a + b, 0) / mid.length;
      const variance = mid.reduce((s, x) => s + (x - mean) ** 2, 0) / mid.length;
      grid[r][c] = Math.min(variance / 400, 1.0);
    }
  }
  return { grid, rows, cols, blockSize };
}
