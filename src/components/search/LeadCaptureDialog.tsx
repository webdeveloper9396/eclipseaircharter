/**
 * Lead Capture Dialog
 * 
 * Modal dialog for collecting lead information, triggered by:
 * - "Request availability" on a search result card (leg_inquiry)
 * - "Ask us to watch this route" from the empty state (route_watch)
 * 
 * Follows OneWay doctrine: calm, honest, non-pressuring copy.
 */

import { useState } from "react";
import eclipseLogo from "@/assets/eclipse-logo.jpg";
import { Loader2, CheckCircle2, ChevronDown } from "lucide-react";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type LeadRequestType = "leg_inquiry" | "route_watch";
export type MatchSection = "exact" | "nearby" | "wider";

export interface LeadCaptureContext {
  requestType: LeadRequestType;
  originIcao: string;
  destinationIcao: string;
  originLabel: string;
  destinationLabel: string;
  travelStartDate: string; // YYYY-MM-DD
  travelEndDate: string;   // YYYY-MM-DD
  emptyLegId?: string;
  matchSection?: MatchSection;
  emptyLegRouteLabel?: string;
  sessionId?: string;
  searchLogId?: string | null;
}

const AIRCRAFT_CATEGORIES = [
  { value: "any", label: "Any" },
  { value: "turboprop", label: "Turboprop" },
  { value: "light", label: "Light Jet" },
  { value: "midsize", label: "Midsize Jet" },
  { value: "heavy", label: "Heavy Jet" },
  { value: "ultra_long_range", label: "Ultra Long Range Jet" },
  { value: "vip_airliner", label: "Airliner" },
] as const;

const leadSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Please enter a valid email").max(255),
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  passengers: z.string().optional(),
  preferredCategory: z.string().optional(),
  notes: z.string().max(500).optional(),
  hasPets: z.boolean().optional(),
});

type LeadFormData = z.infer<typeof leadSchema>;

const COPY: Record<LeadRequestType, {
  title: string;
  description: string;
  confirmTitle: string;
  confirmDescription: string;
}> = {
  leg_inquiry: {
    title: "Request Details",
    description: "We'll review and follow up shortly. No obligation.",
    confirmTitle: "Request received",
    confirmDescription: "We're confirming availability and pricing now. We'll reach out with the details shortly.",
  },
  route_watch: {
    title: "Watch this route",
    description: "Quick turnaround. We'll confirm options and get back to you directly.",
    confirmTitle: "Thank you!",
    confirmDescription: "If any Empty Legs matching your travel itinerary come up – a member of our team will be in touch.",
  },
};

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatContextDate(dateStr: string): string {
  return format(parseDateOnly(dateStr), "EEE MMM d");
}

interface LeadCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: LeadCaptureContext | null;
}

