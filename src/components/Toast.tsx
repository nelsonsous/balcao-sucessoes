import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Info, X } from 'lucide-react';

export interface ToastOptions {
  /** Toasts com a mesma chave substituem-se (evita avisos repetidos). */
  key?: string;
  title: string;
  description?: string;
  tone?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ToastFn = (o: ToastOptions) => void;

const Ctx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback<ToastFn>(
    (o) => {
      const id = ++seq.current;
      setItems((l) => [...l.filter((t) => !o.key || t.key !== o.key).slice(-3), { ...o, id }]);
      const ms = o.duration ?? (o.action ? 7000 : 4000);
      if (ms > 0) setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = t.tone === 'error' ? AlertCircle : t.tone === 'success' ? Check : Info;
          return (
            <div key={t.id} className={`toast ${t.tone ?? 'info'}`}>
              <span className="toast-icon">
                <Icon aria-hidden />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="toast-title">{t.title}</div>
                {t.description && <div className="toast-desc">{t.description}</div>}
              </div>
              {t.action && (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" className="btn sm icon" aria-label="Fechar notificação" onClick={() => dismiss(t.id)}>
                <X aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
