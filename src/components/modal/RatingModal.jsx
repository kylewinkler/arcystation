
import { useState } from 'react';
import StarRating from '../StarRating';
import BaseModal from './Modal';
import ConfirmModal from './ConfirmModal';
import ArcyListens from '../../assets/images/arcy-poses/arcy-listening.png'

export default function RatingModal({
  isOpen,
  rating,
  note,
  setRating,
  setNote,
  onCancel,
  onSave,
  isExisting = false,
  onDelete,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleCancel() {
    setConfirmDelete(false);
    onCancel();
  }

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={handleCancel} image={ArcyListens} title='Arcy listens for a signal'>
        <div className="flex justify-center">
          <StarRating value={rating} onChange={setRating} size="lg" />
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Quick thoughts? (optional)"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
        />

        <div className="flex gap-2">
          {isExisting ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-1 text-sm text-red-400 hover:text-red-300 border border-gray-700 hover:border-red-500 py-2 rounded-lg transition-colors"
            >
              Delete
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="flex-1 text-sm text-gray-500 hover:text-gray-300 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          <button
            onClick={onSave}
            className="flex-1 text-sm bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors font-medium"
          >
            Transmit
          </button>
        </div>
      </BaseModal>

      <ConfirmModal
        isOpen={confirmDelete}
        title="Erase from the archives?"
        message="Your review and rating will be lost to the void forever."
        confirmLabel="Erase it"
        confirmStyle="bg-red-600 hover:bg-red-700"
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete?.();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
