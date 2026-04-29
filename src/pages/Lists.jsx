import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserAllProgress, getList, getUserProfile, getListMovies, getWatchedMovies,
  getPinnedLists, pinList, unpinList, sortLists, getPrebuiltLists,
} from '../lib/firestore';
import ListCard from '../components/lists/ListCard';
import SuggestionCard from '../components/movies/SuggestionCard';
import LoadingScreen from '../components/loading/Loading';
import { useToast } from '../context/ToastContext';
import { randomFrom, PIN_REACTIONS, FIRST_PIN } from '../lib/copy/lore';
import ArcyStar from '../assets/images/arcy-poses/arcy-star.png';
import EmptyArchives from '../assets/images/arcy-scenes/empty-archives.png';

const PAGE_SIZE = 10;

function pickRandom(arr) {
  return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
}

const currentYear = new Date().getFullYear();
function isReleased(m) {
  if (m.releaseDate) return new Date(m.releaseDate) <= new Date();
  if (m.release_date) return new Date(m.release_date) <= new Date();
  return !m.year || Number(m.year) < currentYear;
}

export default function Lists() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allLists, setAllLists] = useState([]);
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const [collections, setCollections] = useState([]); // unstarted pre-built lists
  const [continueItem, setContinueItem] = useState(null);
  const [startWatching, setStartWatching] = useState(null);
  const [almostDone, setAlmostDone] = useState(null);
  const [newInLists, setNewInLists] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const tab = searchParams.get('tab') || 'all';

  useEffect(() => {
    if (!user) return;
    loadLists();
  }, [user]);

  // Reset page when tab changes
  useEffect(() => {
    setPage(1);
  }, [tab]);

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
    const [allProgress, pinned, prebuiltLists] = await Promise.all([
      getUserAllProgress(user.uid),
      getPinnedLists(user.uid),
      getPrebuiltLists(),
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
          return { ...p, list: listDoc, creator, isListOwner: listDoc.createdBy === user.uid };
        } catch { return null; }
      })
    );

    const validLists = enriched.filter(Boolean);
    setAllLists(sortLists(validLists, pinnedSet));

    // Pre-built lists the user hasn't started yet
    const startedListIds = new Set(validLists.map((l) => l.listId));
    setCollections(prebuiltLists.filter((l) => !startedListIds.has(l.id)));

    // Suggestion tiles (Continue / Start watching / Almost done / New) — fetch
    // movies + watched maps for any list with something unwatched, then pick
    // representatives. Shows the user something actionable at the top of the
    // page without making them scan list cards.
    const withUnwatched = validLists.filter(
      (item) => item.watchedCount < (item.list.movieCount || 0)
    );
    const allIncomplete = withUnwatched.filter((item) => item.watchedCount > 0);

    const movieData = {};
    const watchedData = {};
    await Promise.all(
      withUnwatched.map(async (item) => {
        const [movies, watched] = await Promise.all([
          getListMovies(item.listId),
          getWatchedMovies(user.uid, item.listId),
        ]);
        movieData[item.listId] = movies;
        watchedData[item.listId] = watched;
      })
    );

    // Continue watching: most-recent activity on a pinned list, falling back
    // to any other list by recency. Walk candidates in priority order and
    // pick the first one that actually has a released-unwatched movie — a
    // pinned list with no viable pick should yield to the next candidate,
    // not silently hide the tile.
    const byRecent = [...allIncomplete].sort(
      (a, b) => (b.lastActivityAt?.seconds || 0) - (a.lastActivityAt?.seconds || 0)
    );
    const pinnedIncomplete = byRecent.filter((item) => pinnedSet.has(item.listId));
    const unpinnedIncomplete = byRecent.filter((item) => !pinnedSet.has(item.listId));
    const candidates = [...pinnedIncomplete, ...unpinnedIncomplete];

    let continueList = null;
    let continueMovie = null;
    for (const cand of candidates) {
      const unwatched = (movieData[cand.listId] || [])
        .filter((m) => !watchedData[cand.listId]?.[m.tmdbId])
        .filter(isReleased);
      if (unwatched.length > 0) {
        continueList = cand;
        continueMovie = pickRandom(unwatched);
        break;
      }
    }
    if (continueMovie) {
      setContinueItem({
        movie: continueMovie,
        listTitle: continueList.list.title,
        listId: continueList.listId,
      });
    }

    // Almost done: list with highest % watched (excluding the one already used for continue)
    const withRatio = allIncomplete
      .map((item) => ({
        item,
        ratio: item.watchedCount / (item.list.movieCount || 1),
      }))
      .filter(({ item }) => !continueList || item.listId !== continueList.listId)
      .sort((a, b) => b.ratio - a.ratio);

    if (withRatio.length > 0 && withRatio[0].ratio >= 0.5) {
      const almost = withRatio[0].item;
      const remaining = (movieData[almost.listId] || [])
        .filter((m) => !watchedData[almost.listId]?.[m.tmdbId])
        .filter(isReleased);
      const almostMovie = pickRandom(remaining);
      if (almostMovie) {
        const left = (almost.list.movieCount || 0) - almost.watchedCount;
        setAlmostDone({
          movie: almostMovie,
          listTitle: almost.list.title,
          listId: almost.listId,
          remaining: left,
        });
      }
    }

    // Track tmdbIds already shown so the same movie doesn't appear across
    // multiple cards (Continue + Start watching + New).
    const usedTmdbIds = new Set([continueMovie?.tmdbId].filter(Boolean));

    // Start watching: a fresh list (movies present, none watched yet) — picks
    // a released unwatched movie so the user has somewhere obvious to begin.
    const freshLists = withUnwatched.filter((item) => item.watchedCount === 0);
    if (freshLists.length > 0) {
      const shuffled = [...freshLists].sort(() => Math.random() - 0.5);
      for (const item of shuffled) {
        const cands = (movieData[item.listId] || [])
          .filter((m) => !usedTmdbIds.has(m.tmdbId))
          .filter(isReleased);
        if (cands.length > 0) {
          const movie = pickRandom(cands);
          setStartWatching({ movie, listTitle: item.list.title, listId: item.listId });
          usedTmdbIds.add(movie.tmdbId);
          break;
        }
      }
    }

    // New in your lists: a movie tracked in any of the user's lists that
    // released within the last 30 days. Free to compute — we already have
    // movieData fetched. Prefers unwatched.
    const NEW_WINDOW_DAYS = 30;
    const newCutoff = Date.now() - NEW_WINDOW_DAYS * 86400000;
    const newCandidates = [];
    for (const item of withUnwatched) {
      for (const m of (movieData[item.listId] || [])) {
        if (usedTmdbIds.has(m.tmdbId)) continue;
        if (watchedData[item.listId]?.[m.tmdbId]) continue;
        const dateStr = m.releaseDate || m.release_date;
        if (!dateStr) continue;
        const t = new Date(dateStr).getTime();
        if (t >= newCutoff && t <= Date.now()) {
          newCandidates.push({ movie: m, listTitle: item.list.title, listId: item.listId, releasedAt: t });
        }
      }
    }
    if (newCandidates.length > 0) {
      newCandidates.sort((a, b) => b.releasedAt - a.releasedAt);
      const top = newCandidates[0];
      setNewInLists({ movie: top.movie, listTitle: top.listTitle, listId: top.listId });
    }

    setLoading(false);
  }

  if (loading) return <LoadingScreen />;

  // Filtered list — `allLists` is already sorted favorites-first then by
  // most recent activity. Filters narrow that ordering rather than re-sort.
  let activeList;
  if (tab === 'created') activeList = allLists.filter((item) => item.isListOwner);
  else if (tab === 'joined') activeList = allLists.filter((item) => !item.isListOwner);
  else if (tab === 'favorites') activeList = allLists.filter((item) => pinnedIds.has(item.listId));
  else if (tab === 'collections') {
    // Joined prebuilts (with progress) on top, then undiscovered ones.
    const joinedPrebuilts = allLists.filter((item) => item.list.isPrebuilt);
    activeList = [...joinedPrebuilts, ...collections];
  }
  else activeList = allLists;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const paginated = activeList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'favorites', label: 'Favorites' },
    { key: 'created', label: 'Created' },
    { key: 'joined', label: 'Joined' },
    { key: 'collections', label: 'Collections' },
  ];

  const emptyMessage = {
    all: "You aren't on any lists yet.",
    created: "You haven't created any lists yet.",
    joined: "You haven't joined any lists yet.",
    favorites: 'No favorites yet — tap the star on a list to pin it.',
    collections: 'No collections to discover right now.',
  }[tab];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Lists</h1>
        <Link
          to="/lists/new"
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          + New List
        </Link>
      </div>

      {/* Filter pills — wrap to a second row on narrow screens */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setSearchParams({ tab: f.key })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === f.key
                ? 'bg-purple-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List grid */}
      {paginated.length === 0 ? (
        <div className="text-center">
          <img
            src={EmptyArchives}
            alt=""
            className="mx-auto mb-4 w-full max-w-md select-none"
            draggable="false"
          />
          <p className="text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {paginated.map((item) => {
            // Collections filter mixes joined prebuilts (have `.list`/progress)
            // with raw, undiscovered prebuilt docs (no `.listId`).
            if (!item.listId) {
              return (
                <ListCard
                  key={`col-${item.id}`}
                  listId={item.id}
                  title={item.title}
                  total={item.movieCount || 0}
                  isPrebuilt
                  featuredPoster={item.featuredMovie?.posterPath || item.firstPoster}
                />
              );
            }
            return (
              <ListCard
                key={item.id}
                listId={item.listId}
                title={item.list.title}
                total={item.list.movieCount || 0}
                watched={item.watchedCount}
                isOwner={item.isListOwner}
                isPrebuilt={item.list.isPrebuilt || false}
                creatorName={item.creator?.displayName}
                pinned={pinnedIds.has(item.listId)}
                onTogglePin={handleTogglePin}
                featuredPoster={item.list.featuredMovie?.posterPath || item.list.firstPoster}
              />
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm text-gray-400 hover:text-white disabled:text-gray-700 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-sm text-gray-400 hover:text-white disabled:text-gray-700 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
