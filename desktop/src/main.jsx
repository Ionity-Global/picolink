import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';  // bundled, offline
import './app.css';

createRoot(document.getElementById('root')).render(<App />);
