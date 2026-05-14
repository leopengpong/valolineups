"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastAction = { label: string; onClick: () => void };

type Toast = {
  id: number;
  message: string;
  action?: ToastAction;
};

type ToastInput = Omit<Toast, "id"> & { duration?: number };

type ToastCtx = {
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
}

const DEFAULT_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      const { duration = DEFAULT_DURATION_MS, ...rest } = toast;
      setToasts((prev) => [...prev, { id, ...rest }]);
      if (duration > 0) {
        const handle = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const handle of map.values()) clearTimeout(handle);
      map.clear();
    };
  }, []);

  return (
    <Ctx.Provider value={{ show, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            onAction={() => {
              t.action?.onClick();
              dismiss(t.id);
            }}
            onDismiss={() => dismiss(t.id)}
          />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({
  toast,
  onAction,
  onDismiss,
}: {
  toast: Toast;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="status"
      className={
        "pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg transition-all duration-150 " +
        (entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")
      }
    >
      <span className="text-foreground">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={onAction}
          className="ml-1 rounded-md px-2 py-0.5 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
