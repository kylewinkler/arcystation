import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getFriends, getPendingRequests, getUserProfile,
  searchUsersByName, sendFriendRequest, acceptFriendRequest, removeFriend,
  getSuggestedFriends, getNotifications,
} from '../lib/firestore';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import NotificationItem from '../components/notifications/NotificationItem';
import { FRIENDS_NONE, FRIENDS_NO_RESULTS } from '../lib/copy/empty';

const FEED_TYPES = new Set([
  'watched_movie',
  'created_list',
  'finished_list',
  'joined_collection',
  'friend_accepted',
]);

export default function Friends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [feed, setFeed] = useState([]);
  const [feedProfiles, setFeedProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null);
  const searchWrapRef = useRef(null);

  useEffect(() => {
    loadAll();
  }, [user]);

  useEffect(() => {
    function onClickOutside(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function loadAll() {
    setLoading(true);
    const [friendUids, pendingRequests, suggestions, notifs] = await Promise.all([
      getFriends(user.uid),
      getPendingRequests(user.uid),
      getSuggestedFriends(user.uid),
      getNotifications(user.uid),
    ]);

    const friendProfiles = await Promise.all(
      friendUids.map((uid) => getUserProfile(uid))
    );
    setFriends(friendProfiles.filter(Boolean));

    const pendingWithProfiles = await Promise.all(
      pendingRequests.map(async (req) => {
        const otherUid = req.uid1 === user.uid ? req.uid2 : req.uid1;
        const profile = await getUserProfile(otherUid);
        return { ...req, otherUser: profile };
      })
    );
    setPending(pendingWithProfiles);
    setSuggested(suggestions);

    const friendSet = new Set(friendUids);
    const feedItems = notifs.filter(
      (n) => FEED_TYPES.has(n.type) && friendSet.has(n.fromUid)
    ).slice(0, 30);
    setFeed(feedItems);

    const uids = [...new Set(feedItems.map((n) => n.fromUid))];
    const profileMap = {};
    await Promise.all(
      uids.map(async (uid) => {
        const p = await getUserProfile(uid);
        if (p) profileMap[uid] = p;
      })
    );
    setFeedProfiles(profileMap);

    setLoading(false);
  }

  const handleSearch = (value) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchUsersByName(value);
      setSearchResults(results.filter((u) => u.uid !== user.uid));
      setSearching(false);
    }, 250);
  };

  const handleSendRequest = async (toUid, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    await sendFriendRequest(user.uid, toUid);
    await loadAll();
  };

  const handleAccept = async (uid1, uid2) => {
    await acceptFriendRequest(uid1, uid2);
    await loadAll();
  };

  const handleRemove = async (otherUid) => {
    if (!confirm('Remove this friend?')) return;
    await removeFriend(user.uid, otherUid);
    await loadAll();
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const incomingRequests = pending.filter((r) => r.requestedBy !== user.uid);
  const friendUidSet = new Set(friends.map((f) => f.uid));
  const pendingUidSet = new Set(pending.map((p) => p.otherUser?.uid));
  const showDropdown = searchFocused && searchQuery.trim().length > 0;

  function relationLabel(uid) {
    if (friendUidSet.has(uid)) return 'Friend';
    if (pendingUidSet.has(uid)) return 'Pending';
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Search — top, prominent */}
      <div ref={searchWrapRef} className="relative">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            placeholder="Search friends by name or email..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
        {showDropdown && (
          <div className="absolute z-20 left-0 right-0 mt-2 bg-gray-900 border border-gray-800 rounded-lg shadow-xl max-h-96 overflow-y-auto">
            {searching && (
              <p className="text-sm text-gray-400 p-3">Searching...</p>
            )}
            {!searching && searchResults.length === 0 && (
              <p className="text-sm text-gray-500 p-3">{FRIENDS_NO_RESULTS.title}</p>
            )}
            {searchResults.map((u) => {
              const rel = relationLabel(u.uid);
              return (
                <Link
                  key={u.uid}
                  to={`/user/${u.uid}`}
                  onClick={() => setSearchFocused(false)}
                  className="flex items-center gap-3 p-3 hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-b-0"
                >
                  {u.photoURL ? (
                    <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                      {u.displayName?.[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.displayName}</p>
                    <p className="text-gray-400 text-xs truncate">{u.email}</p>
                  </div>
                  {rel ? (
                    <span className="text-xs text-gray-500 shrink-0">{rel}</span>
                  ) : (
                    <button
                      onClick={(e) => handleSendRequest(u.uid, e)}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
                    >
                      Add
                    </button>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Incoming friend requests */}
      {incomingRequests.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Requests</h2>
          <div className="space-y-2">
            {incomingRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 bg-gray-900 border border-purple-500/30 rounded-lg p-3">
                <Link to={`/user/${req.otherUser?.uid}`} className="shrink-0">
                  {req.otherUser?.photoURL ? (
                    <img src={req.otherUser.photoURL} alt="" className="w-9 h-9 rounded-full" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold">
                      {req.otherUser?.displayName?.[0]}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{req.otherUser?.displayName}</p>
                  <p className="text-gray-500 text-xs">wants to be friends</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleAccept(req.uid1, req.uid2)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRemove(req.otherUser?.uid)}
                    className="text-gray-400 hover:text-red-400 border border-gray-700 px-3 py-1.5 rounded-lg text-xs transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity feed — the main event */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">Friend Activity</h2>
        {friends.length === 0 ? (
          <NotFound title={FRIENDS_NONE.title} subtitle={FRIENDS_NONE.subtitle} scene={FRIENDS_NONE.scene} />
        ) : feed.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-400 text-sm">No activity yet.</p>
            <p className="text-gray-600 text-xs mt-1">
              When your friends watch movies or start lists, you'll see it here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {feed.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                profile={feedProfiles[n.fromUid]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Suggested friends */}
      {suggested.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Suggested</h2>
          <div className="space-y-2">
            {suggested.map((s) => (
              <div key={s.uid} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
                <Link to={`/user/${s.uid}`} className="shrink-0">
                  {s.photoURL ? (
                    <img src={s.photoURL} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                      {s.displayName?.[0]}
                    </div>
                  )}
                </Link>
                <Link to={`/user/${s.uid}`} className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{s.displayName}</p>
                  <p className="text-gray-400 text-xs">{s.mutualCount} mutual {s.mutualCount === 1 ? 'friend' : 'friends'}</p>
                </Link>
                <button
                  onClick={(e) => handleSendRequest(s.uid, e)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list — compact, bottom */}
      {friends.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Your {friends.length} {friends.length === 1 ? 'Friend' : 'Friends'}
          </h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {friends.map((friend) => (
              <Link
                key={friend.uid}
                to={`/user/${friend.uid}`}
                className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-2.5 hover:border-gray-700 transition-colors"
              >
                {friend.photoURL ? (
                  <img src={friend.photoURL} alt="" className="w-8 h-8 rounded-full shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {friend.displayName?.[0]}
                  </div>
                )}
                <p className="text-white text-sm font-medium truncate">{friend.displayName}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
