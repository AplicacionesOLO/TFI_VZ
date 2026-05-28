import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { getSessions } from '@/services/tfi.service';
import type { TfiSessionWithCount } from '@/types/tfi.types';

interface SessionContextValue {
  sessions: TfiSessionWithCount[];
  selectedSession: string;
  setSelectedSession: (id: string) => void;
  loadingSessions: boolean;
  sessionsError: string | null;
  selectedSituation: string;
  setSelectedSituation: (situation: string) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Helper: determina si una sesión está activa según los estados reales de la base de datos
function isSessionActive(status: string): boolean {
  return status === 'active' || status === 'open' || status === 'reviewing';
}

const EXCLUDED_SESSION_NAMES = ['Sillaca pruebas'];

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TfiSessionWithCount[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSituation, setSelectedSituation] = useState<string>('TODOS');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingSessions(true);
    getSessions()
      .then((data) => {
        if (cancelled) return;
        setSessions(data);
        if (data.length > 0) {
          const visible = data.filter((s) => !EXCLUDED_SESSION_NAMES.includes(s.name));
          // 1. Primera sesión activa (open/reviewing/active) con datos reales (en cualquiera de las dos tablas)
          const activeWithData = visible.find((s) => isSessionActive(s.status) && (s.total_lines > 0 || s.attempt_lines > 0));
          // 2. Fallback: primera sesión activa (sin datos)
          const activeAny = visible.find((s) => isSessionActive(s.status));
          // 3. Último fallback: primera de la lista visible
          setSelectedSession((activeWithData ?? activeAny ?? visible[0] ?? data[0]).id);
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
  }, [refreshTrigger]);

  return (
    <SessionContext.Provider
      value={{
        sessions,
        selectedSession,
        setSelectedSession,
        loadingSessions,
        sessionsError,
        selectedSituation,
        setSelectedSituation,
        refreshTrigger,
        triggerRefresh,
      }}
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