import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Building,
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Supplier, InsertSupplier } from "@shared/schema";

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const { toast } = useToast();

  const { data: suppliers, isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertSupplier) => {
      return apiRequest("POST", "/api/suppliers", data);
    },
    onSuccess: () => {
      toast({ title: "تم إضافة المورد بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setIsDialogOpen(false);
      setEditingSupplier(null);
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertSupplier> }) => {
      return apiRequest("PATCH", `/api/suppliers/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "تم تحديث المورد بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      setIsDialogOpen(false);
      setEditingSupplier(null);
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/suppliers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم حذف المورد بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const filteredSuppliers = suppliers?.filter(
    (supplier) =>
      !search ||
      supplier.name.toLowerCase().includes(search.toLowerCase()) ||
      supplier.country?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: InsertSupplier = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      country: (formData.get("country") as string) || "الصين",
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      address: (formData.get("address") as string) || null,
      isActive: formData.get("isActive") === "on",
    };

    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingSupplier(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">الموردون</h1>
          <p className="text-muted-foreground mt-1">
            إضافة وتعديل بيانات الموردين المرتبطين بكل صنف
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} data-testid="button-add-supplier">
              <Plus className="w-4 h-4 ml-2" />
              إضافة مورد جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? "تعديل المورد" : "إضافة مورد جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم المورد *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editingSupplier?.name || ""}
                  required
                  data-testid="input-supplier-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">البلد</Label>
                <Input
                  id="country"
                  name="country"
                  defaultValue={editingSupplier?.country || "الصين"}
                  data-testid="input-supplier-country"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">الهاتف</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={editingSupplier?.phone || ""}
                  data-testid="input-supplier-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={editingSupplier?.email || ""}
                  data-testid="input-supplier-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">العنوان</Label>
                <Textarea
                  id="address"
                  name="address"
                  defaultValue={editingSupplier?.address || ""}
                  rows={2}
                  data-testid="input-supplier-address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">الوصف</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editingSupplier?.description || ""}
                  rows={2}
                  data-testid="input-supplier-description"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  name="isActive"
                  defaultChecked={editingSupplier?.isActive ?? true}
                />
                <Label htmlFor="isActive">نشط</Label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-supplier"
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
              placeholder="بحث بالاسم أو البلد..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
              data-testid="input-search-suppliers"
            />
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredSuppliers && filteredSuppliers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => (
            <Card
              key={supplier.id}
              className="hover-elevate"
              data-testid={`card-supplier-${supplier.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Building className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{supplier.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {supplier.country || "الصين"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={supplier.isActive ? "default" : "secondary"}
                    className={
                      supplier.isActive
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : ""
                    }
                  >
                    {supplier.isActive ? "نشط" : "غير نشط"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {supplier.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {supplier.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  {supplier.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <span>{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      <span>{supplier.email}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(supplier)}
                    data-testid={`button-edit-supplier-${supplier.id}`}
                  >
                    <Edit className="w-4 h-4 ml-1" />
                    تعديل
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(supplier.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-supplier-${supplier.id}`}
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
                <Users className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium mb-2">لا يوجد موردون</h3>
              <p className="text-muted-foreground mb-6">
                ابدأ بإضافة موردك الأول لربطه بالأصناف
              </p>
              <Button onClick={openNewDialog}>
                <Plus className="w-4 h-4 ml-2" />
                إضافة مورد جديد
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
