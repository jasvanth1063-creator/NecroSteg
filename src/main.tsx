import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Global error/unhandled promise rejection guard to silence benign WebSocket failures in Vercel/sandbox environments
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason) {
    const msg = String(reason.message || reason);
    if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('Connection closed')) {
      event.preventDefault();
      return;
    }
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
