import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertGenerationSchema } from "@shared/schema";
import { generateImageWithPrompt } from "./gemini";
import multer from "multer";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Generate image endpoint
  app.post("/api/generate", upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const { prompt } = req.body;
      if (!prompt || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      if (prompt.length > 500) {
        return res.status(400).json({ error: "Prompt must be 500 characters or less" });
      }

      // Create generation record
      const generation = await storage.createGeneration({
        prompt: prompt.trim(),
        originalImageUrl: null,
        generatedImageUrl: null,
        status: "pending",
        errorMessage: null,
      });

      // Convert buffer to base64
      const imageData = req.file.buffer.toString('base64');
      
      // Call Gemini API
      const result = await generateImageWithPrompt({
        imageData,
        mimeType: req.file.mimetype,
        prompt: prompt.trim(),
      });

      if (result.success && result.imageData) {
        // Update generation with success
        const updated = await storage.updateGeneration(generation.id, {
          status: "completed",
          generatedImageUrl: `data:image/png;base64,${result.imageData}`,
        });

        res.json({
          success: true,
          generation: updated,
          imageUrl: `data:image/png;base64,${result.imageData}`,
        });
      } else {
        // Update generation with error
        await storage.updateGeneration(generation.id, {
          status: "failed",
          errorMessage: result.error || "Unknown error",
        });

        res.status(500).json({
          success: false,
          error: result.error || "Failed to generate image",
        });
      }
    } catch (error) {
      console.error("Generation error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Get recent generations
  app.get("/api/generations", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const generations = await storage.getRecentGenerations(limit);
      res.json(generations);
    } catch (error) {
      console.error("Error fetching generations:", error);
      res.status(500).json({ error: "Failed to fetch generations" });
    }
  });

  // Get specific generation
  app.get("/api/generations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const generation = await storage.getGeneration(id);
      
      if (!generation) {
        return res.status(404).json({ error: "Generation not found" });
      }

      res.json(generation);
    } catch (error) {
      console.error("Error fetching generation:", error);
      res.status(500).json({ error: "Failed to fetch generation" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
