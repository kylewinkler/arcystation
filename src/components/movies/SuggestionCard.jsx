import { Link } from 'react-router-dom';
import { posterUrl } from '../../lib/tmdb';

/**
 * Reusable movie suggestion card.
 * Props:
 *   movie    — { tmdbId, title, year, posterPath, overview? }
 *   label    — small colored label text (e.g. "Pick for tonight", "You might like")
 *   sublabel — gray text below title (e.g. "from List Name", "based on Movie Name")
 *   labelColor — tailwind text color class for the label (default: text-yellow-400/80)
 */
export default function SuggestionCard({ movie, label, sublabel, labelColor = 'text-yellow-400/80' }) {
  if (!movie) return null;

  return (
    <Link
      to={`/movie/${movie.tmdbId}`}
      className="flex items-center gap-4 bg-gray-900/60 border border-gray-800 rounded-lg p-3 hover:border-purple-500 transition-colors"
    >
      {movie.posterPath ? (
        <img
          src={posterUrl(movie.posterPath, 'w185')}
          alt={movie.title}
          className="w-16 h-24 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-16 h-24 rounded bg-gray-800 shrink-0 flex items-center justify-center text-gray-500 text-xs">
          No img
        </div>
      )}
      <div className="flex-1 min-w-0">
        {label && (
          <p className={`text-xs font-medium mb-0.5 ${labelColor}`}>{label}</p>
        )}
        <p className="text-white font-medium truncate">
          {movie.title}
          {movie.year && (
            <span className="text-gray-400 font-normal"> ({movie.year})</span>
          )}
        </p>
        {sublabel && (
          <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
        )}
        {movie.overview && (
          <p className="text-gray-500 text-xs mt-1 line-clamp-2">{movie.overview}</p>
        )}
      </div>
    </Link>
  );
}
