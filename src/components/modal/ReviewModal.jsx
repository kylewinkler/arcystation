import { useState } from 'react';
import { Link } from 'react-router-dom';
import BaseModal from './Modal';
import RatingModal from './RatingModal';
import StarRating from '../StarRating';
import ReviewReactions from '../ReviewReactions';
import { posterUrl } from '../../lib/tmdb';
import { useAuth } from '../../context/AuthContext';
import { markWatchedStandalone } from '../../lib/firestore';

export default function ReviewModal({ isOpen, onClose, movie, onReactionChange, onEdit, reviewerProfile }) {
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [editRating, setEditRating] = useState(0);
  const [editNote, setEditNote] = useState('');

  if (!movie) return null;

  const { tmdbId, title, year, posterPath, rating, note, reactions, uid } = movie;
  const isOwnReview = user?.uid === uid;
  const displayName = reviewerProfile?.displayName;
  const photoURL = reviewerProfile?.photoURL;
  const headerText = isOwnReview ? 'Your review' : `${displayName || 'Their'}'s review`;

  function openEdit() {
    setEditRating(rating || 0);
    setEditNote(note || '');
    setEditOpen(true);
  }

  async function handleSave() {
    await markWatchedStandalone(user.uid, tmdbId, {
      rating: editRating,
      note: editNote.trim() || null,
      movieData: { title, year, posterPath },
      clearReactions: true,
    });
    setEditOpen(false);
    onEdit?.({ rating: editRating || null, note: editNote.trim() || null, reactions: {} });
  }

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md">
        <div className="flex items-center gap-3 pb-3 border-b border-gray-800 -mt-2">
          {photoURL ? (
            <img src={photoURL} alt="" className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold text-white">
              {(displayName || '?')[0]}
            </div>
          )}
          <h3 className="text-white font-semibold text-base">{headerText}</h3>
        </div>

        <div
          className={`flex gap-4 items-start ${isOwnReview ? 'cursor-pointer group' : ''}`}
          onClick={isOwnReview ? openEdit : undefined}
        >
          {posterPath ? (
            <img
              src={posterUrl(posterPath, 'w185')}
              alt={title}
              className="w-24 aspect-[2/3] rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-24 aspect-[2/3] rounded-lg bg-gray-800 shrink-0" />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h4 className="text-white font-medium break-words leading-tight group-hover:text-purple-300 transition-colors">{title}</h4>
              {year && <p className="text-xs text-gray-500 mt-0.5">{year}</p>}
            </div>
            {rating > 0 && <StarRating value={rating} size="sm" />}
            {note ? (
              <p className="text-gray-300 text-sm italic whitespace-pre-wrap">"{note}"</p>
            ) : (
              <p className="text-gray-500 text-sm">No written review.</p>
            )}
          </div>
        </div>

        {!isOwnReview && (
          <ReviewReactions
            reviewerUid={uid}
            tmdbId={tmdbId}
            reactions={reactions || {}}
            currentUserUid={user?.uid}
            movieTitle={title}
            posterPath={posterPath}
            onReactionChange={onReactionChange}
          />
        )}

        <Link
          to={`/movie/${tmdbId}`}
          onClick={onClose}
          className="block text-center text-sm text-purple-400 hover:text-purple-300 pt-3 border-t border-gray-800"
        >
          See movie details →
        </Link>
      </BaseModal>

      {isOwnReview && (
        <RatingModal
          isOpen={editOpen}
          rating={editRating}
          note={editNote}
          setRating={setEditRating}
          setNote={setEditNote}
          onCancel={() => setEditOpen(false)}
          onSave={handleSave}
          isExisting={true}
        />
      )}
    </>
  );
}
