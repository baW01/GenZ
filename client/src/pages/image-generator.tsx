import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { FileUpload } from "@/components/ui/file-upload";
import { 
  Upload, 
  Wand2, 
  Download, 
  RotateCcw, 
  Clock, 
  TriangleAlert,
  Image as ImageIcon,
  Loader2
} from "lucide-react";

export default function ImageGenerator() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateMutation = useMutation({
    mutationFn: async ({ file, prompt }: { file: File; prompt: string }) => {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('prompt', prompt);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 15, 90));
      }, 200);

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);
        setProgress(100);

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Generation failed');
        }

        const result = await response.json();
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }
    },
    onSuccess: (data) => {
      setGeneratedImageUrl(data.imageUrl);
      setProgress(0);
      toast({
        title: "Sukces!",
        description: "Twój obraz AI został pomyślnie wygenerowany.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/generations'] });
    },
    onError: (error) => {
      setProgress(0);
      toast({
        title: "Generowanie nie powiodło się",
        description: error instanceof Error ? error.message : "Spróbuj ponownie z innym obrazem lub poleceniem.",
        variant: "destructive",
      });
    },
  });

  const { data: recentGenerations } = useQuery({
    queryKey: ['/api/generations'],
    enabled: false, // Only fetch when needed
  });

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = () => {
    if (!selectedFile || !prompt.trim()) return;
    
    setGeneratedImageUrl(null);
    generateMutation.mutate({ file: selectedFile, prompt: prompt.trim() });
  };

  const handleDownload = () => {
    if (!generatedImageUrl) return;
    
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = 'ai-generated-image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleNewGeneration = () => {
    setGeneratedImageUrl(null);
    setPrompt("");
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const insertPromptSuggestion = (suggestion: string) => {
    if (prompt.trim()) {
      setPrompt(prev => prev + ', ' + suggestion);
    } else {
      setPrompt(suggestion);
    }
  };

  const canGenerate = selectedFile && prompt.trim().length > 0 && !generateMutation.isPending;
  const charCount = prompt.length;
  const isCharCountWarning = charCount > 400;
  const isCharCountDanger = charCount > 480;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <header className="text-center mb-12">
        <div className="flex items-center justify-center mb-4">
          <div className="bg-primary/10 p-3 rounded-lg mr-4">
            <Wand2 className="text-primary text-2xl h-6 w-6" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            Chujowy Generator
          </h1>
        </div>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Coś tam generuje ale obrazu nie pobiera c word...
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left Column: Upload and Prompt */}
        <div className="space-y-6">
          {/* Image Upload */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center" data-testid="heading-upload">
                <Upload className="text-primary mr-2 h-5 w-5" />
                Prześlij obraz
              </h2>
              
              <FileUpload
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                onRemoveFile={handleRemoveFile}
                accept="image/*"
                maxSize={10 * 1024 * 1024}
                data-testid="file-upload"
              />
            </CardContent>
          </Card>

          {/* Prompt Input */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center" data-testid="heading-prompt">
                <Wand2 className="text-primary mr-2 h-5 w-5" />
                Opisz swoją wizję
              </h2>
              
              <div className="space-y-4">
                <div>
                  <Textarea
                    placeholder="Opisz, jak chcesz przekształcić ten obraz... (np. 'Spraw, aby wyglądał jak obraz Van Gogha', 'Dodaj neonowe światła cyberpunk', 'Przekształć w styl kreskówki')"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="h-32 resize-none"
                    maxLength={500}
                    data-testid="input-prompt"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => insertPromptSuggestion("oil painting style")}
                        data-testid="button-prompt-oil"
                      >
                        Malarstwo olejne
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => insertPromptSuggestion("cyberpunk aesthetic")}
                        data-testid="button-prompt-cyberpunk"
                      >
                        Cyberpunk
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => insertPromptSuggestion("watercolor painting")}
                        data-testid="button-prompt-watercolor"
                      >
                        Akwarela
                      </Button>
                    </div>
                    <span 
                      className={`text-sm transition-colors ${
                        isCharCountDanger ? 'text-destructive' : 
                        isCharCountWarning ? 'text-yellow-500' : 
                        'text-muted-foreground'
                      }`}
                      data-testid="text-character-count"
                    >
                      {charCount}/500
                    </span>
                  </div>
                </div>
                
                <Button
                  className="w-full py-4 generate-btn"
                  disabled={!canGenerate}
                  onClick={handleGenerate}
                  data-testid="button-generate"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generowanie...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Generuj obraz AI
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Results */}
        <div className="space-y-6">
          {/* Generation Status */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center" data-testid="heading-result">
                <ImageIcon className="text-primary mr-2 h-5 w-5" />
                Wynik generowania
              </h2>
              
              {/* Empty State */}
              {!generateMutation.isPending && !generatedImageUrl && !generateMutation.isError && (
                <div className="text-center py-12" data-testid="state-empty">
                  <div className="bg-muted/30 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                    <ImageIcon className="text-3xl text-muted-foreground h-8 w-8" />
                  </div>
                  <p className="text-muted-foreground">Prześlij obraz i wpisz polecenie, aby rozpocząć</p>
                </div>
              )}
              
              {/* Loading State */}
              {generateMutation.isPending && (
                <div className="text-center py-12" data-testid="state-loading">
                  <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-foreground font-medium">Generowanie Twojego obrazu AI...</p>
                  <p className="text-sm text-muted-foreground mt-2">Może to potrwać 30-60 sekund</p>
                  <div className="mt-4">
                    <Progress value={progress} className="w-64 mx-auto" data-testid="progress-generation" />
                  </div>
                </div>
              )}
              
              {/* Success State */}
              {generatedImageUrl && (
                <div className="fade-in" data-testid="state-success">
                  <div className="text-center mb-4">
                    <img 
                      src={generatedImageUrl} 
                      alt="Generated AI image" 
                      className="rounded-lg max-w-full h-auto mx-auto shadow-lg"
                      data-testid="img-generated"
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      className="flex-1" 
                      onClick={handleDownload}
                      data-testid="button-download"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Pobierz
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={handleNewGeneration}
                      data-testid="button-new"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Nowy obraz
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Error State */}
              {generateMutation.isError && (
                <div className="text-center py-12" data-testid="state-error">
                  <div className="bg-destructive/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                    <TriangleAlert className="text-3xl text-destructive h-8 w-8" />
                  </div>
                  <p className="text-destructive font-medium">Generowanie nie powiodło się</p>
                  <p className="text-sm text-muted-foreground mt-2" data-testid="text-error-message">
                    {generateMutation.error instanceof Error
                      ? generateMutation.error.message
                      : "Spróbuj ponownie z innym obrazem lub poleceniem"
                    }
                  </p>
                  <Button
                    className="mt-4"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    data-testid="button-retry"
                  >
                    Spróbuj ponownie
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Generations */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center" data-testid="heading-recent">
                <Clock className="text-primary mr-2 h-4 w-4" />
                Ostatnie generacje
              </h3>
              
              <div className="text-center py-8">
                <div className="bg-muted/30 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3">
                  <Clock className="text-2xl text-muted-foreground h-6 w-6" />
                </div>
                <p className="text-muted-foreground text-sm">Twoje ostatnie generacje pojawią się tutaj</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center mt-16 py-8 border-t border-border">
        <p className="text-muted-foreground text-sm">
          Stworzone w celach humorystycznych
        </p>
      </footer>
    </div>
  );
}
