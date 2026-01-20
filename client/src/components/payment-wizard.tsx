import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PaymentWizardStep = {
  id: string;
  title: string;
};

type PaymentWizardProps = {
  mode: "wizard" | "single";
  steps?: PaymentWizardStep[];
  currentStep?: number;
  onStepChange?: (index: number) => void;
  summary?: ReactNode;
  summaryPlacement?: "sidebar" | "top";
  footer?: ReactNode;
  children: ReactNode;
};

export function PaymentWizard({
  mode,
  steps = [],
  currentStep = 0,
  onStepChange,
  summary,
  summaryPlacement = "sidebar",
  footer,
  children,
}: PaymentWizardProps) {
  if (mode === "wizard") {
    return (
      <div className="space-y-4">
        {steps.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {steps.map((step, index) => {
              const isActive = index === currentStep;
              const isComplete = index < currentStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onStepChange?.(index)}
                  disabled={index > currentStep}
                  className={cn(
                    "flex-1 min-w-[120px] rounded-md border px-3 py-2 text-xs font-medium transition",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : isComplete
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground",
                    index > currentStep && "cursor-not-allowed opacity-60",
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  {step.title}
                </button>
              );
            })}
          </div>
        )}
        <div className="space-y-4">{children}</div>
        {footer}
      </div>
    );
  }

  const showSidebar = summaryPlacement === "sidebar" && summary;
  const showTop = summaryPlacement === "top" && summary;

  return (
    <div
      className={cn(
        "grid gap-6",
        showSidebar ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1",
      )}
    >
      <div className="space-y-4">
        {showTop && summary}
        {children}
        {footer}
      </div>
      {showSidebar && <div className="hidden xl:block">{summary}</div>}
    </div>
  );
}
