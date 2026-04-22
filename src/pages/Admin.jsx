import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { getUserLists } from '../lib/firestore';

import { ADMIN_UIDS } from '../lib/admin';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { ACCESS_DENIED, ADMIN_NO_USERS, ADMIN_NO_LISTS } from '../lib/copy/empty';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedUser, setExpandedUser] = useState(null);
  const [userLists, setUserLists] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const snap = await getDocs(collection(db, 'users'));
    const userList = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    userList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setUsers(userList);
    setLoading(false);
  }

  async function toggleExpand(uid) {
    if (expandedUser === uid) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(uid);
    if (!userLists[uid]) {
      const lists = await getUserLists(uid);
      setUserLists((prev) => ({ ...prev, [uid]: lists }));
    }
  }

  if (!ADMIN_UIDS.includes(user?.uid)) {
    return <NotFound title={ACCESS_DENIED.title} subtitle={ACCESS_DENIED.subtitle} scene={ACCESS_DENIED.scene} />;
  }

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.email?.toLowerCase().includes(search.toLowerCase()) ||
          u.displayName?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <span className="text-sm text-gray-500">{users.length} users</span>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />

      <div className="space-y-2">
        {filtered.map((u) => {
          const isExpanded = expandedUser === u.uid;
          const lists = userLists[u.uid] || [];
          return (
            <div key={u.uid} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleExpand(u.uid)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-800/50 transition-colors"
              >
                {u.photoURL ? (
                  <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold shrink-0">
                    {u.displayName?.[0] || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{u.displayName}</p>
                  <p className="text-gray-400 text-sm truncate">{u.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500">
                    {u.createdAt?.toDate?.().toLocaleDateString() || 'Unknown'}
                  </p>
                  <span className="text-gray-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-400">
                      {lists.length} {lists.length === 1 ? 'list' : 'lists'} created
                    </p>
                    <Link
                      to={`/user/${u.uid}`}
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >
                      View profile →
                    </Link>
                  </div>
                  {lists.length === 0 ? (
                    <p className="text-sm text-gray-600">{ADMIN_NO_LISTS.title}</p>
                  ) : (
                    <div className="space-y-2">
                      {lists.map((l) => (
                        <Link
                          key={l.id}
                          to={`/lists/${l.id}`}
                          className="block bg-gray-800/50 rounded-lg p-3 hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-white text-sm font-medium">{l.title}</span>
                            <span className="text-xs text-gray-500">
                              {l.movieCount || 0} movies
                            </span>
                          </div>
                          {l.description && (
                            <p className="text-gray-500 text-xs mt-1 line-clamp-1">{l.description}</p>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-center py-8">{ADMIN_NO_USERS.title}</p>
        )}
      </div>
    </div>
  );
}
