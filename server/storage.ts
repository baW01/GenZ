import { type User, type InsertUser, type Generation, type InsertGeneration } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createGeneration(generation: InsertGeneration): Promise<Generation>;
  getGeneration(id: string): Promise<Generation | undefined>;
  updateGeneration(id: string, updates: Partial<Generation>): Promise<Generation | undefined>;
  getRecentGenerations(limit?: number): Promise<Generation[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private generations: Map<string, Generation>;

  constructor() {
    this.users = new Map();
    this.generations = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createGeneration(insertGeneration: InsertGeneration): Promise<Generation> {
    const id = randomUUID();
    const generation: Generation = {
      id,
      prompt: insertGeneration.prompt,
      originalImageUrl: insertGeneration.originalImageUrl || null,
      generatedImageUrl: insertGeneration.generatedImageUrl || null,
      status: insertGeneration.status || "pending",
      errorMessage: insertGeneration.errorMessage || null,
      createdAt: new Date(),
    };
    this.generations.set(id, generation);
    return generation;
  }

  async getGeneration(id: string): Promise<Generation | undefined> {
    return this.generations.get(id);
  }

  async updateGeneration(id: string, updates: Partial<Generation>): Promise<Generation | undefined> {
    const existing = this.generations.get(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...updates };
    this.generations.set(id, updated);
    return updated;
  }

  async getRecentGenerations(limit: number = 10): Promise<Generation[]> {
    return Array.from(this.generations.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }
}

export const storage = new MemStorage();
