import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { getUserLists, getListMovies } from '../lib/firestore';

import { ADMIN_UIDS } from '../lib/admin';
import LoadingScreen from '../components/loading/Loading';

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
    setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
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

  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

  async function migrateWatchedData() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      // Get all userProgress docs
      const progressSnap = await getDocs(collection(db, 'userProgress'));
      const byUser = {}; // uid -> [{ listId, watchedTmdbIds }]

      for (const pDoc of progressSnap.docs) {
        const p = pDoc.data();
        const watchedSnap = await getDocs(collection(db, 'userProgress', pDoc.id, 'watched'));
        if (watchedSnap.empty) continue;
        if (!byUser[p.uid]) byUser[p.uid] = [];
        const watchedEntries = {};
        watchedSnap.docs.forEach((d) => { watchedEntries[d.id] = d.data(); });
        byUser[p.uid].push({
          listId: p.listId,
          watchedEntries,
        });
      }

      let usersUpdated = 0;
      let moviesBackfilled = 0;

      for (const [uid, entries] of Object.entries(byUser)) {
        const allTmdbIds = [];
        const moviesMap = {};

        for (const { listId, watchedEntries } of entries) {
          const listMovies = await getListMovies(listId);
          const movieLookup = {};
          listMovies.forEach((m) => { movieLookup[m.tmdbId] = m; });

          for (const [tmdbId, watchData] of Object.entries(watchedEntries)) {
            allTmdbIds.push(tmdbId);
            const m = movieLookup[tmdbId];
            if (!moviesMap[tmdbId]) {
              moviesMap[tmdbId] = {
                ...(m && { title: m.title || '', year: m.year || '', posterPath: m.posterPath || null }),
                ...(m?.genreIds?.length > 0 && { genreIds: m.genreIds }),
                ...(watchData.rating != null && { rating: watchData.rating }),
                ...(watchData.note != null && { note: watchData.note }),
                ...(watchData.watchedAt && { watchedAt: watchData.watchedAt }),
              };
              moviesBackfilled++;
            }
          }
        }

        // Merge into userWatched doc
        const updates = { tmdbIds: arrayUnion(...allTmdbIds) };
        for (const [tmdbId, meta] of Object.entries(moviesMap)) {
          updates[`movies.${tmdbId}`] = meta;
        }
        await setDoc(doc(db, 'userWatched', uid), updates, { merge: true });
        usersUpdated++;
      }

      setMigrateResult(`Done. Updated ${usersUpdated} users, backfilled ${moviesBackfilled} movies.`);
    } catch (err) {
      console.error('Migration failed:', err);
      setMigrateResult(`Error: ${err.message}`);
    }
    setMigrating(false);
  }

  if (!ADMIN_UIDS.includes(user?.uid)) {
    return <div className="text-gray-400 text-center py-12">Access denied.</div>;
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

      {/* Data migration */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-medium text-white mb-2">Data Migration</h2>
        <p className="text-xs text-gray-500 mb-3">
          Backfill userWatched docs from existing progress data. Safe to run multiple times.
        </p>
        <button
          onClick={migrateWatchedData}
          disabled={migrating}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {migrating ? 'Migrating...' : 'Backfill Watched Data'}
        </button>
        {migrateResult && (
          <p className={`text-sm mt-2 ${migrateResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {migrateResult}
          </p>
        )}
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
                    <p className="text-sm text-gray-600">No lists created yet.</p>
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
          <p className="text-gray-500 text-center py-8">No users found.</p>
        )}
      </div>
    </div>
  );
}
