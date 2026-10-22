/** マイクの音量のメーター(0〜1) */
export function MicMeter({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted">マイク</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-border" role="meter" aria-label="マイクの音量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
        <div className="h-full rounded-full bg-success transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
    </div>
  );
}
