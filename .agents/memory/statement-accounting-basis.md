---
name: Statement accounting basis
description: User-approved accounting and presentation constraints for shipment statements.
---

The user requested a professional bank-statement-style Arabic PDF, not a decorative invoice.

**Why:** The document must make shipment costs, recorded movements and remaining obligations easy to reconcile.

Use a clearly disclosed current-cost opening basis followed by recorded payments when historical cost-entry dates and revision history are unavailable. Never invent dated cost postings or represent this as an audited historical ledger.

**Why:** Current shipment totals do not establish what was owed at every past date. Historic EGP conversions can differ from native-currency settlement.

**How to apply:** Separate RMB and EGP balances, disclose legacy fallback for incomplete native data, and show component deficits separately from surpluses. Allocations explain existing payments; missing-piece amounts and discounts must not be subtracted twice. Generate on demand without persisting new PDF archives or changing financial records.

The accounting dashboard's shipping-company filter is a shipment portfolio summary: when it includes the full costs of that company's shipments, it must deduct all payments on the same selected shipments, including direct supplier payments. This is distinct from the company's creditor statement, which remains payee-specific.

**Why:** The user's Soly reconciliation exposed supplier payments omitted from a dashboard that included their corresponding goods costs, overstating the remainder.

**How to apply:** Match cost and payment scope under all shipment/date/status filters. Never rewrite payment ownership or deduct the same payment again through allocations to reconcile a displayed balance.
