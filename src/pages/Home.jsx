import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserAllProgress, getList, getUserProfile,
  getPendingListInvites, acceptListInvite, declineListInvite,
  getAllWatchedTmdbIds, getAllWatchedMovies, reconcileUserWatchedCounts,
  getThrowbackReview, getRecentSiteReviews,
} from '../lib/firestore';
import { discoverMovies, getRecommendations, posterUrl } from '../lib/tmdb';
import QuickActionModal from '../components/modal/QuickActionModal';
import SuggestionCard from '../components/movies/SuggestionCard';
import StarRating from '../components/StarRating';
import MoviePosterTile from '../components/movies/MoviePosterTile';
import LoadingScreen from '../components/loading/Loading';
import NoComms from '../assets/images/arcy-scenes/no-comms.png';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invites, setInvites] = useState([]);
  const [mightLike, setMightLike] = useState(null);
  const [throwback, setThrowback] = useState(null);
  const [recentReviews, setRecentReviews] = useState([]);
  const [hasLists, setHasLists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [popularMovies, setPopularMovies] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [quickAction, setQuickAction] = useState(null);

  useEffect(() => {
    load();
  }, [user]);

  function handlePosterClick(movie) {
    if (user) {
      setQuickAction({ movie });
    } else {
      navigate(`/movie/${movie.tmdbId}`);
    }
  }

  function handleReviewClick({ review, profile }) {
    if (!user) {
      navigate(`/movie/${review.tmdbId}`);
      return;
    }
    setQuickAction({
      movie: {
        tmdbId: review.tmdbId,
        title: review.title,
        posterPath: review.posterPath,
        year: review.year,
        genreIds: review.genreIds || [],
      },
      review,
      profile,
    });
  }

  function updateRecentReviewReactions(reviewerUid, tmdbId, newReactions) {
    setRecentReviews((prev) => prev.map((entry) =>
      entry.profile.uid === reviewerUid && entry.review.tmdbId === tmdbId
        ? { ...entry, review: { ...entry.review, reactions: newReactions } }
        : entry
    ));
  }

  function updateRecentReviewOwn(tmdbId, { rating, note, reactions }) {
    if (!user) return;
    setRecentReviews((prev) => prev.map((entry) =>
      entry.profile.uid === user.uid && entry.review.tmdbId === tmdbId
        ? { ...entry, review: { ...entry.review, rating, note, reactions } }
        : entry
    ));
  }

  function removeRecentReviewOwn(tmdbId) {
    if (!user) return;
    setRecentReviews((prev) => prev.filter((entry) =>
      !(entry.profile.uid === user.uid && entry.review.tmdbId === tmdbId)
    ));
  }

  async function handleAcceptInvite(invite) {
    await acceptListInvite(invite.id, user.uid, invite.listId);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    load();
  }

  async function handleDeclineInvite(invite) {
    await declineListInvite(invite.id);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  async function load() {
    setLoading(true);

    // Public sections — load for everyone (anonymous + logged-in).
    const [popResult, recents] = await Promise.all([
      discoverMovies({ tab: 'popular' }),
      getRecentSiteReviews(12).catch((err) => {
        console.error('Failed to load recent reviews:', err);
        return [];
      }),
    ]);
    setPopularMovies(popResult.movies.slice(0, 10));
    setRecentReviews(recents);

    if (!user) {
      setLoading(false);
      return;
    }

    // Logged-in-only — recs, invites, throwback, watched glow, hasLists.

    // One-time per session: heal any watchedCount corruption from the earlier
    // increment-on-missing-field bug. Runs before getUserAllProgress so the
    // rest of the load sees corrected data.
    if (!sessionStorage.getItem('watchedCountReconciledV1')) {
      try {
        await reconcileUserWatchedCounts(user.uid);
        sessionStorage.setItem('watchedCountReconciledV1', '1');
      } catch { /* non-fatal — let the rest of load proceed */ }
    }

    const [allProgress, pendingInvites, ids] = await Promise.all([
      getUserAllProgress(user.uid),
      getPendingListInvites(user.uid),
      getAllWatchedTmdbIds(user.uid),
    ]);
    setWatchedIds(ids);

    const enrichedInvites = await Promise.all(
      pendingInvites.map(async (inv) => {
        const [fromProfile, listDoc] = await Promise.all([
          getUserProfile(inv.fromUid),
          getList(inv.listId),
        ]);
        return { ...inv, fromProfile, list: listDoc };
      })
    );
    setInvites(enrichedInvites.filter((inv) => inv.list));

    const enriched = await Promise.all(
      allProgress.map(async (p) => {
        try {
          const listDoc = await getList(p.listId);
          if (!listDoc) return null;
          return { ...p, list: listDoc };
        } catch { return null; }
      })
    );
    const valid = enriched.filter(Boolean);
    setHasLists(valid.length > 0);

    // You might like: seed TMDB recommendations off the user's highest-rated
    // watched film (fall back to a random watched film if they haven't rated
    // anything). Skip silently if they haven't watched anything yet.
    try {
      const allWatched = await getAllWatchedMovies(user.uid);
      if (allWatched.length > 0) {
        const rated = allWatched.filter((m) => m.rating > 0).sort((a, b) => b.rating - a.rating);
        const seed = rated[0] || allWatched[Math.floor(Math.random() * allWatched.length)];
        if (seed?.tmdbId) {
          const recs = await getRecommendations(seed.tmdbId);
          const unseen = recs.filter((m) => !ids.has(m.tmdbId));
          if (unseen.length > 0) {
            setMightLike({ movie: unseen[0], seedTitle: seed.title || '' });
          }
        }
      }
    } catch (err) {
      console.error('Failed to load recs:', err);
    }

    const throwbackReview = await getThrowbackReview(user.uid).catch(() => null);
    if (throwbackReview) setThrowback(throwbackReview);

    setLoading(false);
  }

  if (loading) return <LoadingScreen />;

  const hasAnyAction =
    invites.length > 0 ||
    mightLike ||
    throwback;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Pending invites — top, urgent (logged-in only) */}
      {user && invites.length > 0 && (
        <div className="space-y-2">
          {invites.map((invite) => (
            <div key={invite.id} className="bg-gray-900 border border-purple-500/30 rounded-xl p-4 flex items-center gap-3">
              {invite.fromProfile?.photoURL ? (
                <img src={invite.fromProfile.photoURL} alt="" className="w-10 h-10 rounded-full shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold shrink-0">
                  {invite.fromProfile?.displayName?.[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">
                  {invite.fromProfile?.displayName} {invite.list.isPrebuilt ? 'wants you to join the collection' : 'invited you to their list'}
                </p>
                <p className="text-purple-400 text-sm font-medium truncate">{invite.list.title}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleAcceptInvite(invite)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                >
                  Join
                </button>
                <button
                  onClick={() => handleDeclineInvite(invite)}
                  className="text-gray-400 hover:text-red-400 border border-gray-700 px-3 py-1.5 rounded-lg text-xs transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* You might like — logged-in only, top of page */}
      {user && mightLike && (
        <SuggestionCard
          movie={mightLike.movie}
          label="You might like"
          labelColor="text-purple-400/80"
          sublabel={mightLike.seedTitle ? `because you liked ${mightLike.seedTitle}` : undefined}
          onClick={handlePosterClick}
        />
      )}

      {/* Popular movies — everyone */}
      {popularMovies.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Popular Right Now</h2>
            <Link to="/movies" className="text-xs text-purple-400 hover:text-purple-300">View more →</Link>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {popularMovies.slice(0, 5).map((m) => (
              <MoviePosterTile
                key={m.tmdbId}
                movie={m}
                isSeen={watchedIds.has(m.tmdbId)}
                onClick={() => handlePosterClick(m)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent reviews — everyone */}
      {recentReviews.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Recent Reviews</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {recentReviews.map(({ review, profile, stats }) => (
              <RecentReviewCard
                key={`${profile.uid}__${review.tmdbId}`}
                review={review}
                profile={profile}
                stats={stats}
                onClick={() => handleReviewClick({ review, profile })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Throwback — logged-in only */}
      {user && throwback && (
        <SuggestionCard
          movie={throwback}
          label={<><span className="text-white">A year ago you watched</span></>}
          sublabel={throwback.note ? `"${throwback.note}"` : undefined}
          labelColor="text-amber-400"
          onClick={handlePosterClick}
        />
      )}

      {/* Empty state — no lists at all (logged-in only) */}
      {user && !hasLists && (
        <div className="space-y-8">
          <div className="text-center">
            <img
              src={NoComms}
              alt=""
              className="mx-auto mb-4 w-full max-w-md select-none"
              draggable="false"
            />
            <p className="text-white font-medium mb-1">Your station is quiet.</p>
            <p className="text-gray-400 text-sm mb-4">
              Start a list of movies to track, or join a friend's.
            </p>
            <div className="flex gap-2 justify-center">
              <Link
                to="/lists/new"
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                + New List
              </Link>
              <Link
                to="/lists"
                className="border border-gray-700 hover:border-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Browse Collections
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Nothing actionable but user has lists (e.g. all complete or all untouched) */}
      {user && hasLists && !hasAnyAction && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
          <p className="text-white font-medium mb-1">All caught up.</p>
          <p className="text-gray-400 text-sm mb-4">
            Start watching something from a list to see picks here.
          </p>
          <Link
            to="/lists"
            className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Go to Lists
          </Link>
        </div>
      )}

      {user && (
        <QuickActionModal
          isOpen={!!quickAction}
          onClose={() => setQuickAction(null)}
          movie={quickAction?.movie}
          user={user}
          watched={watchedIds}
          setWatched={setWatchedIds}
          review={quickAction?.review}
          reviewerProfile={quickAction?.profile}
          onReactionChange={(newReactions) => {
            if (!quickAction?.review) return;
            updateRecentReviewReactions(quickAction.review.uid, quickAction.review.tmdbId, newReactions);
            setQuickAction((prev) => prev?.review
              ? { ...prev, review: { ...prev.review, reactions: newReactions } }
              : prev);
          }}
          onEdit={({ rating, note, reactions }) => {
            if (!quickAction?.movie?.tmdbId) return;
            updateRecentReviewOwn(quickAction.movie.tmdbId, { rating, note, reactions });
          }}
          onDelete={() => {
            if (!quickAction?.movie?.tmdbId) return;
            removeRecentReviewOwn(quickAction.movie.tmdbId);
          }}
        />
      )}
    </div>
  );
}

function RecentReviewCard({ review, profile, stats, onClick }) {
  const hasRating = review.rating > 0;
  const hasNote = !!review.note;
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-gray-900/60 border border-gray-800 rounded-lg p-2.5 flex flex-col text-left hover:border-purple-500 transition-colors"
    >
      <div className="flex gap-2.5">
        {review.posterPath ? (
          <img
            src={posterUrl(review.posterPath, 'w92')}
            alt=""
            className="w-12 h-[72px] rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-[72px] rounded bg-gray-800 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {review.title && (
            <p className="text-white text-xs font-medium line-clamp-1 break-words">{review.title}</p>
          )}
          {review.year && <p className="text-[10px] text-gray-500">{review.year}</p>}
          {stats?.scorePct != null && (
            <p className="text-[10px] text-green-400 font-medium mt-0.5">
              {stats.scorePct}%
              {stats.count > 0 && (
                <span className="text-gray-500 font-normal"> ({stats.count})</span>
              )}
            </p>
          )}
          {hasRating && <div className="mt-1"><StarRating value={review.rating} size="sm" /></div>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 min-w-0">
        {profile.photoURL ? (
          <img
            src={profile.photoURL}
            alt=""
            className="w-4 h-4 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center text-[8px] font-bold text-white shrink-0">
            {profile.displayName?.[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-gray-400 text-[10px] truncate">{profile.displayName}</span>
      </div>
      {hasNote ? (
        <p className="text-gray-300 text-xs mt-1.5 italic line-clamp-3">"{review.note}"</p>
      ) : (
        !hasRating && <p className="text-gray-500 text-xs mt-1.5">Watched it</p>
      )}
    </button>
  );
}
