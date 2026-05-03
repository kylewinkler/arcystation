import { useEffect, useState } from 'react';
import { getMovieReviewStats } from '../../lib/firestore';

// Smooth red → yellow → green gradient via HSL hue interpolation. Hue 0 = red,
// 60 = yellow, 120 = green. Maps a 0-100 score to that range.
function scoreColor(pct) {
  const hue = Math.max(0, Math.min(120, (pct / 100) * 120));
  return `hsl(${hue}, 75%, 55%)`;
}

// Tiny self-fetching badge for the site review %. Uses the cached helper, so
// many badges on one page share reads. Renders nothing if there's no rating.
export default function MovieScoreBadge({ tmdbId, size = 'sm', showCount = false }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    getMovieReviewStats(tmdbId)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tmdbId]);

  if (stats?.scorePct == null) return null;

  const textClass = size === 'xs' ? 'text-[10px]' : size === 'md' ? 'text-sm' : 'text-xs';
  const color = scoreColor(stats.scorePct);
  const isElite = stats.scorePct >= 90;
  const style = isElite
    ? { color, textShadow: `0 0 8px ${color}` }
    : { color };

  return (
    <span className={textClass}>
      <span className="font-medium" style={style}>{stats.scorePct}%</span>
      {showCount && <span className="text-gray-600"> ({stats.count})</span>}
    </span>
  );
}
