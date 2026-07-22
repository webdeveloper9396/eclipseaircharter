import { Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AirportCombobox, type AirportSelection } from "@/components/search/AirportCombobox";
import { DateTimePicker, type DateHourValue } from "./DateTimePicker";

export interface LegState {
  from: AirportSelection | null;
  to: AirportSelection | null;
  when: DateHourValue;
  passengers: number;
}

interface LegRowProps {
  leg: LegState;
  index: number;
  onChange: (next: LegState) => void;
  onRemove?: () => void;
  canRemove?: boolean;
  minDate?: Date;
  minHourSameDate?: { date: Date; hour: number | null };
  dateDisabled?: boolean;
  dateDisabledReason?: string;
}

export function LegRow({ leg, index, onChange, onRemove, canRemove, minDate, minHourSameDate, dateDisabled, dateDisabledReason }: LegRowProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Leg {index + 1}
        </span>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={!canRemove}
            className="h-7 px-2 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_120px]">
        <AirportCombobox
          value={leg.from}
          onChange={(v) => onChange({ ...leg, from: v })}
          placeholder="From"
          className="w-full min-w-0"
        />
        <AirportCombobox
          value={leg.to}
          onChange={(v) => onChange({ ...leg, to: v })}
          placeholder="To"
          className="w-full min-w-0"
        />
        <DateTimePicker
          value={leg.when}
          onChange={(v) => onChange({ ...leg, when: v })}
          placeholder="Departure"
          minDate={minDate}
          minHourSameDate={minHourSameDate}
          disabled={dateDisabled}
          disabledReason={dateDisabledReason}
        />
        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={leg.passengers === 0 ? "" : leg.passengers}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange({ ...leg, passengers: 0 });
                return;
              }
              const n = parseInt(raw, 10);
              if (Number.isNaN(n)) return;
              onChange({ ...leg, passengers: Math.min(500, Math.max(1, n)) });
            }}
            onBlur={() => {
              if (!leg.passengers || leg.passengers < 1) {
                onChange({ ...leg, passengers: 1 });
              }
            }}
            className="pl-9"
            aria-label={`Passengers for leg ${index + 1}`}
          />
        </div>
      </div>
    </div>
  );
}
