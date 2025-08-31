# Image Generator with AI

## Overview

This is a full-stack web application that allows users to upload images and transform them using AI-powered image generation. Users can upload an image file and provide a text prompt describing how they want the image to be modified or transformed. The application integrates with Google's Gemini AI models to generate new images based on the uploaded image and user prompts.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite as the build tool
- **UI Library**: Comprehensive component system using Radix UI primitives with shadcn/ui styling
- **Styling**: Tailwind CSS with a dark theme configuration and custom CSS variables
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **File Handling**: Custom file upload component with drag-and-drop support and validation

### Backend Architecture
- **Framework**: Express.js with TypeScript running on Node.js
- **File Upload**: Multer middleware for handling multipart/form-data image uploads
- **API Design**: RESTful endpoints with structured error handling and request logging
- **Development**: Hot reload with Vite development server integration
- **Build System**: ESBuild for production bundling with external package handling

### Data Storage
- **Database**: PostgreSQL with Neon Database serverless connection
- **ORM**: Drizzle ORM with TypeScript-first schema definitions
- **Schema**: Separate tables for users and image generations with status tracking
- **Fallback**: In-memory storage implementation for development/testing
- **Sessions**: PostgreSQL session store using connect-pg-simple

### Authentication & Authorization
- **Session Management**: Express sessions with PostgreSQL storage
- **User System**: Basic user authentication with username/password
- **Security**: CORS handling and request validation middleware

### External Dependencies

#### AI Integration
- **Google Gemini AI**: Primary service for image generation and transformation
  - Uses gemini-2.5-flash for image analysis and description
  - Uses gemini-2.0-flash-preview-image-generation for actual image generation
  - Supports base64 image input and text prompt processing

#### Database Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Connection**: @neondatabase/serverless driver for edge-optimized database connections

#### Development Tools
- **Replit Integration**: Custom vite plugins for Replit development environment
- **Cartographer**: Development-time code mapping and debugging
- **Runtime Error Overlay**: Enhanced error reporting during development

#### UI/UX Libraries
- **Radix UI**: Comprehensive set of accessible React components
- **Lucide Icons**: Modern icon library for consistent iconography
- **Class Variance Authority**: Type-safe variant handling for component styling
- **CMDK**: Command palette component for enhanced user interactions

#### File Processing
- **Multer**: Express middleware for handling file uploads with memory storage
- **File Validation**: MIME type checking and file size limits (10MB max)
- **Base64 Conversion**: Image buffer to base64 encoding for AI API compatibility