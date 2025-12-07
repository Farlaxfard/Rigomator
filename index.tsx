
/// <reference lib="dom" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// JSON circular safety patch remains here as it is standard JS.
const originalStringify = JSON.stringify;
JSON.stringify = function(value: any, replacer?: any, space?: string | number): string {
  const cache = new Set();
  return originalStringify(value, function(this: any, key: string, val: any) {
    if (typeof val === 'object' && val !== null) {
      if (cache.has(val)) {
        return '[Circular]';
      }
      cache.add(val);
    }
    if (replacer) {
      if (typeof replacer === 'function') {
        return replacer.call(this, key, val);
      }
      if (Array.isArray(replacer)) {
        if (key === '') return val;
        const isAllowed = replacer.some((k: any) => String(k) === key);
        if (!isAllowed) return undefined;
      }
    }
    return val;
  }, space);
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
