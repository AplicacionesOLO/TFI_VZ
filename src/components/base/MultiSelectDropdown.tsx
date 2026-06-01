import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  label?: string;
  icon?: string;
  placeholder?: string;
  emptyMessage?: string;
  allLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  accentColor?: string;
}

export default function MultiSelectDropdown({
  options,
  selectedValues,
  onChange,
  label,
  icon = 'ri-filter-3-line',
  placeholder = 'Buscar...',
  emptyMessage = 'No se encontraron opciones',
  allLabel = 'Todas',
  loading = false,
  disabled = false,
  accentColor = 'emerald',
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAllSelected = selectedValues.length === 0;

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtitle?.toLowerCase().includes(q) ?? false)
    );
  }, [options, search]);

  const displayLabel = useMemo(() => {
    if (isAllSelected) return allLabel;
    if (selectedValues.length === 1) return options.find((o) => o.value === selectedValues[0])?.label ?? selectedValues[0];
    return `${selectedValues.length} seleccionados`;
  }, [isAllSelected, selectedValues, options, allLabel]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions.length]);

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

      if (value === '__ALL__') {
        onChange([]);
      } else {
        if (selectedValues.includes(value)) {
          const next = selectedValues.filter((v) => v !== value);
          onChange(next.length === 0 ? [] : next);
        } else {
          onChange([...selectedValues, value]);
        }
      }
      inputRef.current?.focus();
    },
    [onChange, selectedValues]
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

  const removeValue = (value: string) => {
    const next = selectedValues.filter((v) => v !== value);
    onChange(next.length === 0 ? [] : next);
  };

  const ringColor =
    accentColor === 'emerald'
      ? 'focus:ring-emerald-500/20 focus:border-emerald-400'
      : 'focus:ring-indigo-500/20 focus:border-indigo-400';

  const chipColor =
    accentColor === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-indigo-50 text-indigo-700 border border-indigo-200';

  const withAllOption = [
    { value: '__ALL__', label: allLabel, subtitle: `${options.length} opciones` },
    ...filteredOptions,
  ];

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      {label && (
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          <i className={`${icon} mr-1`}></i>
          {label}
        </label>
      )}

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
            placeholder={placeholder}
            disabled={disabled || options.length === 0}
            className={`w-full border border-gray-200 rounded-lg text-sm px-3 py-2.5 bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 ${ringColor} cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
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
              {withAllOption.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400 text-center">
                  <i className="ri-search-line text-lg text-gray-300 block mb-1"></i>
                  {emptyMessage}
                </div>
              ) : (
                <ul className="py-1">
                  {withAllOption.map((opt, idx) => {
                    const isSelected =
                      opt.value === '__ALL__'
                        ? isAllSelected
                        : selectedValues.includes(opt.value);
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
      {!isAllSelected && selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedValues.map((value) => {
            const option = options.find((o) => o.value === value);
            return (
              <span
                key={value}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${chipColor}`}
              >
                {option?.label ?? value}
                <button
                  onClick={() => removeValue(value)}
                  className="w-4 h-4 flex items-center justify-center hover:bg-black/10 rounded-full transition-colors cursor-pointer"
                  title="Quitar"
                >
                  <i className="ri-close-line text-xs"></i>
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}