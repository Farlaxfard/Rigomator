
/// <reference lib="dom" />
import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { GestureType, EnvironmentType, ShapeType, MaterialType } from '../types';
import { audio } from '../services/audio';

/**
 * Tutorial Card Component
 */
const TutorialCard: React.FC<{ emoji: string, title: string, desc: string }> = ({ emoji, title, desc }) => (
    <div className="bg-black/5 p-4 rounded-3xl border border-black/5 hover:bg-black/10 transition-colors flex flex-col items-center text-center gap-2 h-full justify-start">
        <div className="text-5xl mb-2">{emoji}</div>
        <h3 className="text-2xl font-bold uppercase tracking-widest text-zinc-800">{title}</h3>
        <p className="text-xl text-zinc-500 leading-tight">{desc}</p>
    </div>
);

/**
 * Custom Cursor Component
 */
const CustomCursor: React.FC = () => {
    const [pos, setPos] = useState({ x: -100, y: -100 });
    const [hovering, setHovering] = useState(false);
    const [pressing, setPressing] = useState(false);
    const { isPaused } = useStore();

    useEffect(() => {
        const move = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
        const down = () => setPressing(true);
        const up = () => setPressing(false);
        
        const checkHover = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const isInteractive = target.closest('button, input, a, [role="button"], .interactive');
            setHovering(!!isInteractive);
        };

        window.addEventListener('mousemove', move);
        window.addEventListener('mousedown', down);
        window.addEventListener('mouseup', up);
        window.addEventListener('mouseover', checkHover);

        return () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mousedown', down);
            window.removeEventListener('mouseup', up);
            window.removeEventListener('mouseover', checkHover);
        };
    }, []);

    if (isPaused) return null;

    return (
        <div 
            className="fixed top-0 left-0 pointer-events-none z-[100] mix-blend-difference"
            style={{ 
                transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
            }}
        >
            <div 
                className={`rounded-full bg-white transition-all duration-200 ease-out flex items-center justify-center
                    ${hovering ? 'w-12 h-12 -ml-6 -mt-6 opacity-80' : 'w-4 h-4 -ml-2 -mt-2 opacity-100'}
                    ${pressing ? 'scale-75' : 'scale-100'}
                `}
            >
                {hovering && <div className="w-1 h-1 bg-black rounded-full" />}
            </div>
            <div 
                className={`absolute top-0 left-0 rounded-full border border-white transition-all duration-500 ease-out -z-10
                    ${pressing ? 'w-16 h-16 -ml-8 -mt-8 opacity-0 scale-150' : 'w-8 h-8 -ml-4 -mt-4 opacity-30 scale-100'}
                `}
            />
        </div>
    );
};

/**
 * Tooltip Component
 */
const Tooltip: React.FC<{text: string, children: React.ReactNode}> = ({ text, children }) => {
    const [visible, setVisible] = useState(false);
    return (
        <div 
            className="relative flex items-center justify-center interactive" 
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {children}
            <div className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 bg-black/80 backdrop-blur-md text-white text-xl rounded-xl border border-white/10 pointer-events-none transition-all duration-200 z-[70] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                {text}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black/80"></div>
            </div>
        </div>
    )
}

/**
 * Spring Slider
 */
