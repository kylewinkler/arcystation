export default function ProgressBar({ watched, total, showCount }) {
  const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
  
  return (
    <div>
      <div className="flex text-sm text-gray-400 mb-1">
        {showCount && <span>{watched}/{total} watched</span>}
        <span className="ml-auto">{pct}%</span>
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
