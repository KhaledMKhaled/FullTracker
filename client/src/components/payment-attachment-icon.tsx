import { useState } from "react";
import { Paperclip, ImageOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { hasPaymentAttachment } from "@/lib/paymentAttachments";
import type { ShipmentPayment } from "@shared/schema";

interface PaymentAttachmentIconProps {
  paymentId: number | null | undefined;
  attachmentUrl: ShipmentPayment["attachmentUrl"];
  attachmentOriginalName?: ShipmentPayment["attachmentOriginalName"] | null;
  className?: string;
}

export function PaymentAttachmentIcon({
  paymentId,
  attachmentUrl,
  attachmentOriginalName,
  className,
}: PaymentAttachmentIconProps) {
  const [hasError, setHasError] = useState(false);

  if (!paymentId || !hasPaymentAttachment({ attachmentUrl })) {
    return null;
  }

  // Use Object Storage URL directly if available (same approach as item images)
  // This is more reliable than going through the /api/payments/:id/attachment route
  const imageUrl = attachmentUrl?.startsWith("/objects/") 
    ? attachmentUrl 
    : `/api/payments/${paymentId}/attachment?inline=1`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("inline-flex items-center justify-center", className)}
          data-testid={`payment-attachment-${paymentId}`}
          aria-label="عرض صورة المرفق"
        >
          <Paperclip className="h-4 w-4 text-muted-foreground" />
        </a>
      </TooltipTrigger>
      <TooltipContent className="p-2" side="top">
        <div className="flex flex-col items-center gap-2">
          {hasError ? (
            <div className="h-24 w-24 rounded border bg-muted flex items-center justify-center">
              <ImageOff className="h-8 w-8 text-muted-foreground" />
            </div>
          ) : (
            <img
              src={imageUrl}
              alt="معاينة المرفق"
              className="h-24 w-24 rounded border object-cover"
              loading="lazy"
              onError={() => setHasError(true)}
            />
          )}
          <span className="text-xs text-muted-foreground">انقر للعرض</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
