# BHG AI knowledge boundary

The assistant answers branch questions from a server-side cached index. User requests never crawl Boudl, Booking.com, or Google Sheets synchronously.

## Sources and precedence

1. `boudl.com` and `booking.boudl.com` are the primary public sources.
2. `BHG_BRANCH_SHEET_CSV_URL` is internal-only. The importer keeps an explicit amenity/service allowlist and drops contact, employee, credential, booking, price, and guest fields.
3. `BHG_BOOKING_PROPERTY_URLS` is an explicit Booking.com property-page allowlist. A page is indexed only when its content also matches a branch already known from Boudl or the safe sheet. Booking.com is never treated as proof of live price or availability.

The public visitor assistant cannot retrieve sheet documents. Admin sessions may retrieve the sanitized sheet facts; the raw sheet URL is never returned to the model or browser.

## Required runtime configuration

- `BHG_KNOWLEDGE_REFRESH_SECRET`: long random server-only secret used between the scheduler and background refresh function.
- `BHG_BRANCH_SHEET_CSV_URL`: optional exact Google Sheets CSV export URL for a dedicated safe tab.
- `BHG_BOOKING_PROPERTY_URLS`: optional newline- or comma-separated list of approved BHG property URLs on Booking.com.

Do not point `BHG_BRANCH_SHEET_CSV_URL` at a workbook whose sharing exposes sensitive tabs. Application filtering protects assistant output, but it cannot repair unsafe Google Drive sharing on the source workbook. Prefer a dedicated operational-safe workbook or authenticated service-account integration.

## Refresh and response path

- The scheduled function queues a background rebuild every six hours.
- Manual admin refresh also queues the same background job and returns immediately.
- The index is stored in Netlify Blobs and reused in memory for five minutes.
- Generated answers are cached by a SHA-256 conversation key for 30 minutes. Raw questions are not used as Blob keys, and conversations containing redaction markers are never cached.
- If the index is absent, a question returns without starting a live crawl. This preserves latency and prevents unbounded outbound work on the request path.
