import type { PaymentAllocation, Shipment, ShipmentPayment } from "@shared/schema";
import type { IStorage } from "./storage";
import { parseAmountOrZero } from "./services/paymentCalculations";

export type PaymentAllocationSummary = {
  exists: boolean;
  count: number;
  totalAllocated: string;
};

export type PaymentWithShipment = ShipmentPayment & {
  shipment?: Shipment;
  allocationSummary: PaymentAllocationSummary;
  allocations?: PaymentAllocation[];
};

type PaymentsStorage = Pick<
  IStorage,
  "getAllPayments" | "getShipmentsByIds" | "getPaymentAllocationsByPaymentIds"
>;

export async function getPaymentsWithShipments(
  paymentsStorage: PaymentsStorage,
  options?: { includeAllocations?: boolean },
): Promise<PaymentWithShipment[]> {
  const payments = await paymentsStorage.getAllPayments();

  if (payments.length === 0) return [];

  const shipmentIds = Array.from(new Set(payments.map((payment) => payment.shipmentId)));
  const shipments = await paymentsStorage.getShipmentsByIds(shipmentIds);
  const shipmentMap = new Map(shipments.map((shipment) => [shipment.id, shipment]));

  const allocationsByPayment = new Map<number, PaymentAllocation[]>();
  const allocationRows = await paymentsStorage.getPaymentAllocationsByPaymentIds(
    payments.map((payment) => payment.id),
  );

  allocationRows.forEach((allocation) => {
    const allocations = allocationsByPayment.get(allocation.paymentId) ?? [];
    allocations.push(allocation);
    allocationsByPayment.set(allocation.paymentId, allocations);
  });

  return payments.map((payment) => ({
    ...payment,
    shipment: shipmentMap.get(payment.shipmentId),
    ...(options?.includeAllocations
      ? { allocations: allocationsByPayment.get(payment.id) ?? [] }
      : {}),
    allocationSummary: (() => {
      const allocations = allocationsByPayment.get(payment.id) ?? [];
      const totalAllocated = allocations.reduce(
        (sum, allocation) => sum + parseAmountOrZero(allocation.allocatedAmount),
        0,
      );
      return {
        exists: allocations.length > 0,
        count: allocations.length,
        totalAllocated: totalAllocated.toFixed(2),
      };
    })(),
  }));
}
