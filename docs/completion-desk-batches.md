# Completion Desk paperwork

Approvals contains multi-file Labor PDF import, pending labor review, and Completion Desk Batch.

PA imports individually downloaded sales-order PDFs together. Each PDF is reviewed separately, matched by Customer ID, uploaded to private storage, and quantities/rates verified. Unreadable or unmatched fields must be corrected. Original files remain attached. The sample supplied extracts CID 684452, 26 priced lines, total $3,252; blank miscellaneous labor is entered as an extra labor request.

Assigned installers enter actual quantities (zero for unperformed work), reasons for changes, and requested extra labor. Contract lines/rates cannot be changed. They review the agreement and sign. FS/Admin approves individual quantities, denies a line by entering zero, records adjustment notes and chargebacks, and signs using their saved profile signature. PA cannot approve labor. Certificate approval and required Lead Renovation signature must precede labor approval. Prior approved labor remains visible; amounts are authorization records, not accounting payment transactions.

Each approved labor sheet snapshots its visit's certificate and Lead Renovation document. Later visits cannot overwrite the earlier packet. Batch screen defaults through yesterday, includes older unbatched paperwork, shows missing forms, and allows up to 20 visit packets per PDF. A PDF index precedes per-customer certificate, approved labor and applicable Lead Renovation record. Original batch PDF bytes are stored privately and are immutable. Downloading is separate from Mark Sent; marking sent records actor/time and job history. No email is automatically sent. One labor approval can belong to only one batch. Later visits use a new labor sheet and certificate. Approved labor is also downloadable from Digital Documents.

Tables production.completion_batches and production.completion_batch_items initialize on authorized office access under a PostgreSQL advisory lock, with RLS and no anon/authenticated grants. Job labor changes use row locks, version checks and history; batch creation locks selected jobs and stores the PDF and membership atomically. No historical job/payment values are migrated.

Customer certificate questions begin unanswered, including after changing certificate type. All questions require explicit Yes/No responses before acceptance; server schema rejects null answers. Email signing links already used unanswered questions.

Validation: TypeScript, production build, operations integration suite (labor permissions, stale checks, protected rates, required lead sheet, approval, archived visit, duplicate batch exclusion, immutable download, sent tracking), PDF rendering and actual sample import extraction. Production rollout still needs a PA/installer test on real devices; no customer emails or payment processing are performed by these tests.
