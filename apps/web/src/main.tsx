import './styles.css';
import { createRoot } from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { connectionBuilder } from './lib/connection';

createRoot(document.getElementById('root')!).render(
  <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
    <MotionConfig reducedMotion="user"><App /></MotionConfig>
  </SpacetimeDBProvider>
);
