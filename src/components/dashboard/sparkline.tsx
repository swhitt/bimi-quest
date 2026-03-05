interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ data, width = 60, height = 16, className }: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });

  const polyline = points.join(" ");
  const areaPath = `M${points[0]} ${polyline} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <path d={areaPath} fill="currentColor" opacity={0.15} />
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
