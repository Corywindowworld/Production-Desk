# Warehouse receiving and returns

Open **Warehouse** in the dashboard. Admin must select **Set up warehouse database** once if the new tables are missing. Alternatively run migration `014_warehouse.sql` through the existing migration runner. After setup, Admin can create or edit an account with role **Warehouse** under Settings → Accounts.

Warehouse and Admin manage manifests, receiving, discrepancies, barcode aliases and bays. FS/PA view inventory. Installers see inventory linked to their assigned jobs and can submit returns with a reason and uploaded photo. Warehouse accounts do not inherit job, payment, account-management or bonus-edit permissions.

Import an electronic Simonton manifest PDF, check the preview against the manifest's total, enter a unique shipment reference and store number, then import. Import creates expected items only; duplicate external item IDs are not counted again. PO `073-686442` separates store `073` from CID `686442`; suffixes such as `073-660530-1-8-R` are preserved. Accounts without a store field belong to store `073`. Ambiguous or unmatched jobs require explicit matching by store and CID. Manufacturer customer numbers are not homeowner IDs.

Scan a barcode or choose a barcode photo to find an item. Review and confirm physical receiving and bay. Code 39 raw `%Y` and its Full ASCII DEL encoding are normalized to the same manifest ID. Unknown barcodes can be explicitly matched to a reviewed physical item. Never match on dimensions or AQ alone, because multiple physical units can share them.

Missing/damaged items alert PA, Admin, Warehouse and the assigned FS in Job Alerts. Item events retain actor, reason, date and photo. A job moves from ORD to RCVD only through the separate confirmation that all required products are usable, received and located. Products not on known manifests still require the warehouse's physical check.

Installer returns remain **Return Pending** until Warehouse confirms receipt and bay. Unlisted older products can be submitted against an assigned job with label details and photo. Returns do not create a reorder or change the job status. Inventory survives job deletion with its CID and audit history retained.

Loading scans and equipment checkout are deferred. Picking-ticket parsing is not part of this release; manual entries support exceptions. Camera/photo scanning and saves require a connected browser; installer location requirements continue to apply.

Validation: warehouse and live-operations tests; TypeScript; production build. The supplied six-page PDF was checked with the same PDF.js extraction used by the app: 218 items / 23 POs. Its sample label was decoded using ZXing and matched to the first manifest item.
