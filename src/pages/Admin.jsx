import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { getUserLists, backfillMovieStats, createPrebuiltCollection } from '../lib/firestore';
import { getTmdbCollection, discoverMoviesByCompany, getMovieDetails } from '../lib/tmdb';

import { ADMIN_UIDS } from '../lib/admin';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { ACCESS_DENIED, ADMIN_NO_USERS, ADMIN_NO_LISTS } from '../lib/copy/empty';

// TMDB collection / movie / company IDs that source each prebuilt.
const COLLECTION_SPECS = [
  {
    slug: 'batman',
    title: 'Batman',
    description: 'The Caped Crusader on the big screen.',
    sources: [
      { type: 'collection', id: 120794 }, // Batman Collection (Burton/Schumacher)
      { type: 'collection', id: 263 },    // The Dark Knight Trilogy
      { type: 'movie', id: 414906 },      // The Batman (2022)
    ],
  },
  {
    slug: 'james-bond',
    title: 'James Bond',
    description: 'The 007 film series.',
    sources: [
      { type: 'collection', id: 645 },    // James Bond Collection
    ],
  },
  {
    slug: 'superman',
    title: 'Superman',
    description: 'The Man of Steel on screen.',
    sources: [
      { type: 'collection', id: 8537 },   // Superman Collection (Reeve era)
      { type: 'movie', id: 1452 },        // Superman Returns
      { type: 'movie', id: 49521 },       // Man of Steel
    ],
  },
  {
    slug: 'spiderman',
    title: 'Spider-Man',
    description: 'Your friendly neighborhood Spider-Man.',
    sources: [
      { type: 'collection', id: 556 },    // Spider-Man (Raimi)
      { type: 'collection', id: 295130 }, // The Amazing Spider-Man
      { type: 'collection', id: 531241 }, // Spider-Man (MCU)
    ],
  },
  {
    slug: 'disney',
    title: 'Disney',
    description: 'Walt Disney Animation Studios features.',
    sources: [
      { type: 'company', id: 6125, pages: 3 }, // Walt Disney Animation Studios
    ],
  },
];

async function fetchSpecMovies(spec) {
  const all = [];
  for (const src of spec.sources) {
    if (src.type === 'collection') {
      all.push(...(await getTmdbCollection(src.id)));
    } else if (src.type === 'movie') {
      const m = await getMovieDetails(src.id);
      if (m) all.push(m);
    } else if (src.type === 'company') {
      all.push(...(await discoverMoviesByCompany(src.id, { pages: src.pages || 1 })));
    }
  }
  all.sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''));
  return all;
}

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedUser, setExpandedUser] = useState(null);
  const [userLists, setUserLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [buildingSlug, setBuildingSlug] = useState(null);
  const [collectionResults, setCollectionResults] = useState({});

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

  async function handleBuildCollection(spec) {
    if (buildingSlug) return;
    setBuildingSlug(spec.slug);
    setCollectionResults((prev) => ({ ...prev, [spec.slug]: 'Fetching from TMDB…' }));
    try {
      const movies = await fetchSpecMovies(spec);
      const r = await createPrebuiltCollection({
        slug: spec.slug,
        title: spec.title,
        description: spec.description,
        movies,
        createdBy: user.uid,
      });
      setCollectionResults((prev) => ({
        ...prev,
        [spec.slug]: `Done. ${r.added} added (${r.total} total).`,
      }));
    } catch (err) {
      setCollectionResults((prev) => ({ ...prev, [spec.slug]: `Failed: ${err.message}` }));
    } finally {
      setBuildingSlug(null);
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

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-white text-sm font-medium">Movie stats backfill</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Recomputes the aggregate score for every movie that has reviews. Safe to re-run.
            </p>
          </div>
          <button
            onClick={async () => {
              if (backfilling) return;
              setBackfilling(true);
              setBackfillResult(null);
              try {
                const r = await backfillMovieStats();
                setBackfillResult(`Done. ${r.movies} movies updated from ${r.processed} reviews.`);
              } catch (err) {
                setBackfillResult(`Failed: ${err.message}`);
              } finally {
                setBackfilling(false);
              }
            }}
            disabled={backfilling}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0"
          >
            {backfilling ? 'Running…' : 'Run backfill'}
          </button>
        </div>
        {backfillResult && (
          <p className="text-xs text-gray-400 mt-2">{backfillResult}</p>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-white text-sm font-medium">Prebuilt collections</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Pulls movies from TMDB and creates a public prebuilt collection. Safe to re-run — only adds missing movies.
        </p>
        <div className="space-y-2">
          {COLLECTION_SPECS.map((spec) => {
            const isBuilding = buildingSlug === spec.slug;
            const result = collectionResults[spec.slug];
            return (
              <div key={spec.slug} className="flex items-center justify-between gap-3 py-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-200">{spec.title}</p>
                  {result && <p className="text-xs text-gray-500 mt-0.5">{result}</p>}
                </div>
                <button
                  onClick={() => handleBuildCollection(spec)}
                  disabled={!!buildingSlug}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0"
                >
                  {isBuilding ? 'Building…' : 'Create'}
                </button>
              </div>
            );
          })}
        </div>
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
