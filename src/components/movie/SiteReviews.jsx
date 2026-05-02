import { forwardRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StarRating from '../StarRating';
import { getMovieReviews } from '../../lib/firestore';

const PAGE_SIZE = 6;

const SiteReviews = forwardRef(function SiteReviews({ tmdbId, stats, refreshKey }, ref) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!tmdbId) return;
    setLoading(true);
    setPage(0);
    getMovieReviews(tmdbId)
      .then(setReviews)
      .catch((err) => { console.error('Failed to load reviews:', err); setReviews([]); })
      .finally(() => setLoading(false));
  }, [tmdbId, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(reviews.length / PAGE_SIZE));
  const visible = reviews.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const showPager = reviews.length > PAGE_SIZE;

  return (
    <div ref={ref}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-400">Audience reviews</h2>
        {stats?.count > 0 && (
          <span className="text-xs text-gray-500">
            <span className="text-green-400 font-medium">{stats.scorePct}%</span>
            {' '}from {stats.count} {stats.count === 1 ? 'rating' : 'ratings'}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading reviews…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500">
          No reviews yet. Be the first to share what you thought.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {visible.map(({ review, profile }) => (
              <ReviewCard key={profile.uid} review={review} profile={profile} />
            ))}
          </div>
          {showPager && (
            <div className="flex items-center justify-between gap-2 mt-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-sm text-gray-400 hover:text-purple-400 disabled:text-gray-700 disabled:hover:text-gray-700 border border-gray-800 hover:border-purple-500 disabled:hover:border-gray-800 rounded-lg px-3 py-1.5 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="text-sm text-gray-400 hover:text-purple-400 disabled:text-gray-700 disabled:hover:text-gray-700 border border-gray-800 hover:border-purple-500 disabled:hover:border-gray-800 rounded-lg px-3 py-1.5 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
});

function ReviewCard({ review, profile }) {
  const hasRating = review.rating > 0;
  const hasNote = !!review.note;
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-2.5 flex flex-col">
      <Link
        to={`/user/${profile.uid}`}
        className="flex items-center gap-2 group min-w-0"
      >
        {profile.photoURL ? (
          <img
            src={profile.photoURL}
            alt=""
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {profile.displayName?.[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-white text-xs font-medium truncate group-hover:text-purple-400 transition-colors">
          {profile.displayName}
        </span>
      </Link>
      {hasRating && <div className="mt-1"><StarRating value={review.rating} size="sm" /></div>}
      {hasNote ? (
        <p className="text-gray-300 text-xs mt-1.5 italic line-clamp-4">"{review.note}"</p>
      ) : (
        !hasRating && <p className="text-gray-500 text-xs mt-1.5">Watched it</p>
      )}
    </div>
  );
}

export default SiteReviews;
