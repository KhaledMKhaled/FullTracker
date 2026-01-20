# Payments E2E seed

This seed wipes payment-related tables, inserts reference users, suppliers, exchange rates, four shipments that cover lifecycle statuses, shipment items, shipping/customs details, and payments per currency/role/status to exercise persisted behavior.

## Run

```bash
# Point to your Postgres database
DATABASE_URL="postgres://user:pass@localhost:5432/fodastore" tsx server/seeds/payments-e2e.ts
```

The script truncates related tables (`users`, `suppliers`, `exchange_rates`, `shipments`, `shipment_items`, `shipment_shipping_details`, `shipment_customs_details`, `shipment_payments`) and resets identities before seeding, so it is safe to rerun for a clean slate.

## Resetting between runs

Because the script truncates and reseeds everything on each execution, the fastest reset is simply rerunning it. If you need to clear the database without reseeding, execute the same `TRUNCATE … RESTART IDENTITY CASCADE` statement inside psql (with `DATABASE_URL` set) or drop/recreate the Postgres database.
