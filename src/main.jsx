import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './lobby.css';
import App from './App.jsx';
import { preloadCardImages } from './utils/cardAssets.js';

// Preload card SVG assets to prevent flicker during gameplay
preloadCardImages();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
