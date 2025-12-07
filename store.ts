
import { create } from 'zustand';
import { GestureType, HandData, PhysicsObject, FaceData, AppSettings, EnvironmentType } from './types';
import { v4 as uuidv4 } from 'uuid';
import { ROAST_DATA } from './texts';
import * as THREE from 'three';

const { pauseTexts: PAUSE_TEXTS, disconnectTexts: DISCONNECT_TEXTS, middleFingerTexts: MIDDLE_FINGER_TEXTS } = ROAST_DATA;

const ENVIRONMENTS: EnvironmentType[] = ['void', 'grid', 'vaporwave', 'matrix', 'white_room', 'midnight', 'sunset', 'toxic', 'gold', 'ice', 'desert', 'forest', 'lava'];

/**
 * Global App State
 * Uses Zustand for state management.
 */
interface AppState {
  // Tracking Data
  handData: HandData;
  faceData: FaceData;
  setHandData: (data: Partial<HandData>) => void;
  setFaceData: (data: Partial<FaceData>) => void;
  
  // Video Stream for Debugger
  videoStream: MediaStream | null;
  setVideoStream: (stream: MediaStream | null) => void;
  
  // Ambient Light Calculation
  cameraBrightness: number; // 0.0 to 1.0
  setCameraBrightness: (val: number) => void;

  // Physics World
  objects: PhysicsObject[];
  // Registry for direct access to Cloud 3D Objects for proximity checks
  cloudRefs: Record<string, THREE.Object3D>;
  addCloudRef: (id: string, ref: THREE.Object3D) => void;
  removeCloudRef: (id: string) => void;

  addObject: (type: PhysicsObject['type'], position: [number, number, number], velocity?: [number, number, number]) => void;
  updateObject: (id: string, data: Partial<PhysicsObject>) => void;
  clearObjects: () => void;
  removeObject: (id: string) => void;
  
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  pauseMessage: string; 
  
  isMuted: boolean;
  toggleMute: () => void;
  
  // UI States
  isHandLost: boolean;
  setHandLost: (lost: boolean) => void;
  
  // AI Interactions
  roastMessage: string;
  setRoastMessage: (msg: string) => void;
  bannerMessage: string;
  setBannerMessage: (msg: string) => void;
  getRandomDisconnectText: () => string;
  getRandomMiddleFingerText: () => string;

  // Settings
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetApp: () => void;
  cycleEnvironment: () => void;

  // Overlay Controls
  debugMode: boolean; 
  toggleDebugMode: () => void;
  showTrainingUI: boolean;
  setShowTrainingUI: (show: boolean) => void;
  showTutorial: boolean;
  setShowTutorial: (show: boolean) => void;

  // Camera Management
  cameraIndex: number;
  cameraName: string;
  cameraEnabled: boolean;
  toggleCamera: () => void;
  isCameraSwitching: boolean;
  cycleCamera: () => void;
  setCameraSwitching: (isSwitching: boolean) => void;
  setCameraName: (name: string) => void;
  cameraResetTrigger: number; // Signal to reset camera position
}

const DEFAULT_SETTINGS: AppSettings = {
    gravity: -9.81,
    bloomIntensity: 1.5,
    timeScale: 1.0,
    bounciness: 0.5,
    friction: 0.1,
    chaosMode: false,
    soundVolume: 1.0,
    particleDensity: 'high',
    environment: 'grid',
    particleEffect: 'cyber',
    objectShape: 'cube',
    objectMaterial: 'glass', // Default Glass
    uiStyle: 'glass', // Default Glass
    
    // New Defaults - Maxed Out
    spawnRate: 0.5,
    handTrackingSpeed: 0.6, // Normal Speed
    headPanSensitivity: 0.5, // Changed to 0.5
    headRotationSensitivity: 0.5, // Changed to 0.5
    
    // Visuals - Defaults from screenshot
    enableEffects: true,
    filmGrain: 0.04,
    chromaticAberration: 0.05,
    vignetteIntensity: 0.10,
    scanlineIntensity: 0.13, // Increased default
    gameOfLife: false,
};

