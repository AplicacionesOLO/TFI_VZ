import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSessions } from '@/services/tfi.service';
import type { TfiSessionWithCount } from '@/types/tfi.types';

interface SessionContextValue {
  sessions: TfiSessionWithCount[];
  selectedSession: string;
  setSelectedSession: (id: string) => void;
  loadingSessions: boolean;
  sessionsError: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TfiSessionWithCount[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingSessions(true);
    getSessions()
      .then((data) => {
        if (cancelled) return;
        setSessions(data);
        if (data.length > 0) {
          // 1. Primera sesión active con datos reales (total_lines > 0)
          const activeWithData = data.find((s) => s.status === 'active' && s.total_lines > 0);
          // 2. Fallback: primera sesión active (sin datos)
          const activeAny = data.find((s) => s.status === 'active');
          // 3. Último fallback: primera de la lista
          setSelectedSession((activeWithData ?? activeAny ?? data[0]).id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setSessionsError(err?.message ?? 'Error al cargar sesiones');
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{ sessions, selectedSession, setSelectedSession, loadingSessions, sessionsError }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}