export function LeadCaptureDialog({ open, onOpenChange, context }: LeadCaptureDialogProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [passengers, setPassengers] = useState("");
  const [preferredCategory, setPreferredCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [hasPets, setHasPets] = useState(false);
  const [quoteExactLeg, setQuoteExactLeg] = useState(false);
  const [quoteRequoteForRoute, setQuoteRequoteForRoute] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!context) return null;

  const copy = COPY[context.requestType];
  const isNonDirect = context.matchSection === "nearby" || context.matchSection === "wider";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = leadSchema.safeParse({ fullName, email, phone, passengers, preferredCategory, notes, hasPets });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    // Validate quote intent for non-direct
    if (isNonDirect && !quoteExactLeg && !quoteRequoteForRoute) {
      setErrors({ quoteIntent: "Select at least one option." });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        request_type: context.requestType,
        full_name: parsed.data.fullName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        passengers: parsed.data.passengers ? parseInt(parsed.data.passengers, 10) : null,
        preferred_category: parsed.data.preferredCategory || null,
        notes: parsed.data.notes || null,
        has_pets: parsed.data.hasPets || false,
        origin_airport_icao: context.originIcao,
        destination_airport_icao: context.destinationIcao,
        travel_start_date: context.travelStartDate,
        travel_end_date: context.travelEndDate,
        include_nearby: true,
        empty_leg_id: context.emptyLegId || null,
        source: "eclipse_emptylegs_alpha",
      };

      // Quote intent flags
      if (isNonDirect) {
        payload.quote_exact_leg = quoteExactLeg;
        payload.quote_requote_for_route = quoteRequoteForRoute;
      } else {
        payload.quote_exact_leg = true;
        payload.quote_requote_for_route = false;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-lead`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const result = await res.json();
      if (!res.ok || !result.ok) {
        throw new Error(result.error || "Something went wrong");
      }

      setIsSubmitted(true);

      // Fire form_submitted conversion event
      if (context.sessionId) {
        const convUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-conversion`;
        fetch(convUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: context.sessionId,
            search_log_id: context.searchLogId || null,
            event_type: "form_submitted",
            request_type: context.requestType,
            match_section: context.matchSection || null,
            empty_leg_id: context.emptyLegId || null,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[LeadCapture] Submit error:", err);
      let message = "We couldn't submit your request. Please check your connection and try again.";
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        message = "Network error — please check your internet connection and try again.";
      } else if (err instanceof Error) {
        const lower = err.message.toLowerCase();
        if (lower.includes("rate") || lower.includes("too many")) {
          message = "Too many requests. Please wait a moment and try again.";
        } else if (err.message && err.message !== "Something went wrong") {
          message = err.message;
        }
      }
      setErrors({ form: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTimeout(() => {
        setFullName("");
        setEmail("");
        setPhone("");
        setPassengers("");
        setPreferredCategory("");
        setNotes("");
        setHasPets(false);
        setQuoteExactLeg(false);
        setQuoteRequoteForRoute(true);
        setDetailsOpen(false);
        setErrors({});
        setIsSubmitted(false);
      }, 200);
    }
    onOpenChange(nextOpen);
  };

  const dateDisplay = context.travelStartDate === context.travelEndDate
    ? formatContextDate(context.travelStartDate)
    : `${formatContextDate(context.travelStartDate)} – ${formatContextDate(context.travelEndDate)}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {isSubmitted ? (
          /* Confirmation state */
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
              <DialogHeader className="text-left space-y-1.5">
                <DialogTitle>{copy.confirmTitle}</DialogTitle>
                <DialogDescription>{copy.confirmDescription}</DialogDescription>
              </DialogHeader>
            </div>

            {/* Contact info */}
            <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Questions? Contact Us</p>
              <div className="flex items-center gap-3">
                <img src={eclipseLogo} alt="Eclipse Air Charter" className="h-10 w-auto object-contain" />
                <div className="text-sm space-y-0.5">
                  <a href="tel:+14166467323" className="block text-foreground hover:text-primary transition-colors">+1 416 646 7323</a>
                  <a href="mailto:charter@eclipseaircharter.com" className="block text-foreground hover:text-primary transition-colors">charter@eclipseaircharter.com</a>
                </div>
              </div>
            </div>

            <Button className="w-full mt-4" onClick={() => handleClose(false)}>
              Close
            </Button>
          </div>
        ) : (
          /* Form state */
          <>
            <DialogHeader>
              <DialogTitle className="text-foreground">{copy.title}</DialogTitle>
              <DialogDescription className="text-foreground/80">{copy.description}</DialogDescription>
            </DialogHeader>

            {/* Read-only context block — high contrast */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">Your Request</p>
              <div className="rounded-md border-2 border-primary/40 bg-primary/5 px-4 py-3 text-sm space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-foreground/70 text-xs font-semibold uppercase tracking-wide">Route</span>
                  <span className="font-semibold text-foreground">{context.originLabel}</span>
                  <span className="text-foreground/50">→</span>
                  <span className="font-semibold text-foreground">{context.destinationLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground/70 text-xs font-semibold uppercase tracking-wide">Dates</span>
                  <span className="font-medium text-foreground">{dateDisplay}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground/70">We'll review this option for your route.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Quote intent section — only for non-direct matches */}
              {isNonDirect && (
                <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">What should we quote?</p>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="quote-exact"
                        checked={quoteExactLeg}
                        onCheckedChange={(checked) => setQuoteExactLeg(checked === true)}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor="quote-exact" className="text-sm font-medium text-foreground cursor-pointer">
                          Quote this empty leg as listed
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {context.emptyLegRouteLabel || "Use the departure/arrival airports shown on this card."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="quote-requote"
                        checked={quoteRequoteForRoute}
                        onCheckedChange={(checked) => setQuoteRequoteForRoute(checked === true)}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor="quote-requote" className="text-sm font-medium text-foreground cursor-pointer">
                          Re-quote for my requested route <span className="text-xs text-muted-foreground font-normal">(recommended)</span>
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          We'll check whether this aircraft can be repositioned or re-priced to your route.
                        </p>
                      </div>
                    </div>
                  </div>
                  {errors.quoteIntent && <p className="text-xs text-destructive">{errors.quoteIntent}</p>}
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="lead-name" className="text-xs font-medium text-foreground/80">Name</Label>
                <Input
                  id="lead-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="First and last name"
                  className="h-9"
                  aria-invalid={!!errors.fullName}
                />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="lead-email" className="text-xs font-medium text-foreground/80">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="h-9"
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone" className="text-xs font-medium text-foreground/80">Phone</Label>
                <Input
                  id="lead-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="h-9"
                  aria-invalid={!!errors.phone}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>

              {/* Collapsible additional details */}
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-muted/20 transition-colors"
                  >
                    <span>Additional details (optional)</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-passengers" className="text-xs font-medium text-foreground/80">Passengers</Label>
                      <Input
                        id="lead-passengers"
                        type="number"
                        min="1"
                        max="50"
                        value={passengers}
                        onChange={(e) => setPassengers(e.target.value)}
                        placeholder="e.g. 4"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-foreground/80">Preferred aircraft</Label>
                      <Select value={preferredCategory} onValueChange={setPreferredCategory}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          {AIRCRAFT_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="lead-pets"
                      checked={hasPets}
                      onCheckedChange={(checked) => setHasPets(checked === true)}
                    />
                    <Label htmlFor="lead-pets" className="text-xs font-medium text-foreground/80 cursor-pointer">
                      Traveling with pets
                    </Label>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lead-notes" className="text-xs font-medium text-foreground/80">Notes</Label>
                    <Textarea
                      id="lead-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any special requests or details…"
                      className="min-h-[60px] text-sm resize-none text-foreground"
                      maxLength={500}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {errors.form && (
                <p className="text-sm text-destructive">{errors.form}</p>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
