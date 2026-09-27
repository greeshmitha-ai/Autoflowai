interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  loading?: boolean;
}

export function MetricCard({ title, value, subtitle, loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className="glass-card p-5">
        <div className="shimmer h-4 w-24 mb-3 rounded" />
        <div className="shimmer h-8 w-16 mb-2 rounded" />
        <div className="shimmer h-3 w-20 rounded" />
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
      <p className="stat-value mt-2">{value}</p>
      {subtitle && <p className="stat-label mt-1">{subtitle}</p>}
    </div>
  );
}
