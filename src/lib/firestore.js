import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  setDoc, query, where, orderBy, limit, serverTimestamp, increment,
  onSnapshot, writeBatch, arrayUnion, arrayRemove, deleteField,
} from 'firebase/firestore';
import { db } from './firebase';

// ── In-memory caches (per browser session) ──
// Invalidate on mutations; real-time subscriptions also refresh them.
const listCache = new Map();
const listMoviesCache = new Map();

function invalidateListCache(listId) {
  listCache.delete(listId);
  listMoviesCache.delete(listId);
}

// ── ID helpers ──

function memberDocId(uid, listId) {
  return `${uid}__${listId}`;
}

function watchedDocId(uid, listId, tmdbId) {
  return `${uid}__${listId}__${tmdbId}`;
}

function reviewDocId(uid, tmdbId) {
  return `${uid}__${tmdbId}`;
}

// ── Lists ──

export function getWatchlistId(uid) {
  return `watchlist__${uid}`;
}

export async function createWatchlist(uid) {
  const id = getWatchlistId(uid);
  await setDoc(doc(db, 'lists', id), {
    title: 'Watchlist',
    description: '',
    createdBy: uid,
    kind: 'watchlist',
    movieCount: 0,
    isPublic: false,
    shareSlug: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await startList(uid, id);
  return id;
}

export async function createList({ title, description, createdBy }) {
  const ref = await addDoc(collection(db, 'lists'), {
    title,
    description,
    createdBy,
    movieCount: 0,
    isPublic: false,
    shareSlug: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function copyList(sourceListId, newOwnerId) {
  const sourceSnap = await getDoc(doc(db, 'lists', sourceListId));
  if (!sourceSnap.exists()) throw new Error('Source list not found');
  const source = sourceSnap.data();

  const newListId = await createList({
    title: `${source.title} (copy)`,
    description: source.description || '',
    createdBy: newOwnerId,
  });

  const moviesSnap = await getDocs(collection(db, 'lists', sourceListId, 'movies'));
  let movieCount = 0;
  let firstPoster = null;
  for (const mDoc of moviesSnap.docs) {
    const m = mDoc.data();
    await setDoc(doc(db, 'lists', newListId, 'movies', mDoc.id), {
      ...m,
      addedAt: serverTimestamp(),
    });
    movieCount++;
    if (!firstPoster && m.posterPath) firstPoster = m.posterPath;
  }

  await updateDoc(doc(db, 'lists', newListId), {
    movieCount,
    ...(firstPoster && { firstPoster }),
    ...(source.featuredMovie && { featuredMovie: source.featuredMovie }),
  });

  await startList(newOwnerId, newListId);
  return newListId;
}

export async function getList(listId) {
  if (listCache.has(listId)) return listCache.get(listId);
  const snap = await getDoc(doc(db, 'lists', listId));
  const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  listCache.set(listId, data);
  return data;
}

export async function getPrebuiltLists() {
  const q = query(
    collection(db, 'lists'),
    where('isPrebuilt', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateList(listId, data) {
  const existing = await getDoc(doc(db, 'lists', listId));
  if (existing.exists() && existing.data().kind === 'watchlist') {
    throw new Error('The default Watchlist cannot be edited.');
  }
  await updateDoc(doc(db, 'lists', listId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
  invalidateListCache(listId);
}

export async function setFeaturedMovie(listId, movie) {
  if (movie) {
    await updateDoc(doc(db, 'lists', listId), {
      featuredMovie: { tmdbId: movie.tmdbId, posterPath: movie.posterPath || null },
    });
  } else {
    await updateDoc(doc(db, 'lists', listId), { featuredMovie: deleteField() });
  }
  invalidateListCache(listId);
}

export async function deleteList(listId) {
  const existing = await getDoc(doc(db, 'lists', listId));
  if (existing.exists() && existing.data().kind === 'watchlist') {
    throw new Error('The default Watchlist cannot be deleted.');
  }
  // Delete movies subcollection + list doc
  const moviesSnap = await getDocs(collection(db, 'lists', listId, 'movies'));
  const batch = writeBatch(db);
  moviesSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'lists', listId));
  await batch.commit();

  // Delete all listMembers for this list
  const membersSnap = await getDocs(query(collection(db, 'listMembers'), where('listId', '==', listId)));
  for (const memberDoc of membersSnap.docs) {
    await deleteDoc(memberDoc.ref);
  }

  // Delete all listWatched for this list
  const watchedSnap = await getDocs(query(collection(db, 'listWatched'), where('listId', '==', listId)));
  if (!watchedSnap.empty) {
    const wBatch = writeBatch(db);
    watchedSnap.docs.forEach((d) => wBatch.delete(d.ref));
    await wBatch.commit();
  }
  invalidateListCache(listId);
}

export function subscribeToList(listId, callback) {
  return onSnapshot(doc(db, 'lists', listId), (snap) => {
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    listCache.set(listId, data);
    callback(data);
  });
}

export async function getUserLists(uid) {
  const q = query(
    collection(db, 'lists'),
    where('createdBy', '==', uid)
  );
  const snap = await getDocs(q);
  const lists = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  lists.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return lists;
}

// ── Movies in a List ──

export async function addMovieToList(listId, movie) {
  const movieRef = doc(db, 'lists', listId, 'movies', movie.tmdbId);
  await setDoc(movieRef, {
    title: movie.title,
    posterPath: movie.posterPath,
    year: movie.year,
    releaseDate: movie.releaseDate || movie.release_date || null,
    overview: movie.overview,
    order: movie.order || 0,
    ...(movie.genreIds?.length > 0 && { genreIds: movie.genreIds }),
    addedAt: serverTimestamp(),
  });
  const listSnap = await getDoc(doc(db, 'lists', listId));
  const listData = listSnap.data();
  const updates = { movieCount: increment(1), updatedAt: serverTimestamp() };
  if (!listData.firstPoster && movie.posterPath) {
    updates.firstPoster = movie.posterPath;
  }
  await updateDoc(doc(db, 'lists', listId), updates);
  invalidateListCache(listId);
}

export async function removeMovieFromList(listId, tmdbId) {
  await deleteDoc(doc(db, 'lists', listId, 'movies', tmdbId));
  await updateDoc(doc(db, 'lists', listId), {
    movieCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  invalidateListCache(listId);
}

export async function getListMovies(listId) {
  if (listMoviesCache.has(listId)) return listMoviesCache.get(listId);
  const q = query(
    collection(db, 'lists', listId, 'movies'),
    orderBy('order')
  );
  const snap = await getDocs(q);
  const movies = snap.docs.map((d) => ({ tmdbId: d.id, ...d.data() }));
  listMoviesCache.set(listId, movies);
  return movies;
}

export function subscribeToListMovies(listId, callback) {
  const q = query(
    collection(db, 'lists', listId, 'movies'),
    orderBy('order')
  );
  return onSnapshot(q, (snap) => {
    const movies = snap.docs.map((d) => ({ tmdbId: d.id, ...d.data() }));
    listMoviesCache.set(listId, movies);
    callback(movies);
  });
}

// ── List Membership ──

export async function startList(uid, listId) {
  const docId = memberDocId(uid, listId);
  const ref = doc(db, 'listMembers', docId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await updateDoc(ref, { lastActivityAt: serverTimestamp() });
    return;
  }
  await setDoc(ref, {
    uid,
    listId,
    watchedCount: 0,
    joinedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  });
}

export async function getProgress(uid, listId) {
  const snap = await getDoc(doc(db, 'listMembers', memberDocId(uid, listId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function subscribeToProgress(uid, listId, callback) {
  return onSnapshot(doc(db, 'listMembers', memberDocId(uid, listId)), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// Lazy backfill: count watched docs + write back to member doc so future reads are free.
async function backfillWatchedCount(member) {
  const watchedSnap = await getDocs(query(
    collection(db, 'listWatched'),
    where('uid', '==', member.uid),
    where('listId', '==', member.listId)
  ));
  const count = watchedSnap.size;
  updateDoc(doc(db, 'listMembers', member.id), { watchedCount: count }).catch(() => {});
  return count;
}

export async function getUserAllProgress(uid) {
  const q = query(
    collection(db, 'listMembers'),
    where('uid', '==', uid)
  );
  const snap = await getDocs(q);
  const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return Promise.all(members.map(async (m) => {
    if (m.watchedCount !== undefined) return m;
    return { ...m, watchedCount: await backfillWatchedCount(m) };
  }));
}

// One-time heal for users whose watchedCount fields were corrupted by the
// earlier increment-on-missing-field bug. Called once per session from Home.
export async function reconcileUserWatchedCounts(uid) {
  const q = query(collection(db, 'listMembers'), where('uid', '==', uid));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(async (d) => {
    const { listId } = d.data();
    const watchedSnap = await getDocs(query(
      collection(db, 'listWatched'),
      where('uid', '==', uid),
      where('listId', '==', listId)
    ));
    if (d.data().watchedCount !== watchedSnap.size) {
      await updateDoc(d.ref, { watchedCount: watchedSnap.size });
    }
  }));
}

export async function getListStarters(listId) {
  const q = query(
    collection(db, 'listMembers'),
    where('listId', '==', listId)
  );
  const snap = await getDocs(q);
  const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return Promise.all(members.map(async (m) => {
    if (m.watchedCount !== undefined) return m;
    return { ...m, watchedCount: await backfillWatchedCount(m) };
  }));
}

// ── Per-list Watched ──

// Recount from source of truth and write to listMembers doc.
// Called after any mutation that changes watched state so the denormalized
// count always matches reality — even if the field was missing or corrupted
// by a prior increment-on-missing-field.
async function syncWatchedCount(uid, listId, extraMemberUpdates = {}) {
  const watchedSnap = await getDocs(query(
    collection(db, 'listWatched'),
    where('uid', '==', uid),
    where('listId', '==', listId)
  ));
  await updateDoc(doc(db, 'listMembers', memberDocId(uid, listId)), {
    ...extraMemberUpdates,
    watchedCount: watchedSnap.size,
  });
}

export async function markWatched(uid, listId, tmdbId, { rating, note, movieData } = {}) {
  const watchedRef = doc(db, 'listWatched', watchedDocId(uid, listId, tmdbId));
  await setDoc(watchedRef, {
    uid,
    listId,
    tmdbId,
    watchedAt: serverTimestamp(),
  });
  await syncWatchedCount(uid, listId, { lastActivityAt: serverTimestamp() });
  await markWatchedStandalone(uid, tmdbId, { rating, note, movieData });
}

export async function bulkMarkWatchedFromReviews(uid, listId, tmdbIds) {
  const batch = writeBatch(db);
  for (const tmdbId of tmdbIds) {
    batch.set(doc(db, 'listWatched', watchedDocId(uid, listId, tmdbId)), {
      uid,
      listId,
      tmdbId,
      watchedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  await syncWatchedCount(uid, listId, { lastActivityAt: serverTimestamp() });
}

export async function unmarkWatched(uid, listId, tmdbId) {
  const watchedRef = doc(db, 'listWatched', watchedDocId(uid, listId, tmdbId));
  const existing = await getDoc(watchedRef);
  if (!existing.exists()) return;
  await deleteDoc(watchedRef);
  await syncWatchedCount(uid, listId);
  // Don't touch review — it stays
}

export async function getWatchedMovies(uid, listId) {
  const q = query(
    collection(db, 'listWatched'),
    where('uid', '==', uid),
    where('listId', '==', listId)
  );
  const snap = await getDocs(q);
  const map = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    map[data.tmdbId] = data;
  });
  return map;
}

export function subscribeToWatched(uid, listId, callback) {
  const q = query(
    collection(db, 'listWatched'),
    where('uid', '==', uid),
    where('listId', '==', listId)
  );
  return onSnapshot(q, (snap) => {
    const map = {};
    snap.docs.forEach((d) => {
      const data = d.data();
      map[data.tmdbId] = data;
    });
    callback(map);
  });
}

// ── Reviews (global watched) ──

export async function markWatchedStandalone(uid, tmdbId, { rating, note, movieData, clearReactions = false } = {}) {
  const docId = reviewDocId(uid, tmdbId);
  const ref = doc(db, 'reviews', docId);
  const prev = await getDoc(ref);
  const prevRating = prev.exists() ? (prev.data().rating ?? null) : null;
  const newRating = rating ?? null;

  const entry = { uid, tmdbId, watchedAt: serverTimestamp() };
  if (movieData) {
    entry.title = movieData.title || '';
    entry.year = movieData.year || '';
    entry.posterPath = movieData.posterPath || null;
    if (movieData.genreIds?.length > 0) entry.genreIds = movieData.genreIds;
  }
  if (rating !== undefined) entry.rating = rating > 0 ? rating : deleteField();
  if (note != null) entry.note = note;
  if (prev.exists() && (prevRating !== newRating || clearReactions)) {
    entry.reactions = deleteField();
  }
  await setDoc(ref, entry, { merge: true });
  await recomputeMovieStats(tmdbId).catch(() => {});

  // Auto-remove from the user's Watchlist on first-ever watch. Rewatches
  // (where a review already existed) leave the watchlist alone — the user
  // intentionally re-added a previously-watched movie and can take it off
  // manually when done.
  if (!prev.exists()) {
    const watchlistMovieRef = doc(db, 'lists', getWatchlistId(uid), 'movies', tmdbId);
    const watchlistMovieSnap = await getDoc(watchlistMovieRef);
    if (watchlistMovieSnap.exists()) {
      await removeMovieFromList(getWatchlistId(uid), tmdbId);
    }
  }

  await syncWatchedAcrossUserLists(uid, tmdbId);
}

// On a mark-watched, mirror the watched state to every other list the user
// tracks that contains this movie and currently has it unwatched. Lists where
// the movie is already watched are left alone, and lists the user doesn't
// track are ignored.
async function syncWatchedAcrossUserLists(uid, tmdbId) {
  const membersSnap = await getDocs(query(
    collection(db, 'listMembers'),
    where('uid', '==', uid)
  ));
  if (membersSnap.empty) return;

  const listIds = membersSnap.docs.map((d) => d.data().listId);
  const newlyWatchedListIds = [];

  await Promise.all(listIds.map(async (listId) => {
    const movieSnap = await getDoc(doc(db, 'lists', listId, 'movies', tmdbId));
    if (!movieSnap.exists()) return;
    const watchedRef = doc(db, 'listWatched', watchedDocId(uid, listId, tmdbId));
    const watchedSnap = await getDoc(watchedRef);
    if (watchedSnap.exists()) return;
    await setDoc(watchedRef, {
      uid,
      listId,
      tmdbId,
      watchedAt: serverTimestamp(),
    });
    newlyWatchedListIds.push(listId);
  }));

  await Promise.all(newlyWatchedListIds.map((listId) =>
    syncWatchedCount(uid, listId, { lastActivityAt: serverTimestamp() })
  ));
}

export async function unmarkWatchedStandalone(uid, tmdbId) {
  const docId = reviewDocId(uid, tmdbId);
  await deleteDoc(doc(db, 'reviews', docId));
  await recomputeMovieStats(tmdbId).catch(() => {});

  // Cascade: remove per-list watched entries so lists don't keep checking the movie.
  const snap = await getDocs(query(
    collection(db, 'listWatched'),
    where('uid', '==', uid),
    where('tmdbId', '==', tmdbId)
  ));
  if (snap.empty) return;
  const affectedListIds = new Set();
  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.delete(d.ref);
    affectedListIds.add(d.data().listId);
  });
  await batch.commit();
  await Promise.all([...affectedListIds].map((listId) => syncWatchedCount(uid, listId)));
}

export async function getWatchedInfo(uid, tmdbId) {
  const docId = reviewDocId(uid, tmdbId);
  const snap = await getDoc(doc(db, 'reviews', docId));
  return snap.exists() ? snap.data() : null;
}

export async function getAllWatchedTmdbIds(uid) {
  const q = query(collection(db, 'reviews'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return new Set(snap.docs.map((d) => d.data().tmdbId));
}

export async function getAllWatchedMovies(uid, limitCount) {
  const base = [collection(db, 'reviews'), where('uid', '==', uid), orderBy('watchedAt', 'desc')];
  const q = limitCount ? query(...base, limit(limitCount)) : query(...base);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getWatchedMoviesByYear(uid, year) {
  const all = await getAllWatchedMovies(uid);
  return all.filter((m) => String(m.year) === String(year));
}

// ── Hype (pre-watch ratings) ──
// Doc id: `${uid}__${tmdbId}`. A user's hype rating for a movie they
// haven't reviewed yet. Frozen once a review exists — the modal hides
// the editor, but the doc stays so it reappears on unmark.

export async function getHype(uid, tmdbId) {
  const snap = await getDoc(doc(db, 'hypes', reviewDocId(uid, tmdbId)));
  return snap.exists() ? snap.data() : null;
}

export async function setHype(uid, tmdbId, hype, movieData) {
  const ref = doc(db, 'hypes', reviewDocId(uid, tmdbId));
  const entry = {
    uid,
    tmdbId,
    hype,
    hypedAt: serverTimestamp(),
  };
  if (movieData) {
    entry.title = movieData.title || '';
    entry.year = movieData.year || '';
    entry.posterPath = movieData.posterPath || null;
    if (movieData.genreIds?.length > 0) entry.genreIds = movieData.genreIds;
  }
  await setDoc(ref, entry, { merge: true });
}

export async function deleteHype(uid, tmdbId) {
  await deleteDoc(doc(db, 'hypes', reviewDocId(uid, tmdbId)));
}

// ── Movie plots (cached from Wikipedia) ──

export async function getMoviePlot(tmdbId) {
  const snap = await getDoc(doc(db, 'moviePlots', String(tmdbId)));
  return snap.exists() ? snap.data() : null;
}

export async function saveMoviePlot(tmdbId, data) {
  await setDoc(doc(db, 'moviePlots', String(tmdbId)), {
    ...data,
    fetchedAt: serverTimestamp(),
  });
}

export async function deleteMoviePlot(tmdbId) {
  await deleteDoc(doc(db, 'moviePlots', String(tmdbId)));
}

export async function setReviewReaction(reviewerUid, tmdbId, reactorUid, type, movieMeta = {}) {
  const docId = reviewDocId(reviewerUid, tmdbId);
  const ref = doc(db, 'reviews', docId);

  if (type === null) {
    await updateDoc(ref, { [`reactions.${reactorUid}`]: deleteField() });
    return;
  }

  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data().reactions?.[reactorUid] : undefined;
  await updateDoc(ref, { [`reactions.${reactorUid}`]: type });

  if (prev !== type && reactorUid !== reviewerUid) {
    await createNotification('review_reaction', reactorUid, reviewerUid, {
      reaction: type,
      tmdbId: String(tmdbId),
      movieTitle: movieMeta.movieTitle || null,
      posterPath: movieMeta.posterPath || null,
    });
  }
}

export async function getReactionsForReviews(reviewRefs) {
  const snaps = await Promise.all(
    reviewRefs.map(({ reviewerUid, tmdbId }) =>
      getDoc(doc(db, 'reviews', reviewDocId(reviewerUid, tmdbId)))
    )
  );
  const result = {};
  snaps.forEach((snap, i) => {
    const { reviewerUid, tmdbId } = reviewRefs[i];
    result[`${reviewerUid}__${tmdbId}`] = snap.exists() ? (snap.data().reactions || {}) : {};
  });
  return result;
}

// ── Movie review aggregates ──
// Per-movie aggregate doc at `movieStats/{tmdbId}` storing { scorePct, count,
// totalReviews }. Recomputed by clients after every review write/delete (see
// markWatchedStandalone / unmarkWatchedStandalone). Reads are cached in
// memory per session to keep card grids cheap.

const movieStatsCache = new Map();
const EMPTY_STATS = { count: 0, scorePct: null, totalReviews: 0 };

export async function recomputeMovieStats(tmdbId) {
  const id = String(tmdbId);
  const snap = await getDocs(query(
    collection(db, 'reviews'),
    where('tmdbId', '==', id)
  ));
  const all = snap.docs.map((d) => d.data());
  const rated = all.filter((r) => r.rating > 0);
  const stats = rated.length === 0
    ? { count: 0, scorePct: null, totalReviews: all.length }
    : {
        count: rated.length,
        scorePct: Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 20),
        totalReviews: all.length,
      };
  await setDoc(doc(db, 'movieStats', id), { ...stats, updatedAt: serverTimestamp() });
  movieStatsCache.set(id, stats);
  return stats;
}

export async function getMovieReviewStats(tmdbId) {
  const id = String(tmdbId);
  if (movieStatsCache.has(id)) return movieStatsCache.get(id);
  const snap = await getDoc(doc(db, 'movieStats', id));
  const stats = snap.exists()
    ? { count: snap.data().count || 0, scorePct: snap.data().scorePct ?? null, totalReviews: snap.data().totalReviews || 0 }
    : EMPTY_STATS;
  movieStatsCache.set(id, stats);
  return stats;
}

// Batch-fetch stats for many tmdbIds. Returns Map<tmdbId, stats>. Cached
// entries are returned without a fetch. Same total read cost as N getDocs
// (1 read per movie that has a stats doc, plus uncached missing docs).
export async function getMovieStatsBatch(tmdbIds) {
  const result = new Map();
  const need = [];
  for (const raw of tmdbIds) {
    const id = String(raw);
    if (movieStatsCache.has(id)) {
      result.set(id, movieStatsCache.get(id));
    } else if (!need.includes(id)) {
      need.push(id);
    }
  }
  if (need.length === 0) return result;

  const snaps = await Promise.all(
    need.map((id) => getDoc(doc(db, 'movieStats', id)))
  );
  snaps.forEach((snap, i) => {
    const id = need[i];
    const stats = snap.exists()
      ? {
          count: snap.data().count || 0,
          scorePct: snap.data().scorePct ?? null,
          totalReviews: snap.data().totalReviews || 0,
        }
      : EMPTY_STATS;
    movieStatsCache.set(id, stats);
    result.set(id, stats);
  });
  return result;
}

// One-time backfill: walks the entire reviews collection, groups by tmdbId,
// and writes a movieStats doc for each unique tmdbId. Safe to re-run.
export async function backfillMovieStats() {
  const snap = await getDocs(collection(db, 'reviews'));
  const byMovie = new Map();
  snap.docs.forEach((d) => {
    const r = d.data();
    if (!r.tmdbId) return;
    const id = String(r.tmdbId);
    if (!byMovie.has(id)) byMovie.set(id, []);
    byMovie.get(id).push(r);
  });

  let written = 0;
  for (const [id, reviews] of byMovie) {
    const rated = reviews.filter((r) => r.rating > 0);
    const stats = rated.length === 0
      ? { count: 0, scorePct: null, totalReviews: reviews.length }
      : {
          count: rated.length,
          scorePct: Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 20),
          totalReviews: reviews.length,
        };
    await setDoc(doc(db, 'movieStats', id), { ...stats, updatedAt: serverTimestamp() });
    movieStatsCache.set(id, stats);
    written++;
  }
  return { processed: snap.size, movies: written };
}

// Site-wide reviews for a movie, with reviewer profiles attached. Sorted by
// watchedAt desc client-side (no composite index needed). Reviews whose user
// doc is missing get a stub profile so the count stays consistent with
// movieStats (which doesn't filter by profile existence).
export async function getMovieReviews(tmdbId) {
  const snap = await getDocs(query(
    collection(db, 'reviews'),
    where('tmdbId', '==', String(tmdbId))
  ));
  const reviews = snap.docs.map((d) => d.data());
  if (reviews.length === 0) return [];

  const profiles = await Promise.all(reviews.map((r) => getUserProfile(r.uid)));
  return reviews
    .map((review, i) => ({
      review,
      profile: profiles[i] || { uid: review.uid, displayName: 'Unknown', photoURL: null },
    }))
    .sort((a, b) => (b.review.watchedAt?.seconds || 0) - (a.review.watchedAt?.seconds || 0));
}

// Most recent reviews across the whole site, with reviewer profiles + movie
// stats attached. Powers the public "Recent Reviews" strip on Home.
export async function getRecentSiteReviews(max = 12) {
  const snap = await getDocs(query(
    collection(db, 'reviews'),
    orderBy('watchedAt', 'desc'),
    limit(max)
  ));
  const reviews = snap.docs.map((d) => d.data());
  if (reviews.length === 0) return [];

  const uniqueTmdbIds = [...new Set(reviews.map((r) => String(r.tmdbId)))];
  const [profiles, statsList] = await Promise.all([
    Promise.all(reviews.map((r) => getUserProfile(r.uid))),
    Promise.all(uniqueTmdbIds.map((id) => getMovieReviewStats(id).catch(() => null))),
  ]);
  const statsByTmdb = Object.fromEntries(uniqueTmdbIds.map((id, i) => [id, statsList[i]]));

  return reviews.map((review, i) => ({
    review,
    profile: profiles[i] || { uid: review.uid, displayName: 'Unknown', photoURL: null },
    stats: statsByTmdb[String(review.tmdbId)] || null,
  }));
}

export async function getFriendReviewsForMovie(uid, tmdbId) {
  const friendUids = await getFriends(uid);
  if (friendUids.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < friendUids.length; i += 30) {
    chunks.push(friendUids.slice(i, i + 30));
  }

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(
        query(
          collection(db, 'reviews'),
          where('tmdbId', '==', String(tmdbId)),
          where('uid', 'in', chunk)
        )
      )
    )
  );

  const reviews = [];
  snaps.forEach((snap) => snap.docs.forEach((d) => reviews.push(d.data())));
  if (reviews.length === 0) return [];

  const profiles = await Promise.all(reviews.map((r) => getUserProfile(r.uid)));
  return reviews
    .map((review, i) => ({ review, profile: profiles[i] }))
    .filter((r) => r.profile)
    .sort((a, b) => (b.review.watchedAt?.seconds || 0) - (a.review.watchedAt?.seconds || 0));
}

// Throwback pick — a review from roughly one year ago today, within a ±2 week
// window so we don't miss when activity was sparse on the exact date.
export async function getThrowbackReview(uid) {
  const now = new Date();
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() - 14);
  const end = new Date(now);
  end.setFullYear(end.getFullYear() - 1);
  end.setDate(end.getDate() + 14);

  const q = query(
    collection(db, 'reviews'),
    where('uid', '==', uid),
    where('watchedAt', '>=', start),
    where('watchedAt', '<=', end),
    orderBy('watchedAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── Friendships ──

function friendshipId(uid1, uid2) {
  return [uid1, uid2].sort().join('__');
}

export async function sendFriendRequest(fromUid, toUid) {
  const [uid1, uid2] = [fromUid, toUid].sort();
  const docId = friendshipId(fromUid, toUid);
  await setDoc(doc(db, 'friendships', docId), {
    uid1,
    uid2,
    status: 'pending',
    requestedBy: fromUid,
    createdAt: serverTimestamp(),
  });
  await createNotification('friend_request', fromUid, toUid, {});
}

export async function acceptFriendRequest(uid1, uid2) {
  const docId = friendshipId(uid1, uid2);
  const docRef = doc(db, 'friendships', docId);
  const snap = await getDoc(docRef);
  await updateDoc(docRef, { status: 'accepted' });
  if (snap.exists() && snap.data().status !== 'accepted') {
    const { requestedBy } = snap.data();
    const acceptedBy = uid1 === requestedBy ? uid2 : uid1;
    await createNotification('friend_accepted', acceptedBy, requestedBy, {});
    await clearFriendRequestNotifications(requestedBy, acceptedBy);
  }
}

export async function removeFriend(uid1, uid2) {
  const docId = friendshipId(uid1, uid2);
  await deleteDoc(doc(db, 'friendships', docId));
}

export async function getFriendship(uid1, uid2) {
  const docId = friendshipId(uid1, uid2);
  const snap = await getDoc(doc(db, 'friendships', docId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getFriends(uid) {
  const q1 = query(
    collection(db, 'friendships'),
    where('uid1', '==', uid),
    where('status', '==', 'accepted')
  );
  const q2 = query(
    collection(db, 'friendships'),
    where('uid2', '==', uid),
    where('status', '==', 'accepted')
  );
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const friendUids = [];
  snap1.docs.forEach((d) => friendUids.push(d.data().uid2));
  snap2.docs.forEach((d) => friendUids.push(d.data().uid1));
  return friendUids;
}

export async function getFriendshipsWithMeta(uid) {
  const q1 = query(
    collection(db, 'friendships'),
    where('uid1', '==', uid),
    where('status', '==', 'accepted')
  );
  const q2 = query(
    collection(db, 'friendships'),
    where('uid2', '==', uid),
    where('status', '==', 'accepted')
  );
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  const result = [];
  snap1.docs.forEach((d) => result.push({ uid: d.data().uid2, createdAt: d.data().createdAt }));
  snap2.docs.forEach((d) => result.push({ uid: d.data().uid1, createdAt: d.data().createdAt }));
  return result;
}

export async function getPendingRequests(uid) {
  const q1 = query(
    collection(db, 'friendships'),
    where('uid1', '==', uid),
    where('status', '==', 'pending')
  );
  const q2 = query(
    collection(db, 'friendships'),
    where('uid2', '==', uid),
    where('status', '==', 'pending')
  );
  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  return [...snap1.docs, ...snap2.docs].map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUserByEmail(email) {
  const q = query(collection(db, 'users'), where('email', '==', email));
  const snap = await getDocs(q);
  return snap.empty ? null : { uid: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function searchUsersByName(searchTerm) {
  const snap = await getDocs(collection(db, 'users'));
  const term = searchTerm.toLowerCase();
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter(
      (u) =>
        u.displayName?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
}

export async function getSuggestedFriends(uid) {
  const myFriendUids = await getFriends(uid);
  if (myFriendUids.length === 0) return [];

  const fofSets = await Promise.all(
    myFriendUids.map((fuid) => getFriends(fuid))
  );
  const mutualCount = {};
  const myFriendSet = new Set(myFriendUids);
  fofSets.flat().forEach((fofUid) => {
    if (fofUid !== uid && !myFriendSet.has(fofUid)) {
      mutualCount[fofUid] = (mutualCount[fofUid] || 0) + 1;
    }
  });

  const sorted = Object.entries(mutualCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const profiles = await Promise.all(
    sorted.map(async ([suggestedUid, count]) => {
      const profile = await getUserProfile(suggestedUid);
      return profile ? { ...profile, mutualCount: count } : null;
    })
  );
  return profiles.filter(Boolean);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

// Owner-only profile patch — used today for the privacy toggle.
export async function updateUserProfile(uid, patch) {
  await updateDoc(doc(db, 'users', uid), patch);
}

// ── User Settings (pinned lists etc.) ──

export async function getPinnedLists(uid) {
  const snap = await getDoc(doc(db, 'userSettings', uid));
  if (!snap.exists()) return [];
  return snap.data().pinnedLists || [];
}

export async function pinList(uid, listId) {
  await setDoc(doc(db, 'userSettings', uid), {
    pinnedLists: arrayUnion(listId),
  }, { merge: true });
}

export async function unpinList(uid, listId) {
  await setDoc(doc(db, 'userSettings', uid), {
    pinnedLists: arrayRemove(listId),
  }, { merge: true });
}

// ── List Sorting ──

export function sortLists(lists, pinnedIds) {
  return [...lists].sort((a, b) => {
    const aWatchlist = a.list?.kind === 'watchlist' ? 1 : 0;
    const bWatchlist = b.list?.kind === 'watchlist' ? 1 : 0;
    if (aWatchlist !== bWatchlist) return bWatchlist - aWatchlist;
    const aPinned = pinnedIds.has(a.listId) ? 1 : 0;
    const bPinned = pinnedIds.has(b.listId) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const aTime = a.lastActivityAt?.seconds || a.joinedAt?.seconds || 0;
    const bTime = b.lastActivityAt?.seconds || b.joinedAt?.seconds || 0;
    return bTime - aTime;
  });
}

// ── Public Share ──

export async function enablePublicShare(listId) {
  const slug = listId.slice(0, 8) + '-' + Date.now().toString(36);
  await updateDoc(doc(db, 'lists', listId), {
    isPublic: true,
    shareSlug: slug,
    updatedAt: serverTimestamp(),
  });
  invalidateListCache(listId);
  return slug;
}

export async function disablePublicShare(listId) {
  await updateDoc(doc(db, 'lists', listId), {
    isPublic: false,
    shareSlug: null,
    updatedAt: serverTimestamp(),
  });
  invalidateListCache(listId);
}

export async function getListBySlug(slug) {
  const q = query(
    collection(db, 'lists'),
    where('shareSlug', '==', slug),
    where('isPublic', '==', true)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── List Invites ──

export async function sendListInvite(fromUid, toUid, listId, listTitle) {
  await addDoc(collection(db, 'listInvites'), {
    fromUid,
    toUid,
    listId,
    listTitle,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function getPendingListInvites(uid) {
  const q = query(
    collection(db, 'listInvites'),
    where('toUid', '==', uid),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPendingInvitesForList(listId) {
  const q = query(
    collection(db, 'listInvites'),
    where('listId', '==', listId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function acceptListInvite(inviteId, uid, listId) {
  await updateDoc(doc(db, 'listInvites', inviteId), { status: 'accepted' });
  await startList(uid, listId);
  const list = await getList(listId);
  if (list?.createdBy && list.createdBy !== uid) {
    await createNotification('joined_list', uid, list.createdBy, { listTitle: list.title, listId });
  }
}

export async function declineListInvite(inviteId) {
  await updateDoc(doc(db, 'listInvites', inviteId), { status: 'declined' });
}

// ── Notifications ──

export async function createNotification(type, fromUid, toUid, data = {}) {
  await addDoc(collection(db, 'notifications'), {
    type,
    fromUid,
    toUid,
    data,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function notifyFriends(uid, type, data = {}) {
  const friendUids = await getFriends(uid);
  await Promise.all(
    friendUids.map((friendUid) => createNotification(type, uid, friendUid, data))
  );
}

export async function getNotifications(uid) {
  const q = query(
    collection(db, 'notifications'),
    where('toUid', '==', uid)
  );
  const snap = await getDocs(q);
  const notifs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  notifs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return notifs;
}

export function subscribeToUnreadNotificationCount(uid, callback) {
  const q = query(
    collection(db, 'notifications'),
    where('toUid', '==', uid),
    where('read', '==', false)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.size);
  });
}

export async function markAllNotificationsRead(uid) {
  const q = query(
    collection(db, 'notifications'),
    where('toUid', '==', uid),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

export async function deleteNotification(notificationId) {
  await deleteDoc(doc(db, 'notifications', notificationId));
}

export async function clearFriendRequestNotifications(fromUid, toUid) {
  const q = query(
    collection(db, 'notifications'),
    where('type', '==', 'friend_request'),
    where('fromUid', '==', fromUid),
    where('toUid', '==', toUid)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
