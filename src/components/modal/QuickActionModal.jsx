import { useEffect, useState } from 'react';
import BaseModal from './Modal';
import RatingModal from './RatingModal';
import StarRating from '../StarRating';
import { posterUrl } from '../../lib/tmdb';
import {
  getUserLists, getListMovies, addMovieToList, removeMovieFromList,
  createList, startList, markWatchedStandalone, unmarkWatchedStandalone,
  getWatchedInfo, getAllWatchedTmdbIds, notifyFriends,
} from '../../lib/firestore';
import { useToast } from '../../context/ToastContext';
import { randomFrom, REVIEW_REACTIONS, RATING_ONLY_REACTIONS } from '../../lib/copy/lore';
import { getMilestone } from '../../lib/copy/lore';
import ArcyReadTransmission from '../../assets/images/arcy-poses/arcy-read-transmission.png';

export default function QuickActionModal({ isOpen, onClose, movie, user, watched, setWatched }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState('menu'); // 'menu' | 'lists' | 'rating'

  // Watched info
  const [watchedData, setWatchedData] = useState(null);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');

  // Lists
  const [ownedLists, setOwnedLists] = useState([]);
  const [movieOnLists, setMovieOnLists] = useState(new Set());
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [listsLoaded, setListsLoaded] = useState(false);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen && movie) {
      setMode('menu');
      setListsLoaded(false);
      setNewListName('');
      // Check watched status
      getWatchedInfo(user.uid, movie.tmdbId).then((info) => {
        setWatchedData(info);
      });
    } else {
      setWatchedData(null);
      setRating(0);
      setNote('');
    }
  }, [isOpen, movie?.tmdbId]);

  const isWatched = !!watchedData;

  async function loadOwnedLists() {
    if (listsLoaded) return;
    const lists = await getUserLists(user.uid);
    setOwnedLists(lists);
    const onLists = new Set();
    await Promise.all(
      lists.map(async (l) => {
        const movies = await getListMovies(l.id);
        if (movies.some((m) => m.tmdbId === movie.tmdbId)) {
          onLists.add(l.id);
        }
      })
    );
    setMovieOnLists(onLists);
    setListsLoaded(true);
  }

  async function handleToggleList(listId) {
    if (movieOnLists.has(listId)) {
      await removeMovieFromList(listId, movie.tmdbId);
      setMovieOnLists((prev) => { const s = new Set(prev); s.delete(listId); return s; });
    } else {
      await addMovieToList(listId, getMovieData());
      setMovieOnLists((prev) => new Set(prev).add(listId));
    }
  }

  async function handleCreateNewList() {
    const name = newListName.trim();
    if (!name || creatingList) return;
    setCreatingList(true);
    try {
      const listId = await createList({ title: name, description: '', createdBy: user.uid });
      await addMovieToList(listId, getMovieData());
      await startList(user.uid, listId);
      notifyFriends(user.uid, 'created_list', { listId, listTitle: name });
      setNewListName('');
      loadOwnedLists();
      setListsLoaded(false);
    } finally {
      setCreatingList(false);
    }
  }

  async function handleSaveRating() {
    await markWatchedStandalone(user.uid, movie.tmdbId, {
      rating: rating || null,
      note: note.trim() || null,
      movieData: getMovieData(),
    });
    setWatched((prev) => new Set(prev).add(movie.tmdbId));
    onClose();
    showWatchedToast(!!rating);
  }

  async function handleDelete() {
    await unmarkWatchedStandalone(user.uid, movie.tmdbId);
    setWatched((prev) => { const s = new Set(prev); s.delete(movie.tmdbId); return s; });
    onClose();
  }

  async function showWatchedToast(hasRating) {
    const ids = await getAllWatchedTmdbIds(user.uid);
    const milestone = getMilestone(ids.size);
    if (milestone) {
      showToast({ message: `${milestone.title} ${milestone.subtitle}`, image: ArcyReadTransmission }, 5000);
    } else if (hasRating) {
      showToast({ message: randomFrom(REVIEW_REACTIONS), image: ArcyReadTransmission });
    } else {
      showToast(randomFrom(RATING_ONLY_REACTIONS));
    }
  }

  function getMovieData() {
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      posterPath: movie.posterPath,
      year: movie.year,
      overview: movie.overview || '',
      genreIds: movie.genreIds || [],
    };
  }

  function openRating() {
    if (isWatched) {
      setRating(watchedData.rating || 0);
      setNote(watchedData.note || '');
    } else {
      setRating(0);
      setNote('');
    }
    setMode('rating');
  }

  function openLists() {
    loadOwnedLists();
    setMode('lists');
  }

  if (!isOpen || !movie) return null;

  // ── Rating mode: use RatingModal directly ──
  if (mode === 'rating') {
    return (
      <RatingModal
        isOpen
        rating={rating}
        note={note}
        setRating={setRating}
        setNote={setNote}
        onCancel={() => setMode('menu')}
        onSave={handleSaveRating}
        isExisting={isWatched}
        onDelete={handleDelete}
      />
    );
  }

  // ── Lists mode ──
  if (mode === 'lists') {
    return (
      <BaseModal isOpen onClose={onClose}>
        <button
          onClick={() => setMode('menu')}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <h3 className="text-white font-medium">Add to list</h3>

        {!listsLoaded ? (
          <p className="text-sm text-gray-500">Loading lists...</p>
        ) : ownedLists.length === 0 ? (
          <p className="text-sm text-gray-500">No lists yet. Create one below.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto -mx-6 px-6">
            {ownedLists.map((l) => {
              const isOn = movieOnLists.has(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => handleToggleList(l.id)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-gray-800 rounded-lg transition-colors text-left"
                >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isOn ? 'bg-purple-600 border-purple-600' : 'border-gray-600'}`}>
                    {isOn && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-white truncate">{l.title}</span>
                </button>
              );
            })}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); handleCreateNewList(); }}
          className="flex gap-2 pt-2 border-t border-gray-700"
        >
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="New list name..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={!newListName.trim() || creatingList}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Create
          </button>
        </form>
      </BaseModal>
    );
  }

  // ── Menu mode (default) ──
  return (
    <BaseModal isOpen onClose={onClose}>
      {/* Movie poster + title */}
      <div className="flex items-center gap-3">
        {movie.posterPath ? (
          <img
            src={posterUrl(movie.posterPath, 'w92')}
            alt=""
            className="w-12 h-18 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-18 rounded bg-gray-800 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-white font-medium truncate">{movie.title}</p>
          {movie.year && <p className="text-xs text-gray-500">{movie.year}</p>}
        </div>
      </div>

      {/* Watched status */}
      {isWatched ? (
        <button
          onClick={openRating}
          className="w-full bg-purple-600/10 border border-purple-500/30 rounded-lg p-3 text-left hover:border-purple-500 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-purple-300 text-sm font-medium">Watched</span>
            {watchedData.rating > 0 && (
              <span className="ml-auto"><StarRating value={watchedData.rating} size="sm" /></span>
            )}
          </div>
          {watchedData.note && (
            <p className="text-gray-300 text-sm mt-2 italic truncate">"{watchedData.note}"</p>
          )}
        </button>
      ) : (
        <button
          onClick={openRating}
          className="w-full flex items-center gap-2 text-sm text-gray-400 hover:text-green-400 border border-gray-700 hover:border-green-500 px-3 py-2.5 rounded-lg transition-colors"
        >
          <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          Mark as watched
        </button>
      )}

      {/* Add to list */}
      <button
        onClick={openLists}
        className="w-full flex items-center gap-2 text-sm text-gray-400 hover:text-purple-400 border border-gray-700 hover:border-purple-500 px-3 py-2.5 rounded-lg transition-colors"
      >
        <span className="text-lg leading-none">+</span>
        Add to list
      </button>
    </BaseModal>
  );
}
