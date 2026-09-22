# Madareem Riyadh — single-property call-center guide

Prepared on 2026-09-22 using the hotel's public website, https://hotelmadareem.com/.

This branch changes the employee-facing entry point to a Madareem-only guide. The deliverable contains public hotel facts, 11 accommodation categories, 13 hall listings, department contacts, policy summaries, source links, Arabic search, copy actions, room filters, a comparison table and a discount calculator.

## Inventory and verification

- **180 accommodation units** is the official aggregate of rooms, suites and villas, not a breakdown of standalone bedrooms or live availability.
- The number of units in each accommodation category is not published. Do not derive those counts from the total.
- The accessible suite is listed for **one adult**. Companion occupancy needs confirmation.
- Deluxe Villa and Pool Villa are distinct: a pool view does not imply a private pool.
- Official classification is stated as **4 stars** on the hotel's own About page; no separate license-register verification was performed.
- Policies are published general terms, not approval for a particular rate plan or booking. Current booking terms prevail.
- The outdoor restaurant outlet's published hours are ambiguous; they are flagged rather than guessed.
- The wedding page uses a legacy email domain, while the meetings page uses hotelmadareem.com. The contact section flags this discrepancy.

## Data isolation

The Madareem entry point does not import the BHG application, analytics, theme loader, authentication, reservation records, hotel workbooks, or assistant integrations. Vite publishes only `public-madareem`; existing BHG public assets are excluded. Netlify's functions directory is changed to an empty `netlify/madareem-functions` directory for this branch. No BHG functions, scheduled imports, webhooks, databases or secrets are called by the new guide.

Existing BHG source files are preserved in the repository history and checkout; they are not part of the Madareem browser bundle. This project contains no live connection to Madareem's reservation system, no transferred employee accounts and no fabricated booking statistics.

On 2026-09-22, the owner requested replacing the existing site's Boudl identity and information with Madareem. This change is prepared for production on the existing domain. The published experience is the single-hotel call-center information guide; it does not connect to a live reservation system.

## Official branding

The sidebar, mobile header, browser icon and home-screen icon use the hotel's own unmodified assets, downloaded from its official homepage on 2026-09-22. They are served locally so the site's content-security policy can remain unchanged.

- Logo: https://hotelmadareem.com/wp-content/uploads/2020/03/Website-Logo.png
- Browser/app icon: https://hotelmadareem.com/wp-content/uploads/2026/03/cropped-favicon4-192x192.jpg
- Apple home-screen icon: https://hotelmadareem.com/wp-content/uploads/2026/03/cropped-favicon4-180x180.jpg

## Information required from hotel operations

1. Approved unit counts per category, PMS codes, floors, connecting rooms, bedrooms and bathrooms.
2. Rates, meals, taxes and charge inclusions, additional-bed charges and live availability source.
3. Payment, deposits, guarantees, no-show, early-departure, special-rate cancellation and refund terms.
4. Pool access, children's ages, accessibility arrangements, duty-manager and complaint-escalation contacts.

## Main references

| Subject | Official source |
| --- | --- |
| Hotel and aggregate inventory | https://hotelmadareem.com/about-us/ |
| Accommodation categories | https://hotelmadareem.com/room-type/ |
| Address and telephone | https://hotelmadareem.com/contact-us/ |
| General policies | https://hotelmadareem.com/faq/ |
| Restaurants and cafés | https://hotelmadareem.com/restaurant/ |
| Facilities | https://hotelmadareem.com/services/ |
| Meetings | https://hotelmadareem.com/meeting-events/ |
| Weddings | https://hotelmadareem.com/wedding/ |
| Gym and pools | https://hotelmadareem.com/gym/ |
| Ladies' spa | https://hotelmadareem.com/spa/ |
| Kids' club | https://hotelmadareem.com/kids-club/ |
| Barber | https://hotelmadareem.com/barber-shop/ |

Each accommodation record in `src/madareem/data.ts` points to its individual official page, which supplies the area, occupancy and features.

## Validation

- `npm run build`: TypeScript and production bundle.
- `npm run check:netlify-toml`: configuration parsing.
- ESLint on the changed TypeScript files.
- Inspect built files for old BHG hotel domains, phone numbers, operational API routes and assets.

Use `npm run dev -- --host 127.0.0.1` for a local preview where loopback browsing is supported.
