
export enum GestureType {
  NONE = 'NONE',
  OPEN_PALM = 'OPEN_PALM', // Neutral
  CLOSED_FIST = 'CLOSED_FIST', // Slow Mo
  PINCH = 'PINCH', // Grab / Interact
  PEACE = 'PEACE', // Liquid
  MIDDLE_FINGER = 'MIDDLE_FINGER', // Roast
  POINTING = 'POINTING', // Summon Block
  PINKY_UP = 'PINKY_UP', // Clear Objects
  THREE_FINGERS = 'THREE_FINGERS' // Cycle Environment
}

export interface HandPosition {
  x: number;
  y: number;
  z: number;
}

export interface FaceData {
  present: boolean;
  position: { x: number, y: number, z: number }; // Center of face mapped to world bounds
  rotation: { x: number, y: number, z: number };
}

export interface GestureMetrics {
  pinch: number; // 0-1
  fist: number;
  palm: number;
  peace: number;
  pointing: number;
  pinkyUp: number;
  threeFingers: number;
}

export interface HandData {
  present: boolean;
  landmarks: HandPosition[]; // Normalized
  rigLandmarks: [number, number, number][]; // Projected 3D coordinates for all 21 joints
  gesture: GestureType;
  metrics: GestureMetrics; // Confidence levels
  pinchDistance: number;
  worldPosition: [number, number, number]; // Dynamic Centroid (Tip or Pinch Center)
}

export interface PhysicsObject {
  id: string;
  type: 'box' | 'sphere' | 'liquid' | 'cloud'; 
  position: [number, number, number];
  color: string;
  velocity?: [number, number, number]; // Initial velocity
}

export type EnvironmentType = 
  | 'void' 
  | 'grid' 
  | 'vaporwave' 
  | 'matrix' 
  | 'white_room' 
  | 'midnight' 
  | 'sunset' 
  | 'toxic' 
  | 'gold' 
  | 'ice' 
  | 'desert' 
  | 'forest' 
  | 'lava';

export type ShapeType = 
  | 'cube' 
  | 'sphere' 
  | 'pyramid' 
  | 'torus' 
  | 'cylinder' 
  | 'capsule' 
  | 'icosahedron' 
  | 'dodecahedron';

export type MaterialType = 
  | 'plastic' 
  | 'metal' 
  | 'glass' 
  | 'neon' 
  | 'wireframe' 
  | 'stone';

export interface AppSettings {
  gravity: number;
  bloomIntensity: number;
  timeScale: number;
  bounciness: number;
  friction: number;
  chaosMode: boolean;
  soundVolume: number;
  particleDensity: 'low' | 'high';
  environment: EnvironmentType;
  particleEffect: 'cyber' | 'fire' | 'water';
  
  // New Settings
  spawnRate: number; // 0.1 (Slow) to 1.0 (Fast AF)
  handTrackingSpeed: number; // 0.1 (Smooth/Slow) to 1.0 (Instant)
  headPanSensitivity: number; 
  headRotationSensitivity: number;

  // Spawning Settings
  objectShape: ShapeType;
  objectMaterial: MaterialType;
  
  // UI Settings
  uiStyle: 'solid' | 'glass';
  
  // Visual settings
  enableEffects: boolean;
  filmGrain: number;
  chromaticAberration: number;
  vignetteIntensity: number;
  scanlineIntensity: number;
  gameOfLife: boolean;
}
