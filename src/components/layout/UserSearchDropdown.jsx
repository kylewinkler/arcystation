import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { searchUsersByName } from '../../lib/firestore';

export default function UserSearchDropdown() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const found = await searchUsersByName(val);
      setResults(found.filter((u) => u.uid !== user?.uid));
      setSearching(false);
    }, 250);
  }

  function handleSelect(uid) {
    setOpen(false);
    navigate(`/user/${uid}`);
  }

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-gray-300 hover:text-white transition-colors"
        aria-label="Find a user"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search by name..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {searching && (
            <p className="text-xs text-gray-500 px-3 pb-2">Searching...</p>
          )}

          {!searching && results.length > 0 && (
            <ul className="max-h-60 overflow-y-auto pb-1">
              {results.map((u) => (
                <li key={u.uid}>
                  <button
                    onClick={() => handleSelect(u.uid)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
                  >
                    {u.photoURL ? (
                      <img src={u.photoURL} alt="" className="w-7 h-7 rounded-full shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {u.displayName?.[0] || '?'}
                      </div>
                    )}
                    <span className="text-sm text-white truncate">{u.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <p className="text-xs text-gray-500 px-3 pb-3">No users found.</p>
          )}
        </div>
      )}
    </div>
  );
}
