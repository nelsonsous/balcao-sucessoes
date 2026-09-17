import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAgendaItems } from '../lib/agenda';
import { db, useSettings } from '../lib/db';
import { useInboxCount } from '../lib/shareInbox';
import { todayIso } from '../lib/utils';
import { useToast } from './Toast';

const SUMMARY_KEY = 'bs-daily-summary';
const BACKUP_NAG_KEY = 'bs-backup-nag';
const BACKUP_MAX_AGE_DAYS = 7;

type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Mostra uma notificação do sistema (via service worker quando disponível). */
export async function showSystemNotification(title: string, body: string, url = './#/agenda'): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const options: NotificationOptions = {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-64.png',
    tag: 'bs-resumo-diario',
    data: { url },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    /* recorre à API direta */
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/** Resumo diário (uma vez por dia), notificação opcional e contador no ícone da app. */
export function Reminders() {
  const settings = useSettings();
  const items = useAgendaItems();
  const toast = useToast();
  const [loc, navigate] = useLocation();
  const locRef = useRef(loc);
  locRef.current = loc;
  const inbox = useInboxCount();
  const [day, setDay] = useState(todayIso);

  // Itens partilhados para a aplicação (Web Share Target) à espera de serem anexados.
  useEffect(() => {
    if (!inbox || locRef.current.startsWith('/recebidos')) return;
    toast({
      key: 'inbox',
      title: inbox === 1 ? '1 item recebido por partilha' : `${inbox} itens recebidos por partilha`,
      description: 'Escolha o dossier e anexe os ficheiros ou guarde a ligação como nota.',
      duration: 10_000,
      action: { label: 'Ver recebidos', onClick: () => navigate('/recebidos') },
    });
  }, [inbox, toast, navigate]);
  const caseCount = useLiveQuery(() => db.cases.filter((c) => !c.demo).count(), []);

  // Lembrete de cópia de segurança: uma vez por semana, quando há dossiers reais e a última cópia é antiga (ou não existe).
  useEffect(() => {
    if (!settings.onboarded || !caseCount) return;
    let last = '';
    try {
      last = localStorage.getItem(BACKUP_NAG_KEY) ?? '';
    } catch {
      /* ignora */
    }
    const ageDays = (iso: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : Infinity);
    if (ageDays(settings.lastBackupAt) <= BACKUP_MAX_AGE_DAYS || (last && ageDays(last) < BACKUP_MAX_AGE_DAYS)) return;
    try {
      localStorage.setItem(BACKUP_NAG_KEY, new Date().toISOString());
    } catch {
      /* ignora */
    }
    toast({
      key: 'backup-nag',
      title: settings.lastBackupAt ? 'A última cópia de segurança tem mais de uma semana' : 'Ainda não fez nenhuma cópia de segurança',
      description: 'Os dados vivem só neste dispositivo. Exporte uma cópia (pode cifrá-la com palavra-passe).',
      duration: 12_000,
      action: { label: 'Fazer cópia', onClick: () => navigate('/definicoes') },
    });
  }, [settings.onboarded, settings.lastBackupAt, caseCount, toast, navigate]);

  // Mudança de dia com a app aberta (ou ao voltar ao separador).
  useEffect(() => {
    const check = () => setDay(todayIso());
    const timer = setInterval(check, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  // Contador no ícone (PWA instalada).
  useEffect(() => {
    if (!items) return;
    const nav = navigator as BadgeNavigator;
    const count = items.filter((i) => !i.done && i.date <= day).length;
    if (!settings.appBadge || count === 0) void nav.clearAppBadge?.().catch(() => undefined);
    else void nav.setAppBadge?.(count).catch(() => undefined);
  }, [items, day, settings.appBadge]);

  // Resumo do dia.
  useEffect(() => {
    if (!items || !settings.onboarded) return;
    let last = '';
    try {
      last = localStorage.getItem(SUMMARY_KEY) ?? '';
    } catch {
      /* ignora */
    }
    if (last === day) return;
    const todays = items.filter((i) => !i.done && i.date === day);
    const late = items.filter((i) => !i.done && i.date < day);
    try {
      localStorage.setItem(SUMMARY_KEY, day);
    } catch {
      /* ignora */
    }
    if (!todays.length && !late.length) return;

    const prazos = todays.filter((i) => i.source === 'prazo').length;
    const eventos = todays.filter((i) => i.source === 'evento').length;
    const contactos = todays.filter((i) => i.source === 'contacto').length;
    const parts = [
      prazos && `${prazos} prazo${prazos > 1 ? 's' : ''}`,
      eventos && `${eventos} evento${eventos > 1 ? 's' : ''}`,
      contactos && `${contactos} contacto${contactos > 1 ? 's' : ''} a retomar`,
    ].filter(Boolean);
    const title = parts.length ? `Hoje: ${parts.join(', ')}` : 'Agenda do dia';
    const firstTimed = todays.find((i) => i.time);
    const description = [
      late.length ? `${late.length} item(ns) com data ultrapassada.` : '',
      firstTimed ? `Primeiro compromisso às ${firstTimed.time}: ${firstTimed.title}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    toast({
      key: 'daily-summary',
      title,
      description: description || undefined,
      duration: 10_000,
      action: { label: 'Ver agenda', onClick: () => navigate('/agenda') },
    });
    if (settings.notifications) void showSystemNotification(`Balcão das Sucessões — ${title}`, description || 'Abra a agenda para ver os detalhes.');
  }, [items, day, settings.onboarded, settings.notifications, toast, navigate]);

  return null;
}
