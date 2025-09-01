// gemini.ts
import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "",
});

export interface ImageGenerationRequest {
  imageData: string; // base64 (może być też data URL)
  mimeType: string;  // np. "image/png", "image/jpeg"
  prompt: string;
}

export interface ImageGenerationResponse {
  success: boolean;
  imageData?: string; // base64 wygenerowanego/edytowanego obrazu
  error?: string;
}

/** --- Pomocnicze --- */
function stripDataUrl(input: string): string {
  const m = input.match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : input;
}

function extractCandidates(res: any): any[] {
  // Różne wersje SDK zwracają różnie zagnieżdżone pola
  return res?.response?.candidates ?? res?.candidates ?? [];
}

function extractImageBase64(res: any): string | null {
  const candidates = extractCandidates(res);
  if (!candidates?.length) return null;

  const parts = candidates[0]?.content?.parts ?? [];
  // Najczęstszy wariant: inlineData
  const imgPart = parts.find(
    (p: any) =>
      p?.inlineData?.data &&
      String(p?.inlineData?.mimeType || "").startsWith("image/")
  );
  if (imgPart) return imgPart.inlineData.data;

  // Alternatywny wariant (niektóre buildy SDK)
  const alt = parts.find(
    (p: any) =>
      p?.media?.[0]?.data &&
      String(p?.media?.[0]?.mimeType || "").startsWith("image/")
  );
  if (alt) return alt.media[0].data;

  return null;
}

function extractText(res: any): string | null {
  // W części buildów jest dostępne skrótowe pole "text"
  if (typeof res?.text === "string" && res.text.trim()) return res.text;

  const candidates = extractCandidates(res);
  if (!candidates?.length) return null;

  const parts = candidates[0]?.content?.parts ?? [];
  const textPart = parts.find((p: any) => typeof p?.text === "string" && p.text.trim());
  return textPart?.text ?? null;
}

/** --- Nakładki sterujące zachowaniem modelu (wymuszenie edycji a nie generacji od zera) --- */
const EDIT_PREFIX = [
  "EDIT THE PROVIDED IMAGE ONLY.",
  "Use the uploaded image as the base.",
  "Do NOT generate a new scene from scratch.",
  "Preserve subject identity, pose and composition unless changes are explicitly requested.",
  "Apply only these changes:"
].join(" ");

const ANALYZE_PREFIX =
  "Analyze ONLY the uploaded image. Describe key elements, style, colors, composition, and lighting.";

/** --- Główne funkcje --- */

/**
 * Edycja/transformacja obrazu na podstawie promptu.
 * Przekazujemy obraz + instrukcję w JEDNYM komunikacie.
 */
export async function generateImageWithPrompt(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  try {
    if (!ai) return { success: false, error: "AI client not initialized" };
    if (!request?.imageData || !request?.mimeType) {
      return { success: false, error: "Image data and mimeType are required" };
    }
    if (!request?.prompt?.trim()) {
      return { success: false, error: "Prompt is required" };
    }

    const base64 = stripDataUrl(request.imageData);
    const finalPrompt = `${EDIT_PREFIX}\n${request.prompt}`;

    const imageGenResponse = await ai.models.generateContent({
      // Jeśli w Twoim środowisku dostępny jest model do generacji/edycji obrazów w wersji 2.0 preview,
      // możesz użyć: "gemini-2.0-flash-preview-image-generation".
      // Poniżej pozostawiamy model z Twojej wersji:
      model: "gemini-2.5-flash-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: base64, mimeType: request.mimeType } }, // obraz bazowy
            { text: finalPrompt } // instrukcja edycji
          ],
        },
      ],
      // W @google/genai te opcje są w `config`. (W innych SDK bywa `generationConfig`.)
      config: {
        responseModalities: [Modality.IMAGE], // oczekujemy obrazu
        temperature: 0.4,                      // mniej "fantazji", lepsze trzymanie się wejścia
      },
    });

    const outBase64 = extractImageBase64(imageGenResponse);
    if (!outBase64) {
      return { success: false, error: "Invalid response format" };
    }

    return { success: true, imageData: outBase64 };
  } catch (error) {
    console.error("Gemini API error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Analiza obrazu (opis słowny).
 */
export async function analyzeImage(
  imageData: string,
  mimeType: string
): Promise<string> {
  try {
    const base64 = stripDataUrl(imageData);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: base64, mimeType } },
            { text: ANALYZE_PREFIX }
          ],
        },
      ],
      config: {
        responseModalities: [Modality.TEXT],
        temperature: 0.2,
      },
    });

    return extractText(response) || "Unable to analyze image";
  } catch (error) {
    console.error("Image analysis error:", error);
    throw new Error(
      `Failed to analyze image: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
