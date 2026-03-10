
/// <reference lib="dom" />
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store';
import { GestureType, EnvironmentType, ShapeType, MaterialType } from '../types';
import { audio } from '../services/audio';

/**
 * Material Icon Component
 */
const Icon: React.FC<{ name: string, className?: string, style?: React.CSSProperties }> = ({ name, className = "", style }) => (
    <span className={`material-icons select-none leading-none flex items-center justify-center ${className}`} style={{ fontSize: 'inherit', ...style }}>
        {name}
    </span>
);

/**
 * Tutorial Card Component
 */
const TutorialCard: React.FC<{ emoji: string, title: string, desc: string }> = ({ emoji, title, desc }) => (
    <div className="bg-white/5 p-5 rounded-[2rem] hover:bg-white/10 transition-all flex flex-col items-center text-center gap-2 h-full justify-start backdrop-blur-md group border border-white/5">
        <div className="text-5xl mb-2 group-hover:scale-110 transition-transform duration-500">{emoji}</div>
        <h3 className="text-2xl font-bold tracking-tight text-white/90">{title}</h3>
        <p className="text-lg text-white/50 leading-tight">{desc}</p>
    </div>
);

/**
 * Environment Effects Component - Optimized for Performance
 */
const EnvironmentFX: React.FC<{ env: EnvironmentType, accent: string }> = ({ env, accent }) => {
    const [ambient, setAmbient] = useState<{ id: number, x: number, y: number, size: number, speed: number, char?: string }[]>([]);
    const [interactives, setInteractives] = useState<{ id: number, x: number, y: number, color: string, life: number, type: 'steam' | 'spark' }[]>([]);
    const frame = useRef(0);
    const lastTime = useRef(performance.now());

    useEffect(() => {
        const handleInteraction = (e: any) => {
            const { x, y, type, color } = e.detail;
            const count = type === 'steam' ? 4 : 10;
            const newParticles = Array.from({ length: count }).map(() => ({
                id: Math.random(), x, y, color, life: 1, type
            }));
            setInteractives(prev => [...prev, ...newParticles].slice(-40)); // Cap particles
        };
        window.addEventListener('ui-interaction' as any, handleInteraction);
        return () => window.removeEventListener('ui-interaction' as any, handleInteraction);
    }, []);

    useEffect(() => {
        let raf: number;
        const loop = (now: number) => {
            const dt = now - lastTime.current;
            if (dt > 32) { // Target ~30fps for background FX
                lastTime.current = now;
                setInteractives(prev => prev.map(p => ({ ...p, life: p.life - 0.04 })).filter(p => p.life > 0));
                
                if (['vaporwave', 'matrix', 'toxic', 'lava'].includes(env)) {
                    setAmbient(prev => {
                        const next = prev.map(p => ({ 
                            ...p, 
                            y: env === 'matrix' ? p.y + p.speed : p.y - p.speed, 
                            x: p.x + (Math.sin(frame.current / 20 + p.id) * 0.5) 
                        })).filter(p => p.y > -100 && p.y < window.innerHeight + 100);
                        
                        if (next.length < 15) { 
                            next.push({ 
                                id: Math.random(), 
                                x: Math.random() * window.innerWidth, 
                                y: env === 'matrix' ? -50 : window.innerHeight + 50, 
                                size: Math.random() * (env === 'vaporwave' ? 50 : 12) + 4, 
                                speed: Math.random() * 2 + 1, 
                                char: env === 'matrix' ? String.fromCharCode(0x30A0 + Math.random() * 96) : undefined 
                            }); 
                        }
                        return next;
                    });
                } else if (ambient.length > 0) {
                    setAmbient([]);
                }
                frame.current++;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [env, ambient.length]);

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <div className="absolute inset-0 opacity-20">
                {ambient.map(p => (
                    <div key={p.id} className="absolute transition-transform duration-300" style={{ left: p.x, top: p.y, width: p.size, height: p.size, backgroundColor: env === 'matrix' ? 'transparent' : accent, color: env === 'matrix' ? accent : 'transparent', borderRadius: env === 'lava' || env === 'toxic' ? '50%' : '0%', filter: env === 'vaporwave' ? 'blur(20px)' : env === 'toxic' ? 'blur(4px)' : 'none', boxShadow: env === 'lava' ? `0 0 15px ${accent}` : 'none', fontSize: `${p.size}px`, fontFamily: env === 'matrix' ? 'monospace' : 'inherit' }}>{p.char}</div>
                ))}
            </div>
            {interactives.map(p => (
                <div key={p.id} className="absolute pointer-events-none transition-opacity duration-300" style={{ left: p.x, top: p.y, width: p.type === 'steam' ? 35 : 3, height: p.type === 'steam' ? 35 : 3, backgroundColor: p.color, borderRadius: '50%', opacity: p.life, filter: p.type === 'steam' ? 'blur(12px)' : 'none', boxShadow: p.type === 'spark' ? `0 0 8px ${p.color}` : 'none', transform: `translate(${(Math.random()-0.5) * 80 * (1-p.life)}px, ${-120 * (1-p.life)}px) scale(${p.type === 'steam' ? 1 + (1-p.life)*1.5 : p.life})` }} />
            ))}
        </div>
    );
};

/**
 * Tooltip Component
 */
const Tooltip: React.FC<{text: string, children: React.ReactNode}> = ({ text, children }) => {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative flex items-center justify-center interactive" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
            {children}
            <div className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-4 py-1.5 bg-[#1d1d1f]/95 backdrop-blur-2xl text-white text-xl rounded-xl pointer-events-none transition-all duration-300 z-[70] shadow-2xl ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'}`}>{text}</div>
        </div>
    )
}

/**
 * Apple-style Slider
 */
const SpringSlider: React.FC<{
    value: number; min: number; max: number; step: number; 
    onChange: (val: number) => void; label?: string; tooltip?: string; 
    formatValue?: (val: number) => string; accentColor: string; onTrigger?: (e: any) => void;
}> = ({ value, min, max, step, onChange, label, tooltip, formatValue, accentColor, onTrigger }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [visualValue, setVisualValue] = useState(value);
    useEffect(() => {
        let raf: number;
        const loop = () => { setVisualValue(prev => { const diff = value - prev; if (Math.abs(diff) < 0.001) return value; return prev + diff * 0.25; }); raf = requestAnimationFrame(loop); };
        loop(); return () => cancelAnimationFrame(raf);
    }, [value]);
    const calculateValue = (clientX: number) => {
        if (!trackRef.current) return value;
        const rect = trackRef.current.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const raw = min + percent * (max - min);
        const snapped = Math.round(raw / step) * step;
        return Math.min(max, Math.max(min, snapped));
    };
    const handlePointerDown = (e: React.PointerEvent) => { setDragging(true); onChange(calculateValue(e.clientX)); e.currentTarget.setPointerCapture(e.pointerId); if (onTrigger) onTrigger(e); };
    const handlePointerMove = (e: React.PointerEvent) => { if (!dragging) return; onChange(calculateValue(e.clientX)); };
    const handlePointerUp = (e: React.PointerEvent) => { setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId); };
    const percent = ((visualValue - min) / (max - min)) * 100;
    return (
        <div className="w-full pointer-events-auto group select-none interactive">
            {label && (
                <div className="flex justify-between text-2xl text-white/40 mb-2 font-bold tracking-tight items-center leading-none px-1">
                    <Tooltip text={tooltip || label}><span className="cursor-help hover:text-white/60 transition-colors">{label}</span></Tooltip>
                    <span className="text-white/80 font-medium">{formatValue ? formatValue(value) : value.toFixed(2)}</span>
                </div>
            )}
            <div ref={trackRef} className="relative w-full h-8 flex items-center cursor-pointer" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
                <div className="absolute w-full h-full bg-[#3a3a3c]/60 rounded-2xl overflow-hidden shadow-inner backdrop-blur-sm">
                    <div className="h-full transition-all duration-500 ease-out shadow-[0_0_20px_rgba(0,0,0,0.3)]" style={{ width: `${percent}%`, backgroundColor: accentColor }} />
                </div>
                <div className={`absolute w-7 h-7 bg-white rounded-full shadow-xl transition-transform duration-200 ${dragging ? 'scale-110' : 'scale-100'}`} style={{ left: `${percent}%`, transform: `translateX(-50%)`, marginLeft: `${Math.max(14, Math.min(-14, (50 - percent) * 0.28))}px` }} />
            </div>
        </div>
    )
}

/**
 * Overlay Component
 */
export default function Overlay() {
  const isHandLost = useStore(s => s.hands.length === 0);
  const hands = useStore(s => s.hands);
  const faceData = useStore(s => s.faceData);
  const videoStream = useStore(s => s.videoStream);
  const settings = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const cycleCamera = useStore(s => s.cycleCamera);
  const cameraName = useStore(s => s.cameraName);
  const cameraEnabled = useStore(s => s.cameraEnabled);
  const toggleCamera = useStore(s => s.toggleCamera);
  const showTutorial = useStore(s => s.showTutorial);
  const setShowTutorial = useStore(s => s.setShowTutorial);
  const bannerMessage = useStore(s => s.bannerMessage);
  const setBannerMessage = useStore(s => s.setBannerMessage);
  const showTrainingUI = useStore(s => s.showTrainingUI);
  const setShowTrainingUI = useStore(s => s.setShowTrainingUI);
  const resetApp = useStore(s => s.resetApp);
  const isPaused = useStore(s => s.isPaused);
  const setPaused = useStore(s => s.setPaused);
  const pauseMessage = useStore(s => s.pauseMessage);
  const isMuted = useStore(s => s.isMuted);
  const toggleMute = useStore(s => s.toggleMute);
  const clearObjects = useStore(s => s.clearObjects);
  const roastMessage = useStore(s => s.roastMessage);
  const setRoastMessage = useStore(s => s.setRoastMessage);
  const getRandomDisconnectText = useStore(s => s.getRandomDisconnectText);
  const getRandomMiddleFingerText = useStore(s => s.getRandomMiddleFingerText);
  const addObject = useStore(s => s.addObject);
  const cycleEnvironment = useStore(s => s.cycleEnvironment);

  const [lastGesture, setLastGesture] = useState<GestureType>(GestureType.NONE);
  const [gestureText, setGestureText] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [showCameraBanner, setShowCameraBanner] = useState(false);
  const [showRoastBanner, setShowRoastBanner] = useState(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isTutorialExiting, setIsTutorialExiting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // UI Damping / Floating Logic 🌊
  const uiContainerRef = useRef<HTMLDivElement>(null);
  const uiPos = useRef({ x: 0, y: 0 });
  const uiVel = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
      let raf: number;
      const loop = () => {
          if (!settings.uiGraphicsMode) {
              if (uiContainerRef.current) uiContainerRef.current.style.transform = 'none';
              return;
          }
          
          // Target position based on face (camera) movement
          const targetX = faceData.present ? -faceData.position.x * settings.uiParallaxIntensity : 0;
          const targetY = faceData.present ? -faceData.position.y * settings.uiParallaxIntensity : 0;
          
          // Spring Physics (Damping)
          const stiffness = 0.05;
          const damping = 0.85;
          
          const forceX = (targetX - uiPos.current.x) * stiffness;
          const forceY = (targetY - uiPos.current.y) * stiffness;
          
          uiVel.current.x = (uiVel.current.x + forceX) * damping;
          uiVel.current.y = (uiVel.current.y + forceY) * damping;
          
          uiPos.current.x += uiVel.current.x;
          uiPos.current.y += uiVel.current.y;
          
          if (uiContainerRef.current) {
              // Apply transform with slight rotation for extra 3D feel
              const rotateX = -uiPos.current.y * 0.5;
              const rotateY = uiPos.current.x * 0.5;
              uiContainerRef.current.style.transform = `translate3d(${uiPos.current.x}px, ${uiPos.current.y}px, 0) perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
          }
          raf = requestAnimationFrame(loop);
      };
      loop();
      return () => cancelAnimationFrame(raf);
  }, [settings.uiGraphicsMode, faceData.present, faceData.position.x, faceData.position.y]);

  const accentColor = useMemo(() => {
    switch(settings.environment) {
        case 'void': return '#ffffff'; case 'grid': return '#0a84ff'; case 'vaporwave': return '#ff7eb9'; case 'matrix': return '#00ff41';
        case 'white_room': return '#ffffff'; case 'midnight': return '#5e5ce6'; case 'sunset': return '#ff9f0a'; case 'toxic': return '#32d74b';
        case 'gold': return '#ffd60a'; case 'ice': return '#64d2ff'; case 'desert': return '#ac8e68'; case 'forest': return '#30d158';
        case 'lava': return '#ff453a'; default: return '#0a84ff';
    }
  }, [settings.environment]);

  const trigger = useCallback((e: any) => {
      if (settings.environment !== 'vaporwave' && settings.environment !== 'lava') return;
      const type = settings.environment === 'vaporwave' ? 'steam' : 'spark';
      window.dispatchEvent(new CustomEvent('ui-interaction', { detail: { x: e.clientX, y: e.clientY, type, color: type === 'steam' ? accentColor : '#ff4500' } }));
      audio.play3D(settings.environment === 'vaporwave' ? 'hiss' : 'crackle', [0,0,0], 0.5);
  }, [settings.environment, accentColor]);

  useEffect(() => { if (showTrainingUI && videoRef.current && videoStream) { videoRef.current.srcObject = videoStream; videoRef.current.play().catch(() => {}); } }, [showTrainingUI, videoStream]);
  const handleAction = useCallback((fn: Function) => (e: any) => { trigger(e); fn(); }, [trigger]);
  const playClick = useCallback(() => {
      audio.play3D('click', [0,0,0], settings.soundVolume);
  }, [settings.soundVolume]);

  const handleTutorialDismiss = useCallback(() => { playClick(); setIsTutorialExiting(true); setTimeout(() => { setShowTutorial(false); setIsTutorialExiting(false); }, 600); }, [playClick, setShowTutorial]);
  
  // Use primary hand (index 0) for tutorial dismissal
  useEffect(() => { if (showTutorial && !isTutorialExiting && hands[0]?.gesture === GestureType.OPEN_PALM) handleTutorialDismiss(); }, [showTutorial, isTutorialExiting, hands, handleTutorialDismiss]);
  
  useEffect(() => {
      const primaryHand = hands[0];
      if (!primaryHand) return;
      
      if (primaryHand.gesture === GestureType.MIDDLE_FINGER && lastGesture !== GestureType.MIDDLE_FINGER) { const roast = getRandomMiddleFingerText(); setBannerMessage(`savagery detected: ${roast}`); setShowRoastBanner(true); audio.play3D('click', [0,0,0], settings.soundVolume); setTimeout(() => setShowRoastBanner(false), 5000); }
      if (primaryHand.gesture === GestureType.THREE_FINGERS && lastGesture !== GestureType.THREE_FINGERS) { playClick(); cycleEnvironment(); }
      setLastGesture(primaryHand.gesture);
  }, [hands, lastGesture, setBannerMessage, getRandomMiddleFingerText, cycleEnvironment, playClick, settings.soundVolume]);

  useEffect(() => {
    let t: any;
    if (hands.length === 0 && !isPaused && cameraEnabled) { t = setTimeout(() => { const r = getRandomDisconnectText(); setRoastMessage(r.toLowerCase()); }, 1000); }
    else { setRoastMessage(""); }
    return () => clearTimeout(t);
  }, [hands.length, isPaused, cameraEnabled, getRandomDisconnectText, setRoastMessage]);

  useEffect(() => {
      if (isHandLost) { setShowToast(false); return; }
      const primaryHand = hands[0];
      if (primaryHand && primaryHand.gesture !== GestureType.NONE && primaryHand.gesture !== lastGesture) {
          let text = "";
          switch(primaryHand.gesture) {
              case GestureType.CLOSED_FIST: text = "time dilation"; break; case GestureType.PINCH: text = "interact"; break;
              case GestureType.POINTING: text = "summon"; break; case GestureType.PEACE: text = "liquid"; break;
              case GestureType.PINKY_UP: text = "clear scene"; break; case GestureType.THREE_FINGERS: text = "cycle env"; break;
          }
          if (text) { setGestureText(text); setShowToast(true); const t = setTimeout(() => setShowToast(false), 2000); return () => clearTimeout(t); }
      }
  }, [hands, lastGesture, isHandLost]);

  const envs: EnvironmentType[] = ['void', 'grid', 'vaporwave', 'matrix', 'white_room', 'midnight', 'sunset', 'toxic', 'gold', 'ice', 'desert', 'forest', 'lava'];
  const shapes: { id: ShapeType, icon: string }[] = [ { id: 'cube', icon: 'view_in_ar' }, { id: 'sphere', icon: 'circle' }, { id: 'pyramid', icon: 'change_history' }, { id: 'cylinder', icon: 'view_column' }, { id: 'torus', icon: 'donut_large' }, { id: 'capsule', icon: 'medication' }, { id: 'icosahedron', icon: 'diamond' }, { id: 'dodecahedron', icon: 'polyline' } ];
  const materials: MaterialType[] = ['plastic', 'metal', 'glass', 'neon', 'wireframe', 'stone'];

  const glassStyle = useMemo(() => {
    if (!settings.uiGraphicsMode) return {};
    return {
      backdropFilter: `blur(${settings.uiGlassBlur}px) saturate(180%)`,
      backgroundColor: `rgba(44, 44, 46, ${settings.uiGlassOpacity})`,
      boxShadow: `0 0 30px ${accentColor}40, inset 0 0 2px rgba(255,255,255,${settings.uiBorderOpacity * 2})`,
      border: `1px solid rgba(255,255,255,${settings.uiBorderOpacity})`,
      backgroundImage: `linear-gradient(rgba(255,255,255,${settings.uiGridOpacity}) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,${settings.uiGridOpacity}) 1px, transparent 1px)`,
      backgroundSize: '4px 4px',
      textShadow: `0 0 ${10 * settings.uiTextShadowIntensity}px rgba(255,255,255,${0.3 * settings.uiTextShadowIntensity}), ${2 * settings.uiTextShadowIntensity}px 0 rgba(255,0,0,${0.2 * settings.uiTextShadowIntensity}), -${2 * settings.uiTextShadowIntensity}px 0 rgba(0,0,255,${0.2 * settings.uiTextShadowIntensity})`
    };
  }, [settings.uiGraphicsMode, settings.uiGlassBlur, settings.uiGlassOpacity, settings.uiBorderOpacity, settings.uiGridOpacity, settings.uiTextShadowIntensity, accentColor]);

  return (
    <div className={`absolute inset-0 z-10 transition-all duration-1000 lowercase text-white pointer-events-none ${isHandLost ? 'bg-black/20' : ''}`}>
      <EnvironmentFX env={settings.environment} accent={accentColor} />
      
      {isPaused && (
          <div className="absolute inset-0 z-[100] bg-[#050505]/60 backdrop-blur-[80px] flex items-center justify-center pointer-events-auto cursor-auto animate-fade-in">
              <div className="text-center max-w-4xl px-8">
                  <Icon name="pause" className="text-[12rem] mb-12 opacity-20" />
                  <h2 className="text-[10rem] font-bold tracking-tighter mb-6 leading-none">paused</h2>
                  {pauseMessage && <p className="text-4xl text-white/40 italic mb-16 tracking-tight leading-tight">"{pauseMessage}"</p>}
                  <button onClick={() => setPaused(false)} className="px-20 py-8 bg-white text-black rounded-full font-bold hover:scale-105 active:scale-95 transition-all text-5xl shadow-[0_20px_60px_rgba(255,255,255,0.15)] interactive">resume</button>
              </div>
          </div>
      )}

      {/* Floating UI Container */}
      <div ref={uiContainerRef} className="absolute inset-0 pointer-events-none perspective-1000">
          <div className="absolute top-0 left-0 w-full flex flex-col items-center pointer-events-none z-50">
              <div className={`w-full flex items-center justify-center bg-[#ff3b30] text-white py-1.5 shadow-lg backdrop-blur-md pointer-events-auto transition-all duration-700 ease-out ${isHandLost ? 'translate-y-0 opacity-100 blur-none' : '-translate-y-full opacity-0 blur-xl'}`}>
                   <div className="flex items-center gap-3"><Icon name="warning" className="text-2xl animate-pulse" /><div className="flex items-baseline gap-3"><h2 className="text-2xl font-bold uppercase tracking-widest leading-none">rig disconnected</h2>{roastMessage && <p className="text-xl font-bold italic opacity-80 leading-none">"{roastMessage}"</p>}</div></div>
              </div>
              <div className="w-full p-8 flex justify-between items-start">
                  <h1 onMouseEnter={() => addObject('cloud', [(Math.random()-0.5)*10, 20, (Math.random()-0.5)*5], [0,-2,0])} className="text-8xl text-white leading-none tracking-tighter mix-blend-difference hover:scale-105 transition-transform duration-500 cursor-help font-bold drop-shadow-2xl pointer-events-auto">rigomator</h1>
                  <div className={`transition-all duration-500 ease-spring ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}><div className="rounded-full bg-[#1c1c1e]/60 backdrop-blur-3xl shadow-2xl px-6 py-2 flex items-center justify-center gap-3"><div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse shadow-[0_0_15px_white]"></div><span className="text-white font-bold tracking-tight text-3xl">{gestureText}</span></div></div>
                  <div className="flex items-center gap-3 pointer-events-auto">
                      <Tooltip text={isPaused ? "Resume" : "Pause"}><button onClick={handleAction(() => { playClick(); setPaused(!isPaused); })} className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:bg-white/10 active:scale-95 backdrop-blur-md interactive shadow-md bg-[#2c2c2e]/60" style={glassStyle}><Icon name={isPaused ? "play_arrow" : "pause"} className="text-4xl" /></button></Tooltip>
                      <button onClick={handleAction(() => { playClick(); setShowTutorial(true); })} className="h-14 px-8 rounded-full bg-[#2c2c2e]/60 backdrop-blur-md font-bold text-2xl tracking-tight hover:bg-white/10 transition-all interactive shadow-lg flex items-center justify-center" style={glassStyle}>help</button>
                  </div>
              </div>
          </div>

          <div className="absolute bottom-10 left-10 z-[60] pointer-events-none">
              <div className="flex flex-col items-start gap-4 pointer-events-auto">
                   <div className={`flex flex-col transition-all duration-700 ease-[cubic-bezier(0.2,1,0.2,1)] origin-bottom-left bg-[#2c2c2e]/85 backdrop-blur-3xl shadow-[0_30px_100px_rgba(0,0,0,0.5)] overflow-hidden ${isPanelExpanded ? 'w-[440px] h-[720px] rounded-[3.5rem] p-8 opacity-100' : 'w-0 h-0 rounded-full p-0 opacity-0'}`} style={glassStyle}>
                         <div className="flex justify-between items-center mb-10"><h2 className="text-5xl font-bold tracking-tighter" style={settings.uiGraphicsMode ? { textShadow: `0 0 20px ${accentColor}` } : {}}>Control Center</h2><button onClick={handleAction(() => setIsPanelExpanded(false))} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors interactive"><Icon name="close" className="text-3xl" /></button></div>
                         <div className="flex-1 overflow-y-auto custom-scrollbar space-y-12 pr-4">
                             <div className="space-y-6"><h3 className="text-xl font-bold text-white/20 uppercase tracking-[0.2em] px-1">Object Factory</h3><div className="bg-white/5 rounded-[2.5rem] p-6 space-y-10">
                                    <SpringSlider label="Spawn Rate" min={0.0} max={1.0} step={0.1} value={settings.spawnRate} onChange={(val) => updateSettings({ spawnRate: val })} formatValue={(v) => v < 0.2 ? "turtle 🐢" : v < 0.4 ? "slow" : v < 0.6 ? "normal" : v < 0.8 ? "fast" : "fast af 🚀"} accentColor={accentColor} onTrigger={trigger} />
                                    <div><span className="text-2xl text-white/40 font-bold tracking-tight mb-4 block px-1">Shape</span><div className="grid grid-cols-4 gap-3">{shapes.map(s => (<button key={s.id} onClick={handleAction(() => { playClick(); updateSettings({ objectShape: s.id }); })} style={{ backgroundColor: settings.objectShape === s.id ? accentColor : 'transparent' }} className={`w-full aspect-square rounded-2xl flex items-center justify-center transition-all duration-500 interactive ${settings.objectShape === s.id ? 'text-black shadow-xl' : 'bg-white/5 hover:bg-white/10'}`}><Icon name={s.icon} className="text-4xl" /></button>))}</div></div>
                                    <div><span className="text-2xl text-white/40 font-bold tracking-tight mb-4 block px-1">Material</span><div className="flex flex-wrap gap-2">{materials.map(m => (<button key={m} onClick={handleAction(() => { playClick(); updateSettings({ objectMaterial: m }); })} style={{ backgroundColor: settings.objectMaterial === m ? accentColor : 'transparent' }} className={`px-4 py-2 rounded-2xl text-xl font-bold tracking-tight transition-all duration-500 interactive ${settings.objectMaterial === m ? 'text-black shadow-xl' : 'bg-white/5 hover:bg-white/10'}`}>{m}</button>))}</div></div>
                             </div></div>
                             
                             <div className="space-y-6"><h3 className="text-xl font-bold text-white/20 uppercase tracking-[0.2em] px-1">Visuals</h3><div className="bg-white/5 rounded-[2.5rem] p-6 space-y-8">
                                    <div className="flex justify-between items-center px-1"><span className="text-2xl font-bold">Post Processing</span><button onClick={handleAction(() => { playClick(); updateSettings({ enableEffects: !settings.enableEffects }); })} className={`w-16 h-10 rounded-full transition-colors relative interactive ${settings.enableEffects ? 'bg-green-500' : 'bg-white/10'}`}><div className={`absolute top-1 w-8 h-8 bg-white rounded-full shadow-md transition-all ${settings.enableEffects ? 'left-[calc(100%-2.25rem)]' : 'left-1'}`} /></button></div>
                                    {settings.enableEffects && (
                                        <>
                                            <SpringSlider label="Bloom" min={0} max={3} step={0.1} value={settings.bloomIntensity} onChange={(val) => updateSettings({ bloomIntensity: val })} accentColor={accentColor} />
                                            <SpringSlider label="Chromatic" min={0} max={0.1} step={0.001} value={settings.chromaticAberration} onChange={(val) => updateSettings({ chromaticAberration: val })} accentColor={accentColor} />
                                            <SpringSlider label="Scanlines" min={0} max={0.5} step={0.01} value={settings.scanlineIntensity} onChange={(val) => updateSettings({ scanlineIntensity: val })} accentColor={accentColor} />
                                            <SpringSlider label="Vignette" min={0} max={0.5} step={0.01} value={settings.vignetteIntensity} onChange={(val) => updateSettings({ vignetteIntensity: val })} accentColor={accentColor} />
                                            <SpringSlider label="Film Grain" min={0} max={0.2} step={0.01} value={settings.filmGrain} onChange={(val) => updateSettings({ filmGrain: val })} accentColor={accentColor} />
                                        </>
                                    )}
                                    <div className="w-full h-px bg-white/10 my-4" />
                                    <div className="flex justify-between items-center px-1"><span className="text-2xl font-bold">Game of Life Floor</span><button onClick={handleAction(() => { playClick(); updateSettings({ gameOfLife: !settings.gameOfLife }); })} className={`w-16 h-10 rounded-full transition-colors relative interactive ${settings.gameOfLife ? 'bg-green-500' : 'bg-white/10'}`}><div className={`absolute top-1 w-8 h-8 bg-white rounded-full shadow-md transition-all ${settings.gameOfLife ? 'left-[calc(100%-2.25rem)]' : 'left-1'}`} /></button></div>
                                    <div className="flex justify-between items-center px-1"><span className="text-2xl font-bold">UI Graphics (Heavy)</span><button onClick={handleAction(() => { playClick(); updateSettings({ uiGraphicsMode: !settings.uiGraphicsMode }); })} className={`w-16 h-10 rounded-full transition-colors relative interactive ${settings.uiGraphicsMode ? 'bg-green-500' : 'bg-white/10'}`}><div className={`absolute top-1 w-8 h-8 bg-white rounded-full shadow-md transition-all ${settings.uiGraphicsMode ? 'left-[calc(100%-2.25rem)]' : 'left-1'}`} /></button></div>
                                    {settings.uiGraphicsMode && (
                                        <div className="space-y-6 pt-4 border-t border-white/5">
                                            <SpringSlider label="Glass Blur" min={0} max={40} step={1} value={settings.uiGlassBlur} onChange={(val) => updateSettings({ uiGlassBlur: val })} accentColor={accentColor} formatValue={(v) => `${v}px`} />
                                            <SpringSlider label="Transparency" min={0} max={1} step={0.01} value={settings.uiGlassOpacity} onChange={(val) => updateSettings({ uiGlassOpacity: val })} accentColor={accentColor} />
                                            <SpringSlider label="Border" min={0} max={0.5} step={0.01} value={settings.uiBorderOpacity} onChange={(val) => updateSettings({ uiBorderOpacity: val })} accentColor={accentColor} />
                                            <SpringSlider label="Grid Intensity" min={0} max={0.1} step={0.001} value={settings.uiGridOpacity} onChange={(val) => updateSettings({ uiGridOpacity: val })} accentColor={accentColor} />
                                            <SpringSlider label="Shadow Glow" min={0} max={1} step={0.01} value={settings.uiTextShadowIntensity} onChange={(val) => updateSettings({ uiTextShadowIntensity: val })} accentColor={accentColor} />
                                            <SpringSlider label="Parallax Float" min={0} max={40} step={1} value={settings.uiParallaxIntensity} onChange={(val) => updateSettings({ uiParallaxIntensity: val })} accentColor={accentColor} />
                                        </div>
                                    )}
                             </div></div>

                             <div className="space-y-6"><h3 className="text-xl font-bold text-white/20 uppercase tracking-[0.2em] px-1">Worlds</h3><div className="bg-white/5 rounded-[2.5rem] p-4 grid grid-cols-2 gap-2">{envs.map((env) => (<button key={env} onClick={handleAction(() => { playClick(); updateSettings({ environment: env }); })} style={{ backgroundColor: settings.environment === env ? accentColor : 'transparent' }} className={`py-3 px-4 rounded-2xl text-xl font-bold tracking-tight transition-all duration-500 interactive ${settings.environment === env ? 'text-black shadow-lg' : 'bg-white/5 hover:bg-white/10'}`}>{env.replace('_', ' ')}</button>))}</div></div>
                             <button onClick={handleAction(() => { playClick(); setShowTrainingUI(true); setIsPanelExpanded(false); })} className="w-full py-6 rounded-3xl bg-white/5 font-bold text-3xl tracking-tight hover:bg-white/10 transition-all flex items-center justify-center gap-4 interactive group"><Icon name="bar_chart" className="text-4xl group-hover:rotate-12 transition-transform" /><span>Neural Telemetry</span></button>
                         </div>
                   </div>
                   <button onClick={handleAction(() => setIsPanelExpanded(!isPanelExpanded))} style={{ backgroundColor: isPanelExpanded ? accentColor : 'rgba(44,44,46,0.6)', color: isPanelExpanded ? 'black' : 'white', ...(settings.uiGraphicsMode ? glassStyle : {}) }} className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:bg-white/10 active:scale-95 backdrop-blur-md interactive shadow-lg scale-110"><Icon name={isPanelExpanded ? "close" : "settings"} className={`text-4xl transition-transform duration-500 ${isPanelExpanded ? 'rotate-180' : 'rotate-0'}`} /></button>
              </div>
          </div>

          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[60] pointer-events-none"><div className={`p-3 gap-3 bg-[#1c1c1e]/60 backdrop-blur-3xl rounded-[2.5rem] flex items-center border border-white/5 pointer-events-auto transition-all duration-500 hover:scale-105 active:scale-95 shadow-2xl shadow-black/50`} style={glassStyle}>
                   <Tooltip text="Reset System"><button onClick={handleAction(() => { playClick(); resetApp(); })} className="w-16 h-16 rounded-3xl flex items-center justify-center transition-all hover:bg-white/10 active:scale-90 interactive"><Icon name="refresh" className="text-4xl" /></button></Tooltip>
                   <Tooltip text={isMuted ? "Unmute" : "Mute"}><button onClick={handleAction(() => { playClick(); toggleMute(); })} className="w-16 h-16 rounded-3xl flex items-center justify-center transition-all hover:bg-white/10 active:scale-90 interactive"><Icon name={isMuted ? "volume_off" : "volume_up"} className="text-4xl" /></button></Tooltip>
                   <Tooltip text="Clear Objects"><button onClick={handleAction(() => { playClick(); clearObjects(); audio.play3D('trash', [0,0,0], 1); })} className="w-16 h-16 rounded-3xl flex items-center justify-center transition-all hover:bg-red-500/20 text-red-500 active:scale-90 interactive"><Icon name="delete_outline" className="text-4xl" /></button></Tooltip>
                   <div className="w-px h-10 bg-white/10 mx-1"></div>
                   <div className="flex items-center gap-2"><Tooltip text={cameraEnabled ? "Disable Cam" : "Enable Cam"}><button onClick={handleAction(() => { playClick(); toggleCamera(); })} className="w-16 h-16 rounded-3xl flex items-center justify-center transition-all hover:bg-white/10 active:scale-90 interactive"><Icon name={cameraEnabled ? "visibility" : "visibility_off"} className="text-4xl" /></button></Tooltip><button onClick={handleAction(() => { playClick(); cycleCamera(); })} disabled={!cameraEnabled} className={`h-16 px-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-3 transition-all hover:bg-white/10 active:scale-95 interactive ${!cameraEnabled ? 'opacity-30' : ''}`}><span className="font-bold text-2xl tracking-tighter uppercase">Switch</span><Icon name="cameraswitch" className="text-3xl" /></button></div>
          </div></div>

          {showTutorial && (
              <div className={`absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-3xl pointer-events-auto transition-opacity duration-500 ${isTutorialExiting ? 'opacity-0' : 'opacity-100'}`}>
                  <div className={`rounded-[4rem] p-12 max-w-5xl w-full shadow-2xl bg-[#1c1c1e]/80 backdrop-blur-2xl relative transition-all duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] ${isTutorialExiting ? 'scale-90 blur-xl' : 'scale-100 blur-0'}`} style={glassStyle}>
                      <button onClick={handleTutorialDismiss} className="absolute top-10 right-10 w-12 h-12 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all interactive"><Icon name="close" className="text-4xl" /></button>
                      <div className="mb-12 border-b border-white/5 pb-8"><div className="text-2xl font-bold text-white/30 tracking-[0.3em] mb-3 uppercase">Neural Link Established</div><h2 className="text-8xl font-bold mb-3 tracking-tighter text-white" style={settings.uiGraphicsMode ? { textShadow: `0 0 20px ${accentColor}` } : {}}>Master your reality</h2><p className="text-white/40 text-3xl font-medium tracking-tight">High-fidelity spatial manipulation via hand tracking.</p></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <TutorialCard emoji="✋" title="Neutral" desc="Open palm. The state of absolute zero." /><TutorialCard emoji="👌" title="Interact" desc="Pinch index & thumb to grab the fabric of space." /><TutorialCard emoji="☝️" title="Summon" desc="Point index to manifest matter from the void." />
                          <TutorialCard emoji="✊" title="Dilate" desc="Clench your fist to slow the march toward entropy." /><TutorialCard emoji="✌️" title="Fluid" desc="The peace sign spawns digital liquid." /><TutorialCard emoji="🖖" title="Cycle" desc="3 fingers to shift through parallel dimensions." />
                      </div>
                      <div className="mt-12 flex flex-col md:grid-cols-2 justify-between items-center gap-8"><div className="flex items-center gap-4 bg-white/5 px-6 py-3 rounded-full border border-white/5"><span className="text-3xl animate-pulse">✋</span><p className="text-white/40 text-2xl font-medium">Raise <span className="text-white font-bold bg-white/10 px-3 py-1 rounded-xl">Open Palm</span> to dismiss</p></div><button onClick={handleTutorialDismiss} className="bg-white text-black px-16 py-6 rounded-full font-bold text-3xl hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-white/20 interactive">Start Engine</button></div>
                  </div>
              </div>
          )}
          
          {showTrainingUI && (
              <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-3xl pointer-events-auto animate-fade-in">
                 <div className="w-[1200px] max-w-[95vw] h-[800px] max-h-[90vh] flex flex-col overflow-hidden rounded-[4rem] shadow-2xl bg-[#2c2c2e]/85 backdrop-blur-3xl" style={glassStyle}>
                     <div className="px-10 py-8 border-b border-white/5 flex justify-between items-center"><div className="flex items-center gap-4"><div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-3xl font-bold">AI</div><h2 className="text-5xl font-bold tracking-tighter" style={settings.uiGraphicsMode ? { textShadow: `0 0 20px ${accentColor}` } : {}}>Neural Telemetry</h2></div><button onClick={() => setShowTrainingUI(false)} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors interactive"><Icon name="close" className="text-4xl" /></button></div>
                      <div className="flex-1 p-10 grid grid-cols-[1fr_1.2fr] gap-10 overflow-y-auto custom-scrollbar">
                         <div className="space-y-10">
                            <div className="rounded-[3rem] bg-black/40 aspect-video relative overflow-hidden group shadow-2xl">
                                {videoStream ? <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" style={{ transform: "scaleX(-1)" }} /> : <div className="text-white/20 text-3xl h-full flex items-center justify-center font-bold italic">No Signal</div>}
                                <div className="absolute top-6 left-6 px-4 py-2 bg-black/60 backdrop-blur-md rounded-2xl text-xl font-bold text-green-400 tracking-widest uppercase border border-white/5">Live Feed</div>
                                
                                {/* Creative Head Tracker Overlay */}
                                {faceData.present && (
                                    <div className="absolute inset-0 pointer-events-none">
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-white/10 rounded-full animate-pulse"></div>
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-dashed border-white/5 rounded-full rotate-45 animate-reverse-spin"></div>
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white/40 rounded-full shadow-[0_0_20px_white]" style={{ transform: `translate(${-faceData.position.x * 20}px, ${faceData.position.y * 20}px)` }}></div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Head Metrics Grid */}
                            <div className="bg-white/5 rounded-[2.5rem] p-8 space-y-8">
                                <h3 className="text-xl font-bold text-white/20 uppercase tracking-[0.2em]">Neural Head Orbit</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center gap-4 group hover:bg-white/10 transition-colors h-48">
                                        <span className="text-sm font-bold text-white/30 uppercase tracking-tighter">Position X/Y</span>
                                        <div className="relative w-24 h-24 bg-black/40 rounded-xl border border-white/10 overflow-hidden">
                                            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '12px 12px' }}></div>
                                            <div className="absolute w-2 h-2 bg-[#ff3b30] rounded-full shadow-[0_0_10px_#ff3b30] transition-all duration-200" style={{ left: `${(faceData.position.x + 1) * 50}%`, top: `${(1 - (faceData.position.y + 1) / 2) * 100}%`, transform: 'translate(-50%, -50%)' }}></div>
                                        </div>
                                        <div className="text-xl font-mono font-bold text-white/60">{faceData.position.x.toFixed(2)}, {faceData.position.y.toFixed(2)}</div>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center gap-4 group hover:bg-white/10 transition-colors h-48">
                                        <span className="text-sm font-bold text-white/30 uppercase tracking-tighter">Yaw / Pitch</span>
                                        <div className="flex gap-4">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="relative w-16 h-16 rounded-full border border-white/10 flex items-center justify-center">
                                                    <div className="w-px h-12 bg-[#007aff] shadow-[0_0_10px_#007aff] transition-transform duration-200" style={{ transform: `rotate(${-faceData.rotation.y * 180 / Math.PI}deg)` }}></div>
                                                    <span className="absolute -bottom-1 text-[10px] font-bold text-white/20">Yaw</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="relative w-16 h-16 rounded-full border border-white/10 flex items-center justify-center">
                                                    <div className="w-12 h-px bg-[#ffcc00] shadow-[0_0_10px_#ffcc00] transition-transform duration-200" style={{ transform: `rotate(${-faceData.rotation.x * 180 / Math.PI}deg)` }}></div>
                                                    <span className="absolute -bottom-1 text-[10px] font-bold text-white/20">Pitch</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-xl font-mono font-bold text-white/60">{(faceData.rotation.y * 180 / Math.PI).toFixed(1)}°, {(faceData.rotation.x * 180 / Math.PI).toFixed(1)}°</div>
                                    </div>
                                </div>
                                
                                {/* Head Rotation Visualizer */}
                                <div className="flex justify-center py-4">
                                    <div className="relative w-40 h-40 border border-white/5 rounded-full flex items-center justify-center">
                                        <div className="absolute inset-0 border-t-2 border-white/20 rounded-full" style={{ transform: `rotate(${faceData.rotation.z * 180 / Math.PI}deg)` }}></div>
                                        <div className="text-center">
                                            <span className="text-sm font-bold text-white/20 uppercase block mb-1">Tilt</span>
                                            <span className="text-2xl font-mono font-bold">{(faceData.rotation.z * 180 / Math.PI).toFixed(1)}°</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                         </div>
                         <div className="bg-white/5 rounded-[3rem] p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                            <h3 className="text-2xl font-bold text-white/30 uppercase tracking-[0.2em]">Neural Gestures</h3>
                            {hands.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center text-white/20 italic text-2xl">No Hand Data</div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    {['left', 'right'].map(side => {
                                        const hand = hands.find(h => h.handedness.toLowerCase() === side);
                                        return (
                                            <div key={side} className={`space-y-4 p-5 rounded-[2rem] border border-white/5 transition-all duration-500 ${hand ? 'opacity-100 shadow-2xl' : 'bg-black/20 opacity-30'}`} style={hand ? { backgroundColor: `${hand.color}15`, borderColor: `${hand.color}30`, boxShadow: `0 20px 50px ${hand.color}20` } : {}}>
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-lg font-bold bg-white/10 px-3 py-1 rounded-xl uppercase tracking-[0.15em]" style={hand ? { color: hand.color } : {}}>{side} hand</span>
                                                    {hand ? (
                                                        <span className="text-lg font-bold text-white/40 italic">{hand.gesture}</span>
                                                    ) : (
                                                        <span className="text-lg font-bold text-white/20 italic">No Sig</span>
                                                    )}
                                                </div>
                                                {hand && (
                                                    <div className="space-y-3">
                                                        {Object.entries(hand.metrics).map(([key, val]) => (
                                                            <div key={key} className="space-y-1.5 px-1">
                                                                <div className="flex justify-between items-end"><span className="text-base font-bold tracking-tight text-white/80">{key}</span><span className="font-mono text-white/40 text-sm font-bold">{(val * 100).toFixed(0)}%</span></div>
                                                                <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden"><div className="h-full transition-all duration-300 ease-out shadow-[0_0_10px_white]" style={{ width: `${val * 100}%`, backgroundColor: val > 0.5 ? hand.color : 'white' }} /></div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                         </div>
                      </div>
                 </div>
              </div>
          )}
      </div>

      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; } .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); } .ease-spring { transition-timing-function: cubic-bezier(0.2, 1.2, 0.2, 1); } @keyframes reverse-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(-360deg); } } .animate-reverse-spin { animation: reverse-spin 10s linear infinite; }`}</style>
    </div>
  );
}
