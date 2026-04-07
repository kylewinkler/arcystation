import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getListBySlug, getListMovies } from '../lib/firestore';
import MovieCard from '../components/movies/MovieCard';

export default function PublicShare() {
  const { slug } = useParams();
  const [list, setList] = useState(null);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadList();
  }, [slug]);

  async function loadList() {
    const listData = await getListBySlug(slug);
    if (listData) {
      const movieData = await getListMovies(listData.id);
      setList(listData);
      setMovies(movieData);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">List Not Found</h1>
          <p className="text-gray-400">This link may have expired or been disabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div>
          <p className="text-sm text-purple-400 mb-1">Film Freaks</p>
          <h1 className="text-2xl font-bold text-white">{list.title}</h1>
          {list.description && <p className="text-gray-400 mt-1">{list.description}</p>}
          <p className="text-sm text-gray-500 mt-2">{movies.length} movies</p>
        </div>
        <div className="space-y-2">
          {movies.map((movie) => (
            <MovieCard key={movie.tmdbId} movie={movie} readonly />
          ))}
        </div>
      </div>
    </div>
  );
}
