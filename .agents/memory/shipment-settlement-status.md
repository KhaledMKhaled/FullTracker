---
name: Shipment settlement status
description: Rules for deciding when shipment payment status can safely use native-currency components.
---

Determine a shipment's settlement state per cost component in its native currency: goods, shipping, and commission in RMB; customs and takhreeg in EGP. Clamp each component's remainder separately so an overpayment on one component cannot hide a deficit on another.

Use that component result only when native component data is complete and no adjustment exists that the component model cannot represent. For final-total-only records, RMB components stored only as converted EGP, or shipments with missing-piece cost adjustments, preserve the historical final-total-versus-paid EGP result.

**Why:** Historical exchange rates can make converted EGP totals differ even when every native-currency component is fully paid. But forcing component logic onto incomplete or adjusted legacy records can create the opposite error.

**How to apply:** Keep shipment-list and payment-screen status sourced from one server calculation. Do not rewrite historical payments, exchange rates, or stored accounting totals merely to change display status.