const SpringSlider: React.FC<{
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (val: number) => void;
    label?: string;
    tooltip?: string;
    formatValue?: (val: number) => string;
}> = ({ value, min, max, step, onChange, label, tooltip, formatValue }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [visualValue, setVisualValue] = useState(value);
    const [stretch, setStretch] = useState(1);

    useEffect(() => {
        let raf: number;
        const loop = () => {
            setVisualValue(prev => {
                const diff = value - prev;
                const velocity = Math.abs(diff);
                const targetStretch = 1 + Math.min(velocity * 4, 0.6); 
                setStretch(s => s + (targetStretch - s) * 0.2);
                if (Math.abs(diff) < 0.001) {
                    setStretch(1); 
                    return value;
                }
                return prev + diff * 0.2; 
            });
            raf = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(raf);
    }, [value]);

    const calculateValue = (clientX: number) => {
        if (!trackRef.current) return value;
        const rect = trackRef.current.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const raw = min + percent * (max - min);
        const snapped = Math.round(raw / step) * step;
        return Math.min(max, Math.max(min, snapped));
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        setDragging(true);
        onChange(calculateValue(e.clientX));
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragging) return;
        onChange(calculateValue(e.clientX));
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const percent = ((visualValue - min) / (max - min)) * 100;

    return (
        <div className="w-full pointer-events-auto group select-none interactive">
            {label && (
                <div className="flex justify-between text-2xl text-zinc-400 mb-1 font-bold tracking-wider uppercase items-center leading-none">
                    <Tooltip text={tooltip || label}>
                        <span className="cursor-help hover:text-zinc-200 transition-colors">{label}</span>
                    </Tooltip>
                    <span className="font-mono text-zinc-200 text-xl">
                        {formatValue ? formatValue(value) : value.toFixed(2)}
                    </span>
                </div>
            )}
            
            <div 
                ref={trackRef}
                className="relative w-full h-5 flex items-center cursor-pointer"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                <div className="absolute w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-zinc-600/30 w-full" />
                </div>
                <div 
                    className="absolute h-1.5 bg-zinc-200 rounded-full" 
                    style={{ width: `${percent}%` }}
                />
                <div 
                    className={`absolute w-5 h-5 bg-white rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                    style={{ 
                        left: `${percent}%`,
                        transform: `translateX(-50%) scale(${stretch}, ${1/stretch})`,
                        transition: dragging ? 'none' : 'transform 0.2s ease-out'
                    }}
                />
            </div>
        </div>
    )
}

/**
 * Overlay Component
 */
export default function Overlay() {
  const { 
      isHandLost, handData, faceData, setHandLost, 
      roastMessage, setRoastMessage, debugMode, toggleDebugMode,
      cycleCamera, cameraName, settings, updateSettings,
      showTutorial, setShowTutorial, bannerMessage, setBannerMessage,
      showTrainingUI, setShowTrainingUI, resetApp,
      isPaused, setPaused,
      pauseMessage,
      isMuted, toggleMute, clearObjects, videoStream,
      getRandomDisconnectText, cameraEnabled, toggleCamera,
      getRandomMiddleFingerText, addObject, cycleEnvironment
  } = useStore();

  const [lastGesture, setLastGesture] = useState<GestureType>(GestureType.NONE);
  const [gestureText, setGestureText] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [showCameraBanner, setShowCameraBanner] = useState(false);
  const [showRoastBanner, setShowRoastBanner] = useState(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isTutorialExiting, setIsTutorialExiting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Debugger Video Sync
  useEffect(() => {
    if (showTrainingUI && videoRef.current && videoStream) {
        videoRef.current.srcObject = videoStream;
        videoRef.current.play().catch(e => console.error(e));
    }
  }, [showTrainingUI, videoStream]);

  // ESCAPE Key Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setPaused(!isPaused);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaused, setPaused]);

  const playClick = () => {
      if (isMuted) return;
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
  };

  const handleTutorialDismiss = () => {
      playClick();
      setIsTutorialExiting(true);
      setTimeout(() => { setShowTutorial(false); setIsTutorialExiting(false); }, 600);
  };

  useEffect(() => {
      if (showTutorial && !isTutorialExiting && handData.gesture === GestureType.OPEN_PALM) {
          handleTutorialDismiss();
      }
  }, [showTutorial, isTutorialExiting, handData.gesture]);

  const handlePanelToggle = () => {
      playClick();
      setIsPanelExpanded(!isPanelExpanded);
  };

  // Logo Interaction
  const handleLogoHover = () => {
      addObject('cloud', [(Math.random()-0.5)*10, 20, (Math.random()-0.5)*5], [0,-2,0]);
  }

  useEffect(() => {
      if (cameraName) { setShowCameraBanner(true); const t = setTimeout(() => setShowCameraBanner(false), 3000); return () => clearTimeout(t); }
  }, [cameraName]);
  
  // Dynamic Banner trigger when message changes
  useEffect(() => {
      if (bannerMessage && !bannerMessage.includes('savagery')) {
           setShowCameraBanner(true);
           const t = setTimeout(() => setShowCameraBanner(false), 3000);
           return () => clearTimeout(t);
      }
  }, [bannerMessage]);

  useEffect(() => {
      const checkRoast = () => {
        if (handData.gesture === GestureType.MIDDLE_FINGER && lastGesture !== GestureType.MIDDLE_FINGER) {
             const roast = getRandomMiddleFingerText();
             setBannerMessage(`savagery detected: ${roast}`);
             setShowRoastBanner(true); setTimeout(() => setShowRoastBanner(false), 5000);
        }
      };
      
      const checkEnvCycle = () => {
          if (handData.gesture === GestureType.THREE_FINGERS && lastGesture !== GestureType.THREE_FINGERS) {
              playClick();
              cycleEnvironment();
          }
      };

      checkRoast();
      checkEnvCycle();
      setLastGesture(handData.gesture);
  }, [handData.gesture, lastGesture, setBannerMessage, getRandomMiddleFingerText, cycleEnvironment]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (!handData.present && !isPaused && cameraEnabled) {
        timeout = setTimeout(() => { 
            setHandLost(true); 
            const roast = getRandomDisconnectText();
            setRoastMessage(roast.toLowerCase()); 
        }, 1000); 
    } else { 
        setHandLost(false); 
        setRoastMessage(""); 
    }
    return () => clearTimeout(timeout);
  }, [handData.present, isPaused, cameraEnabled, getRandomDisconnectText, setHandLost, setRoastMessage]);

  useEffect(() => {
      if (isHandLost) { setShowToast(false); return; }
      if (handData.gesture !== GestureType.NONE && handData.gesture !== lastGesture) {
          let text = "";
          switch(handData.gesture) {
              case GestureType.CLOSED_FIST: text = "time dilation"; break;
              case GestureType.PINCH: text = "interact"; break;
              case GestureType.POINTING: text = "summon"; break;
              case GestureType.PEACE: text = "liquid"; break;
              case GestureType.PINKY_UP: text = "clear scene"; break;
              case GestureType.THREE_FINGERS: text = "cycle env"; break;
          }
          if (text) { setGestureText(text); setShowToast(true); const t = setTimeout(() => setShowToast(false), 2000); return () => clearTimeout(t); }
      }
  }, [handData.gesture, lastGesture, isHandLost]);

  const envs: EnvironmentType[] = ['void', 'grid', 'vaporwave', 'matrix', 'white_room', 'midnight', 'sunset', 'toxic', 'gold', 'ice', 'desert', 'forest', 'lava'];
  const shapes: ShapeType[] = ['cube', 'sphere', 'pyramid', 'cylinder', 'torus', 'capsule', 'icosahedron', 'dodecahedron'];
  const materials: MaterialType[] = ['plastic', 'metal', 'glass', 'neon', 'wireframe', 'stone'];

  const isGlass = settings.uiStyle === 'glass';
  
  // Style Definitions
  const glassClass = "liquid-glass text-zinc-100 border-white/20";
  const panelClass = isGlass ? `liquid-glass shadow-2xl` : `bg-[#0a0a0a] border-zinc-800 shadow-2xl border`;
  const buttonClass = isGlass
    ? 'bg-white/10 hover:bg-white/20 text-white border-white/20'
    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700';
  const activeBtnClass = isGlass
    ? 'bg-white/80 text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]'
    : 'bg-zinc-100 text-black border-zinc-100';
  const pillBase = "rounded-full flex items-center justify-center border shadow-lg backdrop-blur-md";
  const pillStyle = isGlass
      ? "liquid-glass border-white/30 text-zinc-100" 
      : "bg-zinc-900/95 border-zinc-700 text-zinc-100";
  const roastBannerClass = isGlass 
      ? "liquid-glass border-red-500/30 text-red-200 bg-red-900/20" 
      : "bg-red-950 border-red-800 text-red-200 border";
  const cameraBannerClass = isGlass
      ? "liquid-glass border-zinc-500/30 text-zinc-200 bg-black/40"
      : "bg-zinc-900 border-zinc-700 text-zinc-300 border";

  const getRateLabel = (val: number) => {
      if (val < 0.2) return "Debuffed Turtle 🐢";
      if (val < 0.4) return "Slow";
      if (val < 0.6) return "Normal";
      if (val < 0.8) return "Fast";
      return "FAST AF 🚀";
  }

  return (
    <div className={`absolute inset-0 z-10 transition-all duration-700 lowercase ${isPaused ? 'cursor-auto' : 'cursor-none'} text-zinc-100 pointer-events-none ${isHandLost ? 'bg-black/40' : ''}`}>
      <CustomCursor />
      
      {!faceData.present && !isPaused && cameraEnabled && (
         <div className="absolute inset-0 z-0 pointer-events-none animate-pulse-slow" 
              style={{ boxShadow: 'inset 0 0 150px rgba(0, 0, 0, 0.5)', background: 'radial-gradient(circle, transparent 60%, rgba(10,10,10,0.8) 100%)' }} />
      )}

      {/* PAUSE OVERLAY (Centered) */}
      {isPaused && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-md flex items-center justify-center pointer-events-auto cursor-auto">
              <div className="text-center">
                  <div className="text-8xl mb-4 animate-bounce">⏸</div>
                  <h2 className="text-6xl font-bold text-white tracking-widest mb-4">PAUSED</h2>
                  {pauseMessage && (
                      <p className="text-4xl text-zinc-400 italic mb-8 animate-pulse">"{pauseMessage}"</p>
                  )}
                  <button onClick={() => setPaused(false)} className="px-12 py-4 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform text-4xl interactive">RESUME</button>
                  <p className="mt-4 text-zinc-500 text-xl font-mono uppercase tracking-widest">( Press ESC )</p>
              </div>
          </div>
      )}

      {/* --- CORNER LAYOUT SYSTEM --- */}
      
      {/* TOP LEFT: Logo */}
      <div className="fixed top-8 left-8 pointer-events-auto z-50">
          <h1 
            onMouseEnter={handleLogoHover}
            className="text-8xl text-zinc-100 leading-none drop-shadow-xl tracking-tighter mix-blend-difference hover:scale-105 transition-transform duration-300 cursor-help" style={{ fontWeight: 700 }}>
             rigomator
          </h1>
      </div>

      {/* TOP CENTER: Banners / Hand Lost */}
      <div className="fixed top-0 left-0 w-full flex flex-col items-center pointer-events-none z-[50]">
          {isHandLost && (
            <div className="w-full flex items-center justify-center bg-red-200/90 text-red-900 py-1 shadow-lg backdrop-blur-md animate-slide-down pointer-events-auto border-b border-red-300">
               <div className="flex items-center gap-3">
                  <div className="text-2xl animate-pulse">⚠️</div>
                  <div className="text-left flex items-baseline gap-3">
                      <h2 className="text-2xl font-bold uppercase tracking-widest leading-none">rig disconnected</h2>
                      {roastMessage ? (
                        <p className="text-xl font-bold italic opacity-80 leading-none">"{roastMessage}"</p>
                      ) : (
                        <p className="text-xl opacity-70 leading-none">Searching for hand...</p>
                      )}
                  </div>
               </div>
            </div>
          )}
          
          <div className={`mt-32 transition-all duration-300 ease-out z-20 ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
              <div className={`px-8 py-3 gap-4 ${pillBase} ${pillStyle}`}>
                  <div className="w-3 h-3 bg-zinc-200 rounded-full animate-pulse shadow-[0_0_10px_white]"></div>
                  <span className="text-zinc-100 font-bold tracking-widest text-2xl glow-text">{gestureText}</span>
              </div>
          </div>
      </div>

      {/* TOP RIGHT: Pause Button */}
      <div className="fixed top-8 right-8 pointer-events-auto z-50">
          <Tooltip text={isPaused ? "Resume" : "Pause System"}>
            <button 
                onClick={() => { playClick(); setPaused(!isPaused); }}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 border spring-bounce interactive ${buttonClass}`}
            >
                <span className="text-2xl">{isPaused ? '▶' : '⏸'}</span>
            </button>
          </Tooltip>
      </div>

      {/* BOTTOM LEFT: Control Panel & Help */}
      <div className="fixed bottom-8 left-8 z-[60] flex items-end gap-4 pointer-events-none"> 
          {/* Settings Panel Wrapper */}
          <div className="pointer-events-auto">
             <div 
                className={`flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-2xl origin-bottom-left
                    ${isPanelExpanded ? 'w-[400px] h-[600px] rounded-[2.5rem]' : 'w-14 h-14 rounded-full'}
                    ${isPanelExpanded ? panelClass : 'bg-transparent'}
                `}
             >
                {/* Trigger Button */}
                <button 
                    onClick={handlePanelToggle}
                    className={`absolute bottom-0 left-0 w-14 h-14 flex items-center justify-center transition-all duration-500 z-50 spring-bounce interactive
                        ${isPanelExpanded ? 'rotate-90 opacity-0 pointer-events-none' : 'opacity-100 rotate-0 liquid-glass rounded-full text-zinc-100 hover:bg-white/20'}
                    `}
                >
                    <span className="text-2xl">⚙️</span>
                </button>

                {/* Expanded Content */}
                <div className={`flex flex-col h-full w-full p-6 transition-opacity duration-300 delay-100 ${isPanelExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                     <div className={`flex justify-between items-center mb-6 pb-2 border-b pointer-events-auto ${isGlass ? 'border-white/20' : 'border-zinc-800'}`}>
                         <h2 className="text-4xl font-bold text-zinc-100 tracking-tight">Control Panel</h2>
                         <button onClick={handlePanelToggle} className="text-zinc-500 hover:text-zinc-100 text-3xl transition-colors spring-bounce interactive">✕</button>
                     </div>

                     <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2 pointer-events-auto">
                         {/* Config Sections */}
                         <div className="space-y-2">
                             <h3 className="text-xl font-bold text-zinc-500 uppercase tracking-widest">Object Config</h3>
                             <div className={`p-4 rounded-3xl border space-y-4 ${isGlass ? 'bg-white/5 border-white/10' : 'bg-zinc-900/50 border-zinc-800'}`}>
                                <SpringSlider label="Spawn Rate" min={0.0} max={1.0} step={0.1} value={settings.spawnRate} onChange={(val) => updateSettings({ spawnRate: val })} formatValue={getRateLabel} />
                                <div className="h-px bg-white/10 my-1" />
                                <div>
                                    <span className="text-xl text-zinc-400 font-bold uppercase mb-1 block">Shape</span>
                                    <div className="grid grid-cols-4 gap-2">
                                        {shapes.map(s => (
                                            <Tooltip key={s} text={s.replace('_', ' ')}>
                                                <button onClick={() => { playClick(); updateSettings({ objectShape: s }); }} className={`w-full aspect-square rounded-xl border flex items-center justify-center text-2xl transition-all spring-bounce interactive ${settings.objectShape === s ? activeBtnClass : buttonClass}`}>
                                                    {s === 'cube' && '📦'} {s === 'sphere' && '⚪'} {s === 'pyramid' && '🔺'} {s === 'cylinder' && '🔋'} {s === 'torus' && '🍩'} {s === 'capsule' && '💊'} {s === 'icosahedron' && '💎'} {s === 'dodecahedron' && '🎲'}
                                                </button>
                                            </Tooltip>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xl text-zinc-400 font-bold uppercase mb-1 block">Material</span>
                                    <div className="flex flex-wrap gap-2">
                                        {materials.map(m => (
                                            <button key={m} onClick={() => { playClick(); updateSettings({ objectMaterial: m }); }} className={`px-3 py-1 rounded-xl text-lg font-bold uppercase border transition-all spring-bounce interactive ${settings.objectMaterial === m ? activeBtnClass : buttonClass}`}>
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                             </div>
                         </div>

                         {/* Environment */}
                         <div className="space-y-2">
                             <h3 className="text-xl font-bold text-zinc-500 uppercase tracking-widest">Environment</h3>
                             <div className={`p-4 rounded-3xl border ${isGlass ? 'bg-white/5 border-white/10' : 'bg-zinc-900/50 border-zinc-800'}`}>
                                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                                     {envs.map((env) => (
                                         <button key={env} onClick={() => { playClick(); updateSettings({ environment: env }); }} className={`py-2 px-3 rounded-2xl text-lg font-bold uppercase transition-all border spring-bounce interactive ${settings.environment === env ? activeBtnClass : buttonClass}`}>
                                             {env.replace('_', ' ')}
                                         </button>
                                     ))}
                                </div>
                             </div>
                         </div>
                         
                         {/* Visuals */}
                         <div className="space-y-2">
                             <h3 className="text-xl font-bold text-zinc-500 uppercase tracking-widest">Visuals</h3>
                             <div className={`p-4 rounded-3xl border space-y-4 ${isGlass ? 'bg-white/5 border-white/10' : 'bg-zinc-900/50 border-zinc-800'}`}>
                                <div className="flex items-center justify-between">
                                     <span className="text-xl text-zinc-400 font-bold uppercase">UI Theme</span>
                                     <div className="flex bg-black/30 rounded-full p-1 border border-white/5">
                                        <button onClick={() => updateSettings({ uiStyle: 'solid' })} className={`px-3 py-1 rounded-full text-lg interactive ${settings.uiStyle === 'solid' ? 'bg-white text-black' : 'text-zinc-500'}`}>Solid</button>
                                        <button onClick={() => updateSettings({ uiStyle: 'glass' })} className={`px-3 py-1 rounded-full text-lg interactive ${settings.uiStyle === 'glass' ? 'bg-white text-black' : 'text-zinc-500'}`}>Glass</button>
                                     </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xl text-zinc-400 font-bold uppercase">Post Processing</span>
                                    <button onClick={() => { playClick(); updateSettings({ enableEffects: !settings.enableEffects }); }} className={`w-12 h-6 rounded-full p-1 transition-colors interactive ${settings.enableEffects ? 'bg-green-500' : 'bg-zinc-700'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${settings.enableEffects ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                                {settings.enableEffects && (
                                    <>
                                        <SpringSlider label="Noise" min={0} max={0.5} step={0.01} value={settings.filmGrain} onChange={(val) => updateSettings({ filmGrain: val })} />
                                        <SpringSlider label="Scanlines" min={0} max={0.5} step={0.01} value={settings.scanlineIntensity} onChange={(val) => updateSettings({ scanlineIntensity: val })} />
                                        <SpringSlider label="Vignette" min={0} max={1.5} step={0.1} value={settings.vignetteIntensity} onChange={(val) => updateSettings({ vignetteIntensity: val })} />
                                        <SpringSlider label="Abberation" min={0} max={0.1} step={0.001} value={settings.chromaticAberration} onChange={(val) => updateSettings({ chromaticAberration: val })} />
                                    </>
                                )}
                                <div className="flex items-center justify-between border-t border-white/10 pt-2">
                                    <span className="text-xl text-zinc-400 font-bold uppercase">Game of Life Mode</span>
                                    <button onClick={() => { playClick(); updateSettings({ gameOfLife: !settings.gameOfLife }); }} className={`w-12 h-6 rounded-full p-1 transition-colors interactive ${settings.gameOfLife ? 'bg-green-500' : 'bg-zinc-700'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${settings.gameOfLife ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                             </div>
                         </div>

                         {/* Physics */}
                         <div className="space-y-2">
                             <h3 className="text-xl font-bold text-zinc-500 uppercase tracking-widest">Physics & Controls</h3>
                             <div className={`p-4 rounded-3xl border space-y-4 ${isGlass ? 'bg-white/5 border-white/10' : 'bg-zinc-900/50 border-zinc-800'}`}>
                                <SpringSlider label="Time Scale" min={0.1} max={3.0} step={0.1} value={settings.timeScale} onChange={(val) => updateSettings({ timeScale: val })} />
                                <SpringSlider label="Gravity" min={-20} max={20} step={1} value={settings.gravity} onChange={(val) => updateSettings({ gravity: val })} />
                                <SpringSlider label="Bounciness" min={0} max={1.2} step={0.1} value={settings.bounciness} onChange={(val) => updateSettings({ bounciness: val })} />
                                <div className="h-px bg-white/10 my-1" />
                                 <SpringSlider label="Hand Speed" min={0.1} max={1.0} step={0.1} value={settings.handTrackingSpeed} onChange={(val) => updateSettings({ handTrackingSpeed: val })} formatValue={(v) => v < 0.4 ? "Smooth" : v > 0.8 ? "Instant" : "Normal"} />
                                <SpringSlider label="Head Pan" min={0} max={1.0} step={0.1} value={settings.headPanSensitivity} onChange={(val) => updateSettings({ headPanSensitivity: val })} />
                                <SpringSlider label="Head Rot" min={0} max={1.0} step={0.1} value={settings.headRotationSensitivity} onChange={(val) => updateSettings({ headRotationSensitivity: val })} />
                             </div>
                         </div>

                         <Tooltip text="View real-time hand/face tracking confidence data">
                            <button onClick={() => { playClick(); setShowTrainingUI(true); setIsPanelExpanded(false); }} className={`w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 spring-bounce border interactive ${isGlass ? 'bg-white/10 hover:bg-white/20 border-white/20 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'}`}>
                                <span className="text-2xl">📊</span> <span className="text-2xl">Neural Debugger</span>
                            </button>
                         </Tooltip>
                     </div>
                </div>
             </div>
          </div>

          {/* Help Button - Beside the gear, fades out when expanding */}
          <div className={`pointer-events-auto transition-all duration-300 transform ${isPanelExpanded ? 'opacity-0 -translate-x-4 pointer-events-none' : 'opacity-100 translate-x-0'}`}>
              <button 
                onClick={() => { playClick(); setShowTutorial(true); }}
                className={`h-14 px-6 rounded-full font-bold tracking-widest uppercase text-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 border spring-bounce interactive ${buttonClass}`}
              >
                  <span>Help</span>
                  <span className="text-xl">?</span>
              </button>
          </div>
      </div>

      {/* BOTTOM RIGHT: Unified Toolbar */}
      <div className="fixed bottom-8 right-8 z-[60] flex items-center gap-3 pointer-events-auto">
           {/* Actions Toolbar */}
           <div className={`flex items-center gap-2 p-2 rounded-full border backdrop-blur-md transition-all shadow-xl ${isGlass ? 'bg-black/20 border-white/10' : 'bg-zinc-900 border-zinc-700'}`}>
               
               {/* Reset */}
               <Tooltip text="Reset Scene">
                   <button onClick={() => { playClick(); resetApp(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:bg-white/10 active:scale-90 text-2xl interactive`}>
                       ↺
                   </button>
               </Tooltip>

               {/* Mute */}
               <Tooltip text={isMuted ? "Unmute" : "Mute"}>
                   <button onClick={() => { playClick(); toggleMute(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:bg-white/10 active:scale-90 text-2xl interactive ${isMuted ? 'text-red-400' : 'text-zinc-100'}`}>
                       {isMuted ? '🔇' : '🔊'}
                   </button>
               </Tooltip>

               {/* Clear */}
               <Tooltip text="Clear Objects">
                   <button onClick={() => { playClick(); clearObjects(); audio.play3D('trash', [0,0,0], 1); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:bg-red-500/20 text-red-400 hover:text-red-300 active:scale-90 text-2xl interactive`}>
                       🗑️
                   </button>
               </Tooltip>

               {/* Divider */}
               <div className="w-px h-8 bg-white/20 mx-1"></div>

               {/* Camera Toggle */}
               <Tooltip text={cameraEnabled ? "Disable Camera" : "Enable Camera"}>
                   <button onClick={() => { playClick(); toggleCamera(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:bg-white/10 active:scale-90 text-2xl interactive ${cameraEnabled ? 'text-green-400' : 'text-red-400'}`}>
                       {cameraEnabled ? '👁️' : '🙈'}
                   </button>
               </Tooltip>

               {/* Switch Cam */}
               <Tooltip text="Switch Input">
                   <button 
                    onClick={() => { playClick(); cycleCamera(); }} 
                    disabled={!cameraEnabled}
                    className={`h-12 px-4 rounded-full flex items-center gap-2 transition-all hover:bg-white/10 active:scale-95 interactive ${!cameraEnabled ? 'opacity-50' : ''}`}
                   >
                       <span className="font-bold text-lg uppercase tracking-wider leading-none mt-1">Switch</span>
                       <span className="text-2xl">📷</span>
                   </button>
               </Tooltip>

           </div>
      </div>

      {/* BOTTOM CENTER: Dynamic Banners */}
      <div className="fixed bottom-8 left-0 right-0 pointer-events-none z-[55] flex flex-col items-center gap-2">
          <div className={`transform transition-transform duration-500 ease-spring ${showRoastBanner ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
             <div className={`px-8 py-3 gap-3 ${pillBase} ${roastBannerClass}`}>
                  <span className="text-2xl">🔥</span>
                  <span className="font-mono text-lg tracking-widest">{bannerMessage}</span>
             </div>
          </div>
          <div className={`transform transition-transform duration-500 ease-spring ${showCameraBanner ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
             <div className={`px-8 py-3 gap-3 ${pillBase} ${cameraBannerClass}`}>
                  <span className="animate-pulse w-2 h-2 rounded-full bg-zinc-200"></span>
                  <span className="font-mono text-lg tracking-widest">{cameraName}</span>
             </div>
          </div>
      </div>

      {/* TUTORIAL MODAL */}
      {showTutorial && (
          <div className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-auto ${isTutorialExiting ? 'animate-fade-out' : 'animate-fade-in'}`}>
              <div className={`rounded-[2.5rem] p-10 max-w-4xl w-full shadow-2xl relative overflow-hidden transition-transform duration-500 ease-out ${isTutorialExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'} ${isGlass ? 'bg-white/90 text-black border border-white/50 backdrop-blur-xl' : 'bg-white text-black'}`}>
                  <button onClick={handleTutorialDismiss} className="absolute top-6 right-6 text-zinc-400 hover:text-black transition-colors text-3xl spring-bounce interactive">✕</button>
                  
                  <div className="mb-8 border-b border-zinc-100 pb-4">
                      <div className="text-xl font-bold text-zinc-400 tracking-wider mb-2 uppercase">tutorial</div>
                      <h2 className="text-7xl font-bold mb-2 tracking-tighter text-zinc-900">Welcome to Rigomator</h2>
                      <p className="text-zinc-500 text-2xl">Master reality with high-fidelity gestures.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <TutorialCard emoji="✋" title="neutral" desc="Open palm. The resting state." />
                      <TutorialCard emoji="👌" title="interact" desc="Pinch index & thumb to grab." />
                      <TutorialCard emoji="☝️" title="summon" desc="Point index up to spawn." />
                      <TutorialCard emoji="✊" title="time" desc="Clench fist to dilate time." />
                      <TutorialCard emoji="✌️" title="liquid" desc="Peace sign to spawn liquid." />
                      <TutorialCard emoji="🖖" title="cycle env" desc="Hold 3 fingers (Index+Middle+Ring) to switch worlds." />
                      <TutorialCard emoji="🤙" title="clear scene" desc="Raise Pinky (others curled) to clear objects." />
                  </div>
                  
                  <div className="mt-8 flex flex-col md:flex-row justify-end items-center gap-4">
                      <p className="text-zinc-500 text-xl font-medium animate-pulse hidden md:block">
                          (Raise <span className="text-zinc-900 font-bold bg-zinc-200 px-2 py-0.5 rounded-lg">Open Palm ✋</span> to dismiss)
                      </p>
                      <button 
                        onClick={handleTutorialDismiss}
                        className="bg-zinc-900 text-white px-12 py-4 rounded-full font-bold text-2xl hover:scale-105 active:scale-95 transition-all shadow-xl spring-bounce interactive"
                      >
                          Start Engine
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* TRAINING UI (DEBUGGER) */}
      {showTrainingUI && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-auto animate-fade-in">
             <div className={`border w-[900px] h-[650px] flex flex-col overflow-hidden font-sans rounded-[2.5rem] shadow-2xl transition-all duration-300 ${panelClass}`}>
                 <div className={`px-6 py-4 border-b flex justify-between items-center ${isGlass ? 'bg-white/5 border-white/10' : 'bg-zinc-900 border-zinc-800'}`}>
                     <div className="flex items-center gap-3">
                         <div className={`p-2 px-3 rounded-xl border ${isGlass ? 'bg-white/10 border-white/10 text-white' : 'bg-zinc-800 text-zinc-300 border-zinc-700'}`}>
                            <span className="material-icons text-2xl font-bold">AI</span>
                         </div>
                         <h2 className="text-3xl font-bold text-zinc-100 tracking-tight font-['Dongle']">Neural Telemetry</h2>
                     </div>
                     <button onClick={() => { playClick(); setShowTrainingUI(false); }} className="text-zinc-500 hover:text-white text-3xl transition-colors spring-bounce interactive">✕</button>
                 </div>
                 
                  <div className="flex-1 p-6 grid grid-cols-2 gap-6 overflow-y-auto">
                     {/* Left Column */}
                     <div className="space-y-6">
                        {/* Camera Preview */}
                        <div className={`p-3 rounded-2xl border ${isGlass ? 'bg-white/5 border-white/10' : 'bg-black/40 border-zinc-800'} aspect-video relative overflow-hidden flex items-center justify-center`}>
                             {videoStream ? (
                                 <video 
                                    ref={videoRef} 
                                    autoPlay 
                                    playsInline 
                                    muted 
                                    className="w-full h-full object-cover rounded-xl"
                                    style={{ transform: "scaleX(-1)" }} 
                                 />
                             ) : (
                                 <div className="text-zinc-500 text-xl">NO VIDEO FEED</div>
                             )}
                             <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 rounded-lg text-lg font-mono text-green-400 leading-none">
                                 LIVE FEED
                             </div>
                        </div>

                        {/* Head Tracking Data - FULL DETAIL RESTORED */}
                        <div className="flex gap-3">
                            {/* Position */}
                            <div className={`flex-1 relative p-4 rounded-2xl border flex flex-col overflow-hidden ${isGlass ? 'bg-white/5 border-white/10' : 'bg-black/40 border-zinc-800'}`}>
                                <h3 className="text-lg font-bold text-zinc-400 uppercase tracking-widest font-['Dongle']">Head Position</h3>
                                <div className="relative h-24 border-2 border-dashed border-zinc-700 rounded-full flex items-center justify-center bg-black/20 self-center w-24 aspect-square">
                                    {/* Crosshair */}
                                    <div className="absolute w-full h-[1px] bg-zinc-800"></div>
                                    <div className="absolute h-full w-[1px] bg-zinc-800"></div>
                                    {faceData.present ? (
                                        <div 
                                            className="w-3 h-3 bg-zinc-100 rounded-full shadow-[0_0_20px_white] transition-all duration-75 ease-linear z-10"
                                            style={{ transform: `translate(${faceData.position.x * 5}px, ${-faceData.position.y * 5}px)` }}
                                        ></div>
                                    ) : (
                                        <div className="text-zinc-600 font-bold text-lg animate-pulse font-['Dongle']">NO SIGNAL</div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Rotation Visualizer (Front - Roll/Tilt) */}
                            <div className={`flex-1 relative p-4 rounded-2xl border flex flex-col overflow-hidden ${isGlass ? 'bg-white/5 border-white/10' : 'bg-black/40 border-zinc-800'}`}>
                                <h3 className="text-lg font-bold text-zinc-400 uppercase tracking-widest mb-4 font-['Dongle']">Rotation (Front)</h3>
                                <div className="relative h-24 flex items-center justify-center self-center w-24 aspect-square bg-black/20 rounded-xl border border-zinc-800">
                                     {faceData.present ? (
                                         <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl">
                                             {/* Pitch Lines */}
                                             <div className="absolute w-full h-px bg-zinc-600/50" style={{ transform: `translateY(${faceData.rotation.x * 20}px)` }}></div>
                                             <div className="absolute w-full h-px bg-zinc-600/30" style={{ transform: `translateY(${faceData.rotation.x * 20 - 20}px)` }}></div>
                                             <div className="absolute w-full h-px bg-zinc-600/30" style={{ transform: `translateY(${faceData.rotation.x * 20 + 20}px)` }}></div>
                                             
                                             {/* Yaw/Roll Indicator */}
                                             <div 
                                                className="w-12 h-1 bg-green-400 shadow-[0_0_10px_lime]"
                                                style={{ 
                                                    transform: `rotate(${faceData.rotation.z * 57.29}deg) translateX(${-faceData.rotation.y * 2}px)` // Roll + Yaw slide
                                                }}
                                             ></div>
                                             <div className="absolute bottom-1 text-zinc-500 text-sm font-mono">
                                                Roll: {(faceData.rotation.z * 57.29).toFixed(0)}°
                                             </div>
                                         </div>
                                     ) : (
                                        <div className="text-zinc-600 font-bold text-lg animate-pulse font-['Dongle']">NO SIGNAL</div>
                                     )}
                                </div>
                            </div>
                            
                            {/* Rotation Visualizer (Side - Pitch) */}
                            <div className={`flex-1 relative p-4 rounded-2xl border flex flex-col overflow-hidden ${isGlass ? 'bg-white/5 border-white/10' : 'bg-black/40 border-zinc-800'}`}>
                                <h3 className="text-lg font-bold text-zinc-400 uppercase tracking-widest mb-4 font-['Dongle']">Rotation (Side)</h3>
                                <div className="relative h-24 flex items-center justify-center self-center w-24 aspect-square bg-black/20 rounded-xl border border-zinc-800">
                                     {faceData.present ? (
                                         <div className="relative w-full h-full flex items-center justify-center">
                                             {/* Head Circle */}
                                             <div className="w-16 h-16 rounded-full border border-zinc-600/50 relative">
                                                {/* Eye Direction Line */}
                                                <div 
                                                    className="absolute w-10 h-0.5 bg-green-400 top-1/2 left-1/2 origin-left shadow-[0_0_5px_lime]"
                                                    style={{ 
                                                        transform: `rotate(${-faceData.rotation.x * 57.29}deg)`
                                                    }}
                                                />
                                                {/* Neck */}
                                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-4 h-4 bg-zinc-700/30 rounded-full" />
                                             </div>
                                             
                                             <div className="absolute bottom-1 text-zinc-500 text-sm font-mono">
                                                Pitch: {(faceData.rotation.x * 57.29).toFixed(0)}°
                                             </div>
                                         </div>
                                     ) : (
                                        <div className="text-zinc-600 font-bold text-lg animate-pulse font-['Dongle']">NO SIGNAL</div>
                                     )}
                                </div>
                            </div>

                            {/* Rotation Visualizer (Top - Yaw) */}
                            <div className={`flex-1 relative p-4 rounded-2xl border flex flex-col overflow-hidden ${isGlass ? 'bg-white/5 border-white/10' : 'bg-black/40 border-zinc-800'}`}>
                                <h3 className="text-lg font-bold text-zinc-400 uppercase tracking-widest mb-4 font-['Dongle']">Rotation (Top)</h3>
                                <div className="relative h-24 flex items-center justify-center self-center w-24 aspect-square bg-black/20 rounded-xl border border-zinc-800">
                                     {faceData.present ? (
                                         <div className="relative w-full h-full flex items-center justify-center">
                                             {/* Head Circle Top Down */}
                                             <div className="w-16 h-16 rounded-full border border-zinc-600/50 relative flex items-center justify-center">
                                                {/* Nose Direction Line */}
                                                <div 
                                                    className="absolute w-1 h-8 bg-green-400 top-1/2 left-1/2 origin-top shadow-[0_0_5px_lime]"
                                                    style={{ 
                                                        transform: `translate(-50%, 0) rotate(${-faceData.rotation.y * 57.29}deg)` 
                                                    }}
                                                />
                                                {/* Ears */}
                                                <div className="absolute w-full h-1 bg-zinc-700/30" style={{ transform: `rotate(${-faceData.rotation.y * 57.29}deg)` }}></div>
                                             </div>
                                             
                                             <div className="absolute bottom-1 text-zinc-500 text-sm font-mono">
                                                Yaw: {(faceData.rotation.y * 57.29).toFixed(0)}°
                                             </div>
                                         </div>
                                     ) : (
                                        <div className="text-zinc-600 font-bold text-lg animate-pulse font-['Dongle']">NO SIGNAL</div>
                                     )}
                                </div>
                            </div>
                        </div>
                     </div>

                     {/* Right Column: Gestures */}
                     <div className={`p-6 rounded-2xl border ${isGlass ? 'bg-white/5 border-white/10' : 'bg-black/40 border-zinc-800'}`}>
                         <h3 className="text-lg font-bold text-zinc-400 uppercase tracking-widest mb-4 font-['Dongle']">Gesture Confidence</h3>
                         <div className="space-y-4">
                            {[
                                { name: 'Pinch (Interact)', key: 'pinch', color: 'bg-zinc-400' },
                                { name: 'Point (Summon)', key: 'pointing', color: 'bg-zinc-400' },
                                { name: '3-Finger (Env)', key: 'threeFingers', color: 'bg-green-400' },
                                { name: 'Pinky (Clear)', key: 'pinkyUp', color: 'bg-zinc-400' },
                                { name: 'Fist (Time)', key: 'fist', color: 'bg-zinc-400' },
                                { name: 'Peace (Liquid)', key: 'peace', color: 'bg-zinc-400' },
                            ].map((item) => {
                                const val = handData.metrics[item.key as keyof typeof handData.metrics];
                                return (
                                    <div key={item.key}>
                                        <div className="flex justify-between text-xl font-medium text-zinc-400 mb-1 font-['Dongle']">
                                            <span>{item.name}</span>
                                            <span className="font-mono text-zinc-200 text-lg">{(val * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                            <div className={`h-full ${item.color} transition-all duration-100 ease-out`} style={{ width: `${val * 100}%` }} />
                                        </div>
                                    </div>
                                )
                            })}
                         </div>
                     </div>
                 </div>
             </div>
          </div>
      )}

      <style>{`
        .liquid-glass {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(40px) saturate(200%);
            border: 1px solid rgba(255, 255, 255, 0.4);
            box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
        }
        .spring-bounce {
            transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s ease;
            transform-origin: center;
        }
        .spring-bounce:active { transform: scale(0.95, 0.9); filter: brightness(0.9); }
        .spring-bounce:hover { transform: scale(1.05); }
        @keyframes slide-down { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-slide-down { animation: slide-down 0.5s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
        .animate-fade-out { animation: fadeOut 0.3s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes fadeOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.98); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .ease-spring { transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .glow-text { text-shadow: 0 0 10px rgba(255, 255, 255, 0.3); }
      `}</style>
    </div>
  );
}
