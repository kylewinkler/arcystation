import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getListBySlug, getListMovies } from '../lib/firestore';
import MovieCard from '../components/movies/MovieCard';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { SHARE_NOT_FOUND } from '../lib/copy/empty';

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
    return <LoadingScreen />;
  }

  if (!list) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <NotFound title={SHARE_NOT_FOUND.title} subtitle={SHARE_NOT_FOUND.subtitle} scene={SHARE_NOT_FOUND.scene} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div>
          <p className="text-sm text-purple-400 mb-1">Arcy Station</p>
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
