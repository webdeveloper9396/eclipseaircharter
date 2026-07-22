# Charter Enquiry Page (admin test)

A new admin-only page that recreates the Eclipse charter enquiry flow, reusing existing airport search/display logic. Submit is stubbed (no email yet); enquiries are persisted to the internal Lovable Cloud DB for analytics, locked down behind admin RLS.

## Scope

In:
- New route `/admin/charter-search` behind `ProtectedRoute` + `RequireRole('admin')`, plus a sidebar entry under the admin section.
- Two modes: **One Way** (with optional return) and **Multi-City** (≥2 legs, add/remove).
- Reuses `AirportCombobox` / `usePublicSearchAirports` so the same admin-configured display order is used.
- Date + optional **hour-only** time picker (calendar + scrollable hour list side-by-side, modeled after the reference screenshot — clear button leaves time empty).
- Passenger count input (min 1).
- "Enter your details" dialog on Search: name*, email*, mobile, country (full ISO list with common ones pinned), preferred contact method (single-select Call / Email / WhatsApp), Request Quote + Back.
- Persist submission to a new internal table `charter_enquiries`; show success toast.
- Page is gated; not linked from any public route.

Out (deferred):
- Sending email (charter@eclipseaircharter.com, db@ test recipient). Submit handler leaves a clearly marked TODO for a future `send-charter-enquiry` edge function.
- Replacing the public `/search` landing page.
- Admin list/inbox UI for stored enquiries (table exists, viewer comes later).

## UX details

One Way layout (matches reference):
- Tabs row: One Way | Multi-City (underline style, Eclipse gold).
- Row of inputs: From, To, Departure date/time, Passengers, Search button.
- Below: secondary "Return (optional)" date/time picker with helper text "Leave blank for one-way".

Multi-City:
- Starts with 2 leg rows. Each row: From, To, Date/time, Passengers, remove (disabled when only 2 legs).
- "+ Add leg" button below the last row.
- Single Search button at the bottom.

Date/time picker (matches attached screenshot):
- Trigger button shows `dd MMM yyyy` or `dd MMM yyyy h:mm a` if time set; placeholder "Select date".
- Popover layout: shadcn `Calendar` on the left, vertical scroll list of hour slots on the right (12:00 AM, 1:00 AM … 11:00 PM — 24 entries). Selected hour highlighted in Eclipse gold.
- "Clear time" link below the hour list (date stays selected, time wipes).
- Past dates disabled.

Details dialog:
- Validated with zod (name 1–80, valid email, optional phone, country required, exactly one contact method).
- Back collapses the dialog and returns to the search form with state preserved.
- Request Quote calls the stubbed submit, persists row, shows toast "Request received — we'll be in touch.", closes the dialog and resets the form.

## Data model

New internal table `public.charter_enquiries` (Lovable Cloud DB — keeps app-owned form data separate from external operational DB):

Fields:
- trip_type (`one_way` | `multi_city`)
- legs (jsonb array of `{ from_icao, from_label, to_icao, to_label, depart_date, depart_hour? }`)
- return_date, return_hour (nullable; only for one_way)
- passengers (int)
- contact_name, contact_email, contact_phone (nullable), contact_country, preferred_contact (`call` | `email` | `whatsapp`)
- submitted_by_user_id (auth.uid, nullable for future public use)
- user_agent, referrer (nullable)
- created_at

RLS:
- INSERT: `authenticated` (page is admin-only today; when we go public, we'll route through an edge function and add a controlled anon path).
- SELECT/UPDATE/DELETE: admin only via `has_role(auth.uid(),'admin')`.
- GRANTs: `INSERT, SELECT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`. No `anon` grant.

## Files

New:
- `src/pages/admin/CharterSearch.tsx` — page shell, tabs, mode switch.
- `src/components/charter/OneWayForm.tsx`
- `src/components/charter/MultiCityForm.tsx`
- `src/components/charter/LegRow.tsx` — From/To/DateTime/Pax row.
- `src/components/charter/DateTimePicker.tsx` — side-by-side calendar + hour list popover.
- `src/components/charter/EnquiryDetailsDialog.tsx` — contact form + submit.
- `src/lib/charter-enquiry.ts` — zod schemas, full ISO country list (common ones pinned: US, CA, GB, AU, AE, then alphabetical), and `submitCharterEnquiry()` helper (inserts row; TODO for future email function).

Modified:
- `src/App.tsx` — add `/admin/charter-search` route guarded by `ProtectedRoute` + `RequireRole('admin')`.
- `src/components/layout/AppSidebar.tsx` — add "Charter Search (test)" link in the admin section.

DB:
- One migration creating `charter_enquiries` with GRANTs, RLS, policies, and an `updated_at` trigger.

## Technical notes

- Airport pickers reuse `AirportCombobox` (already wired to `usePublicSearchAirports` → admin-ranked display order).
- Hours stored as integer 0–23; formatted with `date-fns` `format(setHours(date, h), 'h:mm a')` for display.
- Time list uses native `<button>`s inside `ScrollArea`; "Clear time" wipes the hour while keeping the date.
- Country list: single static array in `charter-enquiry.ts`, ~250 entries, rendered with a `<select>` (native) for now to keep it simple; pinned countries appear above a divider.
- All form state is local React state; no global store needed.
- Insert uses the internal `@/integrations/supabase/client` (Lovable Cloud), not the external client.
- Submit handler is a single async function so wiring the future edge function is a one-line change.

## Out of scope reminders

- No email sending in this task.
- No changes to public `/search` route or empty-legs flow.
- No DB hardening pass beyond the new table's own RLS.