export const useStore = create<AppState>((set, get) => ({
  handData: { present: false, landmarks: [], rigLandmarks: [], gesture: GestureType.NONE, metrics: { pinch: 0, fist: 0, palm: 0, peace: 0, pointing: 0, pinkyUp: 0, threeFingers: 0 }, pinchDistance: 1, worldPosition: [0, 0, 0] },
  faceData: { present: false, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  setHandData: (data) => set((state) => ({ handData: { ...state.handData, ...data } })),
  setFaceData: (data) => set((state) => ({ faceData: { ...state.faceData, ...data } })),
  
  videoStream: null,
  setVideoStream: (stream) => set({ videoStream: stream }),

  cameraBrightness: 0.5,
  setCameraBrightness: (val) => set({ cameraBrightness: val }),

  objects: [],
  cloudRefs: {},
  addCloudRef: (id, ref) => set((state) => ({ cloudRefs: { ...state.cloudRefs, [id]: ref } })),
  removeCloudRef: (id) => set((state) => {
      const newRefs = { ...state.cloudRefs };
      delete newRefs[id];
      return { cloudRefs: newRefs };
  }),

  addObject: (type, position, velocity) => set((state) => {
    let limit = 100;
    if (type === 'liquid') limit = 100;
    const newObject: PhysicsObject = {
      id: uuidv4(), type, position, velocity,
      color: type === 'liquid' ? '#00ffff' : (type === 'cloud' ? '#ffffff' : `hsl(${Math.random() * 360}, 80%, 60%)`),
    };
    const newObjects = [...state.objects, newObject];
    if (newObjects.length > limit) return { objects: newObjects.slice(newObjects.length - limit) };
    return { objects: newObjects };
  }),
  updateObject: (id, data) => set((state) => ({ objects: state.objects.map(obj => obj.id === id ? { ...obj, ...data } : obj) })),
  clearObjects: () => set({ objects: [], cloudRefs: {} }), // Clear refs too
  removeObject: (id) => set((state) => ({ objects: state.objects.filter(o => o.id !== id) })),

  isPaused: false,
  pauseMessage: "",
  setPaused: (paused) => {
      const msg = paused ? PAUSE_TEXTS[Math.floor(Math.random() * PAUSE_TEXTS.length)] : "";
      set({ isPaused: paused, pauseMessage: msg });
  },

  isMuted: false,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  isHandLost: false,
  setHandLost: (lost) => set((state) => {
      if (state.isHandLost === lost) return {};
      return { isHandLost: lost };
  }),

  roastMessage: "",
  setRoastMessage: (msg) => set({ roastMessage: msg }),
  bannerMessage: "",
  setBannerMessage: (msg) => set({ bannerMessage: msg }),
  getRandomDisconnectText: () => DISCONNECT_TEXTS[Math.floor(Math.random() * DISCONNECT_TEXTS.length)],
  getRandomMiddleFingerText: () => MIDDLE_FINGER_TEXTS[Math.floor(Math.random() * MIDDLE_FINGER_TEXTS.length)],

  settings: { ...DEFAULT_SETTINGS },
  updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
  resetApp: () => set((state) => ({ objects: [], settings: { ...DEFAULT_SETTINGS }, cameraResetTrigger: state.cameraResetTrigger + 1 })),
  cycleEnvironment: () => set((state) => {
    const idx = ENVIRONMENTS.indexOf(state.settings.environment);
    const next = ENVIRONMENTS[(idx + 1) % ENVIRONMENTS.length];
    return { settings: { ...state.settings, environment: next } };
  }),

  debugMode: false,
  toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
  showTrainingUI: false,
  setShowTrainingUI: (show) => set({ showTrainingUI: show }),
  showTutorial: true,
  setShowTutorial: (show) => set({ showTutorial: show }),

  cameraIndex: 0,
  cameraName: "default camera",
  cameraEnabled: true,
  toggleCamera: () => set((state) => ({ cameraEnabled: !state.cameraEnabled })),
  isCameraSwitching: false,
  cycleCamera: () => set((state) => ({ cameraIndex: state.cameraIndex + 1, isCameraSwitching: true })),
  setCameraSwitching: (val) => set({ isCameraSwitching: val }),
  setCameraName: (name) => set({ cameraName: name.toLowerCase() }),
  cameraResetTrigger: 0,
}));
