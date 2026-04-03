import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { airports } from '../../data/airports';
import { useRecentAirports } from './AirportInput';

const airportEntries = Object.entries(airports).map(([code, info]) => ({
  code,
  city: info.city,
  country: info.country,
  searchStr: `${code} ${info.city} ${info.country}`.toLowerCase(),
}));

interface MultiAirportInputProps {
  codes: string[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  color: 'blue' | 'green';
}

export function MultiAirportInput({ codes, onChange, placeholder, disabled, color }: MultiAirportInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const recent = useRecentAirports((s) => s.recent);
  const addRecent = useRecentAirports((s) => s.addRecent);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  const codeSet = useMemo(() => new Set(codes), [codes]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return recent
        .filter((code) => airports[code] && !codeSet.has(code))
        .map((code) => ({
          code,
          city: airports[code].city,
          country: airports[code].country,
          isRecent: true,
        }));
    }

    const codeMatches = airportEntries
      .filter((e) => e.code.toLowerCase().startsWith(q) && !codeSet.has(e.code));
    const placeMatches = airportEntries
      .filter((e) => !e.code.toLowerCase().startsWith(q) && !codeSet.has(e.code) && e.searchStr.includes(q));
    const all = [...codeMatches, ...placeMatches].slice(0, 20);

    const recentSet = new Set(recent);
    const recentCodeMatches = codeMatches.filter((m) => recentSet.has(m.code));
    const otherAll = all.filter((m) => !recentSet.has(m.code));

    return [
      ...recentCodeMatches.map((m) => ({ ...m, isRecent: true })),
      ...otherAll.map((m) => ({ ...m, isRecent: false })),
    ].slice(0, 12);
  }, [query, recent, codeSet]);

  useEffect(() => {
    setHighlightIdx(-1);
  }, [suggestions.length, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIdx] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  const addCode = (code: string) => {
    if (!codeSet.has(code)) {
      onChange([...codes, code]);
      addRecent(code);
    }
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  };

  const removeCode = (code: string) => {
    onChange(codes.filter((c) => c !== code));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && query === '' && codes.length > 0) {
      e.preventDefault();
      onChange(codes.slice(0, -1));
      return;
    }

    if (!open || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if ((e.key === 'Enter' || e.key === 'Tab') && suggestions.length > 0) {
      e.preventDefault();
      const idx = highlightIdx >= 0 ? highlightIdx : 0;
      addCode(suggestions[idx].code);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    // Split on newlines, commas, spaces, tabs — extract 3-letter codes
    const parsed = text
      .split(/[\n\r,\s\t]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{3}$/.test(s) && airports[s] && !codeSet.has(s));
    if (parsed.length > 0) {
      e.preventDefault();
      const unique = [...new Set(parsed)];
      onChange([...codes, ...unique.filter((c) => !codeSet.has(c))]);
      unique.forEach(addRecent);
      setQuery('');
    }
  };

  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const showDropdown = open && focused && suggestions.length > 0;

  const chipBg = color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';
  const chipClose = color === 'blue' ? 'hover:bg-blue-200' : 'hover:bg-green-200';

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center flex-wrap gap-1 border border-gray-300 rounded-md px-1.5 py-1 min-h-[34px] cursor-text ${
          focused ? 'ring-1 ring-blue-400 border-blue-400' : ''
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        {codes.map((code) => (
          <span
            key={code}
            className={`inline-flex items-center gap-0.5 text-xs font-mono font-medium px-1.5 py-0.5 rounded ${chipBg}`}
          >
            {code}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeCode(code);
              }}
              className={`rounded-full p-0.5 ${chipClose}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={codes.length === 0 ? placeholder : ''}
          disabled={disabled}
          autoComplete="off"
          className="flex-1 min-w-[60px] outline-none text-sm bg-transparent py-0.5 uppercase placeholder:normal-case"
        />
        {codes.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
            title="Copy airport codes"
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          ref={listRef}
          className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[220px] max-h-60 overflow-auto"
        >
          {suggestions.some((s) => s.isRecent) && !query.trim() && (
            <div className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wider">Recent</div>
          )}
          {suggestions.map((s, i) => (
            <button
              key={s.code}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addCode(s.code);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                i === highlightIdx
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="font-mono font-medium w-8 flex-shrink-0">{s.code}</span>
              <span className="text-gray-500 truncate text-xs">
                {s.city ? `${s.city}, ${s.country}` : s.country}
              </span>
              {s.isRecent && query.trim() && (
                <span className="ml-auto text-[10px] text-gray-300 flex-shrink-0">recent</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
