import React, { useState, useRef, useEffect } from 'react';
import axios from "axios";
import './App.css';

function ImageEditor() {
  const [image, setImage] = useState(null);
  const [originalImage, setOriginalImage] = useState(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const DEFAULT_CONFIG = {
    brightness: 50,
    contrast: 50,
    saturation: 50,
    blur: 0,
    resolution: 'HD',
    format: 'PNG',
    quality: 0.9,
  };
  const sharpenKernel = [
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0],
  ];




  const RESOLUTIONS = {
    SD: { width: 640, height: 480 },
    HD: { width: 1280, height: 720 },
    'FULL HD': { width: 1920, height: 1080 },
  };

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [imageInfo, setImageInfo] = useState({
    originalSize: null,
    processedSize: null,
    fileType: null,
  });

  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  const loadImage = (event) => {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
      alert('Please upload a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setOriginalImage(img);
        setImage(img);
        setImageInfo({
          originalSize: `${img.width} x ${img.height}`,
          fileType: file.type,
          processedSize: null,
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (image) {
      debounce(() => processImage(image), 200)();
    }
  }, [config, image]);

  const processImage = (img) => {
    if (!img || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width, height } = RESOLUTIONS[config.resolution];
    canvas.width = width;
    canvas.height = height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const brightnessValue = ((config.brightness - 50) * 2) + 100;
    const contrastValue = ((config.contrast - 50) * 2) + 100;
    const saturationValue = ((config.saturation - 50) * 2) + 100;

    ctx.filter = `brightness(${brightnessValue}%) contrast(${contrastValue}%) saturate(${saturationValue}%) blur(${config.blur}px)`;
    ctx.drawImage(img, 0, 0, width, height);

    setImageInfo((prev) => ({
      ...prev,
      processedSize: `${width} x ${height}`,
    }));
  };

  const toGray = (r, g, b) => Math.round(r * 0.3 + g * 0.59 + b * 0.11);

  const applyHistogramEqualization = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const histogram = new Array(256).fill(0);
    const cdf = new Array(256).fill(0);

    for (let i = 0; i < data.length; i += 4) {
      const gray = toGray(data[i], data[i + 1], data[i + 2]);
      histogram[gray]++;
    }

    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + histogram[i];
    }

    const cdfMin = cdf.find((value) => value > 0);
    const totalPixels = canvas.width * canvas.height;
    const cdfNormalized = cdf.map((value) =>
      Math.round((value - cdfMin) / (totalPixels - cdfMin) * 255)
    );

    for (let i = 0; i < data.length; i += 4) {
      const gray = toGray(data[i], data[i + 1], data[i + 2]);
      const newGray = cdfNormalized[gray];
      data[i] = data[i + 1] = data[i + 2] = newGray;
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const saveImage = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const link = document.createElement('a');
    const fileName = `edited_image_${config.resolution}.${config.format.toLowerCase()}`;
    const dataUrl = canvas.toDataURL(`image/${config.format.toLowerCase()}`, config.quality);
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  };

  const applyCustomFilter = (kernel) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    const result = new Uint8ClampedArray(data);
    const kernelSize = kernel.length;
    const offset = Math.floor(kernelSize / 2);

    for (let y = offset; y < height - offset; y++) {
      for (let x = offset; x < width - offset; x++) {
        let r = 0, g = 0, b = 0;

        for (let j = -offset; j <= offset; j++) {
          for (let i = -offset; i <= offset; i++) {
            const idx = ((y + j) * width + (x + i)) * 4;
            const weight = kernel[j + offset][i + offset];

            r += data[idx] * weight;
            g += data[idx + 1] * weight;
            b += data[idx + 2] * weight;
          }
        }

        const idx = (y * width + x) * 4;


        result[idx] = Math.min(255, Math.max(0, r));
        result[idx + 1] = Math.min(255, Math.max(0, g));
        result[idx + 2] = Math.min(255, Math.max(0, b));
        result[idx + 3] = 255;
      }
    }

    ctx.putImageData(new ImageData(result, width, height), 0, 0);
  };

  const resetImage = () => {
    if (originalImage) {
      setImage(originalImage);
      setConfig(DEFAULT_CONFIG);
    }
  };
  const removeBackgroundWithAPI = async () => {
    if (!image) {
      alert("Please upload an image first.");
      return;
    }

    const canvas = canvasRef.current;
    const base64Image = canvas.toDataURL('image/png').split(',')[1];

    try {
      const response = await axios.post(
        "https://api.remove.bg/v1.0/removebg",
        { image_file_b64: base64Image, size: "auto" },
        {
          headers: {
            "X-Api-Key": "vTcHV7tbbv5e9F1qZuaP67h6",
          },
          responseType: "blob",
        }
      );

      const url = URL.createObjectURL(response.data);

      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = url;
    } catch (error) {
      console.error("Error Response:", error.response);
      console.error("Error Message:", error.message);
      alert("Failed to remove background. Please try again.");
    }

  };

  return (
    <div className="container">
      <div className="sidebar">
        <div className="logo-section">
          <h1>Image Editor</h1>
          <p>Transform your images with powerful tools</p>
        </div>

        <div className="upload-section">
          <div className="file-input-wrapper">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={loadImage}
              className="file-input"
              id="file-input"
            />
            <label htmlFor="file-input" className="file-input-label">
              Choose Image
            </label>
          </div>
        </div>

        <div className="controls">
          <div className="control">
            <label>Brightness</label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.brightness}
              onChange={(e) => setConfig(prev => ({ ...prev, brightness: Number(e.target.value) }))}
              disabled={!image}
            />
            <span className="value-display">{config.brightness}%</span>
          </div>

          <div className="control">
            <label>Contrast</label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.contrast}
              onChange={(e) => setConfig(prev => ({ ...prev, contrast: Number(e.target.value) }))}
              disabled={!image}
            />
            <span className="value-display">{config.contrast}%</span>
          </div>

          <div className="control">
            <label>Saturation</label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.saturation}
              onChange={(e) => setConfig(prev => ({ ...prev, saturation: Number(e.target.value) }))}
              disabled={!image}
            />
            <span className="value-display">{config.saturation}%</span>
          </div>

    

          <div className="histogram">
            <button onClick={applyHistogramEqualization} disabled={!image}>Equalize</button>
            <button onClick={() => applyCustomFilter(sharpenKernel)} disabled={!image}>Apply Sharpen</button>
          </div>

          <div className="remove-background">
            <button onClick={removeBackgroundWithAPI} disabled={!image}>Remove White Background</button>
          </div>

          <div className="control">
            <label>Resolution</label>
            <select
              value={config.resolution}
              onChange={(e) => setConfig(prev => ({ ...prev, resolution: e.target.value }))}
              disabled={!image}
            >
              <option value="SD">SD (640x480)</option>
              <option value="HD">HD (1280x720)</option>
              <option value="FULL HD">Full HD (1171x1600)</option>
            </select>
          </div>

          <div className="control">
            <label>Format</label>
            <select
              value={config.format}
              onChange={(e) => setConfig(prev => ({ ...prev, format: e.target.value }))}
              disabled={!image}
            >
              <option value="PNG">PNG</option>
              <option value="JPEG">JPEG</option>
              <option value="WEBP">WebP</option>
            </select>
          </div>

      
        </div>
      </div>

      <div className="main-content">
        {image ? (
          <div className="preview-section">
            <canvas ref={canvasRef} className="preview" />

            <div className="image-info">
              <p>Original Resolution: {imageInfo.originalSize}</p>
              <p>Processed Resolution: {imageInfo.processedSize}</p>
              <p>File Type: {imageInfo.fileType}</p>
            </div>

            <div className="actions">
              <button onClick={saveImage} className="button save-button">Save Image</button>
              <button onClick={resetImage} className="button reset-button">Reset Changes</button>
            </div>
          </div>
        ) : (
          <div className="placeholder">
            <p>No image uploaded. Please upload an image to start editing.</p>
          </div>
        )}
      </div>
    </div>
  );

}

export default ImageEditor;