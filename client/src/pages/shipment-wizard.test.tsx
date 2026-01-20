import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ShippingCompany } from "@shared/schema";
import { Step2Shipping } from "./shipment-wizard";

function buildShippingCompany(
  overrides: Partial<ShippingCompany> = {},
): ShippingCompany {
  return {
    id: 1,
    name: "شركة شحن تجريبية",
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

test("Step2Shipping renders the shipping company selector with shipping companies", () => {
  const markup = renderToStaticMarkup(
    <Step2Shipping
      shipmentData={{
        shipmentCode: "SHP-1",
        shipmentName: "شحنة اختبار",
        purchaseDate: "2024-02-01",
        status: "جديدة",
        purchaseRmbToEgpRate: "7.1",
        partialDiscountRmb: "0",
        discountNotes: "",
        shippingCompanyId: null,
      }}
      setShipmentData={() => {}}
      shippingData={{
        commissionRatePercent: "0",
        shippingAreaSqm: "0",
        shippingCostPerSqmUsdOriginal: "0",
        shippingDate: "2024-02-02",
        rmbToEgpRate: "7.0",
        usdToRmbRate: "7.2",
        ratesUpdatedAt: "2024-02-02T00:00:00Z",
      }}
      setShippingData={() => {}}
      shippingCompanies={[buildShippingCompany()]}
      totalPurchaseCostRmb={0}
      commissionRmb={0}
      commissionEgp={0}
      shippingCostUsd={0}
      shippingCostRmb={0}
      shippingCostEgp={0}
      refreshRates={() => {}}
      isRefreshing={false}
    />,
  );

  assert.ok(markup.includes("اسم شركة الشحن"));
  assert.ok(markup.includes("اختر شركة الشحن…"));
  assert.ok(markup.includes("شركة شحن تجريبية"));
});
