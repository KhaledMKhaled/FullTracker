import { QueryClient, QueryFunction } from "@tanstack/react-query";

type ApiErrorResponse = {
  ok?: boolean;
  error?: { code?: string; message?: string; details?: unknown };
  message?: string;
};

type ErrorMessageOverrides = Partial<Record<number, string>> & {
  defaultMessage?: string;
};

function buildError(message: string, status: number, code?: string, details?: unknown) {
  const error = new Error(message);
  (error as any).status = status;
  (error as any).code = code;
  (error as any).details = details;
  return error;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let bodyText = "";
    let parsed: ApiErrorResponse | undefined;

    try {
      bodyText = await res.text();
      if (bodyText) {
        if (contentType.includes("application/json")) {
          parsed = JSON.parse(bodyText);
        } else {
          parsed = JSON.parse(bodyText);
        }
      }
    } catch {
      // ignore parse errors
    }

    const code = parsed?.error?.code;
    const details = parsed?.error?.details;
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      bodyText ||
      res.statusText ||
      `Request failed with status ${res.status}`;

    const error = buildError(message, res.status, code, details);
    console.error("API request failed", {
      status: res.status,
      url: res.url,
      bodyText,
      parsed,
      stack: error.stack,
    });
    throw error;
  }
}

export function getErrorMessage(error: unknown, overrides?: ErrorMessageOverrides): string {
  const err = error as any;
  const status = err?.status;

  if (status && overrides?.[status]) {
    return overrides[status] as string;
  }

  if (status === 401) {
    return "Session expired. Please log in again.";
  }
  if (status === 403) {
    return "You don’t have permission.";
  }
  if (status === 409) {
    return err?.message || "Shipping company already exists.";
  }
  if (status === 400 && Array.isArray(err?.details?.fields)) {
    const details = err.details.fields
      .map((field: { field?: string; message?: string }) => {
        if (!field?.field && !field?.message) return null;
        if (field?.field === "name" && field?.message?.toLowerCase().includes("required")) {
          return "Name is required.";
        }
        if (!field?.field) return field.message;
        if (!field?.message) return field.field;
        return `${field.field}: ${field.message}`;
      })
      .filter(Boolean)
      .join(", ");
    if (details) {
      return `Validation error: ${details}`;
    }
  }
  if (status === 500) {
    return "Unexpected server error.";
  }

  return err?.message || overrides?.defaultMessage || "حدث خطأ";
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
    body: data
      ? isFormData
        ? (data as FormData)
        : JSON.stringify(data)
      : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
