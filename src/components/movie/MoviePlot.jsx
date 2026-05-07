import { useState } from 'react';
import { getMoviePlot, saveMoviePlot } from '../../lib/firestore';
import { fetchWikipediaPlot } from '../../lib/wikipedia';

function isPlotFresh(data, year) {
  if (!data?.fetchedAt) return false;
  const fetchedMs = data.fetchedAt.toMillis?.() ?? new Date(data.fetchedAt).getTime();
  if (!fetchedMs) return false;
  const ageDays = (Date.now() - fetchedMs) / (1000 * 60 * 60 * 24);
  const currentYear = new Date().getFullYear();
  const isRecent = !year || Number(year) >= currentYear - 1;
  return ageDays < (isRecent ? 7 : 90);
}

export default function MoviePlot({ tmdbId, title, year }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadPlot() {
    setLoading(true);
    try {
      let cached = await getMoviePlot(tmdbId);
      if (!cached || !isPlotFresh(cached, year)) {
        cached = await fetchWikipediaPlot(title, year);
        await saveMoviePlot(tmdbId, cached).catch(() => {});
      }
      setData(cached);
    } catch (err) {
      console.error('Failed to load plot:', err);
      setData({ error: true });
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !data && !loading) loadPlot();
  }

  return (
    <div className="bg-gray-900/40 border border-gray-800 hover:border-purple-500 rounded-lg overflow-hidden transition-colors">
      <button
        onClick={toggle}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left group"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <h2 className="text-md font-medium text-gray-400 group-hover:text-white transition-colors">Plot</h2>
          <p className="text-xs text-gray-500 mt-0.5">⚠ Spoilers ahead — tap to reveal</p>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 group-hover:text-white shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-gray-800 p-4">
          {loading && <p className="text-sm text-gray-500">Loading plot…</p>}
          {!loading && data?.error && (
            <p className="text-sm text-gray-500">Couldn't load the plot right now. Try again in a bit.</p>
          )}
          {!loading && data && !data.error && data.plot && (
            <>
              <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
                {data.plot.split(/\n\n+/).map((para, i) => <p key={i}>{para}</p>)}
              </div>
              {data.wikipediaUrl && (
                <p className="mt-3 text-xs text-gray-500">
                  Source:{' '}
                  <a href={data.wikipediaUrl} target="_blank" rel="noopener noreferrer" className="hover:text-purple-400 underline">
                    Wikipedia
                  </a>
                </p>
              )}
            </>
          )}
          {!loading && data && !data.error && !data.plot && (
            <p className="text-sm text-gray-500">No detailed plot found on Wikipedia for this movie.</p>
          )}
        </div>
      )}
    </div>
  );
}
