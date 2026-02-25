# Service Store Booking – Migration Notes (Old → Current)

## Phase 0 – Mapping

### Old project (caterwin_cardbey_web)

| Old file / concept | New location (current repo) |
|--------------------|-----------------------------|
| `/store-booking/:storeId` route | `App.jsx`: `/store-booking/:storeId` → `BookingPage` (lazy) |
| `BookingPage.jsx` (container) | `src/pages/booking/BookingPage.tsx` |
| `StoreBooking.jsx` (3-step flow) | `src/features/booking/StoreBooking.tsx` |
| Redux `storeBookings` slice | Local state in `StoreBooking` + optional `useBookingCart` (no Redux in current app) |
| `actions/storeBookings.js` | Inline in component or `features/booking/bookingState.ts` |
| `actions/services` (getAllServices, book, getTimeSlots) | `features/booking/bookingApi.ts` (stub then real) |
| `actions/staffs` (getStaffsByUserId) | `bookingApi.getStaffs(storeId)` (stub) |
| `actions/stores` (getStoreInfo) | `apiGET(/stores/:id)` or public store preview API |
| `/booking-payment` | Phase 2: `src/pages/booking/BookingPaymentPage.tsx` |
| `/booking-success` | `src/pages/booking/BookingSuccessPage.tsx` |
| `/u/:id/bookings` | Phase 3: `/app/bookings` |
| `_storeBooking.scss` | Tailwind in component (no global SCSS) |
| `main.css` booking styles | Tailwind utility classes |

### Old API → New API

| Old API | Current repo |
|---------|--------------|
| GET store by id (user context) | `GET /api/stores/:id` (auth) or public store via preview |
| GET services for store | Use `GET /api/menu/items?storeId=` or products; or stub |
| GET staff by userId | **Stub** (current core has no Staff model) |
| GET time slots (staff + date + duration) | **Stub** (e.g. 9–5, 30 min slots) |
| POST `/bookings/checkout` | **Stub** (return success + bookingId); Phase 2 real endpoint |

### Route summary

| Old route | New route |
|-----------|-----------|
| `/store-booking/:storeId` | `/store-booking/:storeId` (same; public) |
| `/booking-payment` | `/booking-payment` (Phase 2) |
| `/booking-success` | `/booking-success` |
| `/u/:id/bookings` | `/app/bookings` (Phase 3) |

### Safety (Store Creation → Draft → Publish)

- Booking is **additive only**. No changes to draft generation, publish flow, or store schema for creation.
- Service store detection uses existing `storeType` / `category` from preview data.
- New routes and feature folder are isolated from `storeDraft` and `StoreReviewPage`.
