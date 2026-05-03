import { posterUrl } from '../../lib/tmdb';
import MovieScoreBadge from '../movie/MovieScoreBadge';

// Discover-style poster tile: poster, title, year + site score row.
// Used by the discover grid (Movies.jsx) and Popular Right Now on Home.
// Pass `isSeen` to render the watched glow.
export default function MoviePosterTile({ movie, isSeen, onClick }) {
  const glowClass = isSeen ? 'shadow-[0_0_8px_var(--color-watched-glow)]' : '';

  return (
    <button
      onClick={onClick}
      className="group text-left"
    >
      {movie.posterPath ? (
        <img
          src={posterUrl(movie.posterPath, 'w185')}
          alt=""
          className={`w-full aspect-[2/3] rounded-lg object-cover transition-all group-hover:ring-2 ring-purple-500 ${glowClass}`}
        />
      ) : (
        <div className={`w-full aspect-[2/3] rounded-lg bg-gray-800 flex items-center justify-center text-xs text-gray-600 ${glowClass}`}>
          No img
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1.5 truncate group-hover:text-white transition-colors">
        {movie.title}
      </p>
      <div className="flex items-center justify-between gap-1">
        {movie.year && <p className="text-xs text-gray-600">{movie.year}</p>}
        <MovieScoreBadge tmdbId={movie.tmdbId} size="xs" />
      </div>
    </button>
  );
}
