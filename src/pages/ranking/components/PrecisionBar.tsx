interface PrecisionBarProps {
  value: number;
}

export default function PrecisionBar({ value }: PrecisionBarProps) {
  const color =
    value >= 98
      ? 'bg-emerald-500'
      : value >= 95
      ? 'bg-amber-400'
      : 'bg-red-500';

  const textColor =
    value >= 98
      ? 'text-emerald-700'
      : value >= 95
      ? 'text-amber-700'
      : 'text-red-700';

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-[80px]">
        <div
          className={`${color} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(value, 100)}%` }}
        ></div>
      </div>
      <span className={`text-sm font-bold min-w-[52px] text-right ${textColor}`}>
        {value.toFixed(2)}%
      </span>
    </div>
  );
}