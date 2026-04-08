
import StarRating from '../StarRating';
import BaseModal from './Modal';
import ArcyListens from '../../assets/images/arcy-poses/arcy-listening.png'

export default function RatingModal({
  isOpen,
  rating,
  note,
  setRating,
  setNote,
  onCancel,
  onSave,
}) {
  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} image={ArcyListens} title='Arcy listens for a signal'>
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
        <button
          onClick={onCancel}
          className="flex-1 text-sm text-gray-500 hover:text-gray-300 py-2 rounded-lg transition-colors"
        >
          Cancel
        </button>

        <button
          onClick={onSave}
          className="flex-1 text-sm bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors font-medium"
        >
          Transmit
        </button>
      </div>
    </BaseModal>
  );
}