const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const sharp = require('sharp');

// Set ffmpeg binaries
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const app = express();
const PORT = process.env.PORT || 3001;

// Base URL helper for cloud deployments
const getBaseUrl = (req) => process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

// Setup directories
const uploadsDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/processed', express.static(processedDir));

// Root and health routes
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Watermark Remover Backend</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 3rem; background: #0f172a; color: #f8fafc; text-align: center; }
                .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2rem; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
                h1 { margin-top: 0; color: #38bdf8; font-size: 1.5rem; }
                p { color: #94a3b8; line-height: 1.6; }
                a.btn { display: inline-block; margin-top: 1rem; background: #2563eb; color: #fff; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; }
                a.btn:hover { background: #1d4ed8; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Watermark Remover Backend Active</h1>
                <p>The backend API is running on port ${PORT}.</p>
                <p>To use the Watermark Remover, open the web interface:</p>
                <a class="btn" href="http://localhost:5173">Open Web App (localhost:5173)</a>
            </div>
        </body>
        </html>
    `);
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', port: PORT });
});

// Multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    const isVideo = req.file.mimetype.startsWith('video');
    const isImage = req.file.mimetype.startsWith('image');
    
    if (!isVideo && !isImage) {
        return res.status(400).send('Unsupported file type.');
    }

    res.json({
        filename: req.file.filename,
        originalname: req.file.originalname,
        url: `${getBaseUrl(req)}/uploads/${req.file.filename}`,
        type: isVideo ? 'video' : 'image',
        mimetype: req.file.mimetype
    });
});

app.post('/api/upload-multiple', upload.array('media'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files uploaded.');
    }
    const results = req.files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        url: `${getBaseUrl(req)}/uploads/${file.filename}`,
        type: file.mimetype.startsWith('video') ? 'video' : 'image',
        mimetype: file.mimetype
    }));
    res.json(results);
});

app.post('/api/process', async (req, res) => {
    const { filename, type, box, mediaOriginalWidth, mediaOriginalHeight, displayWidth, displayHeight } = req.body;
    
    if (!filename || !box) {
        return res.status(400).send('Missing required parameters.');
    }

    const inputPath = path.join(uploadsDir, filename);
    const outputFilename = 'processed-' + filename;
    const outputPath = path.join(processedDir, outputFilename);

    if (!fs.existsSync(inputPath)) {
        return res.status(404).send('File not found.');
    }

    // Calculate actual coordinates
    // We get the box coordinates relative to the displayed size (displayWidth/displayHeight)
    // We need to scale them to the actual media size (mediaOriginalWidth/mediaOriginalHeight)
    
    const scaleX = mediaOriginalWidth / displayWidth;
    const scaleY = mediaOriginalHeight / displayHeight;

    const x = Math.round(box.x * scaleX);
    const y = Math.round(box.y * scaleY);
    const w = Math.round(box.width * scaleX);
    const h = Math.round(box.height * scaleY);

    if (type === 'video') {
        // Delogo requires at least 1px border around the logo
        const origW = mediaOriginalWidth || 1920;
        const origH = mediaOriginalHeight || 1080;
        const safeX = Math.max(1, Math.min(x, origW - 2));
        const safeY = Math.max(1, Math.min(y, origH - 2));
        const safeW = Math.max(2, Math.min(w, origW - safeX - 1));
        const safeH = Math.max(2, Math.min(h, origH - safeY - 1));

        const delogoFilter = `delogo=x=${safeX}:y=${safeY}:w=${safeW}:h=${safeH}:show=0`;
        
        ffmpeg(inputPath)
            .outputOptions([
                '-vf', delogoFilter,
                '-map', '0:v',
                '-map', '0:a?', // Optional audio: won't fail if video has no audio
                '-c:a', 'copy',
                '-c:v', 'libx264',
                '-crf', '17', // Visually lossless quality
                '-preset', 'slow'
            ])
            .on('end', () => {
                res.json({
                    success: true,
                    url: `${getBaseUrl(req)}/processed/${outputFilename}`
                });
            })
            .on('error', (err) => {
                console.error('Error processing video:', err);
                res.status(500).send('Error processing video: ' + err.message);
            })
            .save(outputPath);
            
    } else if (type === 'image') {
        try {
            // Read image metadata
            const metadata = await sharp(inputPath).metadata();
            
            // Ensure bounds are strictly within the image dimensions
            const safeX = Math.max(0, Math.min(x, metadata.width - 1));
            const safeY = Math.max(0, Math.min(y, metadata.height - 1));
            const safeW = Math.max(1, Math.min(w, metadata.width - safeX));
            const safeH = Math.max(1, Math.min(h, metadata.height - safeY));

            // Extract the box region, blur it, and composite it over the original image
            const blurredBox = await sharp(inputPath)
                .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
                .blur(30)
                .toBuffer();
                
            await sharp(inputPath)
                .composite([
                    {
                        input: blurredBox,
                        top: safeY,
                        left: safeX
                    }
                ])
                .withMetadata()
                .jpeg({ quality: 100, force: false })
                .webp({ quality: 100, force: false })
                .toFile(outputPath);
                
            res.json({
                success: true,
                url: `${getBaseUrl(req)}/processed/${outputFilename}`
            });
            
        } catch (error) {
            console.error('Error processing image:', error);
            res.status(500).send('Error processing image: ' + error.message);
        }
    } else {
        res.status(400).send('Unsupported media type.');
    }
});

app.post('/api/process-multiple', async (req, res) => {
    const { filenames, type, box, mediaOriginalWidth, mediaOriginalHeight, displayWidth, displayHeight } = req.body;
    
    if (!filenames || !Array.isArray(filenames) || filenames.length === 0 || !box) {
        return res.status(400).send('Missing required parameters.');
    }

    const scaleX = mediaOriginalWidth / displayWidth;
    const scaleY = mediaOriginalHeight / displayHeight;

    const x = Math.round(box.x * scaleX);
    const y = Math.round(box.y * scaleY);
    const w = Math.round(box.width * scaleX);
    const h = Math.round(box.height * scaleY);

    const processedUrls = [];

    for (const filename of filenames) {
        const inputPath = path.join(uploadsDir, filename);
        const outputFilename = 'processed-' + filename;
        const outputPath = path.join(processedDir, outputFilename);

        if (!fs.existsSync(inputPath)) continue;

        if (type === 'image') {
            try {
                // Read image metadata to ensure safe bounds
                const metadata = await sharp(inputPath).metadata();
                
                // Keep coordinates within bounds
                const safeX = Math.max(0, Math.min(x, metadata.width - 1));
                const safeY = Math.max(0, Math.min(y, metadata.height - 1));
                const safeW = Math.min(w, metadata.width - safeX);
                const safeH = Math.min(h, metadata.height - safeY);

                if (safeW > 0 && safeH > 0) {
                    const blurredBox = await sharp(inputPath)
                        .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
                        .blur(30)
                        .toBuffer();
                        
                    await sharp(inputPath)
                        .composite([{ input: blurredBox, top: safeY, left: safeX }])
                        .withMetadata()
                        .jpeg({ quality: 100, force: false })
                        .webp({ quality: 100, force: false })
                        .toFile(outputPath);
                        
                    processedUrls.push({
                        url: `${getBaseUrl(req)}/processed/${outputFilename}`,
                        filename: filename
                    });
                }
            } catch (error) {
                console.error('Error processing image:', filename, error);
            }
        }
    }

    res.json({
        success: true,
        urls: processedUrls
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
