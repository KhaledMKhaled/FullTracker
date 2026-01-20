import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Database,
  Download,
  RotateCcw,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { BackupJob } from "@shared/schema";

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "running":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          <Loader2 className="w-3 h-3 ml-1 animate-spin" />
          جاري التنفيذ
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="w-3 h-3 ml-1" />
          مكتمل
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <XCircle className="w-3 h-3 ml-1" />
          فشل
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="w-3 h-3 ml-1" />
          في الانتظار
        </Badge>
      );
  }
}

function getJobTypeBadge(jobType: string) {
  if (jobType === "backup") {
    return (
      <Badge variant="outline" className="bg-primary/10">
        <Database className="w-3 h-3 ml-1" />
        نسخ احتياطي
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-orange-100 dark:bg-orange-900/30">
      <RotateCcw className="w-3 h-3 ml-1" />
      استعادة
    </Badge>
  );
}

export default function BackupPage() {
  const [isBackupDialogOpen, setIsBackupDialogOpen] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [isUploadRestoreDialogOpen, setIsUploadRestoreDialogOpen] = useState(false);
  const [selectedBackupPath, setSelectedBackupPath] = useState<string | null>(null);
  const [selectedBackupId, setSelectedBackupId] = useState<number | null>(null);
  const [uploadedBackupPath, setUploadedBackupPath] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: jobs, isLoading } = useQuery<BackupJob[]>({
    queryKey: ["/api/backup/jobs"],
  });

  const hasRunningJobs = jobs?.some((job) => job.status === "running");

  useEffect(() => {
    if (!hasRunningJobs) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/backup/jobs"] });
    }, 3000);

    return () => clearInterval(interval);
  }, [hasRunningJobs]);

  const completedBackups = jobs?.filter(
    (job) => job.jobType === "backup" && job.status === "completed" && job.outputPath
  ) ?? [];

  const startBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backup/start");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "تم بدء النسخ الاحتياطي بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/backup/jobs"] });
      setIsBackupDialogOpen(false);
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء بدء النسخ الاحتياطي", variant: "destructive" });
    },
  });

  const startRestoreMutation = useMutation({
    mutationFn: async (backupPath: string) => {
      console.log("[restore] Starting restore with path:", backupPath);
      const res = await apiRequest("POST", "/api/restore/start", { backupPath });
      return res.json();
    },
    onSuccess: (data) => {
      console.log("[restore] Restore job started:", data);
      toast({ title: "تم بدء الاستعادة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/backup/jobs"] });
      setIsRestoreDialogOpen(false);
      setIsUploadRestoreDialogOpen(false);
      setSelectedBackupPath(null);
      setSelectedBackupId(null);
      setUploadedBackupPath(null);
      setUploadedFileName(null);
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء بدء الاستعادة", variant: "destructive" });
    },
  });

  const uploadBackupMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backup/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "فشل في رفع الملف");
      }
      return res.json();
    },
    onSuccess: (data) => {
      console.log("[upload] Upload successful:", data);
      toast({ title: "تم رفع النسخة الاحتياطية بنجاح" });
      setUploadedBackupPath(data.backupPath);
      setIsUploadRestoreDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({ title: error.message || "حدث خطأ أثناء رفع النسخة الاحتياطية", variant: "destructive" });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".zip")) {
        toast({ title: "يجب أن يكون الملف بصيغة ZIP", variant: "destructive" });
        return;
      }
      setUploadedFileName(file.name);
      uploadBackupMutation.mutate(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleConfirmUploadRestore = () => {
    if (uploadedBackupPath) {
      startRestoreMutation.mutate(uploadedBackupPath);
    }
  };

  const handleDownload = async (jobId: number) => {
    try {
      const response = await fetch(`/api/backup/download/${jobId}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "فشل في تحميل النسخة الاحتياطية");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      link.download = filenameMatch ? filenameMatch[1] : `backup-${jobId}.zip`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast({ 
        title: error instanceof Error ? error.message : "فشل في تحميل النسخة الاحتياطية", 
        variant: "destructive" 
      });
    }
  };

  const handleRestoreClick = (job: BackupJob) => {
    if (!job.outputPath) return;
    setSelectedBackupPath(job.outputPath);
    setSelectedBackupId(job.id);
    setIsRestoreDialogOpen(true);
  };

  const handleConfirmRestore = () => {
    if (selectedBackupPath) {
      startRestoreMutation.mutate(selectedBackupPath);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">النسخ الاحتياطي والاستعادة</h1>
          <p className="text-muted-foreground mt-1">
            إنشاء نسخ احتياطية واستعادة البيانات
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".zip"
            className="hidden"
            data-testid="input-upload-backup"
          />
          <Button
            variant="outline"
            onClick={handleUploadClick}
            disabled={uploadBackupMutation.isPending}
            data-testid="button-upload-backup"
          >
            {uploadBackupMutation.isPending ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 ml-2" />
            )}
            رفع نسخة احتياطية
          </Button>
          <Button
            onClick={() => setIsBackupDialogOpen(true)}
            disabled={startBackupMutation.isPending}
            data-testid="button-create-backup"
          >
            {startBackupMutation.isPending ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 ml-2" />
            )}
            إنشاء نسخة احتياطية جديدة
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="w-5 h-5" />
              النسخ الاحتياطية المتاحة للاستعادة
              {completedBackups.length > 0 && (
                <Badge variant="secondary" className="mr-2">
                  {completedBackups.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : completedBackups.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">ID</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">الحجم</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedBackups.map((job) => (
                      <TableRow key={job.id} data-testid={`row-backup-${job.id}`}>
                        <TableCell className="font-medium">#{job.id}</TableCell>
                        <TableCell>{formatDate(job.createdAt)}</TableCell>
                        <TableCell>{formatFileSize(job.fileSize)}</TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(job.id)}
                              data-testid={`button-download-${job.id}`}
                            >
                              <Download className="w-4 h-4 ml-1" />
                              تحميل
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestoreClick(job)}
                              disabled={startRestoreMutation.isPending}
                              data-testid={`button-restore-${job.id}`}
                            >
                              <RotateCcw className="w-4 h-4 ml-1" />
                              استعادة
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>لا توجد نسخ احتياطية مكتملة</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              سجل العمليات
              {jobs && jobs.length > 0 && (
                <Badge variant="secondary" className="mr-2">
                  {jobs.length}
                </Badge>
              )}
              {hasRunningJobs && (
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 mr-2">
                  <Loader2 className="w-3 h-3 ml-1 animate-spin" />
                  يتم التحديث تلقائياً
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : jobs && jobs.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">ID</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">التقدم</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">الاكتمال</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                        <TableCell className="font-medium">#{job.id}</TableCell>
                        <TableCell>{getJobTypeBadge(job.jobType)}</TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell className="min-w-[120px]">
                          {job.status === "running" ? (
                            <div className="flex items-center gap-2">
                              <Progress value={job.progress ?? 0} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {job.progress ?? 0}%
                              </span>
                            </div>
                          ) : job.status === "completed" ? (
                            <span className="text-muted-foreground">100%</span>
                          ) : job.status === "failed" ? (
                            <span className="text-red-500 text-xs truncate max-w-[100px]" title={job.error || ""}>
                              {job.error || "خطأ"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(job.createdAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(job.completedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>لا توجد عمليات سابقة</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={isBackupDialogOpen} onOpenChange={setIsBackupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إنشاء نسخة احتياطية</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنشاء نسخة احتياطية كاملة من قاعدة البيانات والملفات المرفقة.
              قد تستغرق هذه العملية بضع دقائق.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={startBackupMutation.isPending}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => startBackupMutation.mutate()}
              disabled={startBackupMutation.isPending}
              data-testid="button-confirm-backup"
            >
              {startBackupMutation.isPending ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <Database className="w-4 h-4 ml-2" />
              )}
              بدء النسخ الاحتياطي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد استعادة النسخة الاحتياطية</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-destructive font-semibold">تحذير:</span> سيتم استبدال جميع البيانات الحالية
              بالبيانات من النسخة الاحتياطية رقم #{selectedBackupId}.
              هذه العملية لا يمكن التراجع عنها. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={startRestoreMutation.isPending}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRestore}
              disabled={startRestoreMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-restore"
            >
              {startRestoreMutation.isPending ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 ml-2" />
              )}
              استعادة النسخة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isUploadRestoreDialogOpen} onOpenChange={setIsUploadRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد استعادة النسخة الاحتياطية المرفوعة</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-destructive font-semibold">تحذير:</span> سيتم استبدال جميع البيانات الحالية
              بالبيانات من الملف "{uploadedFileName}".
              هذه العملية لا يمكن التراجع عنها. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel 
              disabled={startRestoreMutation.isPending}
              onClick={() => {
                setUploadedBackupPath(null);
                setUploadedFileName(null);
              }}
            >
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUploadRestore}
              disabled={startRestoreMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-upload-restore"
            >
              {startRestoreMutation.isPending ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 ml-2" />
              )}
              استعادة النسخة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
