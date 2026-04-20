import { Link } from 'react-router-dom';
import { posterUrl } from '../../lib/tmdb';
import StarRating from '../StarRating';

export default function WatchedPoster({ tmdbId, title, posterPath, rating, glow = true }) {
  const glowClass = glow ? 'shadow-[0_0_8px_var(--color-watched-glow)]' : '';

  return (
    <Link to={`/movie/${tmdbId}`} className="group" title={title}>
      {posterPath ? (
        <img
          src={posterUrl(posterPath, 'w185')}
          alt={title}
          className={`w-full aspect-[2/3] rounded-lg object-cover ${glowClass} group-hover:ring-2 group-hover:ring-purple-500 transition-all`}
        />
      ) : (
        <div className={`w-full aspect-[2/3] rounded-lg bg-gray-800 ${glowClass} flex items-center justify-center`}>
          <span className="text-xs text-gray-500 text-center leading-tight px-2">{title}</span>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1 truncate">{title}</p>
      {rating > 0 && (
        <div className="mt-0.5 overflow-hidden">
          <StarRating value={rating} size="sm" />
        </div>
      )}
    </Link>
  );
}
