import type { Shipment, ShipmentItem, ShipmentPayment, PaymentAllocation } from "./schema";

export type StatementComponent = {
  name: string;
  currency: "RMB" | "EGP";
  cost: number;
  paid: number;
  remaining: number;
  surplus: number;
};
export type StatementPayment = ShipmentPayment & {
  partyName: string;
  componentCurrency: "RMB" | "EGP";
  componentAmount: number;
  conversionBasis: string;
  allocations: (PaymentAllocation & { supplierName: string })[];
};
export type ShipmentStatement = {
  reference: string;
  generatedAt: string;
  shipment: Shipment;
  items: (ShipmentItem & { supplierName: string })[];
  components: StatementComponent[];
  payments: StatementPayment[];
  settlement: {
    status: string; settled: boolean; remainingRmb: number;
    remainingEgp: number; displayRemainingEgp: number;
  };
  basis: "native-components" | "legacy-egp";
  legacy: { cost: number; paid: number; remaining: number };
  notes: string[];
};
