import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getFriends, getPendingRequests, getUserProfile, getUserAllProgress,
  searchUsersByName, sendFriendRequest, acceptFriendRequest, removeFriend,
  getSuggestedFriends, getFriendship,
} from '../lib/firestore';
import LoadingScreen from '../components/loading/Loading';

export default function Friends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [friendActivity, setFriendActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null);

  useEffect(() => {
    loadFriends();
  }, [user]);

  async function loadFriends() {
    setLoading(true);
    const [friendUids, pendingRequests] = await Promise.all([
      getFriends(user.uid),
      getPendingRequests(user.uid),
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

    // Load suggested friends
    const suggestions = await getSuggestedFriends(user.uid);
    setSuggested(suggestions);

    // Load friend activity
    if (friendUids.length > 0) {
      const friendProgressPromises = friendUids.map(async (fuid) => {
        const [fProfile, fProgress] = await Promise.all([
          getUserProfile(fuid),
          getUserAllProgress(fuid),
        ]);
        return fProgress.map((p) => ({ ...p, friend: fProfile }));
      });
      const allFriendProgress = (await Promise.all(friendProgressPromises)).flat();
      allFriendProgress.sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));
      setFriendActivity(allFriendProgress.slice(0, 10));
    }

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
      // Filter out self, existing friends, and pending requests
      const friendUids = new Set(friends.map((f) => f.uid));
      const pendingUids = new Set(pending.map((p) => p.otherUser?.uid));
      const filtered = results.filter(
        (u) => u.uid !== user.uid && !friendUids.has(u.uid) && !pendingUids.has(u.uid)
      );
      setSearchResults(filtered);
      setSearching(false);
    }, 300);
  };

  const handleSendRequest = async (toUid) => {
    await sendFriendRequest(user.uid, toUid);
    setSearchResults((prev) => prev.filter((u) => u.uid !== toUid));
    await loadFriends();
  };

  const handleAccept = async (uid1, uid2) => {
    await acceptFriendRequest(uid1, uid2);
    await loadFriends();
  };

  const handleRemove = async (otherUid) => {
    if (!confirm('Remove this friend?')) return;
    await removeFriend(user.uid, otherUid);
    await loadFriends();
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const incomingRequests = pending.filter((r) => r.requestedBy !== user.uid);
  const outgoingRequests = pending.filter((r) => r.requestedBy === user.uid);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white">Friends</h1>

      {/* Search */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-medium text-white mb-3">Add a Friend</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
        />
        {searching && <p className="text-sm text-gray-400 mt-2">Searching...</p>}
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((u) => (
              <div key={u.uid} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                <Link to={`/user/${u.uid}`} className="shrink-0">
                  {u.photoURL ? (
                    <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                      {u.displayName?.[0]}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{u.displayName}</p>
                  <p className="text-gray-400 text-xs truncate">{u.email}</p>
                </div>
                <button
                  onClick={() => handleSendRequest(u.uid)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        )}
        {searchQuery.trim() && !searching && searchResults.length === 0 && (
          <p className="text-sm text-gray-500 mt-2">No users found.</p>
        )}
      </div>

      {/* Friend Activity */}
      {friendActivity.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Friend Activity</h2>
          <div className="space-y-2">
            {friendActivity.map((activity) => (
              <Link
                key={activity.id}
                to={`/lists/${activity.listId}?viewer=${activity.uid}`}
                className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-purple-500 transition-colors"
              >
                {activity.friend?.photoURL ? (
                  <img src={activity.friend.photoURL} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                    {activity.friend?.displayName?.[0] || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-white text-sm font-medium">{activity.friend?.displayName}</span>
                  <span className="text-gray-400 text-sm"> started </span>
                  <span className="text-white text-sm font-medium">{activity.listTitle}</span>
                </div>
                <span className="text-sm text-gray-500 shrink-0">
                  {activity.watchedCount}/{activity.totalCount}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Suggested friends */}
      {suggested.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Suggested Friends</h2>
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
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{s.displayName}</p>
                  <p className="text-gray-400 text-xs">{s.mutualCount} mutual {s.mutualCount === 1 ? 'friend' : 'friends'}</p>
                </div>
                <button
                  onClick={() => handleSendRequest(s.uid)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incoming requests */}
      {incomingRequests.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Friend Requests</h2>
          <div className="space-y-2">
            {incomingRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
                {req.otherUser?.photoURL ? (
                  <img src={req.otherUser.photoURL} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                    {req.otherUser?.displayName?.[0]}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{req.otherUser?.displayName}</p>
                  <p className="text-gray-400 text-xs">{req.otherUser?.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(req.uid1, req.uid2)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRemove(req.otherUser?.uid)}
                    className="text-gray-400 hover:text-red-400 border border-gray-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing requests */}
      {outgoingRequests.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Pending Requests</h2>
          <div className="space-y-2">
            {outgoingRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
                {req.otherUser?.photoURL ? (
                  <img src={req.otherUser.photoURL} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                    {req.otherUser?.displayName?.[0]}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{req.otherUser?.displayName}</p>
                </div>
                <span className="text-xs text-gray-500">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">
          {friends.length} {friends.length === 1 ? 'Friend' : 'Friends'}
        </h2>
        {friends.length === 0 ? (
          <p className="text-gray-500 text-sm">No friends yet. Search by name to add someone!</p>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div key={friend.uid} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
                <Link to={`/user/${friend.uid}`} className="flex items-center gap-3 flex-1 min-w-0">
                  {friend.photoURL ? (
                    <img src={friend.photoURL} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                      {friend.displayName?.[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{friend.displayName}</p>
                    <p className="text-gray-400 text-xs truncate">{friend.email}</p>
                  </div>
                </Link>
                <button
                  onClick={() => handleRemove(friend.uid)}
                  className="text-gray-500 hover:text-red-400 text-xs shrink-0 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
