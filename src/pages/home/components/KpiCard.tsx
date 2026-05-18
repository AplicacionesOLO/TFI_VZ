interface KpiCardProps {
  label: string;
  value: string | number;
  icon: string;
  iconBg: string;
  iconColor: string;
  badge?: string;
  badgeColor?: 'green' | 'yellow' | 'red' | 'gray';
  trend?: string;
}

const badgeClasses: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 border border-amber-200',
  red: 'bg-red-50 text-red-700 border border-red-200',
  gray: 'bg-gray-50 text-gray-600 border border-gray-200',
};

export default function KpiCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
  badge,
  badgeColor = 'gray',
  trend,
}: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 hover:border-gray-200 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${iconBg}`}>
          <i className={`${icon} text-lg ${iconColor}`}></i>
        </div>
        {badge && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badgeClasses[badgeColor]}`}>
            {badge}
          </span>
        )}
      </div>
      <div>
        <div className="text-3xl font-bold text-gray-900 leading-none mb-1">{value}</div>
        <div className="text-sm text-gray-500 leading-snug">{label}</div>
      </div>
      {trend && (
        <div className="text-xs text-gray-400 border-t border-gray-50 pt-2">{trend}</div>
      )}
    </div>
  );
}