import { Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AirportCombobox, type AirportSelection } from "@/components/search/AirportCombobox";
import { DateTimePicker, type DateHourValue } from "./DateTimePicker";

export interface OneWayState {
  from: AirportSelection | null;
  to: AirportSelection | null;
  depart: DateHourValue;
  return: DateHourValue;
  passengers: number;
}

interface OneWayFormProps {
  value: OneWayState;
  onChange: (next: OneWayState) => void;
  onSearch: () => void;
}

export function OneWayForm({ value, onChange, onSearch }: OneWayFormProps) {
  const canSearch =
    !!value.from && !!value.to && !!value.depart.date && value.passengers > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1.4fr_1.4fr_1fr_1fr_110px_auto] items-center">
        <AirportCombobox
          value={value.from}
          onChange={(v) => onChange({ ...value, from: v })}
          placeholder="From"
          className="w-full min-w-0"
        />
        <AirportCombobox
          value={value.to}
          onChange={(v) => onChange({ ...value, to: v })}
          placeholder="To"
          className="w-full min-w-0"
        />
        <DateTimePicker
          value={value.depart}
          onChange={(v) => onChange({ ...value, depart: v })}
          placeholder="Departure"
        />
        <DateTimePicker
          value={value.return}
          onChange={(v) => onChange({ ...value, return: v })}
          placeholder="Return (optional)"
          minDate={value.depart.date ?? undefined}
          minHourSameDate={
            value.depart.date && value.depart.hour !== null
              ? { date: value.depart.date, hour: value.depart.hour }
              : undefined
          }
        />
        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={value.passengers === 0 ? "" : value.passengers}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                // Allow temporary empty state so user can clear and retype.
                onChange({ ...value, passengers: 0 });
                return;
              }
              const n = parseInt(raw, 10);
              if (Number.isNaN(n)) return;
              onChange({ ...value, passengers: Math.min(500, Math.max(1, n)) });
            }}
            onBlur={() => {
              if (!value.passengers || value.passengers < 1) {
                onChange({ ...value, passengers: 1 });
              }
            }}
            className="pl-9"
            aria-label="Passengers"
          />
        </div>
        <Button onClick={onSearch} disabled={!canSearch} className="gap-2">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Leave return date blank for a one-way trip.
      </p>
    </div>
  );
}
