import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { UploadCloud, Eraser, Loader2, Download, RotateCcw, Info, Camera, Image as ImageIcon, Video, Layers } from 'lucide-react';
import JSZip from 'jszip';

const API_URL = 'http://localhost:3001/api';

function SingleRemover() {
  const [step, setStep] = useState('upload'); // upload, edit, processing, result
  const [mediaInfo, setMediaInfo] = useState(null);
  const [currentEditMedia, setCurrentEditMedia] = useState(null);
  const [box, setBox] = useState(null); // {x, y, width, height}
  const [processedUrl, setProcessedUrl] = useState(null);

  // Upload Step
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('media', file);

    try {
      setStep('processing'); // temporary to show loader
      const response = await axios.post(`${API_URL}/upload`, formData);
      setMediaInfo(response.data);
      setCurrentEditMedia(response.data);
      setStep('edit');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file.');
      setStep('upload');
    }
  };

  const handleReset = () => {
    setStep('upload');
    setMediaInfo(null);
    setCurrentEditMedia(null);
    setBox(null);
    setProcessedUrl(null);
  };

  return (
    <div style={{width: '100%'}}>
        {step === 'upload' && (
          <div className="dropzone" onClick={() => document.getElementById('file-upload').click()}>
            <input 
              id="file-upload" 
              type="file" 
              accept="video/*,image/*" 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
            />
            <UploadCloud />
            <h2>Choose a file or drag it here</h2>
            <p className="help-text">Supports MP4, AVI, MOV, JPG, PNG</p>
          </div>
        )}

        {step === 'edit' && currentEditMedia && (
          <div className="edit-view-container">
            <Editor 
              key={currentEditMedia.url}
              mediaInfo={currentEditMedia} 
              onProcess={async (drawnBox, originalSize, displaySize) => {
                setBox(drawnBox);
                setStep('processing');
                try {
                  const response = await axios.post(`${API_URL}/process`, {
                    filename: currentEditMedia.filename,
                    type: currentEditMedia.type,
                    box: drawnBox,
                    mediaOriginalWidth: originalSize.width,
                    mediaOriginalHeight: originalSize.height,
                    displayWidth: displaySize.width,
                    displayHeight: displaySize.height
                  });
                  setProcessedUrl(response.data.url);
                  setStep('result');
                } catch (error) {
                  console.error('Process failed:', error);
                  alert('Failed to process media.');
                  setStep('edit');
                }
              }} 
            />
          </div>
        )}

        {step === 'processing' && (
          <div className="progress-container">
            <Loader2 className="spinner" />
            <h2>Processing your media...</h2>
            <p className="help-text">This happens locally on your PC and may take a moment.</p>
          </div>
        )}

        {step === 'result' && processedUrl && (
          <div className="result-container">
            <h2>Success! Here is your result:</h2>
            {mediaInfo.type === 'video' ? (
              <video src={processedUrl} controls className="result-media" />
            ) : (
              <img src={processedUrl} alt="Processed" className="result-media" />
            )}
            
            <div className="actions">
              <button onClick={async () => {
                try {
                  const response = await fetch(processedUrl);
                  const blob = await response.blob();
                  const blobUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = mediaInfo.originalname || (processedUrl.split('/').pop() || 'download');
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(blobUrl);
                } catch (e) {
                  console.error('Download failed', e);
                }
              }} className="btn">
                <Download size={20} /> Download
              </button>
              <button onClick={handleReset} className="btn btn-secondary">
                <RotateCcw size={20} /> Process Another
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

function Editor({ mediaInfo, onProcess }) {
  const mediaRef = useRef(null);
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState(null);
  const [capturedFrameData, setCapturedFrameData] = useState(null);

  useEffect(() => {
    setCurrentBox(null);
    setCapturedFrameData(null);
  }, [mediaInfo]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    if (currentBox) {
      ctx.clearRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
    }
  }, [currentBox]);

  useEffect(() => {
    const activeRef = capturedFrameData ? frameRef : mediaRef;
    if (!activeRef.current || !canvasRef.current) return;
    
    const updateCanvasSize = () => {
      if (activeRef.current && canvasRef.current) {
        canvasRef.current.width = activeRef.current.clientWidth;
        canvasRef.current.height = activeRef.current.clientHeight;
        
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        if (currentBox) {
          ctx.clearRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
          ctx.fillRect(currentBox.x, currentBox.y, currentBox.width, currentBox.height);
        }
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    
    resizeObserver.observe(activeRef.current);
    updateCanvasSize();

    return () => resizeObserver.disconnect();
  }, [currentBox, capturedFrameData, mediaInfo]); 

  const getCoordinates = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e) => {
    const coords = getCoordinates(e);
    setIsDrawing(true);
    setStartPos(coords);
    setCurrentBox({ x: coords.x, y: coords.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    const coords = getCoordinates(e);
    const x = Math.min(startPos.x, coords.x);
    const y = Math.min(startPos.y, coords.y);
    const width = Math.abs(coords.x - startPos.x);
    const height = Math.abs(coords.y - startPos.y);
    setCurrentBox({ x, y, width, height });
  };

  const handleMouseUp = () => setIsDrawing(false);

  const captureFrame = () => {
    if (mediaInfo.type !== 'video' || !mediaRef.current) return;
    const video = mediaRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedFrameData(canvas.toDataURL('image/jpeg', 1.0));
    setCurrentBox(null);
  };

  const submitProcess = () => {
    if (!currentBox || currentBox.width === 0) return;
    
    let originalWidth, originalHeight, displayWidth, displayHeight;
    
    if (mediaInfo.type === 'video') {
      originalWidth = mediaRef.current.videoWidth;
      originalHeight = mediaRef.current.videoHeight;
      displayWidth = frameRef.current.clientWidth;
      displayHeight = frameRef.current.clientHeight;
    } else {
      originalWidth = mediaRef.current.naturalWidth;
      originalHeight = mediaRef.current.naturalHeight;
      displayWidth = mediaRef.current.clientWidth;
      displayHeight = mediaRef.current.clientHeight;
    }

    onProcess(
      currentBox, 
      { width: originalWidth, height: originalHeight },
      { width: displayWidth, height: displayHeight }
    );
  };

  return (
    <div className="editor-container">
      <div className="editor-controls">
        <p className="help-text">
          {mediaInfo.type === 'video' ? 
            <><Info size={18} style={{verticalAlign: 'middle', marginRight: '4px'}}/> Play the video, capture a frame, then draw a box over the watermark on the captured frame below.</> :
            <><Info size={18} style={{verticalAlign: 'middle', marginRight: '4px'}}/> Draw a box over the watermark you want to remove.</>
          }
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {mediaInfo.type === 'video' && (
            <button className="btn btn-secondary" onClick={captureFrame}>
              <Camera size={20} /> Capture Frame to Draw
            </button>
          )}
          <button 
            className="btn" 
            onClick={submitProcess} 
            disabled={!currentBox || currentBox.width === 0}
          >
            <Eraser size={20} /> Remove Watermark
          </button>
        </div>
      </div>

      <div className="media-wrapper-split" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: '2rem', alignItems: 'flex-start' }}>
        {/* Main Media (Always visible) */}
        <div className="media-section" style={{ flex: '1 1 400px', maxWidth: '100%', textAlign: 'center' }}>
          {mediaInfo.type === 'video' ? (
            <video 
              ref={mediaRef} 
              src={mediaInfo.url} 
              className="media-element" 
              controls={true}
              crossOrigin="anonymous"
              style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px' }}
            />
          ) : (
            <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
              <img 
                ref={mediaRef} 
                src={mediaInfo.url} 
                alt="Upload" 
                className="media-element" 
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px' }}
              />
              <canvas
                ref={canvasRef}
                className="interaction-canvas"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ 
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                  zIndex: 10, cursor: 'crosshair', pointerEvents: 'auto', borderRadius: '8px'
                }}
              />
            </div>
          )}
        </div>

        {/* Captured Frame (Only for video) */}
        {mediaInfo.type === 'video' && capturedFrameData && (
          <div className="media-section captured-frame-section" style={{ flex: '1 1 400px', maxWidth: '100%', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-color)' }}>Draw on Captured Frame</h3>
            <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
              <img 
                ref={frameRef} 
                src={capturedFrameData} 
                alt="Captured Frame" 
                className="media-element" 
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px' }}
              />
              <canvas
                ref={canvasRef}
                className="interaction-canvas"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ 
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                  zIndex: 10, cursor: 'crosshair', pointerEvents: 'auto', borderRadius: '8px'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('single');
  
  return (
    <div className="app-container">
      <header className="header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{textAlign: 'left'}}>
          <h1 style={{margin: 0}}>Watermark Remover</h1>
          <p style={{margin: '5px 0 0 0'}}>Erase logos, text, or dates locally.</p>
        </div>
        <div style={{display: 'flex', gap: '10px'}}>
          <button className={`btn ${view === 'single' ? '' : 'btn-secondary'}`} onClick={() => setView('single')} style={{padding: '8px 16px', fontSize: '14px'}}>Single File</button>
          <button className={`btn ${view === 'multiple' ? '' : 'btn-secondary'}`} onClick={() => setView('multiple')} style={{padding: '8px 16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px'}}><Layers size={16}/> Multiple</button>
        </div>
      </header>
      <main className="glass-panel">
        {view === 'single' ? <SingleRemover /> : <MultipleRemover />}
      </main>
    </div>
  );
}

function MultipleRemover() {
  const [step, setStep] = useState('upload'); // upload, edit, processing, result
  const [mediaList, setMediaList] = useState([]);
  const [currentEditIndex, setCurrentEditIndex] = useState(0);
  const [currentEditMedia, setCurrentEditMedia] = useState(null);
  const [box, setBox] = useState(null);
  const [processedUrls, setProcessedUrls] = useState([]);

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('media', files[i]);
    }

    try {
      setStep('processing');
      const response = await axios.post(`${API_URL}/upload-multiple`, formData);
      setMediaList(response.data);
      setCurrentEditIndex(0);
      setCurrentEditMedia(response.data[0]);
      setStep('edit');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload files.');
      setStep('upload');
    }
  };

  const handleReset = () => {
    setStep('upload');
    setMediaList([]);
    setCurrentEditIndex(0);
    setCurrentEditMedia(null);
    setBox(null);
    setProcessedUrls([]);
  };

  const downloadAll = async () => {
      try {
          const zip = new JSZip();
          
          for (const item of processedUrls) {
              const originalMedia = mediaList.find(m => m.filename === item.filename);
              const originalName = originalMedia ? originalMedia.originalname : (item.url.split('/').pop() || 'download');

              const response = await fetch(item.url);
              const blob = await response.blob();
              
              zip.file(originalName, blob);
          }
          
          const content = await zip.generateAsync({ type: 'blob' });
          const blobUrl = window.URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = 'processed_images.zip';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(blobUrl);
          
      } catch (e) {
          console.error('Download failed', e);
          alert('Download failed: ' + e.message);
      }
  };

  return (
      <div style={{width: '100%'}}>
        {step === 'upload' && (
          <div className="dropzone" onClick={() => document.getElementById('file-upload-multi').click()}>
            <input 
              id="file-upload-multi" 
              type="file" 
              multiple
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
            />
            <Layers size={48} />
            <h2>Choose multiple images or drag them here</h2>
            <p className="help-text">Select one or more images to apply the same watermark removal box.</p>
          </div>
        )}

        {step === 'edit' && currentEditMedia && (
          <div className="edit-view-container">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
              <h3 style={{margin: 0, color: 'var(--text-color)'}}>Define watermark area (applied to {mediaList.length} images)</h3>
              <div style={{display: 'flex', gap: '10px'}}>
                <button 
                  className="btn btn-secondary" 
                  disabled={currentEditIndex === 0} 
                  onClick={() => {
                    const newIndex = currentEditIndex - 1;
                    setCurrentEditIndex(newIndex);
                    setCurrentEditMedia(mediaList[newIndex]);
                  }}
                  style={{padding: '4px 8px'}}
                >
                  Prev
                </button>
                <span style={{lineHeight: '30px', color: 'var(--text-color)'}}>{currentEditIndex + 1} / {mediaList.length}</span>
                <button 
                  className="btn btn-secondary" 
                  disabled={currentEditIndex === mediaList.length - 1} 
                  onClick={() => {
                    const newIndex = currentEditIndex + 1;
                    setCurrentEditIndex(newIndex);
                    setCurrentEditMedia(mediaList[newIndex]);
                  }}
                  style={{padding: '4px 8px'}}
                >
                  Next
                </button>
              </div>
            </div>
            <Editor 
              key={currentEditMedia.url}
              mediaInfo={currentEditMedia} 
              onProcess={async (drawnBox, originalSize, displaySize) => {
                setBox(drawnBox);
                setStep('processing');
                try {
                  const filenames = mediaList.map(m => m.filename);
                  const response = await axios.post(`${API_URL}/process-multiple`, {
                    filenames: filenames,
                    type: 'image',
                    box: drawnBox,
                    mediaOriginalWidth: originalSize.width,
                    mediaOriginalHeight: originalSize.height,
                    displayWidth: displaySize.width,
                    displayHeight: displaySize.height
                  });
                  setProcessedUrls(response.data.urls);
                  setStep('result');
                } catch (error) {
                  console.error('Process failed:', error);
                  alert('Failed to process media.');
                  setStep('edit');
                }
              }} 
            />
          </div>
        )}

        {step === 'processing' && (
          <div className="progress-container">
            <Loader2 className="spinner" />
            <h2>Processing {mediaList.length} images...</h2>
            <p className="help-text">This happens locally on your PC and may take a moment.</p>
          </div>
        )}

        {step === 'result' && processedUrls.length > 0 && (
          <div className="result-container">
            <h2>Success! Processed {processedUrls.length} images:</h2>
            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px', justifyContent: 'center'}}>
                {processedUrls.map((item, i) => (
                    <img key={i} src={item.url} alt={`Processed ${i}`} style={{width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #444'}} />
                ))}
            </div>
            
            <div className="actions" style={{justifyContent: 'center', display: 'flex'}}>
              <button onClick={downloadAll} className="btn">
                <Download size={20} /> Download All
              </button>
              <button onClick={handleReset} className="btn btn-secondary">
                <RotateCcw size={20} /> Process Another Batch
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
