import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import StarRating from './StarRating';
import ReviewReactions from './ReviewReactions';
import { useAuth } from '../context/AuthContext';

const CYCLE_MS = 5000;
const ANIM_OUT_MS = 300;
const PAUSE_AFTER_CLICK_MS = 15000;

export default function FriendReviewsCarousel({ reviews, movieTitle, posterPath, onOwnReviewClick }) {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('in');
  const [paused, setPaused] = useState(false);
  const [reviewsState, setReviewsState] = useState(reviews);
  const indexRef = useRef(0);
  const phaseRef = useRef('in');
  const resumeTimerRef = useRef(null);

  useEffect(() => { setReviewsState(reviews); }, [reviews]);
  useEffect(() => { indexRef.current = index; }, [index]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  function updateReactionsFor(reviewerUid, newReactions) {
    setReviewsState((prev) => prev.map((r) =>
      r.profile.uid === reviewerUid
        ? { ...r, review: { ...r.review, reactions: newReactions } }
        : r
    ));
  }

  useEffect(() => {
    if (paused || reviewsState.length <= 1) return;
    const id = setInterval(() => {
      if (phaseRef.current === 'out') return;
      goTo((indexRef.current + 1) % reviewsState.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [paused, reviewsState.length]);

  useEffect(() => () => clearTimeout(resumeTimerRef.current), []);

  function goTo(nextIndex) {
    if (nextIndex === indexRef.current || phaseRef.current === 'out') return;
    setPhase('out');
    setTimeout(() => {
      setIndex(nextIndex);
      setPhase('in');
    }, ANIM_OUT_MS);
  }

  function selectFriend(i) {
    setPaused(true);
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), PAUSE_AFTER_CLICK_MS);
    goTo(i);
  }

  if (reviewsState.length === 0) return null;

  const current = reviewsState[index] || reviewsState[0];
  const hasRating = current.review.rating > 0;
  const hasNote = !!current.review.note;
  const isMine = user?.uid === current.profile.uid;
  const friendCount = reviewsState.filter((r) => r.profile.uid !== user?.uid).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {reviewsState.map((r, i) => {
          const isActive = i === index;
          const isSelf = user?.uid === r.profile.uid;
          const ringClass = isSelf
            ? `ring-2 ring-[var(--color-watched-glow)] ${isActive ? '' : 'opacity-60 hover:opacity-100'}`
            : isActive
              ? 'ring-2 ring-purple-500'
              : 'opacity-60 hover:opacity-100';
          return (
            <button
              key={r.profile.uid}
              onClick={() => selectFriend(i)}
              className="shrink-0"
              title={r.profile.displayName}
              aria-label={`Show ${r.profile.displayName}'s review`}
            >
              {r.profile.photoURL ? (
                <img
                  src={r.profile.photoURL}
                  alt=""
                  className={`w-9 h-9 rounded-full object-cover transition-all ${ringClass}`}
                />
              ) : (
                <div
                  className={`w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold text-white transition-all ${ringClass}`}
                >
                  {r.profile.displayName?.[0]?.toUpperCase()}
                </div>
              )}
            </button>
          );
        })}
        <span className="text-xs text-gray-500 ml-1">
          {friendCount === 0
            ? 'Your review'
            : friendCount === 1
              ? '1 friend watched'
              : `${friendCount} friends watched`}
        </span>
      </div>

      <div
        key={`${index}-${phase}`}
        onClick={isMine && onOwnReviewClick ? onOwnReviewClick : undefined}
        className={`bg-gray-900/60 border border-gray-800 rounded-lg p-4 ${
          phase === 'in' ? 'animate-fade-in-up' : 'animate-fade-out-up'
        } ${isMine && onOwnReviewClick ? 'cursor-pointer hover:border-[var(--color-watched-glow)]' : ''}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {isMine ? (
            <span className="text-white text-sm font-medium">You</span>
          ) : (
            <Link
              to={`/user/${current.profile.uid}`}
              onClick={(e) => e.stopPropagation()}
              className="text-white text-sm font-medium hover:text-purple-400 transition-colors"
            >
              {current.profile.displayName}
            </Link>
          )}
          {hasRating && <StarRating value={current.review.rating} size="sm" />}
          {isMine && onOwnReviewClick && (
            <span className="ml-auto text-xs text-gray-500">tap to edit</span>
          )}
        </div>
        {hasNote ? (
          <p className="text-gray-300 text-sm mt-2 italic">"{current.review.note}"</p>
        ) : (
          !hasRating && <p className="text-gray-500 text-sm mt-2">Watched it</p>
        )}
        <ReviewReactions
          reviewerUid={current.profile.uid}
          tmdbId={current.review.tmdbId}
          reactions={current.review.reactions || {}}
          currentUserUid={user?.uid}
          movieTitle={movieTitle}
          posterPath={posterPath}
          onReactionChange={(newReactions) => updateReactionsFor(current.profile.uid, newReactions)}
        />
      </div>
    </div>
  );
}
