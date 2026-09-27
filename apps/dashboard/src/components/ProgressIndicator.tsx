interface Job {
  id: string;
  label: string;
  progress: number;
  status: "running" | "completed" | "failed";
}

interface ProgressIndicatorProps {
  jobs: Job[];
}

export function ProgressIndicator({ jobs }: ProgressIndicatorProps) {
  const running = jobs.filter((j) => j.status === "running");
  if (running.length === 0) return null;

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Background Jobs</p>
      {running.map((job) => (
        <div key={job.id} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">{job.label}</span>
            <span className="text-xs text-slate-500">{job.progress}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
