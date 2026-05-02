import { useEffect, useState } from 'react';
import BaseModal from './Modal';
import {
  getUserLists, getListMovies, addMovieToList, removeMovieFromList,
  createList, startList, notifyFriends,
} from '../../lib/firestore';

export default function AddToListModal({ isOpen, onClose, movie, user, onChanged }) {
  const [ownedLists, setOwnedLists] = useState([]);
  const [movieOnLists, setMovieOnLists] = useState(new Set());
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [listsLoaded, setListsLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen || !movie || !user) return;
    setListsLoaded(false);
    setNewListName('');
    loadOwnedLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, movie?.tmdbId, user?.uid]);

  async function loadOwnedLists() {
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

  function getMovieData() {
    return {
      tmdbId: movie.tmdbId,
      title: movie.title,
      posterPath: movie.posterPath,
      year: movie.year,
      releaseDate: movie.releaseDate || '',
      overview: movie.overview || '',
      genreIds: movie.genreIds || [],
    };
  }

  async function handleToggleList(listId) {
    if (movieOnLists.has(listId)) {
      await removeMovieFromList(listId, movie.tmdbId);
      setMovieOnLists((prev) => { const s = new Set(prev); s.delete(listId); return s; });
    } else {
      await addMovieToList(listId, getMovieData());
      setMovieOnLists((prev) => new Set(prev).add(listId));
    }
    onChanged?.();
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
      setListsLoaded(false);
      await loadOwnedLists();
      onChanged?.();
    } finally {
      setCreatingList(false);
    }
  }

  if (!isOpen || !movie) return null;

  return (
    <BaseModal isOpen onClose={onClose}>
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
