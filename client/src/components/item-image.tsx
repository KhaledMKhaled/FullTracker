import { useState } from "react";
import { Package, ImageOff } from "lucide-react";

interface ItemImageProps {
  src: string | null | undefined;
  alt?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-10 h-10",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

export function ItemImage({ src, alt = "صورة البند", size = "md", className = "" }: ItemImageProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const sizeClass = sizeClasses[size];

  if (!src || hasError) {
    return (
      <div 
        className={`${sizeClass} bg-muted rounded-md flex items-center justify-center flex-shrink-0 ${className}`}
        title={hasError ? "الصورة غير متاحة" : "لا توجد صورة"}
      >
        {hasError ? (
          <ImageOff className="w-5 h-5 text-muted-foreground" />
        ) : (
          <Package className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClass} flex-shrink-0 ${className}`}>
      {isLoading && (
        <div className={`absolute inset-0 ${sizeClass} bg-muted rounded-md animate-pulse`} />
      )}
      <img
        src={src}
        alt={alt}
        className={`${sizeClass} object-cover rounded-md border ${isLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </div>
  );
}
