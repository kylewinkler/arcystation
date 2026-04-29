import { Link, useNavigate } from 'react-router-dom';
import { posterUrl } from '../../lib/tmdb';

/**
 * Reusable movie suggestion card.
 * Props:
 *   movie      — { tmdbId, title, year, posterPath, overview? }
 *   label      — small colored label text (e.g. "Pick for tonight", "Continue watching")
 *   sublabel   — gray text below title (e.g. "from List Name")
 *   labelColor — tailwind text color class for the label (default: text-yellow-400/80)
 *   to         — optional link for the whole card (defaults to movie page)
 */
export default function SuggestionCard({ movie, label, sublabel, labelColor = 'text-yellow-400/80', to }) {
  if (!movie) return null;

  const navigate = useNavigate();
  const cardTo = to || `/movie/${movie.tmdbId}`;
  const movieTo = `/movie/${movie.tmdbId}`;
  const hasCustomLink = !!to;

  return (
    <div
      onClick={() => navigate(cardTo)}
      className="relative flex items-center gap-4 bg-gray-900/60 border border-gray-800 rounded-lg p-3 hover:border-purple-500 transition-colors cursor-pointer overflow-hidden"
    >
      {movie.posterPath && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20 blur-xl pointer-events-none"
          style={{ backgroundImage: `url(${posterUrl(movie.posterPath, 'w500')})` }}
        />
      )}
      {movie.posterPath ? (
        hasCustomLink ? (
          <Link to={movieTo} onClick={(e) => e.stopPropagation()} className="relative shrink-0">
            <img
              src={posterUrl(movie.posterPath, 'w185')}
              alt={movie.title}
              className="w-16 h-24 rounded object-cover"
            />
          </Link>
        ) : (
          <img
            src={posterUrl(movie.posterPath, 'w185')}
            alt={movie.title}
            className="relative w-16 h-24 rounded object-cover shrink-0"
          />
        )
      ) : (
        <div className="relative w-16 h-24 rounded bg-gray-800 shrink-0 flex items-center justify-center text-gray-500 text-xs">
          No img
        </div>
      )}
      <div className="relative flex-1 min-w-0">
        {label && (
          <p className={`text-xs font-medium mb-0.5 ${labelColor}`}>{label}</p>
        )}
        {hasCustomLink ? (
          <Link to={movieTo} onClick={(e) => e.stopPropagation()} className="hover:text-purple-400 transition-colors">
            <p className="text-white font-medium truncate">
              {movie.title}
              {movie.year && (
                <span className="text-gray-400 font-normal"> ({movie.year})</span>
              )}
            </p>
          </Link>
        ) : (
          <p className="text-white font-medium truncate">
            {movie.title}
            {movie.year && (
              <span className="text-gray-400 font-normal"> ({movie.year})</span>
            )}
          </p>
        )}
        {sublabel && (
          <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
        )}
        {movie.overview && (
          <p className="text-gray-500 text-xs mt-1 line-clamp-2">{movie.overview}</p>
        )}
      </div>
    </div>
  );
}
