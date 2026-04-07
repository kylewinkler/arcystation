import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserProfile, getUserAllProgress, getUserLists, getFriendship,
  sendFriendRequest, acceptFriendRequest,
  getList, getAllWatchedMovies,
} from '../lib/firestore';
import { posterUrl } from '../lib/tmdb';
import ListCard from '../components/lists/ListCard';
import LoadingScreen from '../components/loading/Loading';

function CollapsibleSection({ title, count, defaultOpen = true, children, rightAction }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-gray-500 text-sm transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {count != null && <span className="text-sm text-gray-500">({count})</span>}
        </button>
        {rightAction}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function UserProfile() {
  const { uid } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [myLists, setMyLists] = useState([]);
  const [allWatchedMovies, setAllWatchedMovies] = useState([]);
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [trackedProgress, setTrackedProgress] = useState([]);
  const [trackedLists, setTrackedLists] = useState({});
  const [trackedCreators, setTrackedCreators] = useState({});
  const [progressMap, setProgressMap] = useState({});
  const [isFriend, setIsFriend] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState(null);
  const [requestedBy, setRequestedBy] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const isOwner = user?.uid === uid;

  useEffect(() => {
    loadProfile();
  }, [uid]);

  // Load all watched movies once (single Firestore read)
  useEffect(() => {
    if (!uid) return;
    getAllWatchedMovies(uid).then(setAllWatchedMovies);
  }, [uid]);

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

    // Load lists + progress
    const [lists, allProgress] = await Promise.all([
      getUserLists(uid),
      getUserAllProgress(uid),
    ]);

    const pMap = {};
    allProgress.forEach((p) => { pMap[p.listId] = p; });
    setProgressMap(pMap);

    // Filter out year lists from regular lists
    setMyLists(lists.filter((l) => !l.isYearList));

    // Tracked lists = started but not created by this user
    const tracked = allProgress.filter(
      (p) => !lists.some((l) => l.id === p.listId)
    );
    setTrackedProgress(tracked);

    // Load list docs + creator profiles for tracked lists
    if (tracked.length > 0) {
      const listDocs = {};
      const creatorUids = new Set();
      await Promise.all(
        tracked.map(async (p) => {
          try {
            const listDoc = await getList(p.listId);
            if (listDoc) {
              listDocs[p.listId] = listDoc;
              if (listDoc.createdBy) creatorUids.add(listDoc.createdBy);
            }
          } catch (err) { /* list may have been deleted */ }
        })
      );
      setTrackedLists(listDocs);

      const creators = {};
      await Promise.all(
        [...creatorUids].map(async (cuid) => {
          const cp = await getUserProfile(cuid);
          if (cp) creators[cuid] = cp;
        })
      );
      setTrackedCreators(creators);
    }

    setLoading(false);
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <div className="text-gray-400 text-center py-12">User not found.</div>;
  }

  const canSeeContent = isOwner || isFriend;

  // Derive available years from watched data
  const yearSet = new Set();
  allWatchedMovies.forEach((m) => { if (m.year) yearSet.add(String(m.year)); });
  const yearOptions = [...yearSet].sort((a, b) => b - a);

  // Filter watched movies by selected year
  const watchedFiltered = selectedYear === 'all'
    ? allWatchedMovies
    : allWatchedMovies.filter((m) => String(m.year) === String(selectedYear));

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

      {/* Content sections */}
      {canSeeContent && (
        <div className="space-y-6">
          {/* Watched by year */}
          <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-bold text-white">Watched</h2>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All years</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <span className="text-sm text-gray-500">({watchedFiltered.length})</span>
                {watchedFiltered.length > 6 && (
                  <Link
                    to={`/watched/${uid}/${selectedYear}`}
                    className="text-xs text-purple-400 hover:text-purple-300 ml-auto"
                  >
                    View all →
                  </Link>
                )}
              </div>
              {watchedFiltered.length > 0 ? (
                <div className="grid grid-cols-6 gap-2">
                  {watchedFiltered.slice(0, 6).map((m) => (
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
                <p className="text-gray-500 text-sm">No movies watched yet.</p>
              )}
          </div>

          {/* My Lists / Their Lists */}
          <CollapsibleSection
            title={isOwner ? 'My Lists' : `${profile.displayName}'s Lists`}
            count={myLists.length}
            rightAction={isOwner ? (
              <Link
                to="/lists/new"
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                + New List
              </Link>
            ) : null}
          >
            {myLists.length === 0 ? (
              <p className="text-gray-500 text-sm">
                {isOwner ? "You haven't created any lists yet." : 'No lists created yet.'}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {myLists.map((list) => {
                  const p = progressMap[list.id];
                  return (
                    <ListCard
                      key={list.id}
                      listId={list.id}
                      title={list.title}
                      total={list?.movieCount || p?.totalCount || 0}
                      watched={p?.watchedCount}
                      featuredPoster={list?.featuredMovie?.posterPath || list?.firstPoster}
                    />
                  );
                })}
              </div>
            )}
          </CollapsibleSection>

          {/* Tracked Lists */}
          {(trackedProgress.length > 0 || isOwner) && (
            <CollapsibleSection
              title={isOwner ? 'Joined Lists' : 'Tracking'}
              count={trackedProgress.length}
              defaultOpen={trackedProgress.length > 0}
            >
              {trackedProgress.length === 0 ? (
                <p className="text-gray-500 text-sm">No tracked lists yet.</p>
              ) : (
                <div className="space-y-3">
                  {trackedProgress.map((p) => {
                    const listDoc = trackedLists[p.listId];
                    const total = listDoc?.movieCount || p.totalCount || 0;
                    const creator = listDoc?.createdBy ? trackedCreators[listDoc.createdBy] : null;
                    return (
                      <ListCard
                        key={p.id}
                        listId={p.listId}
                        title={p.listTitle}
                        total={total}
                        watched={p.watchedCount}
                        creatorName={creator?.displayName}
                        featuredPoster={listDoc?.featuredMovie?.posterPath || listDoc?.firstPoster}
                        to={isOwner ? `/lists/${p.listId}` : `/lists/${p.listId}?viewer=${uid}`}
                      />
                    );
                  })}
                </div>
              )}
            </CollapsibleSection>
          )}

        </div>
      )}
    </div>
  );
}
