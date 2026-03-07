const STORAGE_KEY = 'fare_miner_state';

interface SavedState {
  tripName: string;
  columns: Record<string, { id: string; name: string; itemIds: string[] }>;
  columnOrder: string[];
  items: Record<string, unknown>;
}

export function saveToStorage(state: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    console.warn('Failed to save to localStorage');
  }
}

export function loadFromStorage(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedState;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}
