import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Tag,
  Plus,
  Search,
  Edit,
  Trash2,
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
import type { ProductType, InsertProductType } from "@shared/schema";

export default function ProductTypes() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ProductType | null>(null);
  const { toast } = useToast();

  const { data: types, isLoading } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertProductType) => {
      return apiRequest("POST", "/api/product-types", data);
    },
    onSuccess: () => {
      toast({ title: "تم إضافة نوع الصنف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/product-types"] });
      setIsDialogOpen(false);
      setEditingType(null);
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertProductType> }) => {
      return apiRequest("PATCH", `/api/product-types/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "تم تحديث نوع الصنف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/product-types"] });
      setIsDialogOpen(false);
      setEditingType(null);
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/product-types/${id}`);
    },
    onSuccess: () => {
      toast({ title: "تم حذف نوع الصنف بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/product-types"] });
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const filteredTypes = types?.filter(
    (type) =>
      !search ||
      type.name.toLowerCase().includes(search.toLowerCase()) ||
      type.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: InsertProductType = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      isActive: formData.get("isActive") === "on",
    };

    if (editingType) {
      updateMutation.mutate({ id: editingType.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (type: ProductType) => {
    setEditingType(type);
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingType(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">أنواع الأصناف</h1>
          <p className="text-muted-foreground mt-1">
            إضافة وتعديل أنواع الأصناف المستخدمة في الشحنات
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} data-testid="button-add-product-type">
              <Plus className="w-4 h-4 ml-2" />
              إضافة نوع جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingType ? "تعديل نوع الصنف" : "إضافة نوع صنف جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم النوع *</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editingType?.name || ""}
                  required
                  data-testid="input-product-type-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">الوصف</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editingType?.description || ""}
                  rows={2}
                  data-testid="input-product-type-description"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="isActive"
                  name="isActive"
                  defaultChecked={editingType?.isActive ?? true}
                />
                <Label htmlFor="isActive">نشط</Label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-product-type"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "جاري الحفظ..."
                    : "حفظ"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel"
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
          <div className="flex items-center gap-2 relative">
            <Search className="w-4 h-4 text-muted-foreground absolute right-3 pointer-events-none" />
            <Input
              placeholder="ابحث عن نوع..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
              data-testid="input-search-product-types"
            />
          </div>
        </CardContent>
      </Card>

      {/* Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))
        ) : filteredTypes && filteredTypes.length > 0 ? (
          filteredTypes.map((type) => (
            <Card
              key={type.id}
              className="flex flex-col"
              data-testid={`product-type-card-${type.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{type.name}</CardTitle>
                  </div>
                  <Badge
                    variant={type.isActive ? "default" : "secondary"}
                    className="whitespace-nowrap"
                  >
                    {type.isActive ? "نشط" : "غير نشط"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                {type.description && (
                  <p className="text-sm text-muted-foreground">
                    {type.description}
                  </p>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(type)}
                    data-testid={`button-edit-product-type-${type.id}`}
                  >
                    <Edit className="w-3 h-3 ml-1" />
                    تعديل
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => deleteMutation.mutate(type.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-product-type-${type.id}`}
                  >
                    <Trash2 className="w-3 h-3 ml-1" />
                    حذف
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="col-span-full">
            <CardContent className="p-8 text-center">
              <Tag className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">لا توجد أنواع أصناف</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
