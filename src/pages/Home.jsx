import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserAllProgress, getList, getUserProfile, getListMovies, getWatchedMovies,
  getPinnedLists, pinList, unpinList,
} from '../lib/firestore';
import { posterUrl } from '../lib/tmdb';
import ListCard from '../components/lists/ListCard';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';

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
  const [lists, setLists] = useState([]);
  const [continueItem, setContinueItem] = useState(null);
  const [tonightPick, setTonightPick] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
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
      newPinned.add(listId);
      await pinList(user.uid, listId);
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
        <Link
          to={`/movie/${tonightPick.movie.tmdbId}`}
          className="flex items-center gap-4 bg-gray-900/60 border border-gray-800 rounded-lg p-3 hover:border-purple-500 transition-colors"
        >
          {tonightPick.movie.posterPath ? (
            <img
              src={posterUrl(tonightPick.movie.posterPath, 'w185')}
              alt={tonightPick.movie.title}
              className="w-16 h-24 rounded object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-24 rounded bg-gray-800 shrink-0 flex items-center justify-center text-gray-500 text-xs">
              No img
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-yellow-400/80 font-medium mb-0.5">Pick for tonight</p>
            <p className="text-white font-medium truncate">
              {tonightPick.movie.title}
              {tonightPick.movie.year && (
                <span className="text-gray-400 font-normal"> ({tonightPick.movie.year})</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">from {tonightPick.listTitle}</p>
          </div>
        </Link>
      )}

      {/* Lists header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Lists</h1>
        <Link
          to="/lists/new"
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          + New List
        </Link>
      </div>

      {/* Search + filter */}
      {lists.length > 0 && (
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search lists..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={() => { setOwnerFilter((f) => f === 'all' ? 'mine' : 'all'); setPage(1); }}
            className="flex items-center gap-2 shrink-0"
          >
            <span className="text-xs text-gray-400">Mine</span>
            <div className={`w-9 h-5 rounded-full transition-colors relative ${ownerFilter === 'mine' ? 'bg-purple-600' : 'bg-gray-700'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${ownerFilter === 'mine' ? 'left-[18px]' : 'left-0.5'}`} />
            </div>
          </button>
        </div>
      )}

      {(() => {
        const filtered = lists
          .filter((item) => {
            if (search && !item.listTitle.toLowerCase().includes(search.toLowerCase())) return false;
            if (ownerFilter === 'mine' && item.list.createdBy !== user.uid) return false;
            return true;
          })
          .sort((a, b) => {
            const aPinned = pinnedIds.has(a.listId) ? 1 : 0;
            const bPinned = pinnedIds.has(b.listId) ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return 0;
          });
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

        if (lists.length === 0) {
          return (
            <div className="text-center py-12">
              <p className="text-gray-400">No lists yet. Create one or join a friend's list to get started.</p>
            </div>
          );
        }

        return (
          <>
            {paginated.length === 0 ? (
              <NotFound title={<>Arcy remembers… something used to be here. <br />But what?</>} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {paginated.map((item) => (
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
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="text-sm text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-500">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="text-sm text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
