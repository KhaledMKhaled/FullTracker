import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PartyFilters {
  type?: string;
  isActive?: boolean;
}

interface InvoiceFilters {
  partyId?: number;
  invoiceKind?: string;
  status?: string;
}

interface PaymentFilters {
  partyId?: number;
  invoiceId?: number;
}

interface ReturnCaseFilters {
  partyId?: number;
  invoiceId?: number;
  status?: string;
}

export function useParties(filters?: PartyFilters) {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.isActive !== undefined) params.set("isActive", String(filters.isActive));
  const queryString = params.toString();
  const url = `/api/local-trade/parties${queryString ? `?${queryString}` : ""}`;
  
  return useQuery({
    queryKey: ["/api/local-trade/parties", filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch parties");
      return res.json();
    },
  });
}

export function useParty(id: number) {
  return useQuery({
    queryKey: ["/api/local-trade/parties", id],
    queryFn: async () => {
      const res = await fetch(`/api/local-trade/parties/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch party");
      return res.json();
    },
    enabled: !!id,
  });
}

export function usePartyProfile(id: number) {
  return useQuery({
    queryKey: ["/api/local-trade/parties", id, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/local-trade/parties/${id}/profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch party profile");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateParty() {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/local-trade/parties", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties"] });
    },
  });
}

export function useUpdateParty() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      return apiRequest("PATCH", `/api/local-trade/parties/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties"] });
    },
  });
}

export function useLocalInvoices(filters?: InvoiceFilters) {
  const params = new URLSearchParams();
  if (filters?.partyId) params.set("partyId", String(filters.partyId));
  if (filters?.invoiceKind) params.set("invoiceKind", filters.invoiceKind);
  if (filters?.status) params.set("status", filters.status);
  const queryString = params.toString();
  const url = `/api/local-trade/invoices${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: ["/api/local-trade/invoices", filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });
}

export function useLocalInvoice(id: number) {
  return useQuery({
    queryKey: ["/api/local-trade/invoices", id],
    queryFn: async () => {
      const res = await fetch(`/api/local-trade/invoices/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateLocalInvoice() {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/local-trade/invoices", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/invoices"] });
    },
  });
}

export function useReceiveInvoice() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      return apiRequest("POST", `/api/local-trade/invoices/${id}/receive`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/invoices"] });
    },
  });
}

export function useLocalPayments(filters?: PaymentFilters) {
  const params = new URLSearchParams();
  if (filters?.partyId) params.set("partyId", String(filters.partyId));
  if (filters?.invoiceId) params.set("invoiceId", String(filters.invoiceId));
  const queryString = params.toString();
  const url = `/api/local-trade/payments${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: ["/api/local-trade/payments", filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
  });
}

export function useCreateLocalPayment() {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/local-trade/payments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties"] });
    },
  });
}

export function useReturnCases(filters?: ReturnCaseFilters) {
  const params = new URLSearchParams();
  if (filters?.partyId) params.set("partyId", String(filters.partyId));
  if (filters?.invoiceId) params.set("invoiceId", String(filters.invoiceId));
  if (filters?.status) params.set("status", filters.status);
  const queryString = params.toString();
  const url = `/api/local-trade/return-cases${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: ["/api/local-trade/return-cases", filters],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch return cases");
      return res.json();
    },
  });
}

export function useCreateReturnCase() {
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/local-trade/return-cases", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/return-cases"] });
    },
  });
}

export function useResolveReturnCase() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      return apiRequest("POST", `/api/local-trade/return-cases/${id}/resolve`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/return-cases"] });
    },
  });
}

export function usePartySeasons(partyId: number) {
  return useQuery({
    queryKey: ["/api/local-trade/parties", partyId, "seasons"],
    queryFn: async () => {
      const res = await fetch(`/api/local-trade/parties/${partyId}/seasons`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch party seasons");
      return res.json();
    },
    enabled: !!partyId,
  });
}

export function useCreateSettlement() {
  return useMutation({
    mutationFn: async ({ partyId, data }: { partyId: number; data: Record<string, unknown> }) => {
      return apiRequest("POST", `/api/local-trade/parties/${partyId}/settlement`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/invoices"] });
    },
  });
}

// Get party collections
export function usePartyCollections(partyId: number) {
  return useQuery({
    queryKey: ["/api/local-trade/collections", partyId],
    queryFn: async () => {
      const res = await fetch(`/api/local-trade/collections?partyId=${partyId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!partyId,
  });
}

// Get party timeline
export function usePartyTimeline(partyId: number) {
  return useQuery({
    queryKey: ["/api/local-trade/parties", partyId, "timeline"],
    queryFn: async () => {
      const res = await fetch(`/api/local-trade/parties/${partyId}/timeline`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!partyId,
  });
}

// Upsert party collections
export function useUpsertPartyCollections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { partyId: number; collections: Array<{
      collectionOrder: number;
      collectionDate: string;
      amountEgp?: string;
      notes?: string;
    }> }) => {
      const res = await fetch("/api/local-trade/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/collections", variables.partyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties", variables.partyId, "timeline"] });
    },
  });
}

// Update collection status
export function useUpdateCollectionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, partyId }: { id: number; status: string; partyId: number }) => {
      const res = await fetch(`/api/local-trade/collections/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/collections", variables.partyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/parties", variables.partyId, "timeline"] });
    },
  });
}

// Mark collection reminder sent
export function useMarkCollectionReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, partyId }: { id: number; partyId: number }) => {
      const res = await fetch(`/api/local-trade/collections/${id}/reminder`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/local-trade/collections", variables.partyId] });
    },
  });
}

export function usePartyProfileSummary(partyId: number) {
  return useQuery({
    queryKey: ["/api/local-trade/parties", partyId, "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/local-trade/parties/${partyId}/summary`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!partyId,
  });
}

// ============ Notifications ============

export function useNotifications() {
  return useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}

export function useCheckDueCollections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/check-due-collections", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}
