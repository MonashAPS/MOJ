"use client";

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  type ChartType,
  Legend,
  LinearScale,
  PieController,
  Tooltip,
} from "chart.js";
import { useEffect, useRef } from "react";

ChartJS.register(
  ArcElement,
  PieController,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
);

export type ChartDataset = {
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
};

/**
 * One Chart.js canvas, rebuilt whenever its data or its resolved token colours
 * change. Animation is off — DESIGN.md section 5: data does not animate.
 */
export function Chart({
  type,
  labels,
  datasets,
  options,
  height,
  ariaLabel,
  className,
}: {
  type: ChartType;
  labels: string[];
  datasets: ChartDataset[];
  options?: ChartOptions;
  height: number;
  ariaLabel: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const key = JSON.stringify({ labels, datasets, options });

  /* biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the serialised
     input. The label, dataset and option objects are new on every render, so listing
     them would tear the chart down and rebuild it on every render. */
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const chart = new ChartJS(canvas, {
      type,
      data: { labels, datasets },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        ...options,
      },
    });

    return () => chart.destroy();
  }, [key, type]);

  return (
    <div className={className} style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}
