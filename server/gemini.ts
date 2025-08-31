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

export async function generateImageWithPrompt(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  try {
    // Use the image generation model directly with both the original image and prompt
    // This allows the model to edit/transform the uploaded image according to the prompt
    const imageGenResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: [{ 
        role: "user", 
        parts: [
          {
            inlineData: {
              data: request.imageData,
              mimeType: request.mimeType,
            },
          },
          { 
            text: `Edit and transform this image according to the following instructions: ${request.prompt}. Keep the overall composition and structure but apply the requested changes.` 
          }
        ] 
      }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    const candidates = imageGenResponse.candidates;
    if (!candidates || candidates.length === 0) {
      return {
        success: false,
        error: "No image generated from the model",
      };
    }

    const content = candidates[0].content;
    if (!content || !content.parts) {
      return {
        success: false,
        error: "Invalid response format",
      };
    }

    // Look for image data in the response
    for (const part of content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return {
          success: true,
          imageData: part.inlineData.data,
        };
      }
    }

    return {
      success: false,
      error: "No image data found in response",
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
