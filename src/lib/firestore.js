import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  setDoc, query, where, orderBy, serverTimestamp, increment,
  onSnapshot, writeBatch, arrayUnion, arrayRemove, deleteField,
} from 'firebase/firestore';
import { db } from './firebase';

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
  const snap = await getDoc(doc(db, 'lists', listId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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
}

export async function removeMovieFromList(listId, tmdbId) {
  await deleteDoc(doc(db, 'lists', listId, 'movies', tmdbId));
  await updateDoc(doc(db, 'lists', listId), {
    movieCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
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

// ── List Membership ──

export async function startList(uid, listId) {
  const docId = memberDocId(uid, listId);
  await setDoc(doc(db, 'listMembers', docId), {
    uid,
    listId,
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

export async function getUserAllProgress(uid) {
  const q = query(
    collection(db, 'listMembers'),
    where('uid', '==', uid)
  );
  const snap = await getDocs(q);
  const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Compute watchedCount for each membership
  const enriched = await Promise.all(
    members.map(async (m) => {
      const watchedSnap = await getDocs(query(
        collection(db, 'listWatched'),
        where('uid', '==', uid),
        where('listId', '==', m.listId)
      ));
      return { ...m, watchedCount: watchedSnap.size };
    })
  );
  return enriched;
}

export async function getListStarters(listId) {
  const q = query(
    collection(db, 'listMembers'),
    where('listId', '==', listId)
  );
  const snap = await getDocs(q);
  const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Compute watchedCount for each member
  const enriched = await Promise.all(
    members.map(async (m) => {
      const watchedSnap = await getDocs(query(
        collection(db, 'listWatched'),
        where('uid', '==', m.uid),
        where('listId', '==', listId)
      ));
      return { ...m, watchedCount: watchedSnap.size };
    })
  );
  return enriched;
}

// ── Per-list Watched ──

export async function markWatched(uid, listId, tmdbId, { rating, note, movieData } = {}) {
  const docId = watchedDocId(uid, listId, tmdbId);
  await setDoc(doc(db, 'listWatched', docId), {
    uid,
    listId,
    tmdbId,
    watchedAt: serverTimestamp(),
  });
  // Update lastActivityAt on membership
  await updateDoc(doc(db, 'listMembers', memberDocId(uid, listId)), {
    lastActivityAt: serverTimestamp(),
  });
  // Global review
  await markWatchedStandalone(uid, tmdbId, { rating, note, movieData });
}

export async function unmarkWatched(uid, listId, tmdbId) {
  const docId = watchedDocId(uid, listId, tmdbId);
  await deleteDoc(doc(db, 'listWatched', docId));
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

export async function markWatchedStandalone(uid, tmdbId, { rating, note, movieData } = {}) {
  const docId = reviewDocId(uid, tmdbId);
  const entry = { uid, tmdbId, watchedAt: serverTimestamp() };
  if (movieData) {
    entry.title = movieData.title || '';
    entry.year = movieData.year || '';
    entry.posterPath = movieData.posterPath || null;
    if (movieData.genreIds?.length > 0) entry.genreIds = movieData.genreIds;
  }
  if (rating != null) entry.rating = rating;
  if (note != null) entry.note = note;
  await setDoc(doc(db, 'reviews', docId), entry, { merge: true });
}

export async function unmarkWatchedStandalone(uid, tmdbId) {
  const docId = reviewDocId(uid, tmdbId);
  await deleteDoc(doc(db, 'reviews', docId));
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

export async function getAllWatchedMovies(uid) {
  const q = query(collection(db, 'reviews'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getWatchedMoviesByYear(uid, year) {
  const all = await getAllWatchedMovies(uid);
  return all.filter((m) => String(m.year) === String(year));
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
  if (snap.exists()) {
    const { requestedBy } = snap.data();
    const acceptedBy = uid1 === requestedBy ? uid2 : uid1;
    await createNotification('friend_accepted', acceptedBy, requestedBy, {});
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
