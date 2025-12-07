
import React, { Suspense, useEffect } from 'react';
import HandManager from './components/HandManager';
import PhysicsScene from './components/PhysicsScene';
import Overlay from './components/Overlay';
import { useStore } from './store'; // Import store to check pause state
import * as THREE from 'three';

// --- THREE.JS PATCH ---
// Moved here to ensure it runs within the context of the app bundle
// @ts-ignore
if (!THREE.Texture.prototype._patched) {
  // @ts-ignore
  THREE.Texture.prototype.toJSON = function(meta: any) {
    return {
      metadata: {
        version: 4.5,
        type: 'Texture',
        generator: 'Texture.toJSON'
      },
      uuid: this.uuid,
      name: this.name,
      image: this.source?.data ? 'skipped_image_data' : undefined
    };
  }
  // @ts-ignore
  THREE.Texture.prototype._patched = true;
}

const App: React.FC = () => {
  const { isPaused } = useStore();

  return (
    <div 
      className={`w-full h-screen bg-gray-900 relative overflow-hidden select-none font-['Dongle'] text-2xl leading-none ${isPaused ? 'cursor-auto' : 'cursor-none'}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <HandManager />
      
      <div className="absolute inset-0 z-0">
        <Suspense fallback={<div className="text-white center text-4xl">Loading 3D Engine...</div>}>
           <PhysicsScene />
        </Suspense>
      </div>

      <Overlay />
    </div>
  );
};

export default App;
