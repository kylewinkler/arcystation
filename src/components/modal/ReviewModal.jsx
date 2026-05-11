import { useState } from 'react';
import { Link } from 'react-router-dom';
import BaseModal from './Modal';
import RatingModal from './RatingModal';
import ReviewDisplay from '../ReviewDisplay';
import { useAuth } from '../../context/AuthContext';
import { markWatchedStandalone } from '../../lib/firestore';

export default function ReviewModal({ isOpen, onClose, movie, onReactionChange, onEdit, reviewerProfile, hideMovieLink }) {
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [editRating, setEditRating] = useState(0);
  const [editNote, setEditNote] = useState('');

  if (!movie) return null;

  const { tmdbId, title, year, posterPath, rating, note, uid } = movie;
  const isOwnReview = user?.uid === uid;

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
        <ReviewDisplay
          movie={movie}
          reviewerProfile={reviewerProfile}
          currentUserUid={user?.uid}
          onEditClick={isOwnReview ? openEdit : undefined}
          onReactionChange={onReactionChange}
        />

        {!hideMovieLink && (
          <Link
            to={`/movie/${tmdbId}`}
            onClick={onClose}
            className="block text-center text-sm text-purple-400 hover:text-purple-300 pt-3 border-t border-gray-800"
          >
            See movie details →
          </Link>
        )}
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
