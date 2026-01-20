import assert from "node:assert/strict";
import test from "node:test";

import { createRelatedPartiesQuery, getPartyOptions } from "../src/lib/relatedParties";

test("createRelatedPartiesQuery builds shipment-scoped query", async () => {
  const query = createRelatedPartiesQuery(42);
  const fetchCalls: string[] = [];

  global.fetch = async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    return {
      ok: true,
      json: async () => ({ suppliers: [{ id: 1, name: "A" }], shippingCompanies: [] }),
    } as any;
  };

  assert.deepEqual(query.queryKey, ["shipment-related-parties", 42]);
  assert.equal(query.enabled, true);

  const data = await query.queryFn?.();
  assert.ok(data);
  assert.equal(fetchCalls[0], "/api/shipments/42/related-parties");
});

test("getPartyOptions returns suppliers for supplier type", () => {
  const related = {
    suppliers: [
      { id: 1, name: "Supplier 1" },
      { id: 2, name: "Supplier 2" },
    ],
    shippingCompanies: [{ id: 10, name: "Carrier" }],
  } as const;

  const options = getPartyOptions(related, "supplier", 55);
  assert.equal(options.length, 2);
  assert.equal(options[0].name, "Supplier 1");
});
