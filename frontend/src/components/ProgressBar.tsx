interface ProgressBarProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  variant?: "default" | "recovery" | "warning" | "danger";
  className?: string;
}

export const ProgressBar = ({
  progress,
  label,
  showPercentage = true,
  variant = "default",
  className = "",
}: ProgressBarProps) => {
  const clamped = Math.min(100, Math.max(0, progress));

  const barColor =
    variant === "recovery" ? "bg-success" :
    variant === "warning"  ? "bg-warning" :
    variant === "danger"   ? "bg-destructive" :
    "bg-primary";

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          {showPercentage && (
            <span className="text-[13px] text-muted-foreground">{Math.round(clamped)}%</span>
          )}
        </div>
      )}
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};