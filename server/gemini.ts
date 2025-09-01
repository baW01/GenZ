// gemini.ts
import { GoogleGenAI, RawReferenceImage } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "",
});

const IMAGE_MODELS = [
  "gemini-2.5-flash-image-preview",
  // zostawiam możliwość szybkiej podmiany, gdy Google zaktualizuje nazwę:
  "gemini-2.5-flash-image",
];

const DEFAULT_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL && IMAGE_MODELS.includes(process.env.GEMINI_IMAGE_MODEL)
    ? process.env.GEMINI_IMAGE_MODEL
    : "gemini-2.5-flash-image-preview";

// Model dedykowany do edycji obrazów (Imagen 3)
const DEFAULT_EDIT_MODEL =
  process.env.GEMINI_EDIT_MODEL ?? "imagen-3.0-capability-001";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface ImageGenerationRequest {
  imageData: string; // base64 lub data URL (data:image/png;base64,...)
  mimeType: string;  // "image/png" | "image/jpeg" | "image/webp"
  prompt: string;    // instrukcja edycji
  // opcjonalnie: wymuś PNG/JPEG w odpowiedzi modelu
  outputMimeType?: "image/png" | "image/jpeg" | "image/webp";
}

export interface ImageGenerationResponse {
  success: boolean;
  imageData?: string; // base64 obrazu wynikowego
  error?: string;
}

/* -------------------- Pomocnicze -------------------- */

function stripDataUrl(input: string): string {
  const m = input.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : input;
}

// czasem base64 z przeglądarki może mieć brakujące = na końcu
function padBase64(b64: string): string {
  const rem = b64.length % 4;
  return rem ? b64 + "=".repeat(4 - rem) : b64;
}

function extractCandidates(res: any): any[] {
  // @google/genai w różnych wersjach zwraca z/bez wrappera response
  return res?.response?.candidates ?? res?.candidates ?? [];
}

function firstPartsArray(res: any): any[] {
  const candidates = extractCandidates(res);
  if (!candidates?.length) return [];
  return candidates[0]?.content?.parts ?? [];
}

function extractText(res: any): string | null {
  if (typeof res?.text === "string" && res.text.trim()) return res.text;
  const parts = firstPartsArray(res);
  const textPart = parts.find((p: any) => typeof p?.text === "string" && p.text.trim());
  return textPart?.text ?? null;
}

/* -------------------- Guardraile promptu (wymuś tryb EDYCJI) -------------------- */

const EDIT_PREFIX = [
  "EDIT THE PROVIDED IMAGE ONLY.",
  "Use the uploaded image as the base.",
  "Do NOT generate a new scene from scratch.",
  "Preserve subject identity, pose and composition unless changes are explicitly requested.",
  "Apply only these changes:"
].join(" ");

/* -------------------- EDYCJA OBRAZU -------------------- */

export async function generateImageWithPrompt(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  try {
    if (!request?.imageData || !request?.mimeType) {
      return { success: false, error: "Image data and mimeType are required" };
    }
    if (!request?.prompt?.trim()) {
      return { success: false, error: "Prompt is required" };
    }
    if (!ALLOWED_MIME.has(request.mimeType)) {
      return {
        success: false,
        error: `Unsupported mimeType "${request.mimeType}". Use image/png, image/jpeg or image/webp.`,
      };
    }

    // 1) Czyste base64 (bez prefiksu data URL) + ewentualny padding
    const base64 = padBase64(stripDataUrl(request.imageData));

    // 2) Finalny prompt kotwiczący edycję na wejściowym obrazie
    const finalPrompt = `${EDIT_PREFIX}\n${request.prompt.trim()}`;

    // 3) Przygotowanie referencyjnego obrazu dla API edycji
    const ref = new RawReferenceImage();
    ref.referenceImage = { imageBytes: base64, mimeType: request.mimeType };

    // 4) Wywołanie API edycji obrazu (Imagen 3)
    const response = await ai.models.editImage({
      model: DEFAULT_EDIT_MODEL,
      prompt: finalPrompt,
      referenceImages: [ref],
      config: {
        ...(request.outputMimeType ? { outputMimeType: request.outputMimeType } : {}),
      },
    });

    const outBase64 = response.generatedImages?.[0]?.image?.imageBytes;
    if (!outBase64) {
      return { success: false, error: "Model returned no image" };
    }

    return { success: true, imageData: outBase64 };
  } catch (error) {
    console.error("Gemini edit error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/* -------------------- ANALIZA OBRAZU (tekst) -------------------- */

export async function analyzeImage(
  imageData: string,
  mimeType: string
): Promise<string> {
  if (!ALLOWED_MIME.has(mimeType)) {
    return `Unsupported mimeType "${mimeType}". Use image/png, image/jpeg or image/webp.`;
  }
  const base64 = padBase64(stripDataUrl(imageData));
  const res = await ai.models.generateContent({
  model: DEFAULT_IMAGE_MODEL,
  contents: [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: "Describe the image succinctly: subjects, background, colors, lighting." },
      ],
    },
  ],
  config: { temperature: 0.2 },
});

  return extractText(res) || "Unable to analyze image";
}
