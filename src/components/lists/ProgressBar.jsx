export default function ProgressBar({ watched, total }) {
  const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm text-gray-400 mb-1">
        <span>{watched}/{total} watched</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className="bg-purple-600 h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
