---
name: Shipment settlement status
description: Rules for deciding when shipment payment status can safely use native-currency components.
---

Determine a shipment's settlement state per cost component in its native currency: goods, shipping, and commission in RMB; customs and takhreeg in EGP. Clamp each component's remainder separately so an overpayment on one component cannot hide a deficit on another.

Use that component result whenever native component data is complete, including shipments with missing-piece adjustments. For final-total-only records or RMB components stored only as converted EGP, preserve the historical final-total-versus-paid EGP result.

**Why:** Historical exchange rates and missing-piece adjustments can make converted EGP totals differ even when every native-currency component is fully paid. Incomplete legacy component data still needs a conservative fallback.

**How to apply:** Keep shipment-list and payment-screen status sourced from one server calculation. Do not rewrite historical payments, exchange rates, or stored accounting totals merely to change display status.