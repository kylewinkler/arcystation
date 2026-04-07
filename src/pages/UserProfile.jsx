import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserProfile, getUserAllProgress, getFriendship,
  sendFriendRequest, acceptFriendRequest,
  getList, getAllWatchedMovies,
  getPinnedLists, pinList, unpinList,
} from '../lib/firestore';
import { posterUrl } from '../lib/tmdb';
import ListCard from '../components/lists/ListCard';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { PROFILE_NO_WATCHED, PROFILE_NO_LISTS, USER_NOT_FOUND } from '../lib/copy/empty';
import { useToast } from '../context/ToastContext';
import { randomFrom, PIN_REACTIONS, FIRST_PIN } from '../lib/copy/lore';
import ArcyStar from '../assets/images/arcy-poses/arcy-star.png';

export default function UserProfile() {
  const { uid } = useParams();
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [allWatchedMovies, setAllWatchedMovies] = useState([]);
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [lists, setLists] = useState([]);
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const [isFriend, setIsFriend] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState(null);
  const [requestedBy, setRequestedBy] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [search, setSearch] = useState('');

  const isOwner = user?.uid === uid;

  useEffect(() => {
    loadProfile();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    getAllWatchedMovies(uid).then(setAllWatchedMovies);
  }, [uid]);

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

  async function loadProfile() {
    setLoading(true);
    const profileData = await getUserProfile(uid);
    setProfile(profileData);

    if (!isOwner && user) {
      const friendship = await getFriendship(user.uid, uid);
      setFriendshipStatus(friendship?.status || null);
      setRequestedBy(friendship?.requestedBy || null);
      setIsFriend(friendship?.status === 'accepted');
    }

    // Load all progress + enrich with list docs
    const [allProgress, pinned] = await Promise.all([
      getUserAllProgress(uid),
      isOwner ? getPinnedLists(uid) : Promise.resolve([]),
    ]);
    setPinnedIds(new Set(pinned));

    const enriched = await Promise.all(
      allProgress.map(async (p) => {
        try {
          const listDoc = await getList(p.listId);
          if (!listDoc) return null;
          let creator = null;
          if (listDoc.createdBy && listDoc.createdBy !== uid) {
            creator = await getUserProfile(listDoc.createdBy);
          }
          return { ...p, list: listDoc, creator, isListOwner: listDoc.createdBy === uid };
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

    setLoading(false);
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <NotFound title={USER_NOT_FOUND.title} subtitle={USER_NOT_FOUND.subtitle} scene={USER_NOT_FOUND.scene} />;
  }

  const canSeeContent = isOwner || isFriend;

  // Filter + sort lists
  const filteredLists = lists
    .filter((item) => {
      if (search && !item.listTitle.toLowerCase().includes(search.toLowerCase())) return false;
      if (ownerFilter === 'mine' && !item.isListOwner) return false;
      return true;
    })
    .sort((a, b) => {
      const aPinned = pinnedIds.has(a.listId) ? 1 : 0;
      const bPinned = pinnedIds.has(b.listId) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return 0;
    });

  const displayedLists = filteredLists.slice(0, 6);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Profile header */}
      <div className="flex items-center gap-4">
        {profile.photoURL ? (
          <img src={profile.photoURL} alt="" className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-2xl font-bold">
            {profile.displayName?.[0]}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{profile.displayName}</h1>
          {isOwner && <p className="text-gray-400 text-sm">{profile.email}</p>}
        </div>
        {isOwner && (
          <button
            onClick={async () => { await logout(); navigate('/login'); }}
            className="ml-auto text-sm text-gray-500 hover:text-red-400 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        )}
      </div>

      {/* Not friends */}
      {!canSeeContent && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">Add this user as a friend to see their lists.</p>
          {friendshipStatus === 'pending' && requestedBy === uid ? (
            <button
              onClick={async () => {
                setSending(true);
                await acceptFriendRequest(user.uid, uid);
                setIsFriend(true);
                setFriendshipStatus('accepted');
                setSending(false);
                loadProfile();
              }}
              disabled={sending}
              className="mt-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? 'Accepting...' : 'Accept Friend Request'}
            </button>
          ) : friendshipStatus === 'pending' ? (
            <p className="text-sm text-gray-500 mt-2">Friend request pending</p>
          ) : (
            <button
              onClick={async () => {
                setSending(true);
                await sendFriendRequest(user.uid, uid);
                setFriendshipStatus('pending');
                setSending(false);
              }}
              disabled={sending}
              className="mt-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? 'Sending...' : 'Add Friend'}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {canSeeContent && (
        <div className="space-y-6">
          {/* Watched by year */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-lg font-bold text-white">Recently Watched</h2>
              <span className="text-sm text-gray-500">({allWatchedMovies.length})</span>
              {allWatchedMovies.length > 6 && (
                <Link
                  to={`/watched/${uid}/${selectedYear}`}
                  className="text-xs text-purple-400 hover:text-purple-300 ml-auto"
                >
                  View all →
                </Link>
              )}
            </div>
            {allWatchedMovies.length > 0 ? (
              <div className="grid grid-cols-6 gap-2">
                {allWatchedMovies.slice(0, 6).map((m) => (
                  <Link
                    key={m.tmdbId}
                    to={`/movie/${m.tmdbId}`}
                    className="group"
                    title={m.title}
                  >
                    {m.posterPath ? (
                      <img
                        src={posterUrl(m.posterPath, 'w185')}
                        alt={m.title}
                        className="w-full aspect-[2/3] rounded object-cover ring-1 ring-purple-500/30 group-hover:ring-purple-500 transition-all"
                      />
                    ) : (
                      <div className="w-full aspect-[2/3] rounded bg-gray-800 ring-1 ring-purple-500/30 flex items-center justify-center">
                        <span className="text-xs text-gray-500 text-center leading-tight px-1">{m.title}</span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <NotFound title={PROFILE_NO_WATCHED.title} subtitle={PROFILE_NO_WATCHED.subtitle} scene={PROFILE_NO_WATCHED.scene} />
            )}
          </div>

          {/* Lists */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Lists</h2>
              {isOwner && (
                                <button
                  onClick={() => setOwnerFilter((f) => f === 'all' ? 'mine' : 'all')}
                  className="flex items-center gap-2 shrink-0"
                >
                  <span className="text-xs text-gray-400">Mine</span>
                  <div className={`w-9 h-5 rounded-full transition-colors relative ${ownerFilter === 'mine' ? 'bg-purple-600' : 'bg-gray-700'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${ownerFilter === 'mine' ? 'left-[18px]' : 'left-0.5'}`} />
                  </div>
                </button>

              )}
            </div>

            {/* Search + Mine toggle */}
            {lists.length > 0 && isOwner && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search lists..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <Link
                  to="/lists/new"
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  + New List
                </Link>
              </div>
            )}

            {displayedLists.length === 0 ? (
              <NotFound title={PROFILE_NO_LISTS.title} subtitle={PROFILE_NO_LISTS.subtitle} scene={PROFILE_NO_LISTS.scene} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {displayedLists.map((item) => (
                  <ListCard
                    key={item.id}
                    listId={item.listId}
                    title={item.listTitle}
                    total={item.list.movieCount || item.totalCount || 0}
                    watched={item.watchedCount}
                    isOwner={item.isListOwner}
                    creatorName={item.creator?.displayName}
                    pinned={pinnedIds.has(item.listId)}
                    onTogglePin={isOwner ? handleTogglePin : undefined}
                    featuredPoster={item.list.featuredMovie?.posterPath || item.list.firstPoster}
                    to={isOwner ? `/lists/${item.listId}` : `/lists/${item.listId}?viewer=${uid}`}
                  />
                ))}
              </div>
            )}

            {filteredLists.length > 6 && (
              <div className="text-center">
                <Link
                  to="/"
                  className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                >
                  View all lists →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
