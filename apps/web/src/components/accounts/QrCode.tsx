"use client";

import { useMemo } from "react";
import { encodeQr, qrPath } from "@/lib/qr";

/** The code stays dark-on-light in both themes: a scanner reads contrast, not
 *  design tokens, and an inverted code is a support ticket. */
export function QrCode({ value, label, size = 240 }: { value: string; label: string; size?: number }) {
  const matrix = useMemo(() => encodeQr(value), [value]);
  const quiet = 4;
  const extent = matrix.size + quiet * 2;

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      className="block h-auto w-full max-w-[240px] rounded-md border border-border-strong"
      shapeRendering="crispEdges"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <g transform={`translate(${quiet} ${quiet})`}>
        <path d={qrPath(matrix)} fill="#101a3d" />
      </g>
    </svg>
  );
}
