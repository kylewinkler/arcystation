import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  // showToast("message") or showToast({ message, image, duration })
  const showToast = useCallback((input, duration = 3000) => {
    clearTimeout(timerRef.current);
    if (typeof input === 'string') {
      setToast({ message: input });
    } else {
      setToast(input);
      duration = input.duration || duration;
    }
    timerRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  const dismissToast = useCallback(() => {
    clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-up">
          <div
            onClick={dismissToast}
            className={`bg-gray-900/95 border border-purple-500/30 rounded-lg shadow-lg shadow-purple-500/10 backdrop-blur-sm cursor-pointer max-w-sm ${
              toast.image ? 'flex items-center gap-3 px-4 py-3' : 'px-5 py-3 text-center'
            }`}
          >
            {toast.image && (
              <img
                src={toast.image}
                alt=""
                className="h-10 w-10 object-contain shrink-0 drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]"
              />
            )}
            <p className="text-sm text-purple-200/90 italic">{toast.message}</p>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
