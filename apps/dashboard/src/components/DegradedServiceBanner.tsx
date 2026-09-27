interface DegradedServiceBannerProps {
  serviceName: string;
}

export function DegradedServiceBanner({ serviceName }: DegradedServiceBannerProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
      <span className="text-lg">⚠️</span>
      <span>
        <strong>{serviceName}</strong> is currently unavailable. Some features may be limited.
      </span>
    </div>
  );
}
