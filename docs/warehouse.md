# Warehouse receiving and returns

Open **Warehouse** in the dashboard. Admin can select **Set up warehouse database** once if the new tables are missing. Saving a **Warehouse** account under Settings → Accounts also initializes the warehouse schema automatically. Alternatively run migration `014_warehouse.sql` through the existing migration runner.

Warehouse and Admin manage manifests, receiving, discrepancies, barcode aliases and bays. FS/PA view inventory. Installers see inventory linked to their assigned jobs and can submit returns with a reason and uploaded photo. Warehouse accounts do not inherit job, payment, account-management or bonus-edit permissions.

Import an electronic Simonton manifest PDF, check the preview against the manifest's total, enter a unique shipment reference and store number, then import. Import creates expected items only; duplicate external item IDs are not counted again. PO `073-686442` separates store `073` from CID `686442`; suffixes such as `073-660530-1-8-R` are preserved. Accounts without a store field belong to store `073`. Ambiguous or unmatched jobs require explicit matching by store and CID. Manufacturer customer numbers are not homeowner IDs.

Scan a barcode or choose a barcode photo to find an item. Review and confirm physical receiving and bay. Code 39 raw `%Y` and its Full ASCII DEL encoding are normalized to the same manifest ID. Unknown barcodes can be explicitly matched to a reviewed physical item. Never match on dimensions or AQ alone, because multiple physical units can share them.

Missing/damaged items alert PA, Admin, Warehouse and the assigned FS in Job Alerts. Item events retain actor, reason, date and photo. A job moves from ORD to RCVD only through the separate confirmation that all required products are usable, received and located. Products not on known manifests still require the warehouse's physical check.

Installer returns remain **Return Pending** until Warehouse confirms receipt and bay. Unlisted older products can be submitted against an assigned job with label details and photo. Returns do not create a reorder or change the job status. Inventory survives job deletion with its CID and audit history retained.

Loading scans and equipment checkout are deferred. Picking-ticket parsing is not part of this release; manual entries support exceptions. Camera/photo scanning and saves require a connected browser; installer location requirements continue to apply.

Validation: warehouse and live-operations tests; TypeScript; production build. The supplied six-page PDF was checked with the same PDF.js extraction used by the app: 218 items / 23 POs. Its sample label was decoded using ZXing and matched to the first manifest item.

## Receiving flow and uneven labels (October 21)
Scan controls are near the top of the workspace. A matched item selects its linked ORD account. Saving the last usable expected item opens the receiving card; its bay is prefilled only when the items share one bay. Receipt still requires a human confirmation covering all required shipments. No status changes occur from scanning alone.

The ORD dropdown is replaced with search by Customer ID, PO, name, address, city, manufacturer order and AQ. Results show usable/expected counts and blockers; at most 20 are shown until the search is narrowed. Exact CID matches sort first. No giant default list. Warehouse job responses expose only identifying address/product details, not payments or full job history.

Camera decoding retains fast perpendicular passes, with an occasional enhanced attempt distributed across tilted angles. Enhanced photo decoding uses overlapping scan bands and local contrast stretching to find an intact area around a crease. Continuous focus and a light toggle are enabled only when supported by the camera. Folds obscuring bars, glare and severely warped printing may still require repositioning or an exact CID/AQ lookup; no barcode values are guessed.

Validation includes Code 39 at all four orientations, -12/+12/+24-degree tilt, a simulated partially obscured scan band, receiving search, blockers and server RCVD safeguards. These tests do not establish real-device success for every damaged label.

## Job scan groups and theme parity
Warehouse receiving uses a continuous camera session directly in the scanner card. Select an account by search or scan its first linked item, scan its Expected/Missing units, then review the group before a single receipt save. Scans do not change inventory until confirmation. Duplicate scans count once. A group cannot mix customers. Every unscanned Expected unit must be explicitly marked missing or left expected for a later delivery; the latter does not assert the item is missing. Missing units require a reason, including when an entire delivery is absent. A bay is mandatory only when physically receiving units. Damaged and returned products retain individual review controls.

The server locks the job and all its inventory under the warehouse advisory lock, compares the complete item/version snapshot, validates nonoverlapping decisions and job ownership, then commits all receipts, missing flags, events and job history together. Missing-item notifications are saved for every active FS, Admin and PA account (including legacy office role), with customer ID, item IDs/AQs and reason. Duplicate or stale submissions roll back and do not send repeated alerts. Existing individual missing/damage alerts now include active field supervisors even without a job assignment. No automatic RCVD transition; the existing complete-receipt check remains required.

Item fallback controls now render immediately after the scanner rather than after the inventory list. Group confirmation controls remain in that same card with a sticky confirmation bar. Search can initialize a group without scanning, allowing an entirely missing delivery to be flagged.

Dashboard and warehouse palettes are defined together in components/operations-palette.css, including Gators' blue header/orange action color, national themes, dark and Tampa sports themes. Profile appearance preferences still use the same saved account theme.
