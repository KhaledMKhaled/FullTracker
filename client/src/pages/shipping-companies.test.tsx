import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ShippingCompany } from "@shared/schema";
import ShippingCompanies from "./shipping-companies";

globalThis.React = React;

function buildCompany(overrides: Partial<ShippingCompany> = {}): ShippingCompany {
  return {
    id: 1,
    name: "شركة الشحن التجريبية",
    contactName: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    isActive: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("ShippingCompanies renders company cards from query data", () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData<ShippingCompany[]>(["/api/shipping-companies"], [
    buildCompany(),
  ]);

  const markup = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <ShippingCompanies />
    </QueryClientProvider>,
  );

  assert.ok(markup.includes("شركة الشحن التجريبية"));
  assert.ok(markup.includes("شركات الشحن"));
});
