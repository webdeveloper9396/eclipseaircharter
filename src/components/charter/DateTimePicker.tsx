import { useState } from "react";
import { CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { format, addMonths, addYears } from "date-fns";
import { useNavigation, type CaptionProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HOURS_0_TO_23, formatHour } from "@/lib/charter-enquiry";

function CustomCaption({ displayMonth, onToday }: CaptionProps & { onToday?: () => void }) {
  const { goToMonth } = useNavigation();
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Previous year"
          onClick={() => goToMonth(addYears(displayMonth, -1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-foreground"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => goToMonth(addMonths(displayMonth, -1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <div className="text-sm font-medium">
        {format(displayMonth, "MMMM yyyy")}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Next month"
          onClick={() => goToMonth(addMonths(displayMonth, 1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next year"
          onClick={() => goToMonth(addYears(displayMonth, 1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-foreground"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
        {onToday && (
          <button
            type="button"
            onClick={onToday}
            className="ml-1 h-7 px-2 inline-flex items-center justify-center rounded-md text-xs font-medium hover:bg-muted text-foreground border border-input"
          >
            Today
          </button>
        )}
      </div>
    </div>
  );
}

export interface DateHourValue {
  date: Date | null;
  hour: number | null; // 0-23
}

interface DateTimePickerProps {
  value: DateHourValue;
  onChange: (next: DateHourValue) => void;
  placeholder?: string;
  className?: string;
  minDate?: Date;
  /** If set, when the selected date equals this date, hours <= this hour are disabled. */
  minHourSameDate?: { date: Date; hour: number | null };
  disabled?: boolean;
  disabledReason?: string;
}

function formatTrigger(value: DateHourValue, placeholder: string): string {
  if (!value.date) return placeholder;
  const datePart = format(value.date, "dd MMM yyyy");
  if (value.hour === null || value.hour === undefined) return datePart;
  return `${datePart} ${formatHour(value.hour)}`;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date",
  className,
  minDate,
  minHourSameDate,
  disabled,
  disabledReason,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const disabledBefore = minDate ?? today;
  const currentYear = today.getFullYear();

  const hasDate = !!value.date;
  const sameAsMinDate =
    !!value.date &&
    !!minHourSameDate &&
    value.date.getFullYear() === minHourSameDate.date.getFullYear() &&
    value.date.getMonth() === minHourSameDate.date.getMonth() &&
    value.date.getDate() === minHourSameDate.date.getDate();
  const minHour =
    sameAsMinDate && minHourSameDate?.hour !== null && minHourSameDate?.hour !== undefined
      ? minHourSameDate!.hour
      : null;

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value.date && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">
            {disabled && disabledReason && !value.date
              ? disabledReason
              : formatTrigger(value, placeholder)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex">
          <Calendar
            mode="single"
            selected={value.date ?? undefined}
            onSelect={(d) => onChange({ date: d ?? null, hour: value.hour })}
            disabled={(d) => d < disabledBefore}
            initialFocus
            defaultMonth={value.date ?? disabledBefore}
            className={cn("p-3 pointer-events-auto")}
            classNames={{
              caption: "flex justify-center pt-1 relative items-center",
              nav: "hidden",
              day_selected:
                "bg-eclipse-gold text-white hover:bg-eclipse-gold hover:text-white focus:bg-eclipse-gold focus:text-white",
              day_today: "ring-1 ring-inset ring-eclipse-gold/60 text-foreground",
            }}
            components={{
              Caption: (props) => (
                <CustomCaption
                  {...props}
                  onToday={() => {
                    const t = new Date();
                    t.setHours(0, 0, 0, 0);
                    if (t >= disabledBefore) {
                      onChange({ date: t, hour: value.hour });
                    }
                  }}
                />
              ),
            }}
          />

          <div className="flex flex-col border-l">
            <ScrollArea className="h-[280px] w-24">
              <div className="flex flex-col p-2 gap-1">
                {!hasDate && (
                  <p className="px-1 py-2 text-xs text-muted-foreground text-center">
                    Pick a date first
                  </p>
                )}
                {HOURS_0_TO_23.map((h) => {
                  const selected = value.hour === h;
                  const hourDisabled =
                    !hasDate || (minHour !== null && h <= minHour);
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={hourDisabled}
                      onClick={() => {
                        if (!value.date) return;
                        onChange({
                          date: value.date,
                          hour: h,
                        });
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground",
                        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-inherit",
                        selected &&
                          "bg-eclipse-gold text-white hover:bg-eclipse-gold hover:text-white",
                      )}
                    >
                      {formatHour(h)}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <button
              type="button"
              onClick={() => onChange({ date: value.date, hour: null })}
              className="border-t px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={value.hour === null}
            >
              Clear time
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
