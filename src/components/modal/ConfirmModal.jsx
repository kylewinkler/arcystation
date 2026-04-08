import BaseModal from "./Modal";

export default function ConfirmModal({
  isOpen = true,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmStyle = 'bg-purple-600 hover:bg-purple-700',
  onConfirm,
  onCancel,
  image,
  disabled = false,
}) {
  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} image={image} title={title} message={message}>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 text-sm text-gray-400 hover:text-white border border-gray-700 py-2 rounded-lg transition-colors"
        >
          Cancel
        </button>

        <button
          onClick={onConfirm}
          disabled={disabled}
          className={`flex-1 text-sm text-white py-2 rounded-lg transition-colors font-medium disabled:bg-gray-700 disabled:text-gray-500 ${confirmStyle}`}
        >
          {confirmLabel}
        </button>
      </div>
    </BaseModal>
  );
}