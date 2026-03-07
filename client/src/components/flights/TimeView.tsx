import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { FlightSearchResult } from '../../types';
import { formatCurrency } from '../../utils/formatCurrency';

interface TimeViewProps {
  results: FlightSearchResult[];
}

interface DayData {
  date: string;
  label: string;
  minPrice: number;
  count: number;
}

export function TimeView({ results }: TimeViewProps) {
  const data = useMemo<DayData[]>(() => {
    const byDate = new Map<string, { min: number; count: number }>();

    for (const r of results) {
      const date = r.departureAt.split('T')[0];
      const existing = byDate.get(date);
      if (!existing) {
        byDate.set(date, { min: r.totalPrice, count: 1 });
      } else {
        existing.min = Math.min(existing.min, r.totalPrice);
        existing.count++;
      }
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => {
        const d = new Date(date + 'T00:00:00');
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
        return {
          date,
          label: dayLabel,
          minPrice: val.min,
          count: val.count,
        };
      });
  }, [results]);

  const globalMin = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.min(...data.map((d) => d.minPrice));
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No data to display
      </div>
    );
  }

  return (
    <div className="flex-1 p-4">
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 20 + 60)}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={data.length > 14 ? -45 : 0}
            textAnchor={data.length > 14 ? 'end' : 'middle'}
            height={data.length > 14 ? 60 : 30}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => formatCurrency(v)}
            width={70}
          />
          <Tooltip
            formatter={(value: unknown) => [
              formatCurrency(Number(value)),
              'Min Price',
            ]}
            labelStyle={{ fontWeight: 600 }}
          />
          <Bar dataKey="minPrice" radius={[3, 3, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.minPrice === globalMin ? '#22C55E' : '#3B82F6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
