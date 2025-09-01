// gemini.ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "",
});

export interface ImageGenerationRequest {
  imageData: string; // base64 lub data URL (data:image/png;base64,...)
  mimeType: string;  // np. "image/png" | "image/jpeg"
  prompt: string;    // instrukcja edycji
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

function extractCandidates(res: any): any[] {
  return res?.response?.candidates ?? res?.candidates ?? [];
}

function extractImageBase64(res: any): string | null {
  const candidates = extractCandidates(res);
  if (!candidates?.length) return null;
  const parts = candidates[0]?.content?.parts ?? [];

  // Najczęstsza ścieżka w @google/genai: part.inlineData.{mimeType,data}
  const imgPart = parts.find(
    (p: any) =>
      p?.inlineData?.data &&
      String(p?.inlineData?.mimeType || "").startsWith("image/")
  );
  if (imgPart) return imgPart.inlineData.data;

  // Alternatywne ścieżki (sporadyczne różnice między wersjami)
  const alt = parts.find(
    (p: any) =>
      p?.media?.[0]?.data &&
      String(p?.media?.[0]?.mimeType || "").startsWith("image/")
  );
  if (alt) return alt.media[0].data;

  return null;
}

function extractText(res: any): string | null {
  if (typeof res?.text === "string" && res.text.trim()) return res.text;
  const candidates = extractCandidates(res);
  if (!candidates?.length) return null;
  const parts = candidates[0]?.content?.parts ?? [];
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

    // 1) Zadbaj o czyste base64 (bez prefiksu data URL)
    const base64 = stripDataUrl(request.imageData);

    // 2) Zbuduj finalny prompt, który „kotwiczy” edycję na wejściowym obrazie
    const finalPrompt = `${EDIT_PREFIX}\n${request.prompt}`;

    // 3) Jedno wywołanie: model obrazowy + (obraz + instrukcja) w JEDNYM contents
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      // Zgodnie z oficjalnym przykładem: przekazujemy tablicę parts z text + inlineData
      // (JS przykład w docs dla "Image editing")
      contents: [
        {
          role: "user",
          parts: [
            { text: finalPrompt },
            { inlineData: { mimeType: request.mimeType, data: base64 } },
          ],
        },
      ],
      // Uwaga: w zwykłym generateContent nie trzeba wymuszać responseModalities;
      // model sam zwróci part inlineData (obraz) oraz ewentualnie part text.
      // Jeśli chcesz, możesz dodać lekką kontrolę kreatywności:
      // config: { temperature: 0.2, topP: 0.1, topK: 16 },
    });

    const outBase64 = extractImageBase64(response);
    if (!outBase64) {
      // pokaż surowy tekst (jeśli model coś powiedział), żeby łatwiej debugować
      const maybeText = extractText(response);
      const extra = maybeText ? ` (${maybeText})` : "";
      return { success: false, error: "Invalid response format" + extra };
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

/* -------------------- ANALIZA OBRAZU (tekst) — opcjonalnie też tym samym modelem -------------------- */

export async function analyzeImage(
  imageData: string,
  mimeType: string
): Promise<string> {
  const base64 = stripDataUrl(imageData);
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-image-preview",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: "Describe the image: subjects, pose/arrangement, background, colors, lighting. Be objective and concise." },
        ],
      },
    ],
    // config: { temperature: 0.2 },
  });
  return extractText(res) || "Unable to analyze image";
}
