import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LegRow, type LegState } from "./LegRow";

interface MultiCityFormProps {
  legs: LegState[];
  onChange: (next: LegState[]) => void;
  onSearch: () => void;
}

export function emptyLeg(): LegState {
  return {
    from: null,
    to: null,
    when: { date: null, hour: null },
    passengers: 1,
  };
}

export function MultiCityForm({ legs, onChange, onSearch }: MultiCityFormProps) {
  const canSearch =
    legs.length >= 2 &&
    legs.every((l) => l.from && l.to && l.when.date && l.passengers > 0);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {legs.map((leg, i) => {
          const prev = i > 0 ? legs[i - 1] : null;
          const prevHasDate = !!prev?.when.date;
          const minDate = prev?.when.date ?? undefined;
          const minHourSameDate =
            prev?.when.date
              ? { date: prev.when.date, hour: prev.when.hour }
              : undefined;
          return (
            <LegRow
              key={i}
              leg={leg}
              index={i}
              onChange={(next) => {
                const copy = [...legs];
                copy[i] = next;
                onChange(copy);
              }}
              onRemove={() => onChange(legs.filter((_, idx) => idx !== i))}
              canRemove={legs.length > 2}
              minDate={minDate}
              minHourSameDate={minHourSameDate}
              dateDisabled={i > 0 && !prevHasDate}
              dateDisabledReason={`Set leg ${i} date first`}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => onChange([...legs, emptyLeg()])}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add leg
        </Button>
        <Button onClick={onSearch} disabled={!canSearch} className="gap-2">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>
    </div>
  );
}
