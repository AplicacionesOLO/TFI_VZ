import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { AvailableTake } from '@/types/comparison-v2.types';

interface DashboardTakeSelectorProps {
  takes: AvailableTake[];
  selectedTakes: string[];
  onChange: (takes: string[]) => void;
  loading: boolean;
  disabled?: boolean;
}

const ALL_VALUE = '__ALL__';
const EMPTY_VALUE = '__EMPTY__';

export default function DashboardTakeSelector({
  takes,
  selectedTakes,
  onChange,
  loading,
  disabled = false,
}: DashboardTakeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAllSelected = selectedTakes.length === 0;
  const isEmptySelected = selectedTakes.length === 1 && selectedTakes[0] === EMPTY_VALUE;

  const options = useMemo(() => {
    const list = takes.map((t) => {
      const dateRange = t.min_date && t.max_date
        ? t.min_date === t.max_date
          ? t.min_date
          : `${t.min_date} al ${t.max_date}`
        : '';
      return {
        value: t.take_name,
        label: t.take_name,
        subtitle: `${t.article_count.toLocaleString('es-AR')} artículos${dateRange ? ` · ${dateRange}` : ''}`,
        type: 'take' as const,
      };
    });
    return [
      { value: ALL_VALUE, label: 'Todas las tomas', subtitle: `${takes.length} tomas disponibles`, type: 'special' as const },
      { value: EMPTY_VALUE, label: 'Sin toma', subtitle: 'Registros sin nombre de toma', type: 'special' as const },
      ...list,
    ];
  }, [takes]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtitle?.toLowerCase().includes(q) ?? false)
    );
  }, [options, search]);

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setIsOpen(true);
    setSearch('');
    setHighlightedIndex(0);
  }, []);

  const handleBlur = useCallback(() => {
    blurTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setSearch('');
    }, 150);
  }, []);

  const handleSelect = useCallback(
    (value: string) => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }

      if (value === ALL_VALUE) {
        onChange([]);
      } else if (value === EMPTY_VALUE) {
        onChange([EMPTY_VALUE]);
      } else {
        // Toggle individual take
        if (selectedTakes.includes(EMPTY_VALUE)) {
          // If empty was selected, replace with this take
          onChange([value]);
        } else if (selectedTakes.includes(value)) {
          // Deselect
          const next = selectedTakes.filter((t) => t !== value);
          onChange(next.length === 0 ? [] : next);
        } else {
          // Add to selection
          onChange([...selectedTakes, value]);
        }
      }
      // Keep dropdown open for multi-select
      inputRef.current?.focus();
    },
    [onChange, selectedTakes]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          setIsOpen(true);
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) =>
          Math.min(i + 1, Math.max(0, filteredOptions.length - 1))
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = filteredOptions[highlightedIndex];
        if (opt) {
          handleSelect(opt.value);
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
        inputRef.current?.blur();
      }
    },
    [isOpen, filteredOptions, highlightedIndex, handleSelect]
  );

  const removeTake = (value: string) => {
    const next = selectedTakes.filter((t) => t !== value);
    onChange(next.length === 0 ? [] : next);
  };

  // Build display text
  const displayLabel = useMemo(() => {
    if (isAllSelected) return 'Todas las tomas';
    if (isEmptySelected) return 'Sin toma';
    if (selectedTakes.length === 1) return selectedTakes[0];
    return `${selectedTakes.length} tomas seleccionadas`;
  }, [isAllSelected, isEmptySelected, selectedTakes]);

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        <i className="ri-filter-3-line mr-1"></i>
        Filtrar por tomas
      </label>

      {loading ? (
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={isOpen ? search : displayLabel}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Buscar tomas..."
            disabled={disabled || takes.length === 0}
            className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2.5 bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            autoComplete="off"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            {isOpen ? (
              <i className="ri-arrow-up-s-line text-gray-400 text-sm"></i>
            ) : (
              <i className="ri-search-line text-gray-400 text-sm"></i>
            )}
          </div>

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden max-h-[300px] overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400 text-center">
                  <i className="ri-search-line text-lg text-gray-300 block mb-1"></i>
                  No se encontraron tomas
                </div>
              ) : (
                <ul className="py-1">
                  {filteredOptions.map((opt, idx) => {
                    const isSelected =
                      opt.value === ALL_VALUE
                        ? isAllSelected
                        : opt.value === EMPTY_VALUE
                          ? isEmptySelected
                          : selectedTakes.includes(opt.value);
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <li
                        key={opt.value}
                        onClick={() => handleSelect(opt.value)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`px-3 py-2.5 cursor-pointer text-sm transition-colors flex items-center justify-between ${
                          isHighlighted ? 'bg-gray-50' : ''
                        } ${isSelected ? 'bg-emerald-50/60' : ''}`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className={`truncate ${isSelected ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                            {opt.label}
                          </span>
                          {opt.subtitle && (
                            <span className="text-xs text-gray-400 mt-0.5">{opt.subtitle}</span>
                          )}
                        </div>
                        {isSelected && (
                          <i className="ri-check-line text-emerald-600 text-sm ml-2 shrink-0"></i>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected chips */}
      {!isAllSelected && selectedTakes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTakes.map((take) => (
            <span
              key={take}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                take === EMPTY_VALUE
                  ? 'bg-gray-100 text-gray-600 border border-gray-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {take === EMPTY_VALUE ? 'Sin toma' : take}
              <button
                onClick={() => removeTake(take)}
                className="w-4 h-4 flex items-center justify-center hover:bg-emerald-200/50 rounded-full transition-colors cursor-pointer"
                title="Quitar"
              >
                <i className="ri-close-line text-xs"></i>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Summary */}
      {isAllSelected && takes.length > 0 && (
        <span className="text-xs text-gray-400">
          Mostrando todas las {takes.length} tomas
        </span>
      )}
    </div>
  );
}