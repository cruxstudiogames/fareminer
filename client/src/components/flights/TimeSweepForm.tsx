import { useState, useMemo } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { getQualifyingDates } from '../../utils/dateRange';
import type { TimeSweepParams } from '../../types';
import { useFlightSearchStore } from '../../store/useFlightSearchStore';
import { AirportInput, useRecentAirports } from './AirportInput';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// getDay() values: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

interface TimeSweepFormProps {
  onSearch: (params: TimeSweepParams) => void;
  onCancel: () => void;
  isRunning: boolean;
}

function DayPills({
  label,
  days,
  setDays,
  disabled,
}: {
  label: string;
  days: number[];
  setDays: React.Dispatch<React.SetStateAction<number[]>>;
  disabled: boolean;
}) {
  const allSelected = days.length === 7;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-500 w-14 shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {DAY_LABELS.map((full, i) => {
          const active = days.includes(DAY_VALUES[i]);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              title={full}
              onClick={() =>
                setDays((prev) =>
                  prev.includes(DAY_VALUES[i])
                    ? prev.filter((d) => d !== DAY_VALUES[i])
                    : [...prev, DAY_VALUES[i]]
                )
              }
              className={`w-7 h-7 rounded-md text-xs font-medium transition-colors disabled:opacity-50
                ${active
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
            >
              {DAY_SHORT[i]}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setDays(allSelected ? [] : [1, 2, 3, 4, 5, 6, 0])}
        className="text-[10px] text-blue-500 hover:text-blue-700 disabled:opacity-50 ml-1"
      >
        {allSelected ? 'None' : 'All'}
      </button>
    </div>
  );
}

export function TimeSweepForm({ onSearch, onCancel, isRunning }: TimeSweepFormProps) {
  const store = useFlightSearchStore((s) => s.timeSweep);
  const setStore = useFlightSearchStore((s) => s.setTimeSweep);
  const addRecent = useRecentAirports((s) => s.addRecent);
  const [origin, setOrigin] = useState(store.origin);
  const [destination, setDestination] = useState(store.destination);
  const [startDate, setStartDate] = useState(store.startDate);
  const [endDate, setEndDate] = useState(store.endDate);
  const [daysOfWeek, setDaysOfWeek] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [returnDaysOfWeek, setReturnDaysOfWeek] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [minTripDays, setMinTripDays] = useState(4);
  const [maxTripDays, setMaxTripDays] = useState(5);
  const [adults, setAdults] = useState(store.adults);
  const [currency, setCurrency] = useState(store.currency);

  const outboundCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return getQualifyingDates(startDate, endDate, daysOfWeek).length;
  }, [startDate, endDate, daysOfWeek]);

  const returnCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return getQualifyingDates(startDate, endDate, returnDaysOfWeek).length;
  }, [startDate, endDate, returnDaysOfWeek]);

  const totalQueries = outboundCount + returnCount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalQueries === 0) return;
    setStore({ origin, destination, startDate, endDate, adults, currency });
    addRecent(origin.toUpperCase());
    addRecent(destination.toUpperCase());
    onSearch({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      startDate,
      endDate,
      daysOfWeek,
      returnDaysOfWeek,
      minTripDays,
      maxTripDays: Math.max(minTripDays, maxTripDays),
      adults,
      currency,
    });
  };

  const inputClass = "border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 disabled:opacity-50 transition-shadow";

  return (
    <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Route + Dates + Pax row */}
        <div className="flex items-end gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-end gap-1.5">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">From</label>
              <AirportInput
                value={origin}
                onChange={setOrigin}
                placeholder="JFK"
                required
                disabled={isRunning}
                className={`w-20 uppercase placeholder:normal-case ${inputClass}`}
              />
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 mb-2 shrink-0" />
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">To</label>
              <AirportInput
                value={destination}
                onChange={setDestination}
                placeholder="NRT"
                required
                disabled={isRunning}
                className={`w-20 uppercase placeholder:normal-case ${inputClass}`}
              />
            </div>
          </div>

          <div className="h-8 w-px bg-gray-200 hidden sm:block mb-0.5" />

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              disabled={isRunning}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              required
              disabled={isRunning}
              className={inputClass}
            />
          </div>

          <div className="h-8 w-px bg-gray-200 hidden sm:block mb-0.5" />

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Pax</label>
            <input
              type="number"
              value={adults}
              onChange={(e) => setAdults(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={9}
              disabled={isRunning}
              className={`w-14 ${inputClass}`}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Currency</label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="AUD"
              maxLength={3}
              disabled={isRunning}
              className={`w-16 uppercase placeholder:normal-case ${inputClass}`}
            />
          </div>

          {isRunning ? (
            <button
              type="button"
              onClick={onCancel}
              className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={totalQueries === 0}
              className="bg-blue-600 text-white px-5 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Search className="w-3.5 h-3.5" />
              Search
            </button>
          )}
        </div>

        {/* Day pickers + trip length */}
        <div className="flex items-start gap-6 sm:gap-10 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <DayPills label="Depart" days={daysOfWeek} setDays={setDaysOfWeek} disabled={isRunning} />
            <DayPills label="Return" days={returnDaysOfWeek} setDays={setReturnDaysOfWeek} disabled={isRunning} />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-500">Trip length</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={minTripDays}
                onChange={(e) => setMinTripDays(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={90}
                disabled={isRunning}
                className={`w-14 ${inputClass}`}
              />
              <span className="text-xs text-gray-400">&ndash;</span>
              <input
                type="number"
                value={maxTripDays}
                onChange={(e) => setMaxTripDays(Math.max(minTripDays, parseInt(e.target.value) || minTripDays))}
                min={minTripDays}
                max={90}
                disabled={isRunning}
                className={`w-14 ${inputClass}`}
              />
              <span className="text-xs text-gray-400">days</span>
            </div>
          </div>

          {totalQueries > 0 && (
            <div className="flex items-end pb-1 sm:ml-auto">
              <span className="text-xs text-gray-400">
                {totalQueries} quer{totalQueries !== 1 ? 'ies' : 'y'}
                {totalQueries > 20 && (
                  <span className="text-amber-500 ml-1">
                    ~{Math.ceil(totalQueries * 2 / 60)}m
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
