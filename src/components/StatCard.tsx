interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
}

/**
 * A simple card showing one statistic.
 * Used in the admin dashboard to display pending / processed counts.
 */
export default function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-4xl font-semibold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-sm text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
