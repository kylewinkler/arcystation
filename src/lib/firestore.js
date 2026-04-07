import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  setDoc, query, where, orderBy, serverTimestamp, increment,
  onSnapshot, writeBatch, arrayUnion, arrayRemove, deleteField,
} from 'firebase/firestore';
import { db } from './firebase';

// ── Lists ──

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

  // Create the new list
  const newListId = await createList({
    title: `${source.title} (copy)`,
    description: source.description || '',
    createdBy: newOwnerId,
  });

  // Copy all movies
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

  // Update counts + poster on the new list
  await updateDoc(doc(db, 'lists', newListId), {
    movieCount,
    ...(firstPoster && { firstPoster }),
    ...(source.featuredMovie && { featuredMovie: source.featuredMovie }),
  });

  // Auto-start for the new owner
  await startList(newOwnerId, newListId, source.title + ' (copy)', movieCount);

  return newListId;
}

export async function getList(listId) {
  const snap = await getDoc(doc(db, 'lists', listId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateList(listId, data) {
  await updateDoc(doc(db, 'lists', listId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function setFeaturedMovie(listId, movie) {
  if (movie) {
    await updateDoc(doc(db, 'lists', listId), {
      featuredMovie: { tmdbId: movie.tmdbId, posterPath: movie.posterPath || null },
    });
  } else {
    await updateDoc(doc(db, 'lists', listId), { featuredMovie: deleteField() });
  }
}

export async function deleteList(listId) {
  // Delete movies subcollection + list doc
  const moviesSnap = await getDocs(collection(db, 'lists', listId, 'movies'));
  const batch = writeBatch(db);
  moviesSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'lists', listId));
  await batch.commit();

  // Delete all userProgress docs (and their watched subcollections) for this list
  const progressSnap = await getDocs(query(collection(db, 'userProgress'), where('listId', '==', listId)));
  for (const progressDoc of progressSnap.docs) {
    const watchedSnap = await getDocs(collection(db, 'userProgress', progressDoc.id, 'watched'));
    if (!watchedSnap.empty) {
      const wBatch = writeBatch(db);
      watchedSnap.docs.forEach((d) => wBatch.delete(d.ref));
      await wBatch.commit();
    }
    await deleteDoc(progressDoc.ref);
  }
}

export function subscribeToList(listId, callback) {
  return onSnapshot(doc(db, 'lists', listId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
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
  // Sync totalCount for all users tracking this list
  const progressSnap = await getDocs(query(collection(db, 'userProgress'), where('listId', '==', listId)));
  if (!progressSnap.empty) {
    const batch = writeBatch(db);
    progressSnap.docs.forEach((d) => batch.update(d.ref, { totalCount: increment(1) }));
    await batch.commit();
  }
}

export async function removeMovieFromList(listId, tmdbId) {
  await deleteDoc(doc(db, 'lists', listId, 'movies', tmdbId));
  await updateDoc(doc(db, 'lists', listId), {
    movieCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  // Sync totalCount for all users tracking this list
  const progressSnap = await getDocs(query(collection(db, 'userProgress'), where('listId', '==', listId)));
  if (!progressSnap.empty) {
    const batch = writeBatch(db);
    progressSnap.docs.forEach((d) => batch.update(d.ref, { totalCount: increment(-1) }));
    await batch.commit();
  }
}

export async function getListMovies(listId) {
  const q = query(
    collection(db, 'lists', listId, 'movies'),
    orderBy('order')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ tmdbId: d.id, ...d.data() }));
}

export function subscribeToListMovies(listId, callback) {
  const q = query(
    collection(db, 'lists', listId, 'movies'),
    orderBy('order')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ tmdbId: d.id, ...d.data() })));
  });
}

// ── Progress ──

function progressDocId(uid, listId) {
  return `${uid}__${listId}`;
}

export async function startList(uid, listId, listTitle, totalCount) {
  const docId = progressDocId(uid, listId);
  await setDoc(doc(db, 'userProgress', docId), {
    uid,
    listId,
    listTitle,
    startedAt: serverTimestamp(),
    watchedCount: 0,
    totalCount,
  });
}

export async function getProgress(uid, listId) {
  const snap = await getDoc(doc(db, 'userProgress', progressDocId(uid, listId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function subscribeToProgress(uid, listId, callback) {
  return onSnapshot(doc(db, 'userProgress', progressDocId(uid, listId)), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function getUserAllProgress(uid) {
  const q = query(
    collection(db, 'userProgress'),
    where('uid', '==', uid)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getListStarters(listId) {
  const q = query(
    collection(db, 'userProgress'),
    where('listId', '==', listId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function markWatched(uid, listId, tmdbId, { rating, note, movieData } = {}) {
  const progressId = progressDocId(uid, listId);
  const watchRef = doc(db, 'userProgress', progressId, 'watched', tmdbId);
  // Per-list: just a flag
  await setDoc(watchRef, { watchedAt: serverTimestamp() });
  await updateDoc(doc(db, 'userProgress', progressId), {
    watchedCount: increment(1),
    lastActivityAt: serverTimestamp(),
  });
  // Global: rating/note/metadata all live here
  await markWatchedStandalone(uid, tmdbId, { rating, note, movieData });
}

export async function unmarkWatched(uid, listId, tmdbId) {
  const progressId = progressDocId(uid, listId);
  await deleteDoc(doc(db, 'userProgress', progressId, 'watched', tmdbId));
  await updateDoc(doc(db, 'userProgress', progressId), {
    watchedCount: increment(-1),
  });
  // Don't touch userWatched — the global review stays.
  // unmarkWatchedStandalone handles full removal from the movie page.
}

export async function getWatchedMovies(uid, listId) {
  const progressId = progressDocId(uid, listId);
  const snap = await getDocs(collection(db, 'userProgress', progressId, 'watched'));
  const map = {};
  snap.docs.forEach((d) => {
    map[d.id] = d.data();
  });
  return map;
}

export function subscribeToWatched(uid, listId, callback) {
  const progressId = progressDocId(uid, listId);
  return onSnapshot(collection(db, 'userProgress', progressId, 'watched'), (snap) => {
    const map = {};
    snap.docs.forEach((d) => {
      map[d.id] = d.data();
    });
    callback(map);
  });
}

// ── Standalone watched (no list) ──

export async function markWatchedStandalone(uid, tmdbId, { rating, note, movieData } = {}) {
  await setDoc(doc(db, 'userWatched', uid), { tmdbIds: arrayUnion(tmdbId) }, { merge: true });
  const entry = { watchedAt: serverTimestamp() };
  if (movieData) {
    entry.title = movieData.title || '';
    entry.year = movieData.year || '';
    entry.posterPath = movieData.posterPath || null;
    if (movieData.genreIds?.length > 0) entry.genreIds = movieData.genreIds;
  }
  if (rating != null) entry.rating = rating;
  if (note != null) entry.note = note;
  // Merge so we don't wipe fields set by a previous call
  const ref = doc(db, 'userWatched', uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data().movies?.[tmdbId] || {} : {};
  await updateDoc(ref, { [`movies.${tmdbId}`]: { ...existing, ...entry } });
}

export async function unmarkWatchedStandalone(uid, tmdbId) {
  await setDoc(doc(db, 'userWatched', uid), { tmdbIds: arrayRemove(tmdbId) }, { merge: true });
  try {
    await updateDoc(doc(db, 'userWatched', uid), { [`movies.${tmdbId}`]: deleteField() });
  } catch (e) { /* doc may not have movies map yet */ }
}

export async function getWatchedInfo(uid, tmdbId) {
  const snap = await getDoc(doc(db, 'userWatched', uid));
  if (!snap.exists()) return null;
  return snap.data().movies?.[tmdbId] || null;
}

// Get all tmdbIds a user has watched across ALL their lists (single doc read)
export async function getAllWatchedTmdbIds(uid) {
  const snap = await getDoc(doc(db, 'userWatched', uid));
  if (!snap.exists()) return new Set();
  return new Set(snap.data().tmdbIds || []);
}

// Get watched movies filtered by year (single doc read, no API calls)
export async function getAllWatchedMovies(uid) {
  const snap = await getDoc(doc(db, 'userWatched', uid));
  if (!snap.exists()) return [];
  const data = snap.data();
  const movies = data.movies || {};
  return Object.entries(movies).map(([tmdbId, m]) => ({ tmdbId, ...m }));
}

export async function getWatchedMoviesByYear(uid, year) {
  const snap = await getDoc(doc(db, 'userWatched', uid));
  if (!snap.exists()) return [];
  const data = snap.data();
  const movies = data.movies || {};
  return Object.entries(movies)
    .filter(([, m]) => String(m.year) === String(year))
    .map(([tmdbId, m]) => ({ tmdbId, ...m }));
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
}

export async function acceptFriendRequest(uid1, uid2) {
  const docId = friendshipId(uid1, uid2);
  await updateDoc(doc(db, 'friendships', docId), { status: 'accepted' });
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
  // Firestore doesn't support full-text search, so we load all users and filter client-side
  // Fine for <100 users
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
  // Get my friends
  const myFriendUids = await getFriends(uid);
  if (myFriendUids.length === 0) return [];

  // Get friends-of-friends
  const fofSets = await Promise.all(
    myFriendUids.map((fuid) => getFriends(fuid))
  );
  // Count how many mutual friends each person has
  const mutualCount = {};
  const myFriendSet = new Set(myFriendUids);
  fofSets.flat().forEach((fofUid) => {
    if (fofUid !== uid && !myFriendSet.has(fofUid)) {
      mutualCount[fofUid] = (mutualCount[fofUid] || 0) + 1;
    }
  });

  // Sort by mutual count descending, take top 5
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

// ── Public Share ──

export async function enablePublicShare(listId) {
  const slug = listId.slice(0, 8) + '-' + Date.now().toString(36);
  await updateDoc(doc(db, 'lists', listId), {
    isPublic: true,
    shareSlug: slug,
    updatedAt: serverTimestamp(),
  });
  return slug;
}

export async function disablePublicShare(listId) {
  await updateDoc(doc(db, 'lists', listId), {
    isPublic: false,
    shareSlug: null,
    updatedAt: serverTimestamp(),
  });
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
