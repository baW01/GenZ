import * as fs from "fs";
import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || ""
});

export interface ImageGenerationRequest {
  imageData: string; // base64 encoded image
  mimeType: string;
  prompt: string;
}

export interface ImageGenerationResponse {
  success: boolean;
  imageData?: string; // base64 encoded generated image
  error?: string;
}

export async function generateImageWithPrompt(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  try {
    if (!ai) {
      return { success: false, error: "AI client not initialized" };
    }
    if (!request?.imageData || !request?.mimeType) {
      return { success: false, error: "Image data and mimeType are required" };
    }
    if (!request?.prompt?.trim()) {
      return { success: false, error: "Prompt is required" };
    }

    // 1) Upewnij się, że przekazujesz same base64 (bez prefiksu data URL)
    const base64 = (() => {
      const m = request.imageData.match(/^data:[^;]+;base64,(.+)$/);
      return m ? m[1] : request.imageData;
    })();

    // 2) Jedno wywołanie: model do generacji/edycji obrazów + obraz + prompt w JEDNYM 'contents'
    const imageGenResponse = await ai.models.generateContent({
      // użyj modelu do generacji obrazów; jeśli w Twoim projekcie był:
      // "gemini-2.0-flash-preview-image-generation", to wstaw go tutaj.
      // Jeżeli masz pewność, że "gemini-2.5-flash-image-preview" działa u Ciebie — zostaw go.
      model: "gemini-2.5-flash-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: base64, mimeType: request.mimeType } }, // obraz do edycji
            { text: request.prompt } // instrukcja edycji
          ],
        },
      ],
      // W wielu wersjach SDK to pole nazywa się `config`.
      // Jeśli u Ciebie jest `generationConfig`, przenieś tam te opcje.
      config: {
        // Poproś o obraz w odpowiedzi
        responseModalities: [Modality.IMAGE],
      },
    });

    // 3) Elastyczne parsowanie odpowiedzi (różne SDK zwracają różnie zagnieżdżone pola)
    const anyRes: any = imageGenResponse;
    const candidates = anyRes?.response?.candidates ?? anyRes?.candidates ?? [];
    if (!candidates?.length) {
      return { success: false, error: "No image generated from the model" };
    }

    const parts = candidates[0]?.content?.parts ?? [];
    const imgPart = parts.find(
      (p: any) =>
        p?.inlineData?.data &&
        String(p?.inlineData?.mimeType || "").startsWith("image/")
    );

    if (!imgPart) {
      // dodatkowa próba: niektóre SDK umieszczają obraz pod innym kluczem
      const altImgPart = parts.find(
        (p: any) => p?.media?.[0]?.data && String(p?.media?.[0]?.mimeType || "").startsWith("image/")
      );
      if (altImgPart) {
        return {
          success: true,
          imageData: altImgPart.media[0].data,
        };
      }

      return { success: false, error: "Invalid response format" };
    }

    return {
      success: true,
      imageData: imgPart.inlineData.data, // czyste base64 obrazu wyjściowego
    };
  } catch (error) {
    console.error("Gemini API error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}


export async function analyzeImage(imageData: string, mimeType: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: imageData,
                mimeType: mimeType,
              },
            },
            {
              text: "Analyze this image and describe its key elements, style, colors, and composition in detail.",
            },
          ],
        },
      ],
    });

    return response.text || "Unable to analyze image";
  } catch (error) {
    console.error("Image analysis error:", error);
    throw new Error(`Failed to analyze image: ${error}`);
  }
}
