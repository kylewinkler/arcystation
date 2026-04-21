import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);
  const exitTimerRef = useRef(null);

  // showToast("message") or showToast({ message, image, duration })
  // Toasts persist until tapped. Pass a duration (ms) to auto-dismiss.
  const showToast = useCallback((input, duration) => {
    clearTimeout(timerRef.current);
    clearTimeout(exitTimerRef.current);
    setExiting(false);
    if (typeof input === 'string') {
      setToast({ message: input });
    } else {
      setToast(input);
      duration = input.duration ?? duration;
    }
    if (duration) {
      timerRef.current = setTimeout(() => dismissToast(), duration);
    }
  }, []);

  const dismissToast = useCallback(() => {
    clearTimeout(timerRef.current);
    setExiting(true);
    exitTimerRef.current = setTimeout(() => {
      setToast(null);
      setExiting(false);
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toast && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[100] animate-fade-in-down w-[calc(100%-2rem)] max-w-md px-2">
          <div
            onClick={dismissToast}
            className={`relative bg-gray-900/95 border-2 border-purple-500/60 rounded-xl shadow-2xl shadow-purple-500/30 backdrop-blur-sm cursor-pointer ring-1 ring-purple-400/20 ${
              toast.image ? 'flex items-center gap-3 pl-5 pr-10 py-4' : 'px-10 py-4 text-center'
            }`}
          >
            {toast.image && (
              <img
                src={toast.image}
                alt=""
                className="h-12 w-12 object-contain shrink-0 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]"
              />
            )}
            <p className="text-base text-purple-100 italic leading-snug">{toast.message}</p>
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 text-gray-400 hover:text-white text-lg leading-none w-6 h-6 flex items-center justify-center"
            >
              ×
            </span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
