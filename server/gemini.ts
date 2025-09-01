// gemini.ts
import { GoogleGenAI } from "@google/genai";

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

function extractImageBase64(res: any): string | null {
  const parts = firstPartsArray(res);
  if (!parts.length) return null;

  // Najczęstsza ścieżka w @google/genai: part.inlineData.{mimeType,data}
  const p1 = parts.find(
    (p: any) =>
      p?.inlineData?.data &&
      String(p?.inlineData?.mimeType || "").startsWith("image/")
  );
  if (p1) return p1.inlineData.data;

  // Alternatywna ścieżka (niektóre wersje):
  const p2 = parts.find(
    (p: any) =>
      p?.media?.[0]?.data &&
      String(p?.media?.[0]?.mimeType || "").startsWith("image/")
  );
  if (p2) return p2.media[0].data;

  // Rzadziej: fileData może wskazywać zasób – wtedy potrzebny byłby dodatkowy fetch.
  // Tu próbujemy jeszcze znaleźć inlineData ukryte w zagnieżdżeniu:
  const p3 = parts.find((p: any) => p?.inline_data?.data && String(p?.inline_data?.mime_type || "").startsWith("image/"));
  if (p3) return p3.inline_data.data;

  return null;
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

    // 3) Wywołanie modelu obrazowego z jednoczesnym tekstem i obrazem
    const response = await ai.models.generateContent({
  model: DEFAULT_IMAGE_MODEL, // "gemini-2.5-flash-image-preview"
  contents: [
    {
      role: "user",
      parts: [
        { text: `${EDIT_PREFIX}\n${request.prompt.trim()}\nReturn an image, not text.` },
        { inlineData: { mimeType: request.mimeType, data: base64 } },
      ],
    },
  ],
  config: {
    temperature: 0.2,
    topP: 0.9,
    topK: 32,
    // maxOutputTokens nie jest wymagane dla obrazu
  },
});




    const outBase64 = extractImageBase64(response);
    if (!outBase64) {
      const maybeText = extractText(response);
      const extra = maybeText ? ` (${maybeText})` : "";
      return { success: false, error: "Model returned no image" + extra };
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
