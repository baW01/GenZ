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
    // First, analyze the uploaded image to understand its content
    const analysisResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: request.imageData,
                mimeType: request.mimeType,
              },
            },
            {
              text: `Analyze this image and then create a detailed prompt for generating a new image based on this description: ${request.prompt}. Include key visual elements from the original image that should be maintained or transformed.`,
            },
          ],
        },
      ],
    });

    // Use the enhanced prompt for image generation
    const enhancedPrompt = analysisResponse.text || request.prompt;
    
    // Generate image using Imagen 4.0 (latest and best quality)
    const imageGenResponse = await ai.models.generateImages({
      model: "imagen-4.0-generate-001",
      prompt: enhancedPrompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "1:1",
      },
    });

    if (!imageGenResponse.generatedImages || imageGenResponse.generatedImages.length === 0) {
      return {
        success: false,
        error: "No image generated from the model",
      };
    }

    const generatedImage = imageGenResponse.generatedImages[0];
    if (!generatedImage.image || !generatedImage.image.imageBytes) {
      return {
        success: false,
        error: "No image data found in response",
      };
    }

    return {
      success: true,
      imageData: generatedImage.image.imageBytes,
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
