import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Truck,
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Building,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getErrorMessage, queryClient } from "@/lib/queryClient";
import type { InsertShippingCompany, ShippingCompany } from "@shared/schema";

export default function ShippingCompanies() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<ShippingCompany | null>(null);
  const { toast } = useToast();

  const { data: companies, isLoading } = useQuery<ShippingCompany[]>({
    queryKey: ["/api/shipping-companies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertShippingCompany) => {
      return apiRequest("POST", "/api/shipping-companies", data);
    },
    onSuccess: () => {
      toast({ title: "تم إضافة شركة الشحن بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/shipping-companies"] });
      setIsDialogOpen(false);
      setEditingCompany(null);
    },
    onError: (error) => {
      toast({
        title: getErrorMessage(error, {
          403: "No permission to add shipping companies.",
          409: "Shipping company already exists.",
        }),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertShippingCompany> }) => {
      return apiRequest("PATCH", `/api/shipping-companies/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "تم تحديث شركة الشحن بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/shipping-companies"] });
      setIsDialogOpen(false);
      setEditingCompany(null);
    },
    onError: (error) => {
      toast({
        title: getErrorMessage(error, {
          403: "No permission to update shipping companies.",
          409: "Shipping company already exists.",
        }),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/shipping-companies/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم حذف شركة الشحن بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/shipping-companies"] });
    },
    onError: (error) => {
      toast({
        title: getErrorMessage(error, {
          403: "No permission to delete shipping companies.",
        }),
        variant: "destructive",
      });
    },
  });

  const filteredCompanies = companies?.filter(
    (company) =>
      !search ||
      company.name.toLowerCase().includes(search.toLowerCase()) ||
      company.phone?.toLowerCase().includes(search.toLowerCase()) ||
      company.contactName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: InsertShippingCompany = {
      name: formData.get("name") as string,
      contactName: (formData.get("contactName") as string) || null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      address: (formData.get("address") as string) || null,
      notes: (formData.get("notes") as string) || null,
      isActive: formData.get("isActive") === "on",
    };

    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (company: ShippingCompany) => {
    setEditingCompany(company);
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingCompany(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">شركات الشحن</h1>
          <p className="text-muted-foreground mt-1">
            إدارة بيانات شركات الشحن المرتبطة بالشحنات
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} data-testid="button-add-shipping-company">
              <Plus className="w-4 h-4 ml-2" />
              إضافة شركة شحن جديدة
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCompany ? "تعديل شركة الشحن" : "إضافة شركة شحن جديدة"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم شركة الشحن *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editingCompany?.name || ""}
                  required
                  data-testid="input-shipping-company-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">اسم جهة الاتصال</Label>
                <Input
                  id="contactName"
                  name="contactName"
                  defaultValue={editingCompany?.contactName || ""}
                  data-testid="input-shipping-company-contact"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">الهاتف</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={editingCompany?.phone || ""}
                  data-testid="input-shipping-company-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={editingCompany?.email || ""}
                  data-testid="input-shipping-company-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">العنوان</Label>
                <Textarea
                  id="address"
                  name="address"
                  defaultValue={editingCompany?.address || ""}
                  rows={2}
                  data-testid="input-shipping-company-address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={editingCompany?.notes || ""}
                  rows={2}
                  data-testid="input-shipping-company-notes"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  name="isActive"
                  defaultChecked={editingCompany?.isActive ?? true}
                />
                <Label htmlFor="isActive">نشط</Label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-shipping-company"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "جاري الحفظ..."
                    : "حفظ"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو جهة الاتصال..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
              data-testid="input-search-shipping-companies"
            />
          </div>
        </CardContent>
      </Card>

      {/* Companies Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredCompanies && filteredCompanies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((company) => (
            <Card
              key={company.id}
              className="hover-elevate"
              data-testid={`card-shipping-company-${company.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Building className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{company.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {company.address || "غير محدد"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={company.isActive ? "default" : "secondary"}
                    className={
                      company.isActive
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : ""
                    }
                  >
                    {company.isActive ? "نشط" : "غير نشط"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {company.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {company.notes}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  {company.contactName && (
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{company.contactName}</span>
                    </div>
                  )}
                  {company.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <span>{company.phone}</span>
                    </div>
                  )}
                  {company.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      <span>{company.email}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(company)}
                    data-testid={`button-edit-shipping-company-${company.id}`}
                  >
                    <Edit className="w-4 h-4 ml-1" />
                    تعديل
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(company.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-shipping-company-${company.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <Truck className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium mb-2">لا توجد شركات شحن</h3>
              <p className="text-muted-foreground mb-6">
                ابدأ بإضافة شركة الشحن الأولى لربطها بالشحنات
              </p>
              <Button onClick={openNewDialog}>
                <Plus className="w-4 h-4 ml-2" />
                إضافة شركة شحن جديدة
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
