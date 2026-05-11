import { forwardRef, useEffect, useMemo, useState } from 'react';
import StarRating from '../StarRating';
import ReviewModal from '../modal/ReviewModal';
import { getMovieReviews } from '../../lib/firestore';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZE = 6;

const SiteReviews = forwardRef(function SiteReviews({ tmdbId, stats, refreshKey }, ref) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null); // { review, profile }

  useEffect(() => {
    if (!tmdbId) return;
    setLoading(true);
    setPage(0);
    getMovieReviews(tmdbId)
      .then(setReviews)
      .catch((err) => { console.error('Failed to load reviews:', err); setReviews([]); })
      .finally(() => setLoading(false));
  }, [tmdbId, refreshKey]);

  const orderedReviews = useMemo(() => {
    if (!user) return reviews;
    const mine = reviews.filter((r) => r.profile.uid === user.uid);
    const rest = reviews.filter((r) => r.profile.uid !== user.uid);
    return [...mine, ...rest];
  }, [reviews, user]);

  const totalPages = Math.max(1, Math.ceil(orderedReviews.length / PAGE_SIZE));
  const visible = orderedReviews.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const showPager = orderedReviews.length > PAGE_SIZE;

  function updateSelectedReactions(newReactions) {
    setSelected((prev) => prev
      ? { ...prev, review: { ...prev.review, reactions: newReactions } }
      : prev);
    setReviews((prev) => prev.map((r) =>
      r.profile.uid === selected?.profile.uid
        ? { ...r, review: { ...r.review, reactions: newReactions } }
        : r
    ));
  }

  return (
    <div ref={ref}>
      <h2 className="text-md font-medium text-gray-400 mb-2">Site reviews</h2>

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
              <ReviewCard
                key={profile.uid}
                review={review}
                profile={profile}
                isMine={user?.uid === profile.uid}
                onClick={() => setSelected({ review, profile })}
              />
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

      <ReviewModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        movie={selected?.review}
        reviewerProfile={selected?.profile}
        hideMovieLink
        onReactionChange={updateSelectedReactions}
      />
    </div>
  );
});

function ReviewCard({ review, profile, isMine, onClick }) {
  const hasRating = review.rating > 0;
  const hasNote = !!review.note;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`bg-gray-900/60 border border-gray-800 hover:border-purple-500 rounded-lg p-2.5 flex flex-col text-left transition-colors ${isMine ? 'shadow-[0_0_8px_var(--color-watched-glow)]' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0">
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
        <span className="text-white text-xs font-medium truncate">
          {profile.displayName}
        </span>
      </div>
      {hasRating && <div className="mt-1"><StarRating value={review.rating} size="sm" /></div>}
      {hasNote ? (
        <p className="text-gray-300 text-xs mt-1.5 italic text-left line-clamp-4">
          "{review.note}"
        </p>
      ) : (
        !hasRating && <p className="text-gray-500 text-xs mt-1.5">Watched it</p>
      )}
    </button>
  );
}

export default SiteReviews;
