import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onRemoveFile: () => void;
  accept?: string;
  maxSize?: number;
  className?: string;
}

export function FileUpload({
  onFileSelect,
  selectedFile,
  onRemoveFile,
  accept = "*",
  maxSize = 10 * 1024 * 1024, // 10MB default
  className,
  ...props
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileValidation(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileValidation(files[0]);
    }
  };

  const handleFileValidation = (file: File) => {
    if (maxSize && file.size > maxSize) {
      alert(`Rozmiar pliku musi być mniejszy niż ${Math.round(maxSize / (1024 * 1024))}MB`);
      return;
    }

    if (accept !== "*" && !file.type.match(accept.replace("*", ".*"))) {
      alert("Proszę wybrać prawidłowy typ pliku");
      return;
    }

    onFileSelect(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={cn("space-y-4", className)} {...props}>
      <div
        className={cn(
          "upload-zone rounded-lg p-8 text-center cursor-pointer transition-all duration-300",
          "border-2 border-dashed border-border bg-gradient-to-br from-muted to-card",
          "hover:border-primary hover:bg-gradient-to-br hover:from-accent hover:to-muted",
          isDragOver && "border-primary bg-gradient-to-br from-primary/10 to-muted"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        data-testid="upload-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleFileInputChange}
          data-testid="file-input"
        />

        {!selectedFile ? (
          <div data-testid="upload-content">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Przeciągnij i upuść swój obraz tutaj</p>
            <p className="text-muted-foreground mb-4">lub kliknij, aby przeglądać pliki</p>
            <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
              <span className="bg-muted px-2 py-1 rounded">JPG</span>
              <span className="bg-muted px-2 py-1 rounded">PNG</span>
              <span className="bg-muted px-2 py-1 rounded">WebP</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Maksymalny rozmiar: {Math.round(maxSize / (1024 * 1024))}MB
            </p>
          </div>
        ) : (
          <div className="relative" data-testid="image-preview">
            <img
              src={URL.createObjectURL(selectedFile)}
              alt="Podgląd przesłanego obrazu"
              className="rounded-lg max-h-64 mx-auto"
              data-testid="preview-image"
            />
            <Button
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2 rounded-full w-8 h-8 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFile();
              }}
              data-testid="button-remove-file"
            >
              <X className="h-4 w-4" />
            </Button>
            <p className="text-sm text-muted-foreground mt-2" data-testid="text-filename">
              {selectedFile.name}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
