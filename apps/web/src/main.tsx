import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './editorFacade';
import './styles/layers.css';
import './styles/tokens.css';
import './styles/globals.css';
import './styles/shared.css';

const client = new QueryClient();
const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el contenedor principal de SIMBO');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={client}><App /></QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
