export default function BaseModal({
  isOpen = true,
  onClose,
  children,
  maxWidth = 'max-w-sm',
  closeOnBackdrop = true,
  image,
  title,
  message
}) {
  if (!isOpen) return null;

  function handleBackdropClick() {
    if (closeOnBackdrop) onClose?.();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        className={`bg-gray-900 border border-gray-700 rounded-xl p-6 w-full ${maxWidth} space-y-4`}
        onClick={(e) => e.stopPropagation()}
      >
        {image && (
          <div className="flex justify-center">
            <img
              src={image}
              alt=""
              className="h-24 w-24 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]"
            />
          </div>
        )}
        {title && <h3 className="text-white font-medium text-center">{title}</h3>} 

        {message && (
          <p className="text-sm text-gray-400 text-center">{message}</p>
        )}
        {children}
      </div>
    </div>
  );
}