import { useState } from "react";
import { User, Mail, Phone, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  contactSchema,
  getOrderedCountries,
  submitCharterEnquiry,
  type CharterEnquiryInput,
  type ContactMethod,
} from "@/lib/charter-enquiry";
import { logConversion } from "@/lib/log-conversion";

interface EnquiryDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Omit<CharterEnquiryInput, "contact"> | null;
  sessionId?: string;
  onSubmitted: () => void;
}

const CONTACT_METHODS: { value: ContactMethod; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

export function EnquiryDetailsDialog({
  open,
  onOpenChange,
  enquiry,
  sessionId,
  onSubmitted,
}: EnquiryDetailsDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [preferred, setPreferred] = useState<ContactMethod>("call");
  const [submitting, setSubmitting] = useState(false);

  const { pinned, rest } = getOrderedCountries();

  const handleSubmit = async () => {
    if (!enquiry) return;

    const parsed = contactSchema.safeParse({
      name,
      email,
      phone,
      country,
      preferred_contact: preferred,
    });

    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Please check your details");
      return;
    }

    setSubmitting(true);
    try {
      const { id: enquiryId } = await submitCharterEnquiry({
        ...enquiry,
        contact: {
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone || "",
          country: parsed.data.country,
          preferred_contact: parsed.data.preferred_contact,
        },
      });
      if (sessionId) {
        logConversion({
          sessionId,
          eventType: "charter_form_submitted",
          flow: "charter",
          enquiryId,
          metadata: {
            trip_type: enquiry.trip_type,
            leg_count: enquiry.legs.length,
            passengers: enquiry.passengers,
            preferred_contact: parsed.data.preferred_contact,
            country: parsed.data.country,
          },
        });
      }
      toast.success("Request received — we'll be in touch.");
      // Reset
      setName("");
      setEmail("");
      setPhone("");
      setCountry("");
      setPreferred("call");
      onSubmitted();
    } catch (err) {
      console.error(err);
      toast.error("Could not submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto top-2 translate-y-0 sm:top-[50%] sm:translate-y-[-50%] rounded-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Enter your details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-9"
                maxLength={80}
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="email"
                placeholder="Email *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                maxLength={255}
              />
            </div>
          </div>

          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="tel"
              placeholder="Enter your mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="pl-9"
              maxLength={40}
            />
          </div>

          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Country"
          >
            <option value="">--Select Country--</option>
            <optgroup label="Common">
              {pinned.map((c) => (
                <option key={c.code} value={c.name}>{c.name}</option>
              ))}
            </optgroup>
            <optgroup label="All countries">
              {rest.map((c) => (
                <option key={c.code} value={c.name}>{c.name}</option>
              ))}
            </optgroup>
          </select>

          <div>
            <Label className="text-sm text-gray-800">Preferred Contact Method:</Label>
            <div className="mt-2 flex flex-wrap gap-4">
              {CONTACT_METHODS.map((m) => (
                <div key={m.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`contact-${m.value}`}
                    checked={preferred === m.value}
                    onCheckedChange={(checked) => {
                      if (checked) setPreferred(m.value);
                    }}
                  />
                  <Label
                    htmlFor={`contact-${m.value}`}
                    className="text-sm cursor-pointer text-gray-800"
                  >
                    {m.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Request Quote"}
          </Button>

          <Button
            variant="outline"
            className="w-full gap-2 text-gray-800"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
