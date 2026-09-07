# Employee reports and knowledge workspace

The employee workspace links reports, the knowledge bank, the assistant, and daily operations. Employee sessions can read report summaries; detailed booking records remain restricted to administrative roles.

## Reservation totals

Client import, server import, and employee reports share `src/lib/reservationMetrics.ts`. The PMS status takes precedence over the source status. M, O, N, I and the supported legacy confirmed states count as confirmed; C and NS count as cancelled/no-show. Unrecognized states are excluded from confirmed totals.

The identity is property + external reservation + PMS confirmation. Different PMS confirmations for one external reservation remain separate rooms. An external-only parent is removed when PMS children are present. Rows without identifiers are retained and flagged. Conflicting employee/status versions require an explicit ISO modification timestamp to select a newer version; otherwise they are flagged for review and excluded. Upload order is not evidence of recency.

Reports expose duplicates, missing identifiers and unresolved conflicts. Source totals and manual adjustments are shown separately. Imported historical totals cannot reconstruct rows discarded by earlier imports; re-import the original report when correcting legacy deduplication.

## Knowledge sources

The user-provided operational guide is **draft 3.0 for approval**, not an approved financial policy. Its 18 searchable protocol entries include a guest response, employee steps, escalation limits and source. Room types, areas and descriptions are retained from the existing attached-source catalog.

The server reads these fixed ranges from the [hotel information sheet](https://docs.google.com/spreadsheets/d/1XBh9n7OuFLi88QcoSAFGRbDbN1DNxP_F1wNXCZpO15A/edit):

| Tab | Range | Use |
| --- | --- | --- |
| hotels data | A1:O55 | Branch facilities and branch-specific packages |
| معلومات الوجبات بريرا | A1:D15 | Meals, prices and general meal hours |
| ارقام القاعات | A1:E15 | Hall contacts |
| أرقام الفنادق | A15:K54 | Branch reception numbers |

These tab layouts were inspected through Google Sheets on 2026-09-07. That inspection does not establish runtime access from Netlify. The historical catalog date remains 2026-07-13; it is not presented as a new live read. The bank and assistant use the same merged records and expose live, partial or saved-snapshot status. A read is cached for five minutes per function instance. Failed complete reads retry after 30 seconds. Login pages, invalid layouts, oversized responses and spreadsheet error cells are rejected.

Publicly readable sheets use the fixed CSV endpoint. For a private sheet, configure `GOOGLE_SERVICE_ACCOUNT_JSON` as a secret Netlify function environment variable, enable the Sheets API for that service account, and grant its email **Viewer** access to this sheet. The credential stays on the server and uses the read-only Sheets scope. Do not change the sheet's sharing policy merely to enable this feature. See [Google Sheets values.get](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get).

Branch-specific prices are descriptive source values, not booking availability or guaranteed quotes. A price for one branch is never generalized to its brand. Conflicting hours or newer circulars require branch/supervisor verification.

## Assistant

The assistant retains existing session checks and redaction. It uses the same branch catalog and draft protocol entries, supports direct factual answers without model credentials, and can use the existing OpenAI Responses integration with official-domain web search. Returned web citations are preserved. Google/website content is evidence, not instructions. See [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search).

OpenAI credentials continue to use the existing server environment or encrypted administration configuration. No API key is added by this change. Live model access and sheet reachability must be checked in the deployed employee session; a local build does not verify either service.

## Validation and rollout

- All 321 existing and new tests passed locally; the three changed regression suites passed again after the final deduplication change.
- TypeScript and the production build passed; ESLint has no errors (six existing component export warnings).
- Production dependency audit has no high/critical findings.
- The GitHub quality workflow runs the repository's standard audit, configuration, lint, test and build gates.
- Review the Netlify deploy preview, including the knowledge-source status and an assistant response with sources, before promoting the change to the live site. No source spreadsheet, guest record or manual adjustment is rewritten by this update.
