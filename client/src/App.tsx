import { Suspense, lazy } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

const Landing = lazy(() => import("@/pages/landing"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Shipments = lazy(() => import("@/pages/shipments"));
const ShipmentWizard = lazy(() => import("@/pages/shipment-wizard"));
const Suppliers = lazy(() => import("@/pages/suppliers"));
const ShippingCompanies = lazy(() => import("@/pages/shipping-companies"));
const ProductTypes = lazy(() => import("@/pages/product-types"));
const ExchangeRates = lazy(() => import("@/pages/exchange-rates"));
const Payments = lazy(() => import("@/pages/payments"));
const Inventory = lazy(() => import("@/pages/inventory"));
const UsersPage = lazy(() => import("@/pages/users"));
const AccountingPage = lazy(() => import("@/pages/accounting"));
const SupplierBalancesPage = lazy(() => import("@/pages/supplier-balances"));
const ShippingCompanyBalancesPage = lazy(
  () => import("@/pages/shipping-company-balances"),
);
const MovementReportPage = lazy(() => import("@/pages/movement-report"));
const PaymentMethodsReportPage = lazy(
  () => import("@/pages/payment-methods-report"),
);
const BackupPage = lazy(() => import("@/pages/backup"));
const PartiesPage = lazy(() => import("@/pages/local-trade/parties"));
const PartyProfilePage = lazy(() => import("@/pages/local-trade/party-profile"));
const InvoicesPage = lazy(() => import("@/pages/local-trade/invoices"));
const CreateInvoicePage = lazy(() => import("@/pages/local-trade/create-invoice"));
const LocalPaymentsPage = lazy(() => import("@/pages/local-trade/payments"));
const ReturnsPage = lazy(() => import("@/pages/local-trade/returns"));
const NotFound = lazy(() => import("@/pages/not-found"));

function AuthenticatedRouter() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/shipments" component={Shipments} />
        <Route path="/shipments/new" component={ShipmentWizard} />
        <Route path="/shipments/:id" component={ShipmentWizard} />
        <Route path="/shipments/:id/edit" component={ShipmentWizard} />
        <Route path="/suppliers" component={Suppliers} />
        <Route path="/shipping-companies" component={ShippingCompanies} />
        <Route path="/product-types" component={ProductTypes} />
        <Route path="/exchange-rates" component={ExchangeRates} />
        <Route path="/payments" component={Payments} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/users" component={UsersPage} />
        <Route path="/accounting" component={AccountingPage} />
        <Route path="/supplier-balances" component={SupplierBalancesPage} />
        <Route path="/shipping-company-balances" component={ShippingCompanyBalancesPage} />
        <Route path="/movement-report" component={MovementReportPage} />
        <Route path="/payment-methods-report" component={PaymentMethodsReportPage} />
        <Route path="/backup" component={BackupPage} />
        <Route path="/local-trade/parties" component={PartiesPage} />
        <Route path="/local-trade/parties/:id" component={PartyProfilePage} />
        <Route path="/local-trade/invoices" component={InvoicesPage} />
        <Route path="/local-trade/invoices/new" component={CreateInvoicePage} />
        <Route path="/local-trade/payments" component={LocalPaymentsPage} />
        <Route path="/local-trade/returns" component={ReturnsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="sticky top-0 z-50 flex items-center justify-between gap-4 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <AuthenticatedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
          <Skeleton className="w-10 h-10 rounded" />
        </div>
        <Skeleton className="h-6 w-32 mx-auto" />
        <Skeleton className="h-4 w-48 mx-auto" />
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Landing />
      </Suspense>
    );
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
