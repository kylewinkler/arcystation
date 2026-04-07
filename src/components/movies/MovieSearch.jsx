import { useState, useRef } from 'react';
import { searchMovies, posterUrl } from '../../lib/tmdb';

export default function MovieSearch({ onAdd, addedIds, yearFilter }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const handleSearch = (value) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const movies = await searchMovies(value, { year: yearFilter });
      setResults(movies);
      setSearching(false);
    }, 400);
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search for a movie..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />
      {searching && <p className="text-sm text-gray-400">Searching...</p>}
      {results.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {results.map((movie) => {
            const isAdded = addedIds.has(movie.tmdbId);
            return (
              <div
                key={movie.tmdbId}
                className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-2"
              >
                {movie.posterPath ? (
                  <img
                    src={posterUrl(movie.posterPath, 'w92')}
                    alt=""
                    className="w-12 h-18 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-12 h-18 rounded bg-gray-700 shrink-0 flex items-center justify-center text-xs text-gray-500">
                    No img
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {movie.title} {movie.year && <span className="text-gray-400">({movie.year})</span>}
                  </p>
                  <p className="text-gray-400 text-xs mt-1 line-clamp-2">{movie.overview}</p>
                </div>
                <button
                  onClick={() => !isAdded && onAdd(movie)}
                  disabled={isAdded}
                  className={`shrink-0 px-3 py-1 rounded text-sm font-medium transition-colors ${
                    isAdded
                      ? 'bg-gray-700 text-gray-500 cursor-default'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {isAdded ? 'Added' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
