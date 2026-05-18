import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSession } from '@/context/SessionContext';

const navItems = [
  { label: 'Dashboard', path: '/', icon: 'ri-dashboard-3-line' },
  { label: 'Comparación', path: '/comparison', icon: 'ri-file-list-3-line' },
  { label: 'Ranking', path: '/ranking', icon: 'ri-medal-line' },
  { label: 'Pendientes', path: '/pending', icon: 'ri-time-line' },
];

function formatLineCount(count: number): string {
  if (count === 0) return 'sin datos';
  return count.toLocaleString('es-AR') + ' líneas';
}

function sessionLabel(name: string, location: string | null, totalLines: number): string {
  const loc = location ? ` — ${location}` : '';
  const cnt = ` — ${formatLineCount(totalLines)}`;
  return `${name}${loc}${cnt}`;
}

export default function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const location = useLocation();
  const { sessions, selectedSession, setSelectedSession, loadingSessions } = useSession();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  // Sesiones filtradas según toggle
  const visibleSessions = useMemo(
    () => (hideEmpty ? sessions.filter((s) => s.total_lines > 0) : sessions),
    [sessions, hideEmpty]
  );

  // Si la sesión seleccionada queda oculta al activar el filtro, reasignar a la primera visible
  useEffect(() => {
    if (hideEmpty && visibleSessions.length > 0) {
      const stillVisible = visibleSessions.some((s) => s.id === selectedSession);
      if (!stillVisible) {
        setSelectedSession(visibleSessions[0].id);
      }
    }
  }, [hideEmpty, visibleSessions, selectedSession, setSelectedSession]);

  const emptySessions = sessions.filter((s) => s.total_lines === 0);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white shadow-sm border-b border-gray-100' : 'bg-white border-b border-gray-100'
      }`}
    >
      <div className="px-6 md:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2 cursor-pointer shrink-0">
            <div className="w-8 h-8 flex items-center justify-center bg-emerald-600 rounded-lg">
              <i className="ri-bar-chart-box-line text-white text-base"></i>
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">
              TFI<span className="text-emerald-600">.</span>
            </span>
          </NavLink>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <i className={`${item.icon} text-base`}></i>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right: Session selector + indicator */}
          <div className="hidden md:flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
              <span className="w-2 h-2 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              </span>
              En vivo
            </div>
            <div className="h-4 w-px bg-gray-200"></div>

            {/* Session selector */}
            {loadingSessions ? (
              <div className="h-8 w-44 bg-gray-100 rounded-lg animate-pulse"></div>
            ) : sessions.length > 0 ? (
              <div className="flex items-center gap-2">
                <i className="ri-calendar-check-line text-gray-400 text-sm shrink-0"></i>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="border border-gray-200 rounded-lg text-sm px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer max-w-[320px]"
                >
                  {visibleSessions.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      disabled={s.total_lines === 0}
                      style={s.total_lines === 0 ? { color: '#9ca3af' } : undefined}
                    >
                      {sessionLabel(s.name, s.location, s.total_lines)}
                    </option>
                  ))}
                </select>

                {/* Toggle ocultar sin datos — solo si hay sesiones vacías */}
                {emptySessions.length > 0 && (
                  <button
                    onClick={() => setHideEmpty((v) => !v)}
                    title={hideEmpty ? 'Mostrar todas las sesiones' : 'Ocultar sesiones sin datos'}
                    className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer shrink-0 ${
                      hideEmpty
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                    }`}
                  >
                    <i className="ri-filter-3-line text-xs"></i>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-400 italic">
                <i className="ri-calendar-close-line text-gray-300"></i>
                No hay sesiones disponibles
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <i className={`${menuOpen ? 'ri-close-line' : 'ri-menu-line'} text-xl text-gray-700`}></i>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-1">
          {/* Mobile session selector */}
          {sessions.length > 0 ? (
            <div className="flex flex-col gap-1.5 px-2 py-2 mb-1">
              <div className="flex items-center gap-2">
                <i className="ri-calendar-check-line text-gray-400 text-sm shrink-0"></i>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg text-sm px-3 py-1.5 bg-white text-gray-700 focus:outline-none cursor-pointer"
                >
                  {visibleSessions.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      disabled={s.total_lines === 0}
                      style={s.total_lines === 0 ? { color: '#9ca3af' } : undefined}
                    >
                      {sessionLabel(s.name, s.location, s.total_lines)}
                    </option>
                  ))}
                </select>
              </div>
              {emptySessions.length > 0 && (
                <button
                  onClick={() => setHideEmpty((v) => !v)}
                  className={`self-start flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                    hideEmpty
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-gray-200 text-gray-400'
                  }`}
                >
                  <i className="ri-filter-3-line"></i>
                  {hideEmpty ? 'Mostrando solo con datos' : `Ocultar ${emptySessions.length} sin datos`}
                </button>
              )}
            </div>
          ) : !loadingSessions ? (
            <div className="flex items-center gap-2 px-2 py-2 mb-1 text-xs text-gray-400 italic">
              <i className="ri-calendar-close-line text-gray-300"></i>
              No hay sesiones disponibles
            </div>
          ) : null}

          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <i className={`${item.icon} text-base`}></i>
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}