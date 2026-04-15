import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserAllProgress, getList, getUserProfile,
  getPinnedLists, pinList, unpinList, sortLists, getPrebuiltLists,
} from '../lib/firestore';
import ListCard from '../components/lists/ListCard';
import LoadingScreen from '../components/loading/Loading';
import { useToast } from '../context/ToastContext';
import { randomFrom, PIN_REACTIONS, FIRST_PIN } from '../lib/copy/lore';
import ArcyStar from '../assets/images/arcy-poses/arcy-star.png';

const PAGE_SIZE = 10;

export default function Lists() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allLists, setAllLists] = useState([]);
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const [collections, setCollections] = useState([]); // unstarted pre-built lists
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const tab = searchParams.get('tab') || 'created';

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

    setLoading(false);
  }

  if (loading) return <LoadingScreen />;

  // Split lists
  const favorites = allLists.filter((item) => pinnedIds.has(item.listId));
  const created = allLists.filter((item) => item.isListOwner);
  const joined = allLists.filter((item) => !item.isListOwner);
  const activeList = tab === 'created' ? created : joined;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const paginated = activeList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

      {/* Favorites */}
      {favorites.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-2">Favorites</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {favorites.map((item) => (
              <ListCard
                key={`fav-${item.id}`}
                listId={item.listId}
                title={item.list.title}
                total={item.list.movieCount || 0}
                watched={item.watchedCount}
                isOwner={item.isListOwner}
                isPrebuilt={item.list.isPrebuilt || false}
                creatorName={item.creator?.displayName}
                pinned={true}
                onTogglePin={handleTogglePin}
                featuredPoster={item.list.featuredMovie?.posterPath || item.list.firstPoster}
              />
            ))}
          </div>
        </div>
      )}

      {/* Collections (unstarted pre-built lists) */}
      {collections.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-2">Collections</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {collections.map((list) => (
              <ListCard
                key={`col-${list.id}`}
                listId={list.id}
                title={list.title}
                total={list.movieCount || 0}
                isPrebuilt
                featuredPoster={list.featuredMovie?.posterPath || list.firstPoster}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
        <button
          onClick={() => setSearchParams({ tab: 'created' })}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'created' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Created ({created.length})
        </button>
        <button
          onClick={() => setSearchParams({ tab: 'joined' })}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'joined' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Joined ({joined.length})
        </button>
      </div>

      {/* List grid */}
      {paginated.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">
            {tab === 'created'
              ? "You haven't created any lists yet."
              : "You haven't joined any lists yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {paginated.map((item) => (
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
          ))}
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
