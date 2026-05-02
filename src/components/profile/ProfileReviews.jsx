import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { posterUrl } from '../../lib/tmdb';
import StarRating from '../StarRating';

const PREVIEW_COUNT = 6;

export default function ProfileReviews({ watchedMovies, onSelect, viewAllHref }) {
  const reviewed = useMemo(
    () => watchedMovies.filter((m) => m.rating > 0 || m.note),
    [watchedMovies]
  );
  const visible = reviewed.slice(0, PREVIEW_COUNT);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-2xl font-bold text-white">Recently Reviewed</h2>
        <span className="text-sm text-gray-500">({reviewed.length})</span>
        {viewAllHref && reviewed.length > 0 && (
          <Link
            to={viewAllHref}
            className="text-xs text-purple-400 hover:text-purple-300 ml-auto"
          >
            View all →
          </Link>
        )}
      </div>

      {reviewed.length === 0 ? (
        <p className="text-sm text-gray-500">No rated reviews yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {visible.map((movie) => (
            <ReviewCard
              key={movie.tmdbId}
              movie={movie}
              onClick={() => onSelect?.(movie)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ movie, onClick }) {
  const hasRating = movie.rating > 0;
  const hasNote = !!movie.note;
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-gray-900/60 border border-gray-800 hover:border-purple-500 rounded-lg p-2.5 flex flex-col text-left transition-colors"
    >
      <div className="flex gap-2.5">
        {movie.posterPath ? (
          <img
            src={posterUrl(movie.posterPath, 'w92')}
            alt=""
            className="w-12 h-[72px] rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-[72px] rounded bg-gray-800 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-white text-xs font-medium truncate">{movie.title}</p>
          {movie.year && <p className="text-[10px] text-gray-500">{movie.year}</p>}
          {hasRating && <div className="mt-1"><StarRating value={movie.rating} size="sm" /></div>}
        </div>
      </div>
      {hasNote && (
        <p className="text-gray-300 text-xs mt-2 italic line-clamp-4">"{movie.note}"</p>
      )}
    </button>
  );
}
