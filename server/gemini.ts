// gemini.ts
import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "",
});

export interface ImageGenerationRequest {
  imageData: string; // base64 lub data URL
  mimeType: string;  // np. "image/png"
  prompt: string;
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
  const imgPart = parts.find(
    (p: any) =>
      p?.inlineData?.data &&
      String(p?.inlineData?.mimeType || "").startsWith("image/")
  );
  if (imgPart) return imgPart.inlineData.data;

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

/* -------------------- Guardraile promptu -------------------- */

const EDIT_PREFIX = [
  "EDIT THE PROVIDED IMAGE ONLY.",
  "Use the uploaded image as the base.",
  "Do NOT generate a new scene from scratch.",
  "Preserve subject identity, pose and composition unless changes are explicitly requested.",
  "Apply only these changes:"
].join(" ");

const ANALYZE_BRIEF =
  "In 1-2 concise sentences, list the most salient, objective facts about this image (subject, pose, clothing/main objects, background, lighting). No speculation.";

/* -------------------- Krok 1: krótka analiza obrazu (kotwica) -------------------- */

async function briefDescribeImage(imageBase64: string, mimeType: string): Promise<string> {
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { data: imageBase64, mimeType } },
        { text: ANALYZE_BRIEF }
      ]
    }],
    config: {
      responseModalities: [Modality.TEXT],
      temperature: 0.1,
      topP: 0.1,
      topK: 16,
    },
  });
  const text = extractText(res)?.trim() || "";
  // utnij nadmiar — to ma być kotwica, nie esej
  return text.slice(0, 500);
}

/* -------------------- Krok 2: właściwa edycja (image + instrukcja) -------------------- */

type GenModel = "gemini-2.0-flash-preview-image-generation" | "gemini-2.5-flash-image-preview";

async function tryGenerateWithModel(
  model: GenModel,
  imageBase64: string,
  mimeType: string,
  finalPrompt: string
): Promise<ImageGenerationResponse> {
  const res = await ai.models.generateContent({
    model,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { data: imageBase64, mimeType } },
        { text: finalPrompt }
      ],
    }],
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT], // obraz + krótki opis zmian
      temperature: 0.2,
      topP: 0.1,
      topK: 16,
    },
  });

  const outBase64 = extractImageBase64(res);
  if (!outBase64) {
    return { success: false, error: "Invalid response format (no image part)" };
  }
  return { success: true, imageData: outBase64 };
}

/* -------------------- API: edycja obrazu -------------------- */

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

    const base64 = stripDataUrl(request.imageData);

    // 1) Zbuduj kotwicę z obrazu, żeby model „wiedział”, co zachować
    let anchor = "";
    try {
      anchor = await briefDescribeImage(base64, request.mimeType);
    } catch {
      // brak kotwicy to nie błąd krytyczny — jedziemy dalej
      anchor = "";
    }

    // 2) Finalny prompt: twarde zasady + rzeczy do zachowania + Twoje instrukcje
    const preserveLine = anchor
      ? `\nPRESERVE these factual properties of the input image: ${anchor}`
      : "";
    const finalPrompt = `${EDIT_PREFIX}${preserveLine}\n${request.prompt}`;

    // 3) Najpierw spróbuj model image-to-image; jeśli brak/działa inaczej, fallback
    const primaryModel: GenModel = "gemini-2.0-flash-preview-image-generation";
    const fallbackModel: GenModel = "gemini-2.5-flash-image-preview";

    try {
      const r1 = await tryGenerateWithModel(primaryModel, base64, request.mimeType, finalPrompt);
      if (r1.success) return r1;
      // jeśli format nie ten — od razu spróbuj fallback
    } catch (e) {
      // np. model niedostępny w regionie/projekcie — spróbuj fallback
    }

    const r2 = await tryGenerateWithModel(fallbackModel, base64, request.mimeType, finalPrompt);
    return r2;
  } catch (error) {
    console.error("Gemini edit error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/* -------------------- API: analiza obrazu (opcjonalne) -------------------- */

export async function analyzeImage(
  imageData: string,
  mimeType: string
): Promise<string> {
  try {
    const base64 = stripDataUrl(imageData);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: base64, mimeType } },
          { text: "Analyze this image: subjects, pose, objects, background, colors, lighting. Be objective and concise." }
        ]
      }],
      config: {
        responseModalities: [Modality.TEXT],
        temperature: 0.2,
        topP: 0.1,
        topK: 16,
      },
    });
    return extractText(response) || "Unable to analyze image";
  } catch (error) {
    console.error("Image analysis error:", error);
    throw new Error(
      `Failed to analyze image: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
