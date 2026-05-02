import { useEffect, useState } from 'react';
import BaseModal from './Modal';
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

export default function PlotModal({ isOpen, onClose, tmdbId, title, year }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !tmdbId) return;
    if (data) return;
    setLoading(true);
    (async () => {
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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tmdbId]);

  if (!isOpen) return null;

  return (
    <BaseModal isOpen onClose={onClose} maxWidth="max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-white font-medium">Plot {title ? `— ${title}` : ''}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <p className="text-xs text-gray-500 -mt-2">Spoilers ahead.</p>

      <div className="max-h-[60vh] overflow-y-auto">
        {loading && <p className="text-sm text-gray-500">Loading plot…</p>}
        {!loading && data?.error && (
          <p className="text-sm text-gray-500">Couldn't load the plot right now. Try again in a bit.</p>
        )}
        {!loading && data && !data.error && data.plot && (
          <>
            <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
              {data.plot.split(/\n\n+/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            {data.wikipediaUrl && (
              <p className="mt-3 text-xs text-gray-500">
                Source:{' '}
                <a
                  href={data.wikipediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-purple-400 underline"
                >
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
    </BaseModal>
  );
}
