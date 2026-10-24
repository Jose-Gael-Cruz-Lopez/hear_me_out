import { lazy, Suspense } from 'react';
import type { ReferenceMember } from './ReferenceWorld';
const World = lazy(() => import('./ReferenceWorld').then(m => ({ default: m.ReferenceWorld })));
export function Crowd(props: { variant?: 'cover' | 'stage'; phase?: string; members?: readonly ReferenceMember[] }) {
  return <Suspense fallback={<div className="crowd-loading" aria-hidden="true" />}><World {...props} /></Suspense>;
}
