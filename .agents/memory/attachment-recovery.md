---
name: Recovering renamed payment receipts
description: How to handle historical receipt candidates without overwriting current financial data
---
Historical development data can retain a receipt under a different generated filename than production. Matching payment details, original filename, and byte size identify a candidate, not proof that the image is identical.

**Why:** A development receipt was recoverable under an older filename; the user visually confirmed it before selective recovery. Restoring historical database records would have risked newer transactions.

**How to apply:** Search by metadata as well as exact filenames. For ambiguous candidates, show the image and obtain confirmation. Restore only the missing file with exclusive creation, verify its checksum through the live URL, and leave current payment records unchanged.
