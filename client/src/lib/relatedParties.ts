export type RelatedParty = { id: number; name: string };
export type RelatedPartiesResponse = {
  suppliers: RelatedParty[];
  shippingCompanies: RelatedParty[];
};

export function createRelatedPartiesQuery(shipmentId: number | null) {
  const enabled = Boolean(shipmentId);
  return {
    queryKey: ["shipment-related-parties", shipmentId ?? "none"],
    enabled,
    queryFn: enabled
      ? async () => {
          const res = await fetch(`/api/shipments/${shipmentId}/related-parties`, {
            credentials: "include",
            cache: "no-store",
          });

          if (!res.ok) {
            const message = (await res.json().catch(() => ({} as any)))?.message;
            throw new Error(message || "تعذر جلب الجهات المرتبطة بالشحنة");
          }

          return (await res.json()) as RelatedPartiesResponse;
        }
      : undefined,
  } as const;
}

export function getPartyOptions(
  relatedParties: RelatedPartiesResponse | undefined,
  partyType: "supplier" | "shipping_company",
  selectedShipmentId: number | null,
): RelatedParty[] {
  if (!selectedShipmentId) return [];
  if (!relatedParties) return [];

  return partyType === "supplier"
    ? relatedParties.suppliers ?? []
    : relatedParties.shippingCompanies ?? [];
}
