import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { getUserLists, getListMovies, getPrebuiltLists } from '../lib/firestore';

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
    getPrebuiltLists().then(setPrebuiltLists);
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
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [prebuiltLists, setPrebuiltLists] = useState([]);

  const SCOOBY_DOO_TMDB_IDS = [
    36972, 24787, 13350, 37211, 13351, 13151, 17681, 20410,
    15601, 9637, 30074, 21956, 11024, 12902, 24615, 20558,
    13355, 13354, 12903, 16390, 22620, 32916, 45752, 47533,
    67900, 81900, 119321, 151535, 210769, 203696, 258893, 284995,
    302960, 347688, 392536, 409122, 427564, 461054, 484862, 489939,
    533592, 560066, 615774, 385103, 721656, 682254, 843906, 1015724,
  ];

  async function seedScoobyDoo() {
    setSeeding(true);
    setSeedResult(null);
    try {
      const apiKey = import.meta.env.VITE_TMDB_API_KEY;

      // Create the pre-built list
      const listRef = await addDoc(collection(db, 'lists'), {
        title: 'The Scooby-Doo Movie Collection',
        description: 'Every Scooby-Doo movie from 1979 to 2022. Animated classics, live-action films, and everything in between.',
        createdBy: null,
        isPrebuilt: true,
        movieCount: 0,
        isPublic: false,
        shareSlug: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const listId = listRef.id;
      let count = 0;
      let firstPoster = null;

      for (let i = 0; i < SCOOBY_DOO_TMDB_IDS.length; i++) {
        const tmdbId = SCOOBY_DOO_TMDB_IDS[i];
        const res = await fetch(
          `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`
        );
        const m = await res.json();
        if (!m.id) continue;

        const movieDoc = {
          title: m.title || '',
          posterPath: m.poster_path || null,
          year: m.release_date ? m.release_date.slice(0, 4) : '',
          overview: m.overview || '',
          genreIds: (m.genres || []).map((g) => g.id),
          order: i,
          addedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'lists', listId, 'movies', String(tmdbId)), movieDoc);
        if (!firstPoster && m.poster_path) firstPoster = m.poster_path;
        count++;
      }

      await updateDoc(doc(db, 'lists', listId), {
        movieCount: count,
        ...(firstPoster && { firstPoster }),
      });

      setSeedResult(`Created "${listRef.id}" with ${count} movies.`);
      getPrebuiltLists().then(setPrebuiltLists);
    } catch (err) {
      console.error('Seed failed:', err);
      setSeedResult(`Error: ${err.message}`);
    }
    setSeeding(false);
  }

  async function migrateToNewSchema() {
    setMigrating(true);
    setMigrateResult(null);
    try {
      let membersCreated = 0;
      let listWatchedCreated = 0;
      let reviewsCreated = 0;

      // 1. Migrate userProgress → listMembers
      const progressSnap = await getDocs(collection(db, 'userProgress'));
      for (const pDoc of progressSnap.docs) {
        const p = pDoc.data();
        const memberDocId = `${p.uid}__${p.listId}`;
        await setDoc(doc(db, 'listMembers', memberDocId), {
          uid: p.uid,
          listId: p.listId,
          joinedAt: p.startedAt || serverTimestamp(),
          lastActivityAt: p.lastActivityAt || p.startedAt || serverTimestamp(),
        }, { merge: true });
        membersCreated++;

        // 2. Migrate userProgress/{id}/watched/{tmdbId} → listWatched
        const watchedSnap = await getDocs(collection(db, 'userProgress', pDoc.id, 'watched'));
        for (const wDoc of watchedSnap.docs) {
          const w = wDoc.data();
          const tmdbId = wDoc.id;
          const watchedDocId = `${p.uid}__${p.listId}__${tmdbId}`;
          await setDoc(doc(db, 'listWatched', watchedDocId), {
            uid: p.uid,
            listId: p.listId,
            tmdbId,
            watchedAt: w.watchedAt || serverTimestamp(),
          }, { merge: true });
          listWatchedCreated++;
        }
      }

      // 3. Migrate userWatched/{uid} mega-docs → reviews/{uid__tmdbId}
      const userWatchedSnap = await getDocs(collection(db, 'userWatched'));
      for (const uwDoc of userWatchedSnap.docs) {
        const uid = uwDoc.id;
        const data = uwDoc.data();
        const movies = data.movies || {};

        for (const [tmdbId, meta] of Object.entries(movies)) {
          const reviewDocId = `${uid}__${tmdbId}`;
          const entry = { uid, tmdbId };
          if (meta.watchedAt) entry.watchedAt = meta.watchedAt;
          else entry.watchedAt = serverTimestamp();
          if (meta.title) entry.title = meta.title;
          if (meta.year) entry.year = meta.year;
          if (meta.posterPath) entry.posterPath = meta.posterPath;
          if (meta.genreIds?.length > 0) entry.genreIds = meta.genreIds;
          if (meta.rating != null) entry.rating = meta.rating;
          if (meta.note != null) entry.note = meta.note;

          await setDoc(doc(db, 'reviews', reviewDocId), entry, { merge: true });
          reviewsCreated++;
        }
      }

      setMigrateResult(
        `Done. ${membersCreated} list memberships, ${listWatchedCreated} list-watched entries, ${reviewsCreated} reviews migrated.`
      );
    } catch (err) {
      console.error('Migration failed:', err);
      setMigrateResult(`Error: ${err.message}`);
    }
    setMigrating(false);
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

      {/* Data migration */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-medium text-white mb-2">Data Migration</h2>
        <p className="text-xs text-gray-500 mb-3">
          Migrate old schema (userProgress + userWatched) → new schema (listMembers + listWatched + reviews). Safe to run multiple times.
        </p>
        <button
          onClick={migrateToNewSchema}
          disabled={migrating}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {migrating ? 'Migrating...' : 'Migrate to New Schema'}
        </button>
        {migrateResult && (
          <p className={`text-sm mt-2 ${migrateResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {migrateResult}
          </p>
        )}
      </div>

      {/* Pre-built lists */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-medium text-white mb-2">Pre-built Collections</h2>
        {prebuiltLists.length > 0 ? (
          <div className="space-y-2 mb-3">
            {prebuiltLists.map((l) => (
              <Link key={l.id} to={`/lists/${l.id}`} className="block bg-gray-800/50 rounded-lg p-3 hover:bg-gray-800 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium">{l.title}</span>
                  <span className="text-xs text-gray-500">{l.movieCount || 0} movies</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 mb-3">No pre-built lists yet.</p>
        )}
        <button
          onClick={seedScoobyDoo}
          disabled={seeding}
          className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {seeding ? 'Seeding...' : 'Seed: Scooby-Doo Collection'}
        </button>
        {seedResult && (
          <p className={`text-sm mt-2 ${seedResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {seedResult}
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
