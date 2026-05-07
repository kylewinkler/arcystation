import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getList, getListMovies, updateList, addMovieToList, removeMovieFromList } from '../lib/firestore';
import MovieSearch from '../components/movies/MovieSearch';
import { posterUrl } from '../lib/tmdb';
import LoadingScreen from '../components/loading/Loading';

export default function EditList() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [movies, setMovies] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadList();
  }, [id]);

  async function loadList() {
    const [listData, movieData] = await Promise.all([
      getList(id),
      getListMovies(id),
    ]);
    if (!listData || listData.createdBy !== user.uid) {
      navigate('/');
      return;
    }
    if (listData.kind === 'watchlist') {
      navigate(`/lists/${id}`);
      return;
    }
    setList(listData);
    setTitle(listData.title);
    setDescription(listData.description || '');
    setMovies(movieData);
    setLoading(false);
  }

  const addedIds = new Set(movies.map((m) => m.tmdbId));

  const handleAdd = async (movie) => {
    const newMovie = { ...movie, order: movies.length };
    setMovies((prev) => [...prev, newMovie]);
    await addMovieToList(id, newMovie);
  };

  const handleRemove = async (tmdbId) => {
    setMovies((prev) => prev.filter((m) => m.tmdbId !== tmdbId));
    await removeMovieFromList(id, tmdbId);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await updateList(id, {
        title: title.trim(),
        description: description.trim(),
      });
      navigate(`/lists/${id}`);
    } catch (err) {
      console.error('Failed to update list:', err);
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Edit List</h1>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Add More Movies</label>
        <MovieSearch onAdd={handleAdd} addedIds={addedIds} />
      </div>

      <div>
        <h3 className="text-sm text-gray-400 mb-2">{movies.length} movies in list</h3>
        <div className="space-y-2">
          {movies.map((movie) => (
            <div key={movie.tmdbId} className="flex items-center gap-2 bg-gray-800/50 rounded-lg p-2">
              {movie.posterPath ? (
                <img src={posterUrl(movie.posterPath, 'w92')} alt="" className="w-8 h-12 rounded object-cover shrink-0" />
              ) : (
                <div className="w-8 h-12 rounded bg-gray-700 shrink-0" />
              )}
              <span className="text-white text-sm flex-1 truncate">
                {movie.title} {movie.year && <span className="text-gray-400">({movie.year})</span>}
              </span>
              <button onClick={() => handleRemove(movie.tmdbId)} className="text-gray-500 hover:text-red-400 text-sm shrink-0">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
