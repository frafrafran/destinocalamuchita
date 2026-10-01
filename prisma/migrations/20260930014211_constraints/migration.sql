-- Integrity rules Prisma cannot express in schema.prisma.
-- These are the last line of defence against double bookings: even if application code had a bug,
-- PostgreSQL refuses two blocking reservations whose nights overlap for the same property.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Valid ranges ([start, end) with at least one night).
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_dates_check" CHECK ("checkOut" > "checkIn"),
  ADD CONSTRAINT "Reservation_nights_check" CHECK ("nights" = ("checkOut" - "checkIn")),
  ADD CONSTRAINT "Reservation_guestCount_check" CHECK ("guestCount" > 0),
  ADD CONSTRAINT "Reservation_total_check" CHECK ("total" >= 0);

ALTER TABLE "Availability" ADD CONSTRAINT "Availability_dates_check" CHECK ("endDate" > "startDate");
ALTER TABLE "Season" ADD CONSTRAINT "Season_dates_check" CHECK ("endDate" > "startDate");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_dates_check" CHECK ("endDate" > "startDate");
ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_dates_check"
  CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" > "startDate");

ALTER TABLE "Property"
  ADD CONSTRAINT "Property_capacity_check" CHECK ("maxGuests" > 0 AND "bedrooms" >= 0 AND "beds" >= 0 AND "bathrooms" >= 0),
  ADD CONSTRAINT "Property_price_check" CHECK ("basePrice" >= 0 AND "cleaningFee" >= 0 AND ("weekendPrice" IS NULL OR "weekendPrice" >= 0)),
  ADD CONSTRAINT "Property_nights_check" CHECK ("minNights" >= 1 AND ("maxNights" IS NULL OR "maxNights" >= "minNights"));

ALTER TABLE "Owner" ADD CONSTRAINT "Owner_commission_check" CHECK ("commissionPercent" >= 0 AND "commissionPercent" <= 100);

-- No two date-blocking reservations may overlap for the same property.
-- Keep this status list in sync with BLOCKING_STATUSES in src/lib/reservation-status.ts.
ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_no_overlap"
  EXCLUDE USING gist (
    "propertyId" WITH =,
    daterange("checkIn", "checkOut", '[)') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'AWAITING_PAYMENT', 'PROOF_RECEIVED', 'UNDER_REVIEW', 'CONFIRMED', 'COMPLETED'));
