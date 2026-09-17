import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { CalendarClock, Check, ChevronDown, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MemberRecord, Status } from '../lib/types';
import { cx, formatDate, initials, relativeDays } from '../lib/utils';
import { dueState } from '../engine/deadlines';
import type { Health } from '../engine/insights';
import { STATUSES } from '../engine/phases';

// ---------------------------------------------------------------------------
// Botão

type Variant = 'default' | 'primary' | 'soft' | 'ghost' | 'danger' | 'danger-soft';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  block?: boolean;
  iconOnly?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  block,
  iconOnly,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'btn',
        variant !== 'default' && variant,
        size !== 'md' && size,
        block && 'block',
        iconOnly && 'icon',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon aria-hidden />}
      {children}
      {IconRight && <IconRight aria-hidden />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cartões

export function Card({ className, children, pad }: { className?: string; children: ReactNode; pad?: boolean }) {
  return <section className={cx('card', pad && 'card-pad', className)}>{children}</section>;
}

export function CardHead({ title, subtitle, actions, icon: Icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="card-head">
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        {Icon && (
          <span className="icon-tile brand">
            <Icon aria-hidden />
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicadores

export function StatusPill({ status, onClick, compact }: { status: Status; onClick?: () => void; compact?: boolean }) {
  const def = STATUSES.find((s) => s.id === status)!;
  const content = (
    <>
      <span className={cx('dot', status)} aria-hidden />
      {compact ? def.short : def.label}
    </>
  );
  if (onClick)
    return (
      <button type="button" className={cx('status-pill', status)} onClick={onClick}>
        {content}
        <ChevronDown size={14} aria-hidden />
      </button>
    );
  return <span className={cx('status-pill', status)}>{content}</span>;
}

export function HealthBadge({ health, showDetail }: { health: Health; showDetail?: boolean }) {
  return (
    <span className={cx('health', health.level)} title={health.detail}>
      <span className={cx('dot', health.level)} aria-hidden />
      {showDetail ? health.detail : health.label}
    </span>
  );
}

export function DueChip({ date, status, withRelative = true }: { date: string; status: Status; withRelative?: boolean }) {
  if (!date) return null;
  const st = dueState(date, status);
  const rel = relativeDays(date);
  const label = st === 'atrasado' ? `Atrasado · ${formatDate(date, 'daymonth')}` : formatDate(date, 'daymonth');
  return (
    <span className={cx('due', st)} title={`Prazo: ${formatDate(date, 'long')}${rel ? ` (${rel})` : ''}`}>
      <CalendarClock aria-hidden />
      {label}
      {withRelative && st !== 'atrasado' && st !== 'cumprido' && rel && <span style={{ fontWeight: 500, opacity: 0.8 }}>· {rel}</span>}
    </span>
  );
}

export function Avatar({ member, name, size, title }: { member?: MemberRecord; name?: string; size?: 'sm' | 'lg'; title?: string }) {
  const n = member?.name ?? name ?? '';
  if (!n)
    return (
      <span className={cx('avatar empty', size)} title={title ?? 'Sem responsável'}>
        ?
      </span>
    );
  return (
    <span
      className={cx('avatar', size)}
      style={member?.color ? ({ '--av': member.color } as CSSProperties) : undefined}
      title={title ?? n}
    >
      {initials(n)}
    </span>
  );
}

export function Progress({ pct, thin, label }: { pct: number; thin?: boolean; label?: string }) {
  return (
    <div
      className={cx('progress', thin && 'thin')}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progresso'}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function StackedBar({ counts }: { counts: Record<Status, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const order: Status[] = ['concluido', 'em_curso', 'aguarda', 'pendente', 'na'];
  return (
    <div className="stacked-bar" aria-hidden>
      {order.map((s) =>
        counts[s] ? <span key={s} className={s} style={{ width: `${(counts[s] / total) * 100}%` }} /> : null,
      )}
    </div>
  );
}

export function Ring({ pct, size = 64, stroke = 7, label }: { pct: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${pct}% concluído`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--st-concluido)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset .6s var(--ease)' }}
        />
      </svg>
      <span className="ring-label" style={{ fontSize: size * 0.24 }}>
        {label ?? `${pct}%`}
      </span>
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon aria-hidden />
      </span>
      <h2 className="empty-title">{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulários

export function Field({
  label,
  hint,
  error,
  ok,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ok?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx('field', className)}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="error">{error}</span> : ok ? <span className="ok-hint">{ok}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  icon?: LucideIcon;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={14} aria-hidden />}
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export function Tabs<T extends string>({ items, value, onChange }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
        >
          {t.icon && <t.icon aria-hidden />}
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu contextual

export interface MenuItem {
  label: string;
  description?: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  checked?: boolean;
  separatorBefore?: boolean;
}

export function Menu({
  items,
  button,
  align = 'right',
  ariaLabel,
}: {
  items: MenuItem[];
  button: (p: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-label'?: string }) => ReactNode;
  align?: 'left' | 'right';
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={wrap}>
      {button({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu', 'aria-label': ariaLabel })}
      {open && (
        <div className={cx('menu', align === 'right' ? 'align-right' : 'align-left')} role="menu">
          {items.map((it, i) => (
            <div key={i}>
              {it.separatorBefore && <div className="menu-sep" />}
              <button
                type="button"
                role="menuitem"
                className={cx('menu-item', it.danger && 'danger')}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.icon && <it.icon aria-hidden />}
                <span style={{ flex: 1 }}>
                  {it.label}
                  {it.description && <span className="menu-desc">{it.description}</span>}
                </span>
                {it.checked && <Check size={16} aria-hidden />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gaveta / modal (elemento <dialog> nativo: foco e Esc acessíveis)

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  variant = 'drawer',
  icon: Icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'drawer' | 'modal';
  icon?: LucideIcon;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // O autoFocus do React não funciona dentro de <dialog>: focamos depois de abrir.
      requestAnimationFrame(() => d.querySelector<HTMLElement>('[data-autofocus]')?.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cx('sheet', variant === 'modal' && 'modal')}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sheet-panel">
          <div className="sheet-head">
            {Icon && (
              <span className="icon-tile brand">
                <Icon aria-hidden />
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 id={titleId}>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <Button variant="ghost" iconOnly icon={X} aria-label="Fechar" onClick={onClose} />
          </div>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Confirmação assíncrona

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>(
    (o) => new Promise<boolean>((resolve) => setState({ ...o, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Sheet
        open={Boolean(state)}
        onClose={() => close(false)}
        variant="modal"
        title={state?.title ?? ''}
        footer={
          <>
            <span className="spacer" />
            <Button onClick={() => close(false)}>Cancelar</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {state?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="muted">{state?.message}</div>
      </Sheet>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ---------------------------------------------------------------------------

export function KpiCard({
  label,
  value,
  foot,
  icon: Icon,
  tone,
  onClick,
  pressed,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  icon?: LucideIcon;
  tone?: 'red' | 'orange' | 'blue' | 'green' | 'grey' | 'brand';
  onClick?: () => void;
  pressed?: boolean;
}) {
  const inner = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {foot && <span className="kpi-foot">{foot}</span>}
      {Icon && (
        <span className="kpi-icon">
          <Icon aria-hidden />
        </span>
      )}
    </>
  );
  if (onClick)
    return (
      <button type="button" className={cx('kpi', tone && `tone-${tone}`)} onClick={onClick} aria-pressed={pressed}>
        {inner}
      </button>
    );
  return <div className={cx('kpi', tone && `tone-${tone}`)}>{inner}</div>;
}

/** Hook utilitário para campos de texto com gravação diferida. */
export function useDebounced<T>(value: T, delay = 500): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
