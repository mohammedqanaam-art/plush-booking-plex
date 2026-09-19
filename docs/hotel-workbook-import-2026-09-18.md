# Hotel information workbook import

Source: `معلومات الفنادق اخر نسخه(1).xlsx`, imported 2026-09-18. This is a reviewed snapshot, not a live workbook connection.

- Mapped database rows 2–61 to 60 stable branch IDs, including four new entries: Braira Jubail, Boudl Salmia, Boudl Fahahil and Zamn.
- Corrected the existing `boudl-moaz` display name to Boudl Masif using the workbook name and matching reception number. Retained its ID so existing links continue to work.
- Corrected branch cities from the named location entries: Maydan and Aber City Center in Hafar Al Batin, Braira Azizya in Khobar, and the Qassim branches in Buraydah, Unayzah or Ar Rass.
- Imported 51 location descriptions and 47 connecting-room entries. Continuation rows remain attached to their explicit branch; duplicate Aber Unayzah descriptions are deduplicated.
- Imported the reception phone column only. Additional numbers are shown separately for 16 branches. Existing reception numbers for Boudl Jubail and Aber Khamis are retained with a source disagreement notice.
- Missing cells remain unknown. Ambiguous AM/PM times and the conflicting connecting-room entries for Braira Wezarat, Braira Yarmouk and Boudl Worood have visible confirmation notices.
- Extra-bed amounts retain a currency/tax confirmation label because the source column does not identify those details.

Each hotel includes source sheet names and row numbers. No manager column, manager contacts, hall coordinators, discount percentages, credentials or raw workbook is included in the imported dataset. The public API rebuilds its response from explicit top-level and nested allowlists.

## Material excluded during review

- Location row 74 names only `Bodle`, so its description is not assigned to a branch.
- The signed cancellation-policy image and the editable cancellation table disagree, including company peak-season cancellation and individual early-departure charges. This import does not change cancellation rules.
- Honeymoon-package artwork lists brand-wide offers without branch-specific applicability. It is not used to overwrite branch package availability or promise prices.
- Regional map illustrations are approximate and contain label/address differences. Their pixels are not used as geospatial evidence or republished as navigation maps.
- The hall-coordinator number cells have negative numeric values and are not imported as hotel reception numbers.

The uploaded snapshot owns its imported facility and breakfast fields. The separate legacy Google feed may still supplement lunch, dinner and private hall contacts; it cannot silently overwrite imported hotel facts. Existing room inventories remain separate from connecting-room descriptions.

Useful older facility/package descriptions remain as explicitly dated supplements where the newer sheet does not say the service is unavailable. In particular, branch-specific package prices are never replaced by the brand-wide artwork. These supplements carry the older snapshot date and require branch confirmation.
