import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { HeatmapGrid } from '../lib/heatmapAnalyzer';

type ColorScheme = 'redblue' | 'thermal' | 'viridis';

interface Props {
  gridData: HeatmapGrid;
  colorScheme?: ColorScheme;
  opacity?: number;
  title?: string;
}

export default function StegoHeatmap({
  gridData,
  colorScheme = 'redblue',
  opacity = 0.78,
  title = 'Anomaly Heatmap',
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !gridData) return;
    const { grid, rows, cols } = gridData;

    const svgEl = svgRef.current;
    const W = svgEl.clientWidth  || 600;
    const H = svgEl.clientHeight || 400;

    d3.select(svgEl).selectAll('*').remove();
    const svg = d3.select(svgEl);

    // Color scales — redblue: red = high anomaly, blue = normal
    const scales: Record<ColorScheme, d3.ScaleSequential<string>> = {
      redblue:  d3.scaleSequential(d3.interpolateRdYlBu).domain([1, 0]),
      thermal:  d3.scaleSequential(d3.interpolateInferno).domain([0, 1]),
      viridis:  d3.scaleSequential(d3.interpolateViridis).domain([0, 1]),
    };
    const colorScale = scales[colorScheme];

    const cellW = W / cols;
    const cellH = H / rows;

    // Draw heatmap cells
    const cells = svg.append('g').attr('class', 'hm-cells');
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = grid[r][c];
        cells.append('rect')
          .attr('x', c * cellW).attr('y', r * cellH)
          .attr('width', cellW + 0.6).attr('height', cellH + 0.6)
          .attr('fill', colorScale(val))
          .attr('opacity', opacity)
          .append('title').text(`[${r},${c}] Score: ${(val * 100).toFixed(1)}%`);
      }
    }

    // Contour density rings for cluster detection
    const pts: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] > 0.45) {
          const w = Math.round(grid[r][c] * 12);
          for (let i = 0; i < w; i++)
            pts.push([(c + 0.5) * cellW, (r + 0.5) * cellH]);
        }
      }
    }
    if (pts.length > 10) {
      const density = d3.contourDensity<[number, number]>()
        .x(d => d[0]).y(d => d[1])
        .size([W, H]).bandwidth(cellW * 2.5).thresholds(5)(pts);

      svg.append('g').attr('class', 'hm-contours')
        .selectAll('path').data(density).join('path')
        .attr('d', d3.geoPath())
        .attr('fill', 'none')
        .attr('stroke', '#ff3300')
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', d => Math.min(d.value * 60, 0.9));
    }

    // Legend bar
    const lW = 140, lH = 10;
    const lx = W - lW - 12, ly = H - 26;
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'hm-grad');
    d3.range(0, 1.01, 0.1).forEach(t =>
      grad.append('stop').attr('offset', `${t*100}%`).attr('stop-color', colorScale(t))
    );
    svg.append('rect').attr('x', lx).attr('y', ly)
       .attr('width', lW).attr('height', lH).attr('rx', 3)
       .attr('fill', 'url(#hm-grad)');
    svg.append('text').attr('x', lx).attr('y', ly - 3)
       .attr('font-size', '9px').attr('fill', '#888').text('Normal');
    svg.append('text').attr('x', lx + lW).attr('y', ly - 3)
       .attr('text-anchor', 'end').attr('font-size', '9px').attr('fill', '#888').text('Anomalous');

    // Title
    svg.append('text').attr('x', W / 2).attr('y', 14)
       .attr('text-anchor', 'middle').attr('font-size', '11px')
       .attr('fill', '#aaa').attr('font-family', 'monospace').text(title);

  }, [gridData, colorScheme, opacity, title]);

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
      style={{ background: 'transparent' }}
    />
  );
}
