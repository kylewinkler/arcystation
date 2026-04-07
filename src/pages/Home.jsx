import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserAllProgress, getList, getUserProfile, getListMovies, getWatchedMovies,
  getPinnedLists, pinList, unpinList,
} from '../lib/firestore';
import { posterUrl } from '../lib/tmdb';
import ListCard from '../components/lists/ListCard';
import SuggestionCard from '../components/movies/SuggestionCard';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { HOME_NO_LISTS, HOME_NO_RESULTS } from '../lib/copy/empty';
import { useToast } from '../context/ToastContext';
import { randomFrom, PIN_REACTIONS, FIRST_PIN } from '../lib/copy/lore';
import ArcyStar from '../assets/images/arcy-poses/arcy-star.png';

function pickRandom(arr) {
  return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
}

const currentYear = new Date().getFullYear();
function isReleased(m) {
  return !m.year || Number(m.year) <= currentYear;
}

const PAGE_SIZE = 10;

export default function Home() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [lists, setLists] = useState([]);
  const [continueItem, setContinueItem] = useState(null);
  const [tonightPick, setTonightPick] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pinnedIds, setPinnedIds] = useState(new Set());

  useEffect(() => {
    if (!user) return;
    loadLists();
  }, [user]);

  async function handleTogglePin(listId) {
    const newPinned = new Set(pinnedIds);
    if (newPinned.has(listId)) {
      newPinned.delete(listId);
      await unpinList(user.uid, listId);
    } else {
      const isFirst = pinnedIds.size === 0;
      newPinned.add(listId);
      await pinList(user.uid, listId);
      showToast({
        message: isFirst ? FIRST_PIN : randomFrom(PIN_REACTIONS),
        image: ArcyStar,
      });
    }
    setPinnedIds(newPinned);
  }

  async function loadLists() {
    setLoading(true);
    const [allProgress, pinned] = await Promise.all([
      getUserAllProgress(user.uid),
      getPinnedLists(user.uid),
    ]);
    const pinnedSet = new Set(pinned);
    setPinnedIds(pinnedSet);

    const enriched = await Promise.all(
      allProgress.map(async (p) => {
        try {
          const listDoc = await getList(p.listId);
          if (!listDoc) return null;
          let creator = null;
          if (listDoc.createdBy && listDoc.createdBy !== user.uid) {
            creator = await getUserProfile(listDoc.createdBy);
          }
          return { ...p, list: listDoc, creator };
        } catch { return null; }
      })
    );

    const valid = enriched.filter(Boolean);
    valid.sort((a, b) => {
      const aTime = a.lastActivityAt?.seconds || a.startedAt?.seconds || 0;
      const bTime = b.lastActivityAt?.seconds || b.startedAt?.seconds || 0;
      return bTime - aTime;
    });

    setLists(valid);

    // Find incomplete lists for suggestions — prefer pinned
    const allIncomplete = valid.filter(
      (item) => item.watchedCount < (item.list.movieCount || item.totalCount || 0)
    );
    const pinnedIncomplete = allIncomplete.filter((item) => pinnedSet.has(item.listId));
    const incomplete = pinnedIncomplete.length > 0 ? pinnedIncomplete : allIncomplete;

    if (incomplete.length > 0) {
      const movieData = {};
      const watchedData = {};
      await Promise.all(
        incomplete.map(async (item) => {
          const [movies, watched] = await Promise.all([
            getListMovies(item.listId),
            getWatchedMovies(user.uid, item.listId),
          ]);
          movieData[item.listId] = movies;
          watchedData[item.listId] = watched;
        })
      );

      // "Continue" — random unwatched movie from the most recently active incomplete list
      const continueList = incomplete[0];
      const continueUnwatched = (movieData[continueList.listId] || [])
        .filter((m) => !watchedData[continueList.listId]?.[m.tmdbId])
        .filter(isReleased);
      const continueMovie = pickRandom(continueUnwatched);
      if (continueMovie) {
        const appearsOn = incomplete.filter((item) =>
          (movieData[item.listId] || []).some((m) => m.tmdbId === continueMovie.tmdbId)
        ).map((item) => ({ list: item.list, progress: item }));

        setContinueItem({ movie: continueMovie, lists: appearsOn });
      }

      // "Tonight" — random unwatched movie from a random incomplete list, different from continue
      const tonightList = pickRandom(incomplete);
      const tonightUnwatched = (movieData[tonightList.listId] || [])
        .filter((m) => !watchedData[tonightList.listId]?.[m.tmdbId])
        .filter((m) => m.tmdbId !== continueMovie?.tmdbId)
        .filter(isReleased);
      let tonightMovie = pickRandom(tonightUnwatched);
      if (!tonightMovie) {
        for (const item of incomplete) {
          const candidates = (movieData[item.listId] || [])
            .filter((m) => !watchedData[item.listId]?.[m.tmdbId])
            .filter((m) => m.tmdbId !== continueMovie?.tmdbId)
            .filter(isReleased);
          tonightMovie = pickRandom(candidates);
          if (tonightMovie) break;
        }
      }
      if (tonightMovie) {
        const tonightLists = incomplete.filter((item) =>
          (movieData[item.listId] || []).some((m) => m.tmdbId === tonightMovie.tmdbId)
        );
        setTonightPick({
          movie: tonightMovie,
          listTitle: tonightLists[0]?.listTitle || '',
          listId: tonightLists[0]?.listId || '',
        });
      }
    }

    setLoading(false);
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Continue where you left off */}
      {continueItem && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex">
            <Link to={`/movie/${continueItem.movie.tmdbId}`} className="shrink-0">
              {continueItem.movie.posterPath ? (
                <img
                  src={posterUrl(continueItem.movie.posterPath, 'w342')}
                  alt={continueItem.movie.title}
                  className="w-32 h-48 object-cover"
                />
              ) : (
                <div className="w-32 h-48 bg-gray-800 flex items-center justify-center text-gray-500 text-sm">
                  No poster
                </div>
              )}
            </Link>
            <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
              <div>
                <p className="text-xs text-purple-400 font-medium mb-1">Continue watching</p>
                <Link to={`/movie/${continueItem.movie.tmdbId}`} className="hover:text-purple-400 transition-colors">
                  <h2 className="text-lg font-bold text-white truncate">
                    {continueItem.movie.title}
                    {continueItem.movie.year && (
                      <span className="text-gray-400 font-normal"> ({continueItem.movie.year})</span>
                    )}
                  </h2>
                </Link>
                {continueItem.movie.overview && (
                  <p className="text-gray-500 text-xs mt-1 line-clamp-2">{continueItem.movie.overview}</p>
                )}
              </div>
              <p className="mt-3 text-xs text-gray-500">
                from{' '}
                {continueItem.lists.map(({ list, progress }, i) => (
                  <span key={list.id}>
                    {i > 0 && ', '}
                    <Link to={`/lists/${list.id}`} className="text-gray-400 hover:text-purple-400 transition-colors">
                      {list.title} ({progress.watchedCount}/{list.movieCount || progress.totalCount || 0})
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pick for tonight */}
      {tonightPick && tonightPick.movie.tmdbId !== continueItem?.movie.tmdbId && (
        <SuggestionCard
          movie={tonightPick.movie}
          label="Pick for tonight"
          sublabel={`from ${tonightPick.listTitle}`}
        />
      )}

      {/* Lists header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">List Activity</h1>
          <Link
          to="/lists/new"
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            + New List
          </Link>
      </div>
      {
        lists.length === 0 ? (
          <NotFound title={HOME_NO_LISTS.title} subtitle={HOME_NO_LISTS.subtitle} scene={HOME_NO_LISTS.scene} />
        ) : (
            <div className="grid gap-3 sm:grid-cols-2">
                {lists.map((item) => (
                  <ListCard
                    key={item.id}
                    listId={item.listId}
                    title={item.listTitle}
                    total={item.list.movieCount || item.totalCount || 0}
                    watched={item.watchedCount}
                    isOwner={item.list.createdBy === user.uid}
                    creatorName={item.creator?.displayName}
                    pinned={pinnedIds.has(item.listId)}
                    onTogglePin={handleTogglePin}
                    featuredPoster={item.list.featuredMovie?.posterPath || item.list.firstPoster}
                  />
                ))}
              </div>
        )
      }
    </div>
  );
}
