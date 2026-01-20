import { useState } from "react";
import { Ship, Package, CreditCard, BarChart3, Shield, Globe, Loader2, Lock, User, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function Landing() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/login", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.href = "/";
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في تسجيل الدخول",
        description: error.message || "اسم المستخدم أو كلمة المرور غير صحيحة",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم المستخدم وكلمة المرور",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-20 w-60 h-60 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 right-1/3 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative min-h-screen flex">
        {/* Left Panel - Login Form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-8">
            {/* Logo & Brand */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-xl shadow-primary/25">
                <Ship className="w-10 h-10 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight">Tracker</h1>
                <p className="text-muted-foreground mt-2">نظام إدارة الشحنات والتكاليف</p>
              </div>
            </div>

            {/* Login Card */}
            <Card className="border-0 shadow-2xl shadow-black/5 bg-card/80 backdrop-blur-sm">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-semibold">مرحباً بك</h2>
                    <p className="text-sm text-muted-foreground">
                      قم بتسجيل الدخول للوصول إلى لوحة التحكم
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-sm font-medium">
                        اسم المستخدم
                      </Label>
                      <div className="relative">
                        <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="username"
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="أدخل اسم المستخدم"
                          className="pr-11 h-12 text-base"
                          dir="ltr"
                          disabled={loginMutation.isPending}
                          data-testid="input-username"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-sm font-medium">
                        كلمة المرور
                      </Label>
                      <div className="relative">
                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="أدخل كلمة المرور"
                          className="pr-11 h-12 text-base"
                          dir="ltr"
                          disabled={loginMutation.isPending}
                          data-testid="input-password"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-medium"
                      disabled={loginMutation.isPending}
                      data-testid="button-login"
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                          جاري تسجيل الدخول...
                        </>
                      ) : (
                        <>
                          تسجيل الدخول
                          <ArrowLeft className="mr-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>

            {/* Footer */}
            <p className="text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} Tracker - جميع الحقوق محفوظة
            </p>
          </div>
        </div>

        {/* Right Panel - Features */}
        <div className="hidden lg:flex flex-1 items-center justify-center p-12 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5">
          <div className="max-w-lg space-y-10">
            {/* Hero Text */}
            <div className="space-y-4">
              <h2 className="text-3xl font-bold leading-tight">
                إدارة شحناتك بكل سهولة واحترافية
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                تتبع شحناتك من لحظة الشراء حتى الاستلام، مع حساب دقيق للتكاليف 
                بالجنيه المصري والرممبي الصيني
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-4">
              <FeatureItem
                icon={Ship}
                title="إدارة الشحنات"
                description="تتبع جميع مراحل الشحن"
              />
              <FeatureItem
                icon={BarChart3}
                title="حساب التكاليف"
                description="حساب دقيق بالعملتين"
              />
              <FeatureItem
                icon={CreditCard}
                title="متابعة السداد"
                description="تسجيل المدفوعات"
              />
              <FeatureItem
                icon={Package}
                title="المخزون"
                description="ربط تلقائي بالمخزون"
              />
              <FeatureItem
                icon={Globe}
                title="أسعار الصرف"
                description="إدارة أسعار العملات"
              />
              <FeatureItem
                icon={Shield}
                title="الصلاحيات"
                description="نظام أدوار متكامل"
              />
            </div>

            {/* Currency Pills */}
            <div className="flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 border shadow-sm">
                <span className="text-xl font-bold text-primary">¥</span>
                <span className="text-sm font-medium">رممبي صيني</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 border shadow-sm">
                <span className="text-xl font-bold text-primary">ج.م</span>
                <span className="text-sm font-medium">جنيه مصري</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 border shadow-sm">
                <span className="text-xl font-bold text-primary">$</span>
                <span className="text-sm font-medium">دولار أمريكي</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Ship;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-background/60 backdrop-blur-sm border shadow-sm">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}
