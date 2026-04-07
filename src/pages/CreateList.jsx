import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createList, addMovieToList } from '../lib/firestore';
import MovieSearch from '../components/movies/MovieSearch';
import { posterUrl } from '../lib/tmdb';

export default function CreateList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [movies, setMovies] = useState([]);
  const [saving, setSaving] = useState(false);

  const addedIds = new Set(movies.map((m) => m.tmdbId));

  const handleAdd = (movie) => {
    setMovies((prev) => [...prev, { ...movie, order: prev.length }]);
  };

  const handleRemove = (tmdbId) => {
    setMovies((prev) => prev.filter((m) => m.tmdbId !== tmdbId).map((m, i) => ({ ...m, order: i })));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    setMovies((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((m, i) => ({ ...m, order: i }));
    });
  };

  const handleMoveDown = (index) => {
    if (index === movies.length - 1) return;
    setMovies((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((m, i) => ({ ...m, order: i }));
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || movies.length === 0) return;
    setSaving(true);
    try {
      const listId = await createList({
        title: title.trim(),
        description: description.trim(),
        createdBy: user.uid,
      });
      for (const movie of movies) {
        await addMovieToList(listId, movie);
      }
      navigate(`/lists/${listId}`);
    } catch (err) {
      console.error('Failed to create list:', err);
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Create New List</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Best Sci-Fi of the 90s"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this list about?"
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Add Movies</label>
          <MovieSearch onAdd={handleAdd} addedIds={addedIds} />
        </div>

        {movies.length > 0 && (
          <div>
            <h3 className="text-sm text-gray-400 mb-2">{movies.length} movies added</h3>
            <div className="space-y-2">
              {movies.map((movie, index) => (
                <div key={movie.tmdbId} className="flex items-center gap-2 bg-gray-800/50 rounded-lg p-2">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" onClick={() => handleMoveUp(index)} className="text-gray-500 hover:text-white text-xs leading-none" disabled={index === 0}>▲</button>
                    <button type="button" onClick={() => handleMoveDown(index)} className="text-gray-500 hover:text-white text-xs leading-none" disabled={index === movies.length - 1}>▼</button>
                  </div>
                  {movie.posterPath ? (
                    <img src={posterUrl(movie.posterPath, 'w92')} alt="" className="w-8 h-12 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-12 rounded bg-gray-700 shrink-0" />
                  )}
                  <span className="text-white text-sm flex-1 truncate">
                    {movie.title} {movie.year && <span className="text-gray-400">({movie.year})</span>}
                  </span>
                  <button type="button" onClick={() => handleRemove(movie.tmdbId)} className="text-gray-500 hover:text-red-400 text-sm shrink-0">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !title.trim() || movies.length === 0}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          {saving ? 'Creating...' : 'Create List'}
        </button>
      </form>
    </div>
  );
}
