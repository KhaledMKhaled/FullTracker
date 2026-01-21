import { Link, useLocation } from "wouter";
import {
  Ship,
  Users,
  DollarSign,
  Package,
  CreditCard,
  Shield,
  LayoutDashboard,
  Calculator,
  FileSpreadsheet,
  Banknote,
  Tag,
  Truck,
  Database,
  Store,
  RotateCcw,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const menuItems = [
  {
    title: "لوحة التحكم",
    url: "/",
    icon: LayoutDashboard,
    tooltip: "نظرة عامة على جميع الشحنات والمدفوعات",
  },
  {
    title: "الشحنات",
    url: "/shipments",
    icon: Ship,
    tooltip: "إدارة جميع الشحنات من لحظة الشراء حتى الاستلام",
  },
  {
    title: "الموردون",
    url: "/suppliers",
    icon: Users,
    tooltip: "إضافة وتعديل بيانات الموردين المرتبطين بكل صنف",
  },
  {
    title: "شركات الشحن",
    url: "/shipping-companies",
    icon: Truck,
    tooltip: "إدارة قائمة شركات الشحن المرتبطة بالشحنات",
  },
  {
    title: "أنواع الأصناف",
    url: "/product-types",
    icon: Tag,
    tooltip: "إدارة أنواع الأصناف المستخدمة في الشحنات",
  },
  {
    title: "أسعار الصرف",
    url: "/exchange-rates",
    icon: DollarSign,
    tooltip: "إدارة أسعار تحويل العملات بين الرممبي والجنيه وباقي العملات",
  },
  {
    title: "المخزون",
    url: "/inventory",
    icon: Package,
    tooltip: "متابعة الأصناف المستلمة وتكلفتها في المخزون",
  },
  {
    title: "سداد الشحنات",
    url: "/payments",
    icon: CreditCard,
    tooltip: "متابعة إجمالي ما تم دفعه وما هو متبقي على جميع الشحنات",
  },
];

const localTradeItems = [
  {
    title: "الملفات",
    url: "/local-trade/parties",
    icon: Users,
    tooltip: "إدارة التجار والعملاء",
  },
  {
    title: "الفواتير",
    url: "/local-trade/invoices",
    icon: FileSpreadsheet,
    tooltip: "فواتير الشراء والمرتجعات",
  },
  {
    title: "المدفوعات",
    url: "/local-trade/payments",
    icon: CreditCard,
    tooltip: "تسجيل المدفوعات والتحصيلات",
  },
  {
    title: "الهوامش",
    url: "/local-trade/returns",
    icon: RotateCcw,
    tooltip: "حالات الهوامش والنواقص",
  },
];

const accountingItems = [
  {
    title: "المحاسبة",
    url: "/accounting",
    icon: Calculator,
    tooltip: "ملخص التكاليف والمدفوعات والأرصدة",
  },
  {
    title: "كشف حساب الموردين",
    url: "/supplier-balances",
    icon: Users,
    tooltip: "الفلوس اللي عليك وليك لكل مورد",
  },
  {
    title: "كشف حساب شركات الشحن",
    url: "/shipping-company-balances",
    icon: Truck,
    tooltip: "الفلوس اللي عليك وليك لكل شركة شحن",
  },
  {
    title: "كشف حركة الحساب",
    url: "/movement-report",
    icon: FileSpreadsheet,
    tooltip: "تقرير شامل لجميع التكاليف والمدفوعات",
  },
  {
    title: "وسائل الدفع",
    url: "/payment-methods-report",
    icon: Banknote,
    tooltip: "تحليل المدفوعات حسب وسيلة الدفع",
  },
];

const adminItems = [
  {
    title: "المستخدمون والصلاحيات",
    url: "/users",
    icon: Shield,
    tooltip: "إدارة حسابات المستخدمين والصلاحيات",
  },
  {
    title: "النسخ الاحتياطي",
    url: "/backup",
    icon: Database,
    tooltip: "إنشاء واستعادة النسخ الاحتياطية",
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const isAdmin = user?.role === "مدير";

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
            <Ship className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-lg">Tracker</span>
            <span className="text-xs text-muted-foreground">إدارة الشحنات</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>القائمة الرئيسية</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        data-testid={`nav-${item.url.replace("/", "") || "dashboard"}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      {item.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>التجارة المحلية</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {localTradeItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url || location.startsWith("/local-trade/")}
                        data-testid={`nav-${item.url.replace(/\//g, "-").slice(1)}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      {item.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>المحاسبة والتقارير</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountingItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        data-testid={`nav-${item.url.replace("/", "")}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      {item.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>الإدارة</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.url}
                          data-testid={`nav-${item.url.replace("/", "")}`}
                        >
                          <Link href={item.url}>
                            <item.icon className="w-5 h-5" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        {item.tooltip}
                      </TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <SidebarUserFooter />
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarUserFooter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/";
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="flex items-center gap-3">
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-primary/10 text-primary font-medium">
          {user?.firstName?.[0] || (user as any)?.username?.[0]?.toUpperCase() || "م"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 flex flex-col group-data-[collapsible=icon]:hidden">
        <span className="font-medium text-sm">
          {user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : (user as any)?.username || "مستخدم"}
        </span>
        <span className="text-xs text-muted-foreground">{user?.role || "مشاهد"}</span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="group-data-[collapsible=icon]:hidden"
            data-testid="button-logout"
            disabled={logoutMutation.isPending}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">تسجيل الخروج</TooltipContent>
      </Tooltip>
    </div>
  );
}
