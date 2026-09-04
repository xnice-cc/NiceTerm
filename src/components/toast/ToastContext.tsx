import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastType = "error" | "warn" | "info" | "success";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  error: (msg: string) => void;
  warn: (msg: string) => void;
  info: (msg: string) => void;
  success: (msg: string) => void;
  dismiss: (id: string) => void;
}

/**
 * Toast state: array of ToastItem. Add via error/warn/info/success(msg); auto-dismiss
 * after 5s. dismiss(id) removes manually.
 */
const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 5000;

/** Provides toasts array and error/warn/info/success/dismiss helpers. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const error = useCallback((msg: string) => addToast("error", msg), [addToast]);
  const warn = useCallback((msg: string) => addToast("warn", msg), [addToast]);
  const info = useCallback((msg: string) => addToast("info", msg), [addToast]);
  const success = useCallback((msg: string) => addToast("success", msg), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, error, warn, info, success, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

/** Hook to access ToastContext. Throws if used outside ToastProvider. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
