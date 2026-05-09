import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BaseModal from './Modal';
import RatingModal from './RatingModal';
import AddToListModal from './AddToListModal';
import StarRating from '../StarRating';
import MovieScoreBadge from '../movie/MovieScoreBadge';
import { posterUrl } from '../../lib/tmdb';
import {
  markWatchedStandalone, unmarkWatchedStandalone,
  getWatchedInfo, getAllWatchedTmdbIds, notifyFriends,
} from '../../lib/firestore';
import { useToast } from '../../context/ToastContext';
import { randomFrom, REVIEW_REACTIONS, RATING_ONLY_REACTIONS } from '../../lib/copy/lore';
import { getMilestone } from '../../lib/copy/lore';
import ArcyReadTransmission from '../../assets/images/arcy-poses/arcy-read-transmission.png';

export default function QuickActionModal({ isOpen, onClose, movie, user, watched, setWatched }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState('menu'); // 'menu' | 'lists' | 'rating'

  // Watched info
  const [watchedData, setWatchedData] = useState(null);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');

  // Reset state on open/close
  useEffect(() => {
    if (isOpen && movie) {
      setMode('menu');
      // Check watched status
      getWatchedInfo(user.uid, movie.tmdbId).then((info) => {
        setWatchedData(info);
      });
    } else {
      setWatchedData(null);
      setRating(0);
      setNote('');
    }
  }, [isOpen, movie?.tmdbId]);

  const isWatched = !!watchedData;

  async function handleSaveRating() {
    await markWatchedStandalone(user.uid, movie.tmdbId, {
      rating: rating,
      note: note.trim() || null,
      movieData: getMovieData(),
    });
    setWatched((prev) => new Set(prev).add(movie.tmdbId));
    onClose();
    showWatchedToast(!!rating);
    notifyFriends(user.uid, 'watched_movie', {
      movieTitle: movie?.title || null,
      tmdbId: movie?.tmdbId || movie?.id || null,
      posterPath: movie?.poster_path || movie?.posterPath || null,
      rating: rating || null,
      note: note.trim() || null,
    });
  }

  async function handleDelete() {
    await unmarkWatchedStandalone(user.uid, movie.tmdbId);
    setWatched((prev) => { const s = new Set(prev); s.delete(movie.tmdbId); return s; });
    onClose();
  }

  async function showWatchedToast(hasRating) {
    const ids = await getAllWatchedTmdbIds(user.uid);
    const milestone = getMilestone(ids.size);
    if (milestone) {
      showToast({ message: `${milestone.title} ${milestone.subtitle}`, image: ArcyReadTransmission });
    } else if (hasRating) {
      showToast({ message: randomFrom(REVIEW_REACTIONS), image: ArcyReadTransmission });
    } else {
      showToast(randomFrom(RATING_ONLY_REACTIONS));
    }
  }

  function getMovieData() {
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      posterPath: movie.posterPath,
      year: movie.year,
      overview: movie.overview || '',
      genreIds: movie.genreIds || [],
    };
  }

  async function handleToggleWatchlist() {
    if (watchlistBusy) return;
    setWatchlistBusy(true);
    const watchlistId = getWatchlistId(user.uid);
    try {
      if (onWatchlist) {
        await removeMovieFromList(watchlistId, movie.tmdbId);
        setOnWatchlist(false);
        showToast({ message: 'Removed from Watchlist', duration: 1500 });
      } else {
        await addMovieToList(watchlistId, getMovieData());
        setOnWatchlist(true);
        showToast({ message: 'Added to Watchlist', duration: 1500 });
      }
    } finally {
      setWatchlistBusy(false);
    }
  }

  function openRating(initialRating) {
    if (isWatched) {
      setRating(initialRating ?? watchedData.rating ?? 0);
      setNote(watchedData.note || '');
    } else {
      setRating(initialRating ?? 0);
      setNote('');
    }
    setMode('rating');
  }

  if (!isOpen || !movie) return null;

  // ── Rating mode: use RatingModal directly ──
  if (mode === 'rating') {
    return (
      <RatingModal
        isOpen
        rating={rating}
        note={note}
        setRating={setRating}
        setNote={setNote}
        onCancel={() => setMode('menu')}
        onSave={handleSaveRating}
        isExisting={isWatched}
        onDelete={handleDelete}
      />
    );
  }

  // ── Lists mode: delegate to AddToListModal ──
  if (mode === 'lists') {
    return (
      <AddToListModal
        isOpen
        onClose={onClose}
        movie={movie}
        user={user}
      />
    );
  }

  // ── Menu mode (default) ──
  return (
    <BaseModal isOpen onClose={onClose}>
      {/* Movie poster + title */}
      <div className="flex items-center gap-3">
        {movie.posterPath ? (
          <img
            src={posterUrl(movie.posterPath, 'w92')}
            alt=""
            className="w-12 h-18 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-18 rounded bg-gray-800 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-white font-medium truncate">{movie.title}</p>
          {movie.year && <p className="text-xs text-gray-500">{movie.year}</p>}
          <div className="mt-0.5"><MovieScoreBadge tmdbId={movie.tmdbId} /></div>
        </div>
      </div>

      {/* Watched status */}
      {isWatched ? (
        <button
          onClick={openRating}
          className="w-full bg-purple-600/10 border border-purple-500/30 rounded-lg p-3 text-left hover:border-purple-500 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-purple-300 text-sm font-medium">Watched</span>
            <span className="ml-auto"><StarRating value={watchedData.rating || 0} size="sm" /></span>
          </div>
          {watchedData.note && (
            <p className="text-gray-300 text-sm mt-2 italic truncate">"{watchedData.note}"</p>
          )}
        </button>
      ) : (
        <div className="w-full flex items-center gap-2 text-sm border border-gray-700 hover:border-green-500 px-3 py-2 rounded-lg transition-colors">
          <button
            onClick={() => openRating(0)}
            className="flex items-center gap-2 text-gray-400 hover:text-green-400 transition-colors"
          >
            <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            Rate this movie
          </button>
          <span className="ml-auto">
            <StarRating value={0} onChange={(v) => openRating(v)} size="md" />
          </span>
        </div>
      )}

      {/* Add to / Remove from Watchlist */}
      <button
        onClick={handleToggleWatchlist}
        disabled={watchlistBusy}
        className={`w-full flex items-center gap-2 text-sm border px-3 py-2.5 rounded-lg transition-colors ${
          onWatchlist
            ? 'text-purple-300 border-purple-500/50 bg-purple-600/10 hover:border-purple-500'
            : 'text-gray-400 border-gray-700 hover:text-purple-400 hover:border-purple-500'
        } disabled:opacity-50`}
      >
        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${onWatchlist ? 'bg-purple-600 border-purple-600' : 'border-gray-600'}`}>
          {onWatchlist && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        {onWatchlist ? 'On Watchlist' : 'Add to Watchlist'}
      </button>

      {/* Add to list */}
      <button
        onClick={() => setMode('lists')}
        className="w-full flex items-center gap-2 text-sm text-gray-400 hover:text-purple-400 border border-gray-700 hover:border-purple-500 px-3 py-2.5 rounded-lg transition-colors"
      >
        <span className="text-lg leading-none">+</span>
        Add to list
      </button>

      {/* View movie page */}
      <button
        onClick={() => { onClose(); navigate(`/movie/${movie.tmdbId}`); }}
        className="w-full flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2.5 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
        </svg>
        Go To Movie
        <svg className="w-4 h-4 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </BaseModal>
  );
}
