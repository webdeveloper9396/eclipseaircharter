import { useRef, useState } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OneWayForm, type OneWayState } from "@/components/charter/OneWayForm";
import { MultiCityForm, emptyLeg } from "@/components/charter/MultiCityForm";
import type { LegState } from "@/components/charter/LegRow";
import { EnquiryDetailsDialog } from "@/components/charter/EnquiryDetailsDialog";
import type { CharterEnquiryInput, CharterLeg } from "@/lib/charter-enquiry";
import { logConversion } from "@/lib/log-conversion";
import { format } from "date-fns";
import eclipseLogo from "@/assets/eclipse-logo.jpg";

function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function legToCharterLeg(leg: LegState): CharterLeg {
  return {
    from_icao: leg.from!.icao,
    from_label: leg.from!.label,
    to_icao: leg.to!.icao,
    to_label: leg.to!.label,
    depart_date: isoDate(leg.when.date!),
    depart_hour: leg.when.hour,
  };
}

export default function CharterSearch() {
  const sessionId = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  ).current;

  const [mode, setMode] = useState<"one_way" | "multi_city">("one_way");

  const [oneWay, setOneWay] = useState<OneWayState>({
    from: null,
    to: null,
    depart: { date: null, hour: null },
    return: { date: null, hour: null },
    passengers: 1,
  });

  const [legs, setLegs] = useState<LegState[]>([emptyLeg(), emptyLeg()]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingEnquiry, setPendingEnquiry] = useState<
    Omit<CharterEnquiryInput, "contact"> | null
  >(null);

  const logSearchClicked = (enquiry: Omit<CharterEnquiryInput, "contact">) => {
    logConversion({
      sessionId,
      eventType: "charter_search_clicked",
      flow: "charter",
      metadata: {
        trip_type: enquiry.trip_type,
        leg_count: enquiry.legs.length,
        passengers: enquiry.passengers,
        has_return: !!enquiry.return_date,
        origin_icao: enquiry.legs[0]?.from_icao,
        destination_icao: enquiry.legs[enquiry.legs.length - 1]?.to_icao,
      },
    });
    logConversion({
      sessionId,
      eventType: "charter_dialog_opened",
      flow: "charter",
      metadata: { trip_type: enquiry.trip_type },
    });
  };

  const openDialogForOneWay = () => {
    if (!oneWay.from || !oneWay.to || !oneWay.depart.date) return;
    const charterLeg: CharterLeg = {
      from_icao: oneWay.from.icao,
      from_label: oneWay.from.label,
      to_icao: oneWay.to.icao,
      to_label: oneWay.to.label,
      depart_date: isoDate(oneWay.depart.date),
      depart_hour: oneWay.depart.hour,
    };
    const enquiry = {
      trip_type: "one_way" as const,
      legs: [charterLeg],
      return_date: oneWay.return.date ? isoDate(oneWay.return.date) : null,
      return_hour: oneWay.return.date ? oneWay.return.hour : null,
      passengers: oneWay.passengers,
    };
    setPendingEnquiry(enquiry);
    setDialogOpen(true);
    logSearchClicked(enquiry);
  };

  const openDialogForMultiCity = () => {
    if (!legs.every((l) => l.from && l.to && l.when.date)) return;
    const enquiry = {
      trip_type: "multi_city" as const,
      legs: legs.map(legToCharterLeg),
      return_date: null,
      return_hour: null,
      passengers: Math.max(...legs.map((l) => l.passengers)),
    };
    setPendingEnquiry(enquiry);
    setDialogOpen(true);
    logSearchClicked(enquiry);
  };

  const handleSubmitted = () => {
    setDialogOpen(false);
    setPendingEnquiry(null);
    setOneWay({
      from: null,
      to: null,
      depart: { date: null, hour: null },
      return: { date: null, hour: null },
      passengers: 1,
    });
    setLegs([emptyLeg(), emptyLeg()]);
  };

  return (
    <PublicLayout>
      {/* Section heading */}
      <div className="text-center mb-6">
        <h1
          className="uppercase tracking-[0.15em] text-[#b7a369]"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: "1.75rem" }}
        >
          View Aircraft Options &amp; Prices
        </h1>
        <div className="mx-auto mt-3 h-px w-12 bg-[#b7a369]" />
      </div>

      {/* Applet card */}
      <div className="bg-white rounded-md border border-border p-6 shadow-sm">
        <div className="flex justify-center mb-6">
          <img
            src={eclipseLogo}
            alt="Eclipse Air Charter"
            className="h-24 w-auto object-contain"
          />
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList>
            <TabsTrigger value="one_way">One Way / Return</TabsTrigger>
            <TabsTrigger value="multi_city">Multi-City</TabsTrigger>
          </TabsList>

          <TabsContent value="one_way" className="mt-4">
            <OneWayForm
              value={oneWay}
              onChange={setOneWay}
              onSearch={openDialogForOneWay}
            />
          </TabsContent>

          <TabsContent value="multi_city" className="mt-4">
            <MultiCityForm
              legs={legs}
              onChange={setLegs}
              onSearch={openDialogForMultiCity}
            />
          </TabsContent>
        </Tabs>
      </div>

      <EnquiryDetailsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        enquiry={pendingEnquiry}
        sessionId={sessionId}
        onSubmitted={handleSubmitted}
      />
    </PublicLayout>
  );
}
