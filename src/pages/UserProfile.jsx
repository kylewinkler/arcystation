import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserProfile, getUserAllProgress, getFriendship,
  sendFriendRequest, acceptFriendRequest,
  getList, getAllWatchedMovies, getAllWatchedTmdbIds,
  getPinnedLists, pinList, unpinList, sortLists,
} from '../lib/firestore';
import ListCard from '../components/lists/ListCard';
import WatchedPoster from '../components/movies/WatchedPoster';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import ProfileHeader from '../components/profile/ProfileHeader';
import { PROFILE_NO_WATCHED, PROFILE_NO_LISTS, USER_NOT_FOUND } from '../lib/copy/empty';
import { useToast } from '../context/ToastContext';
import { randomFrom, PIN_REACTIONS, FIRST_PIN } from '../lib/copy/lore';
import ArcyStar from '../assets/images/arcy-poses/arcy-star.png';

export default function UserProfile() {
  const { uid } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
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
  const [myWatchedIds, setMyWatchedIds] = useState(new Set());

  const isOwner = user?.uid === uid;

  useEffect(() => {
    loadProfile();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    getAllWatchedMovies(uid).then(setAllWatchedMovies);
  }, [uid]);

  // Load current user's watched set for glow effect
  useEffect(() => {
    if (!user) return;
    getAllWatchedTmdbIds(user.uid).then(setMyWatchedIds);
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
    const pinnedSet = new Set(pinned);
    setPinnedIds(pinnedSet);

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
    setLists(sortLists(valid, pinnedSet));

    setLoading(false);
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <NotFound title={USER_NOT_FOUND.title} subtitle={USER_NOT_FOUND.subtitle} scene={USER_NOT_FOUND.scene} />;
  }

  const canSeeContent = isOwner || isFriend;

  // Split lists into owned vs joined
  const ownedLists = lists.filter((item) => item.isListOwner);
  const joinedLists = lists.filter((item) => !item.isListOwner);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <ProfileHeader profile={profile} isOwner={isOwner} />

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
                  to={`/watched/${uid}`}
                  className="text-xs text-purple-400 hover:text-purple-300 ml-auto"
                >
                  View all →
                </Link>
              )}
            </div>
            {allWatchedMovies.length > 0 ? (
              <div className="grid grid-cols-6 gap-2">
                {allWatchedMovies.slice(0, 6).map((m) => (
                  <WatchedPoster
                    key={m.tmdbId}
                    tmdbId={m.tmdbId}
                    title={m.title}
                    posterPath={m.posterPath}
                    rating={m.rating}
                    glow={myWatchedIds.has(m.tmdbId)}
                  />
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
                <Link
                  to="/lists/new"
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  + New List
                </Link>
              )}
            </div>

            {ownedLists.length === 0 ? (
              <NotFound title={PROFILE_NO_LISTS.title} subtitle={PROFILE_NO_LISTS.subtitle} scene={PROFILE_NO_LISTS.scene} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {ownedLists.slice(0, 6).map((item) => (
                  <ListCard
                    key={item.id}
                    listId={item.listId}
                    title={item.list.title}
                    total={item.list.movieCount || 0}
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
          </div>

          {/* Joined Lists */}
          {joinedLists.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Joined Lists</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {joinedLists.slice(0, 6).map((item) => (
                  <ListCard
                    key={item.id}
                    listId={item.listId}
                    title={item.list.title}
                    total={item.list.movieCount || 0}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
