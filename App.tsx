
import React, { Suspense } from 'react';
import HandManager from './components/HandManager';
import PhysicsScene from './components/PhysicsScene';
import Overlay from './components/Overlay';
import { useStore } from './store'; 

const App: React.FC = () => {
  const isPaused = useStore(s => s.isPaused);

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
