import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Shield,
  Users,
  Edit,
  Trash2,
  Plus,
  Key,
  Calendar,
  Loader2,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface UserType {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

const ROLES = [
  { value: "مدير", label: "مدير", description: "صلاحيات كاملة" },
  { value: "محاسب", label: "محاسب", description: "الشحنات والتكاليف والمدفوعات" },
  { value: "مسؤول مخزون", label: "مسؤول مخزون", description: "عرض الشحنات والمخزون" },
  { value: "مشاهد", label: "مشاهد", description: "عرض فقط" },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "مشاهد",
  });
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      toast({ title: "تم تحديث الصلاحية بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsEditDialogOpen(false);
      setEditingUser(null);
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم إضافة المستخدم بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsCreateDialogOpen(false);
      setNewUser({ username: "", password: "", firstName: "", lastName: "", role: "مشاهد" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "حدث خطأ", variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return apiRequest("PATCH", `/api/users/${userId}`, { password });
    },
    onSuccess: () => {
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setIsPasswordDialogOpen(false);
      setEditingUser(null);
      setNewPassword("");
    },
    onError: () => {
      toast({ title: "حدث خطأ", variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "تم حذف المستخدم بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsDeleteDialogOpen(false);
      setEditingUser(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "حدث خطأ", variant: "destructive" });
    },
  });

  const openEditDialog = (user: UserType) => {
    setEditingUser(user);
    setSelectedRole(user.role || "مشاهد");
    setIsEditDialogOpen(true);
  };

  const openPasswordDialog = (user: UserType) => {
    setEditingUser(user);
    setNewPassword("");
    setIsPasswordDialogOpen(true);
  };

  const openDeleteDialog = (user: UserType) => {
    setEditingUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleSaveRole = () => {
    if (editingUser) {
      updateRoleMutation.mutate({ userId: editingUser.id, role: selectedRole });
    }
  };

  const handleCreateUser = () => {
    if (!newUser.username || !newUser.password) {
      toast({ title: "يرجى إدخال اسم المستخدم وكلمة المرور", variant: "destructive" });
      return;
    }
    createUserMutation.mutate(newUser);
  };

  const handleChangePassword = () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    if (editingUser) {
      changePasswordMutation.mutate({ userId: editingUser.id, password: newPassword });
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("ar-EG");
  };

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case "مدير":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "محاسب":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "مسؤول مخزون":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      default:
        return "";
    }
  };

  const isAdmin = currentUser?.role === "مدير";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold">المستخدمون والصلاحيات</h1>
          <p className="text-muted-foreground mt-1">
            إدارة حسابات المستخدمين والصلاحيات
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <UserPlus className="w-4 h-4 ml-2" />
            إضافة مستخدم
          </Button>
        )}
      </div>

      {/* Roles Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ROLES.map((role) => (
          <Card key={role.value}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{role.label}</p>
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users List */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            قائمة المستخدمين
            {users && (
              <Badge variant="secondary" className="mr-2">
                {users.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : users && users.length > 0 ? (
            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-md border bg-card hover-elevate"
                  data-testid={`user-row-${user.id}`}
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {user.firstName?.[0] || user.username?.[0]?.toUpperCase() || "م"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName}`
                          : user.username}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-1">
                        <div className="flex items-center gap-1">
                          @{user.username}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          انضم: {formatDate(user.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={getRoleBadgeColor(user.role)}
                    >
                      {user.role || "مشاهد"}
                    </Badge>
                    {isAdmin && user.username !== "root" && user.id !== currentUser?.id && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          data-testid={`button-edit-user-${user.id}`}
                        >
                          <Edit className="w-4 h-4 ml-1" />
                          تعديل الدور
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPasswordDialog(user)}
                        >
                          <Key className="w-4 h-4 ml-1" />
                          كلمة المرور
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDeleteDialog(user)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {isAdmin && user.username === "root" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPasswordDialog(user)}
                      >
                        <Key className="w-4 h-4 ml-1" />
                        كلمة المرور
                      </Button>
                    )}
                    {user.id === currentUser?.id && (
                      <Badge variant="secondary">أنت</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المستخدم</Label>
              <Input
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                placeholder="أدخل اسم المستخدم"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="أدخل كلمة المرور"
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الاسم الأول</Label>
                <Input
                  value={newUser.firstName}
                  onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                  placeholder="اختياري"
                />
              </div>
              <div className="space-y-2">
                <Label>الاسم الأخير</Label>
                <Input
                  value={newUser.lastName}
                  onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                  placeholder="اختياري"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الصلاحية</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleCreateUser}
                className="flex-1"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                    جاري الإضافة...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 ml-2" />
                    إضافة
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل صلاحية المستخدم</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-md bg-muted/50">
                <Avatar>
                  <AvatarFallback>
                    {editingUser.firstName?.[0] || editingUser.username?.[0]?.toUpperCase() || "م"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {editingUser.firstName && editingUser.lastName
                      ? `${editingUser.firstName} ${editingUser.lastName}`
                      : editingUser.username}
                  </p>
                  <p className="text-sm text-muted-foreground">@{editingUser.username}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>الصلاحية</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div>
                          <p>{role.label}</p>
                          <p className="text-xs text-muted-foreground">{role.description}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSaveRole}
                  className="flex-1"
                  disabled={updateRoleMutation.isPending}
                  data-testid="button-save-role"
                >
                  {updateRoleMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-md bg-muted/50">
                <Avatar>
                  <AvatarFallback>
                    {editingUser.firstName?.[0] || editingUser.username?.[0]?.toUpperCase() || "م"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {editingUser.firstName && editingUser.lastName
                      ? `${editingUser.firstName} ${editingUser.lastName}`
                      : editingUser.username}
                  </p>
                  <p className="text-sm text-muted-foreground">@{editingUser.username}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>كلمة المرور الجديدة</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الجديدة"
                  dir="ltr"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleChangePassword}
                  className="flex-1"
                  disabled={changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
                <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المستخدم</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المستخدم "{editingUser?.username}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => editingUser && deleteUserMutation.mutate(editingUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUserMutation.isPending ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Users className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2">لا يوجد مستخدمون</h3>
      <p className="text-muted-foreground">
        سيظهر المستخدمون هنا بعد إضافتهم
      </p>
    </div>
  );
}
