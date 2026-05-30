import { useState, useCallback, useEffect } from 'react';
import type { ColumnLayout } from '@/pages/comparison-v2/types/columns';
import { LS_KEY, getDefaultLayout, COLUMN_META } from '@/pages/comparison-v2/types/columns';

function loadLayout(): ColumnLayout | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ColumnLayout;
    // Validate that all columns in order exist in COLUMN_META
    const validOrder = parsed.order.filter((id) => COLUMN_META[id]);
    const validHidden = parsed.hidden.filter((id) => COLUMN_META[id]);
    return { ...parsed, order: validOrder, hidden: validHidden };
  } catch {
    return null;
  }
}

function saveLayout(layout: ColumnLayout): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(layout));
  } catch {
    // ignore
  }
}

export function useColumnConfig(mode: 'compare' | 'single_take') {
  const defaultLayout = getDefaultLayout(mode);
  const saved = loadLayout();
  const initial = saved ?? defaultLayout;

  // Always ensure the order matches the mode
  const filteredOrder = initial.order.filter((id) => {
    const meta = COLUMN_META[id];
    if (!meta) return false;
    return mode === 'single_take' ? meta.showInSingleTake : meta.showInCompare;
  });

  // Ensure all visible columns are present
  const allVisibleIds = Object.values(COLUMN_META)
    .filter((meta) => (mode === 'single_take' ? meta.showInSingleTake : meta.showInCompare))
    .map((meta) => meta.id);

  const missingIds = allVisibleIds.filter((id) => !filteredOrder.includes(id));
  const finalOrder = [...filteredOrder, ...missingIds];

  const [order, setOrder] = useState<string[]>(finalOrder);
  const [hidden, setHidden] = useState<string[]>(initial.hidden);
  const [widths] = useState<Record<string, number>>(initial.widths);
  const [showSettings, setShowSettings] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const persist = useCallback(
    (nextOrder: string[], nextHidden: string[]) => {
      const layout: ColumnLayout = { order: nextOrder, hidden: nextHidden, widths };
      saveLayout(layout);
    },
    [widths],
  );

  const moveColumn = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const fromIdx = order.indexOf(fromId);
      const toIdx = order.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const meta = COLUMN_META[fromId];
      if (meta?.sticky) return; // sticky columns can't move

      const newOrder = [...order];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, fromId);
      setOrder(newOrder);
      persist(newOrder, hidden);
    },
    [order, hidden, persist],
  );

  const toggleColumn = useCallback(
    (id: string) => {
      const meta = COLUMN_META[id];
      if (meta?.sticky) return; // sticky columns can't hide
      const isHidden = hidden.includes(id);
      const nextHidden = isHidden ? hidden.filter((h) => h !== id) : [...hidden, id];
      setHidden(nextHidden);
      persist(order, nextHidden);
    },
    [order, hidden, persist],
  );

  const resetLayout = useCallback(() => {
    const def = getDefaultLayout(mode);
    setOrder(def.order);
    setHidden(def.hidden);
    persist(def.order, def.hidden);
  }, [mode, persist]);

  const visibleColumns = useCallback(() => {
    return order.filter((id) => {
      const meta = COLUMN_META[id];
      if (!meta) return false;
      if (hidden.includes(id)) return false;
      return mode === 'single_take' ? meta.showInSingleTake : meta.showInCompare;
    });
  }, [order, hidden, mode]);

  const isSticky = useCallback(
    (id: string) => {
      return !!COLUMN_META[id]?.sticky;
    },
    [],
  );

  const getStickyOffset = useCallback(
    (id: string) => {
      const meta = COLUMN_META[id];
      if (!meta?.sticky || !meta.stickyOffset) return undefined;
      return meta.stickyOffset;
    },
    [],
  );

  // Save on unmount or when mode changes
  useEffect(() => {
    return () => {
      persist(order, hidden);
    };
  }, [order, hidden, persist]);

  return {
    order,
    hidden,
    showSettings,
    setShowSettings,
    draggingId,
    setDraggingId,
    moveColumn,
    toggleColumn,
    resetLayout,
    visibleColumns,
    isSticky,
    getStickyOffset,
  };
}