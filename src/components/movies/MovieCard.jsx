import { Link } from 'react-router-dom';
import { posterUrl } from '../../lib/tmdb';
import StarRating from '../StarRating';
import MovieScoreBadge from '../movie/MovieScoreBadge';

export default function MovieCard({ movie, onRemove, watchedData, onToggleWatched, readonly, seenElsewhere, isFeatured, onToggleFeatured }) {
  const isWatched = !!watchedData;
  const isInteractive = onToggleWatched && !readonly;

  const handleCardClick = (e) => {
    if (e.target.closest('a') || e.target.closest('button')) return;
    if (!isInteractive) return;
    onToggleWatched(movie.tmdbId, !isWatched);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`flex items-start gap-3 rounded-lg p-3 transition-all ${
        isWatched || seenElsewhere
          ? 'bg-gray-800 shadow-[0_0_8px_var(--color-watched-glow)]'
          : 'bg-gray-900/50'
      } ${isInteractive ? 'cursor-pointer hover:bg-gray-800/70' : ''}`}
    >
      {/* Clickable watch indicator (replaces old checkbox) */}
      {isInteractive && (
        <div className="shrink-0 pt-1">
          {isWatched ? (
            <div className="w-6 h-6 rounded-full bg-watched flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-gray-600 hover:border-purple-500 transition-colors" />
          )}
        </div>
      )}

      <Link to={`/movie/${movie.tmdbId}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {movie.posterPath ? (
          <img
            src={posterUrl(movie.posterPath, 'w92')}
            alt=""
            className="w-12 h-18 rounded object-cover hover:ring-2 ring-purple-500 transition-all"
          />
        ) : (
          <div className="w-12 h-18 rounded bg-gray-700 flex items-center justify-center text-xs text-gray-500">
            No img
          </div>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isWatched ? 'text-gray-300' : 'text-white'}`}>
          <Link to={`/movie/${movie.tmdbId}`} className="hover:text-purple-400 transition-colors" onClick={(e) => e.stopPropagation()}>
            {movie.title}{movie.year && <span className="text-gray-400"> ({movie.year})</span>}
          </Link>
        </p>
        <div className="mt-0.5"><MovieScoreBadge tmdbId={movie.tmdbId} /></div>
        {isWatched && (
          <div className="inline-flex items-center gap-2 mt-0.5">
            <span className="text-xs text-purple-400">Watched</span>
            <StarRating value={watchedData?.rating || 0} size="sm" />
          </div>
        )}
        {seenElsewhere && !isWatched && (
          <p className="text-watched text-xs mt-0.5">You've seen this</p>
        )}
        {movie.overview && !isWatched && (
          <p className="text-gray-600 text-xs mt-1 line-clamp-2">{movie.overview}</p>
        )}
        {watchedData?.note && (
          <p className="text-gray-400 text-xs mt-1 italic">"{watchedData.note}"</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onToggleFeatured && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFeatured(movie); }}
            className={`transition-colors ${isFeatured ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-400'}`}
            title={isFeatured ? 'Remove featured' : 'Set as featured'}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isFeatured ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path d="M4 3h16v14l-8 4-8-4V3z" />
            </svg>
          </button>
        )}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(movie.tmdbId); }}
            className="shrink-0 text-gray-500 hover:text-red-400 transition-colors text-sm"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
