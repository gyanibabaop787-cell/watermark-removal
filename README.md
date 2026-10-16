# Watermark Removal Web App

A full-stack web application designed for removing watermarks, logos, and overlays from images and videos with precision blur/delogo processing.

## 🚀 Features

- **Image & Video Support**: Supports processing for videos (`.mp4`, `.mov`, etc.) and images (`.png`, `.jpg`, `.jpeg`).
- **Interactive Watermark Selection**: Canvas-based selection box to pinpoint watermark areas.
- **FFmpeg Delogo Processing**: High-performance backend processing using `fluent-ffmpeg` and `sharp`.
- **Live Preview & Download**: Compare before and after results with side-by-side preview and direct downloads.
- **Modern UI**: Clean and intuitive React + Vite interface.

## 📁 Project Structure

```
├── client/          # Frontend React + Vite application
│   ├── src/         # UI components and watermark canvas selector
│   └── public/      # Static assets & icons
└── server/          # Node.js Express backend
    ├── server.js    # FFmpeg & Sharp processing pipeline
    ├── uploads/     # Temporary uploaded files
    └── processed/   # Generated output files
```

## 🛠️ Getting Started

### 1. Backend Setup
```bash
cd server
npm install
node server.js
```
The server will run on `http://localhost:3001`.

### 2. Frontend Setup
```bash
cd client
npm install
npm run dev
```
The frontend will run on `http://localhost:5173`.
