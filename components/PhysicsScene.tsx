
/// <reference lib="dom" />
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, useBox, useSphere, useCylinder, useConvexPolyhedron, usePlane } from '@react-three/cannon';
import { Stars, Grid, Sparkles, Sky, Environment, Torus, RoundedBox, Float } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, HueSaturation, Noise, Scanline } from '@react-three/postprocessing';
import { useStore } from '../store';
import { GestureType, PhysicsObject as PhysicsObjectType, ShapeType, MaterialType } from '../types';
import { audio } from '../services/audio';
import * as THREE from 'three';

// Fix for React Three Fiber intrinsic elements in TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

// --- HARD OPTIMIZATION: SHARED SCRATCHPAD VECTORS ---
// prevents garbage collection churn during the 60fps loop
const _vec3 = new THREE.Vector3();
const _vec3_2 = new THREE.Vector3(); // Secondary scratch
const _handPos = new THREE.Vector3();
const _bodyPos = new THREE.Vector3();
const _tempColor = new THREE.Color();
const _baseColor = new THREE.Color();
const _targetTint = new THREE.Color();
const _currentEmit = new THREE.Color();
const _targetColor = new THREE.Color();
const _quat = new THREE.Quaternion();
const _dummyObj = new THREE.Object3D();

// --- PHYSICS BOUNDARIES ---
const Boundaries = () => {
    // Friction optimized for game-feel
    usePlane(() => ({ rotation: [-Math.PI / 2, 0, 0], position: [0, -6, 0], material: { friction: 0.1, restitution: 0.5 } }));
    usePlane(() => ({ position: [0, 0, -30], material: { friction: 0.0, restitution: 0.8 } }));
    usePlane(() => ({ position: [0, 0, 30], rotation: [0, -Math.PI, 0], material: { friction: 0.0, restitution: 0.8 } })); 
    usePlane(() => ({ position: [-30, 0, 0], rotation: [0, Math.PI / 2, 0], material: { friction: 0.0, restitution: 0.8 } })); 
    usePlane(() => ({ position: [30, 0, 0], rotation: [0, -Math.PI / 2, 0], material: { friction: 0.0, restitution: 0.8 } })); 
    usePlane(() => ({ position: [0, 40, 0], rotation: [Math.PI / 2, 0, 0], material: { friction: 0.0, restitution: 0.5 } })); 
    return null;
};

// --- HAND DROP SHADOW ---
const HandDropShadow = () => {
    const { handData } = useStore();
    const shadowRef = useRef<THREE.Mesh>(null);

    useFrame(() => {
        if (!shadowRef.current) return;
        
        if (handData.present) {
            shadowRef.current.position.set(handData.worldPosition[0], -5.95, handData.worldPosition[2]);
            shadowRef.current.visible = true;
            const height = handData.worldPosition[1] - (-6);
            const scale = 1 + (Math.max(0, height) * 0.15);
            // Optimization: Detect height purely via math, no extra object creation
            const opacity = Math.max(0.1, 0.6 - (height * 0.05));
            shadowRef.current.scale.set(scale, scale, 1);
            (shadowRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
        } else {
            shadowRef.current.visible = false;
        }
    });

    return (
        <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
            <circleGeometry args={[1.5, 32]} />
            <meshBasicMaterial color="black" transparent opacity={0.5} depthWrite={false} />
        </mesh>
    );
};

// --- GAME OF LIFE (OPTIMIZED) ---
const GameOfLifeFloor = () => {
    const { handData } = useStore();
    const rows = 30;
    const cols = 30;
    const count = rows * cols;
    const meshRef = useRef<THREE.InstancedMesh>(null);
    // Use Int8Array for grid state (much less memory)
    const [grid] = useState(() => new Int8Array(count).fill(0));
    const lastUpdate = useRef(0);

    // Initial random state
    useEffect(() => {
        for(let i=0; i<count; i++) grid[i] = Math.random() > 0.8 ? 1 : 0;
    }, []);

    useFrame((state) => {
        if (!meshRef.current) return;
        const now = state.clock.elapsedTime;
        
        // Input: Map hand position to grid index
        let newLifeIdx = -1;
        if (handData.present) {
            const hx = handData.worldPosition[0];
            const hz = handData.worldPosition[2];
            const gx = Math.floor((hx + 30) / 2);
            const gz = Math.floor((hz + 30) / 2);
            if (gx >= 0 && gx < cols && gz >= 0 && gz < rows) {
                newLifeIdx = gz * cols + gx;
            }
        }

        // Logic Update Rate (10Hz)
        if (now - lastUpdate.current > 0.1) {
            lastUpdate.current = now;
            // Double buffer simulation using a temporary array would be safer, 
            // but mutating in place adds chaos which fits the aesthetic.
            const nextGrid = new Int8Array(grid);
            
            for (let i = 0; i < count; i++) {
                const r = Math.floor(i / cols);
                const c = i % cols;
                let neighbors = 0;
                
                // Unrolled neighbor check for speed
                // Top
                if (r > 0) {
                    if (grid[(r-1)*cols + c]) neighbors++;
                    if (c > 0 && grid[(r-1)*cols + c-1]) neighbors++;
                    if (c < cols-1 && grid[(r-1)*cols + c+1]) neighbors++;
                }
                // Bottom
                if (r < rows-1) {
                    if (grid[(r+1)*cols + c]) neighbors++;
                    if (c > 0 && grid[(r+1)*cols + c-1]) neighbors++;
                    if (c < cols-1 && grid[(r+1)*cols + c+1]) neighbors++;
                }
                // Sides
                if (c > 0 && grid[r*cols + c-1]) neighbors++;
                if (c < cols-1 && grid[r*cols + c+1]) neighbors++;

                const alive = grid[i] === 1;
                if (alive) nextGrid[i] = (neighbors === 2 || neighbors === 3) ? 1 : 0;
                else nextGrid[i] = (neighbors === 3) ? 1 : 0;
                
                if (i === newLifeIdx) nextGrid[i] = 1;
            }
            grid.set(nextGrid);
        }

        // Render Loop
        const black = new THREE.Color('#111111');
        const aliveColor = new THREE.Color();
        
        for (let i = 0; i < count; i++) {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const x = (c * 2) - 30;
            const z = (r * 2) - 30;
            const isAlive = grid[i] === 1;
            const targetY = isAlive ? -5 : -6.5; 
            
            _dummyObj.position.set(x, targetY, z);
            _dummyObj.scale.set(0.9, 0.9, 0.9);
            _dummyObj.updateMatrix();
            meshRef.current.setMatrixAt(i, _dummyObj.matrix);
            
            if (isAlive) {
                aliveColor.setHSL((i / count) * 0.2 + 0.5, 0.8, 0.5);
                meshRef.current.setColorAt(i, aliveColor);
            } else {
                meshRef.current.setColorAt(i, black);
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} position={[0, 0, 0]} receiveShadow>
            <boxGeometry args={[1.8, 1, 1.8]} />
            <meshStandardMaterial roughness={0.2} metalness={0.8} />
        </instancedMesh>
    );
};

// --- ENVIRONMENTS ---
const EnvironmentManager = React.memo(() => {
    const { settings } = useStore();
    return (
        <group>
            {settings.gameOfLife && <GameOfLifeFloor />}
            {!settings.gameOfLife && (
                <>
                {settings.environment === 'void' && <gridHelper args={[100, 10]} position={[0,-6,0]} visible={false} />}
                {settings.environment === 'grid' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#222" />
                        </mesh>
                        <Grid infiniteGrid sectionColor="#555" cellColor="#333" position={[0, 0.01, 0]} />
                    </group>
                )}
                {settings.environment === 'vaporwave' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                            <planeGeometry args={[400,400]} />
                            <meshStandardMaterial color="#2d004d" />
                        </mesh>
                        <Grid infiniteGrid sectionColor="#ff00ff" cellColor="#00ffff" sectionSize={10} cellSize={2} position={[0, 0.01, 0]} />
                        <ambientLight intensity={2} color="#ff00ff" />
                    </group>
                )}
                {settings.environment === 'matrix' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#001100" />
                        </mesh>
                        <Grid infiniteGrid sectionColor="#00ff00" cellColor="#003300" sectionSize={5} cellSize={1} position={[0, 0.01, 0]} />
                        <fog attach="fog" args={['#002200', 5, 50]} />
                    </group>
                )}
                {settings.environment === 'white_room' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#e0e0e0" roughness={0.1} />
                        </mesh>
                        <Grid infiniteGrid sectionColor="#ccc" cellColor="#f0f0f0" position={[0, 0.01, 0]} />
                        <ambientLight intensity={0.8} />
                    </group>
                )}
                {settings.environment === 'midnight' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#050510" />
                        </mesh>
                        <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
                        <fog attach="fog" args={['#050510', 10, 80]} />
                    </group>
                )}
                {settings.environment === 'sunset' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#331111" />
                        </mesh>
                        <Sky sunPosition={[100, 10, 100]} turbidity={10} rayleigh={3} />
                        <ambientLight intensity={0.5} color="#ffaa00" />
                    </group>
                )}
                {settings.environment === 'toxic' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#1a2010" />
                        </mesh>
                        <fog attach="fog" args={['#204010', 0, 60]} />
                        <Grid infiniteGrid sectionColor="#40ff00" cellColor="#104000" position={[0, 0.01, 0]} />
                    </group>
                )}
                {settings.environment === 'gold' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#443300" metalness={0.8} roughness={0.2} />
                        </mesh>
                        <Environment preset="city" />
                        <Grid infiniteGrid sectionColor="#ffd700" cellColor="#554400" position={[0, 0.01, 0]} />
                    </group>
                )}
                {settings.environment === 'ice' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#88ccff" metalness={0.5} roughness={0.1} />
                        </mesh>
                        <fog attach="fog" args={['#e0f0ff', 10, 100]} />
                        <Sparkles count={300} scale={50} size={4} speed={0.2} opacity={0.5} color="#ffffff" />
                    </group>
                )}
                {settings.environment === 'desert' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#eebb88" roughness={1} />
                        </mesh>
                        <Sky sunPosition={[10, 50, 10]} turbidity={5} rayleigh={1} mieCoefficient={0.005} />
                        <fog attach="fog" args={['#eebb88', 20, 100]} />
                    </group>
                )}
                {settings.environment === 'forest' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#1a2b1a" roughness={0.8} />
                        </mesh>
                        <fog attach="fog" args={['#0a1a0a', 5, 40]} />
                        <Sparkles count={100} scale={20} size={2} speed={0.5} opacity={0.6} color="#55ff55" />
                    </group>
                )}
                {settings.environment === 'lava' && (
                    <group position={[0,-6,0]}>
                        <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                            <planeGeometry args={[200,200]} />
                            <meshStandardMaterial color="#200000" />
                        </mesh>
                        <Grid infiniteGrid sectionColor="#ff2200" cellColor="#440000" position={[0, 0.01, 0]} />
                        <Sparkles count={200} scale={30} size={6} speed={2} opacity={0.8} color="#ff4400" />
                        <fog attach="fog" args={['#220000', 5, 60]} />
                    </group>
                )}
                </>
            )}
        </group>
    );
});

// --- INTERACTIVE PHYSICS OBJECTS ---

const VisualGeometry: React.FC<{shape: ShapeType, args: any[]}> = React.memo(({ shape, args }) => {
    switch(shape) {
        case 'cube': return <boxGeometry args={args as any} />;
        case 'sphere': return <sphereGeometry args={args as any} />;
        case 'pyramid': return <coneGeometry args={[args[0], args[1], 4]} />;
        case 'cylinder': return <cylinderGeometry args={args as any} />;
        case 'torus': return <torusGeometry args={[0.4, 0.2, 16, 32]} />;
        case 'capsule': return <capsuleGeometry args={[0.3, 1, 4, 8]} />;
        case 'icosahedron': return <icosahedronGeometry args={[0.5, 0]} />;
        case 'dodecahedron': return <dodecahedronGeometry args={[0.5, 0]} />;
        default: return <boxGeometry args={args as any} />;
    }
});

// Wrapped in forwardRef to allow material manipulation
const MaterialFactory = React.forwardRef<any, {color: string, type: MaterialType, bloom: number}>(({ color, type, bloom }, ref) => {
    switch(type) {
        case 'metal': return <meshStandardMaterial ref={ref} color={color} metalness={1} roughness={0.2} emissive={color} emissiveIntensity={0.2 * bloom} />;
        case 'glass': return <meshPhysicalMaterial ref={ref} color={color} transmission={0.9} thickness={1} roughness={0} metalness={0} emissive={color} emissiveIntensity={0.1 * bloom} />;
        case 'neon': return <meshStandardMaterial ref={ref} color={color} emissive={color} emissiveIntensity={2 * bloom} toneMapped={false} />;
        case 'wireframe': return <meshBasicMaterial ref={ref} color={color} wireframe />;
        case 'stone': return <meshStandardMaterial ref={ref} color={color} roughness={0.9} metalness={0} />;
        case 'plastic': default: return <meshStandardMaterial ref={ref} color={color} roughness={0.4} metalness={0.1} emissive={color} emissiveIntensity={0.5 * bloom} />;
    }
});

const CloudVisual = React.memo(({ color }: { color: string }) => {
    // A simple cloud made of a few spheres
    const offsets = useMemo(() => [
        [0,0,0], [0.8, 0.2, 0], [-0.8, 0.1, 0.2], [0, 0.5, 0.3], [0.4, -0.3, -0.2]
    ], []);
    
    return (
        <group>
            {offsets.map((pos, i) => (
                <mesh key={i} position={pos as [number,number,number]} scale={[0.8 + Math.random()*0.4, 0.8 + Math.random()*0.4, 0.8 + Math.random()*0.4]}>
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshStandardMaterial 
                        color={color} 
                        transparent 
                        opacity={0.8} 
                        roughness={1} 
                        depthWrite={false}
                    />
                </mesh>
            ))}
        </group>
    )
});

const SmartObjectDispatcher = React.memo((props: PhysicsObjectType) => {
    const { id, type, position, color, velocity: initVelocity } = props;
    const { settings, cameraBrightness, addCloudRef, removeCloudRef } = useStore();
    
    // Determine Shape and Material
    let shape: ShapeType = settings.objectShape;
    let matType: MaterialType = settings.objectMaterial;
    let radius = 0.5;

    // Type overrides
    if (type === 'liquid') {
        shape = 'sphere';
        matType = 'glass';
        radius = 0.2;
    } else if (type === 'cloud') {
        shape = 'sphere';
        matType = 'plastic'; // Ignored, using custom visual
        radius = 1.5;
    }

    // Physics Hook Selection
    let hookFn: any = useBox;
    let args: any = [1,1,1];

    if (shape === 'sphere' || shape === 'icosahedron' || shape === 'dodecahedron' || type === 'cloud') {
        hookFn = useSphere;
        args = [radius];
    } else if (shape === 'cylinder' || shape === 'pyramid') {
        hookFn = useCylinder;
        args = [0.5, 0.5, 1, 16];
    } else if (shape === 'capsule') {
        hookFn = useSphere; args = [0.5]; 
    } else if (shape === 'torus') {
        hookFn = useBox; args = [1, 0.4, 1];
    }

    const mass = type === 'liquid' ? 0.1 : (type === 'cloud' ? 0.1 : 1);
    const linearDamping = type === 'cloud' ? 0.95 : 0.05;

    const safePosition = useMemo(() => [Number(position[0]), Number(position[1]), Number(position[2])] as [number, number, number], [position]);
    
    const onCollide = (e: any) => {
        if (!e || !e.body) return; // Prevent crash if body is undefined
        if (type === 'cloud') return; 

        const impact = Math.abs(e.contact.impactVelocity);
        if (impact > 1.5) {
             audio.play3D('collide', [0,0,0], settings.soundVolume * Math.min(1, impact/10));
        }
    }

    // @ts-ignore
    const [ref, api] = hookFn(() => ({ 
        mass, 
        position: safePosition, 
        args, 
        onCollide,
        linearDamping,
        velocity: initVelocity || [0,0,0],
        material: { restitution: settings.bounciness, friction: settings.friction },
        allowSleep: true, // HARD OPTIMIZATION: Sleeping bodies save CPU
        sleepSpeedLimit: 0.1,
        sleepTimeLimit: 1
    }));

    // Update phys material dynamically
    useEffect(() => {
        if (api.material) (api.material as any).set({ restitution: settings.bounciness, friction: settings.friction });
    }, [settings.bounciness, settings.friction, api]);

    const isGrabbed = useRef(false);
    const { handData } = useStore();
    const velocity = useRef([0,0,0]);
    useEffect(() => api.velocity.subscribe((v: any) => { velocity.current = v }), [api.velocity]);
    
    // Register Cloud Ref
    useEffect(() => {
        if (type === 'cloud' && ref.current) {
            addCloudRef(id, ref.current);
            return () => removeCloudRef(id);
        }
    }, [id, type, addCloudRef, removeCloudRef]);

    // VISUAL CUE: Ref to the material to update standard material properties
    const materialRef = useRef<any>(null);

    useFrame((state) => {
        // Run logic only if rigid body is active
        if (ref.current) {
            
            // PROXIMITY TINT LOGIC - OPTIMIZED to use Squared Distance
            // Only check if we are not a cloud
            if (type !== 'cloud' && materialRef.current) {
                const cloudRefs = useStore.getState().cloudRefs;
                let minSqDist = Infinity; // Using squared distance to avoid Math.sqrt
                
                _bodyPos.copy(ref.current.position);
                
                // Optimized Loop
                // Getting values from object lookup is fast
                const keys = Object.keys(cloudRefs);
                for (let i = 0; i < keys.length; i++) {
                    const cloud = cloudRefs[keys[i]];
                    if (cloud) {
                        const sqDist = _bodyPos.distanceToSquared(cloud.position);
                        if (sqDist < minSqDist) minSqDist = sqDist;
                    }
                }

                // Threshold 15 -> Squared 225
                if (minSqDist < 225) {
                    const dist = Math.sqrt(minSqDist);
                    const tintFactor = 1 - (Math.max(0, dist - 5) / 10); // 0 to 1
                    const cloudColor = cameraBrightness > 0.5 ? '#ffffff' : '#333333';
                    _targetTint.set(cloudColor);
                    _baseColor.set(color);
                    _tempColor.copy(_baseColor).lerp(_targetTint, tintFactor * 0.9);
                    
                    if (materialRef.current.color) {
                        materialRef.current.color.lerp(_tempColor, 0.1);
                    }
                } else {
                     // Revert to original color
                     _baseColor.set(color);
                     if (materialRef.current.color) {
                         materialRef.current.color.lerp(_baseColor, 0.05);
                     }
                }
            }

            // Grab Logic
            if (handData.present && handData.gesture === GestureType.PINCH) {
                 _bodyPos.copy(ref.current.position); 
                 _handPos.set(handData.worldPosition[0], handData.worldPosition[1], handData.worldPosition[2]);
                 // Distance check
                 const sqDist = _handPos.distanceToSquared(_bodyPos);
                 
                 // Radius 3.5 -> Squared 12.25
                 if (sqDist < 12.25) isGrabbed.current = true;
                 else if (sqDist > 25) isGrabbed.current = false; // Hysteresis release
                 
                 if (isGrabbed.current) {
                     // Spring Physics
                     const stiffness = 150; 
                     const damping = 10;
                     const forceX = (_handPos.x - _bodyPos.x) * stiffness - velocity.current[0] * damping;
                     const forceY = (_handPos.y - _bodyPos.y) * stiffness - velocity.current[1] * damping;
                     const forceZ = (_handPos.z - _bodyPos.z) * stiffness - velocity.current[2] * damping;
                     api.wakeUp(); 
                     api.applyForce([forceX, forceY, forceZ], [0,0,0]); 
                     api.angularDamping.set(0.9); 
                     api.linearDamping.set(0); 
                 }
             } else { 
                 isGrabbed.current = false; 
             }
             
             if (handData.gesture === GestureType.CLOSED_FIST && !isGrabbed.current) { 
                 api.linearDamping.set(0.99); api.angularDamping.set(0.99); 
             } else if (!isGrabbed.current) { 
                 // Reset damping
                 api.linearDamping.set(type === 'cloud' ? 0.95 : 0.05); 
                 api.angularDamping.set(0.05); 
             }
    
             // VISUAL CUE LOGIC (Emissive)
             if (materialRef.current) {
                 const baseEmissiveIntensity = (matType === 'neon') ? 2 * settings.bloomIntensity : 0.2 * settings.bloomIntensity;
                 const targetIntensity = isGrabbed.current ? 4.0 : baseEmissiveIntensity;
                 materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(materialRef.current.emissiveIntensity, targetIntensity, 0.2);
                 
                 if (isGrabbed.current) {
                     materialRef.current.emissive.lerp(new THREE.Color("#ffffff"), 0.1);
                 } else {
                     materialRef.current.emissive.lerp(new THREE.Color(color), 0.1);
                 }
             }
        }
    });

    if (type === 'cloud') {
         const cloudHex = cameraBrightness > 0.5 ? '#ffffff' : '#333333';
         return (
             <mesh ref={ref as any} castShadow receiveShadow>
                 <CloudVisual color={cloudHex} />
             </mesh>
         );
    }

    return (
        <mesh ref={ref as any} castShadow receiveShadow>
            <VisualGeometry shape={shape} args={args} />
            <MaterialFactory ref={materialRef} color={color} type={matType} bloom={settings.bloomIntensity} />
        </mesh>
    );
});

// --- RIG & CAMERA ---

const Bone: React.FC<{ start: number[], end: number[], material: THREE.MeshStandardMaterial }> = ({ start, end, material }) => {
    const ref = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (ref.current) {
            _vec3.set(start[0], start[1], start[2]);
            _vec3_2.set(end[0], end[1], end[2]);
            const dist = _vec3.distanceTo(_vec3_2);
            // Midpoint
            ref.current.position.copy(_vec3).add(_vec3_2).multiplyScalar(0.5);
            ref.current.lookAt(_vec3_2);
            ref.current.rotateX(Math.PI / 2);
            ref.current.scale.set(1, dist * 0.85, 1);
        }
    });
    return (
        <mesh ref={ref} castShadow receiveShadow material={material}>
            <cylinderGeometry args={[0.22, 0.22, 1, 12]} />
        </mesh>
    );
};

// IMPROVED HAND PHYSICS: Kinematic Velocity
const PhysicsJoint: React.FC<{ index: number, material: THREE.Material }> = ({ index, material }) => {
    const { handData, settings } = useStore();
    const [ref, api] = useSphere(() => ({ 
        type: 'Kinematic', 
        args: [0.25], 
        position: [0, -100, 0],
        userData: { isHand: true } 
    }));
    
    // Store previous position for velocity calculation
    const prevPos = useRef(new THREE.Vector3(0, -100, 0));

    useFrame((state, delta) => {
        if (handData.present && handData.rigLandmarks[index]) {
            const [x, y, z] = handData.rigLandmarks[index];
            _targetColor.set(x,y,z); // Reuse as vector target
            
            const alpha = Math.max(0.1, settings.handTrackingSpeed); 
            // Lerp current conceptual position
            prevPos.current.lerp(_targetColor as unknown as THREE.Vector3, alpha);
            
            // Set Physics Position
            api.position.set(prevPos.current.x, prevPos.current.y, prevPos.current.z);
            
            // Calculate Velocity manually so dynamic objects react to the hand moving
            // Velocity = (Current - Previous) / TimeDelta
            if (delta > 0) {
                // Approximate velocity for impact
                // Since we lerped, prevPos is effectively "current"
                // This part is tricky with lerp, but generally we want to impart force
                // We set velocity to 0 effectively because Kinematic bodies move via position
                // However, setting velocity helps collision solvers sometimes
                api.velocity.set(
                    (x - prevPos.current.x) * 10,
                    (y - prevPos.current.y) * 10,
                    (z - prevPos.current.z) * 10
                );
            }
        } else {
            api.position.set(0, -100, 0);
            prevPos.current.set(0, -100, 0);
        }
    });

    return (
        <mesh ref={ref as any} castShadow receiveShadow material={material}>
            <sphereGeometry args={[0.22]} />
        </mesh>
    );
};

const SphereHandRig = React.memo(() => {
    const { handData, settings } = useStore();
    const jointIndices = useMemo(() => Array.from({ length: 21 }, (_, i) => i), []);
    const connections = useMemo(() => [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20]], []);
    
    // Updated Material: ToneMapped false allows colors to exceed 1.0 (blooming)
    const handMaterial = useMemo(() => new THREE.MeshStandardMaterial({ 
        roughness: 0.3, 
        metalness: 0.8,
        toneMapped: false 
    }), []);

    useFrame(() => {
        if (!handData.present) return;
        
        let targetColor = "#00ffff"; 
        if (settings.particleEffect === 'fire') targetColor = "#ff4400";
        if (settings.particleEffect === 'water') targetColor = "#0088ff";

        // Fix: Use gesture directly for stable checking instead of raw metric
        const isInteracting = handData.gesture === GestureType.PINCH;
        const isAction = handData.gesture !== GestureType.NONE && handData.gesture !== GestureType.OPEN_PALM;

        if (isInteracting) {
            targetColor = "#FFD700"; // GOLD
        }

        _targetColor.set(targetColor);
        // Faster lerp for interaction response
        handMaterial.color.lerp(_targetColor, isInteracting ? 0.4 : 0.1);
        
        // Massive emissive boost when interacting for proper yellow glow
        const targetEmissive = isInteracting ? 4.0 : (isAction ? 1.0 : 0.5);
        _currentEmit.set(targetColor);
        
        handMaterial.emissive.lerp(_currentEmit, isInteracting ? 0.4 : 0.1);
        handMaterial.emissiveIntensity = THREE.MathUtils.lerp(handMaterial.emissiveIntensity, targetEmissive, isInteracting ? 0.4 : 0.1);
    });

    if (!handData.present) return null;

    return (
        <group>
            {jointIndices.map((i) => (
                <PhysicsJoint key={`j-${i}`} index={i} material={handMaterial} />
            ))}
            {connections.map(([startIdx, endIdx], i) => (
                <Bone key={`b-${i}`} start={handData.rigLandmarks[startIdx]} end={handData.rigLandmarks[endIdx]} material={handMaterial} />
            ))}
        </group>
    );
});

const HeadTrackingCamera = () => {
    const { faceData, isCameraSwitching, handData, cameraResetTrigger, settings } = useStore();
    const { camera } = useThree();
    const introTime = useRef(0);
    const hasIntroFinished = useRef(false);

    useEffect(() => {
        if (cameraResetTrigger > 0) {
            introTime.current = 0;
            hasIntroFinished.current = false;
        }
    }, [cameraResetTrigger]);

    useFrame((state, delta) => {
        if (!hasIntroFinished.current) {
            introTime.current += delta;
            const t = Math.min(introTime.current / 2.5, 1);
            const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            _vec3.set(0, 30, 60).lerp(_vec3_2.set(0, 5, 18), ease);
            camera.position.copy(_vec3); camera.lookAt(0, 0, 0);
            if (t >= 1) hasIntroFinished.current = true;
            return;
        }

        const isTimeDilation = handData.gesture === GestureType.CLOSED_FIST;
        const targetFov = isTimeDilation ? 35 : 45; 
        const pCamera = camera as THREE.PerspectiveCamera;
        if (pCamera.isPerspectiveCamera) {
            pCamera.fov = THREE.MathUtils.lerp(pCamera.fov, targetFov, 0.1);
            pCamera.updateProjectionMatrix();
        }

        if (isCameraSwitching) {
             const time = state.clock.elapsedTime;
             camera.position.set(Math.sin(time * 20) * 20, 5, Math.cos(time * 20) * 20);
             camera.lookAt(0,0,0);
        } else {
            // Updated: Removed Hand Pan logic. Only Head Tracking controls camera now.
            let targetX = 0; let targetY = 5;
            
            const panMult = settings.headPanSensitivity * 4; 
            const rotMult = settings.headRotationSensitivity * 0.5;
            
            if (faceData.present) {
                targetX = faceData.position.x * panMult; 
                targetY = 5 + faceData.position.y * panMult;
            }
            
            _vec3.set(targetX, targetY, 18);
            camera.position.lerp(_vec3, 0.05); 
            
            if (faceData.present) {
                const rotY = -faceData.position.x * rotMult * 0.5; // Inverted Horizontal Rotation
                const rotX = faceData.position.y * rotMult; // Inverted Pitch from last turn (no negative sign)
                const baseRotX = -0.27; 
                
                camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, baseRotX + rotX, 0.1);
                camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, rotY, 0.1);
                camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, 0, 0.1);
            } else {
                 const defaultLookAt = _vec3_2.set(0, 0, 0);
                 const dummyCam = _dummyObj;
                 dummyCam.position.copy(camera.position);
                 dummyCam.lookAt(defaultLookAt);
                 camera.quaternion.slerp(dummyCam.quaternion, 0.05);
            }

            audio.updateDrone(camera.position.distanceTo(_vec3) * 10);
        }
    });
    return null;
}

const GameLogic = () => {
    const { handData, addObject, settings, clearObjects } = useStore();
    const [lastSpawnTime, setLastSpawnTime] = useState(0);
    const [lastClearTime, setLastClearTime] = useState(0);
    const wasPresent = useRef(false);

    useFrame((state) => {
        if (useStore.getState().isPaused) return;

        const now = state.clock.elapsedTime;
        if (handData.present && !wasPresent.current) { audio.play3D('connect', [0,0,0], settings.soundVolume); wasPresent.current = true; } 
        else if (!handData.present && wasPresent.current) { wasPresent.current = false; }
        
        if (!handData.present) return;
        const [hx, hy, hz] = handData.worldPosition; 
        
        // POINTING: Spawn
        if (handData.gesture === GestureType.POINTING) {
            // FIXED: Relaxed rate limiting slightly to ensure action is taken
            if (now - lastSpawnTime > 0.12) {
                const pos: [number,number,number] = [hx, hy - 1, hz];
                // Ensure velocity is undefined if not used
                addObject('box', pos, undefined); 
                audio.play3D('spawn', pos, settings.soundVolume); 
                setLastSpawnTime(now);
            }
        }
        
        // PINKY: Clear Objects (With Debounce)
        if (handData.gesture === GestureType.PINKY_UP) {
            if (now - lastClearTime > 1.5) {
                clearObjects();
                audio.play3D('trash', [0,0,0], 1);
                setLastClearTime(now);
            }
        }
        
        // PEACE: Liquid
        if (handData.gesture === GestureType.PEACE) {
            if (Math.random() > 0.7) addObject('liquid', [hx + (Math.random()-0.5), hy - 1, hz + (Math.random()-0.5)]);
        }
    });
    return null;
};

// --- MAIN SCENE ---

const PostProcessing = () => {
    const { settings, isCameraSwitching, handData } = useStore();
    const abRef = useRef<any>(null);

    useFrame((state) => {
        if (abRef.current) {
           const glitch = isCameraSwitching ? 0.05 : 0;
           const manual = settings.chromaticAberration * 0.2; 
           const breathing = Math.sin(state.clock.elapsedTime * 2) * 0.001;
           const final = glitch + manual + breathing;
           abRef.current.offset.set(final, final);
        }
    });
    
    if (!settings.enableEffects) return null;
  
    return (
        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.6} mipmapBlur intensity={settings.bloomIntensity} radius={0.5} />
          <Vignette eskil={false} offset={0.1} darkness={settings.vignetteIntensity} />
          <ChromaticAberration ref={abRef} offset={new THREE.Vector2(0.005, 0.005)} radialModulation={true} modulationOffset={0.7} />
          {settings.filmGrain > 0 ? <Noise opacity={settings.filmGrain} /> : null}
          {settings.scanlineIntensity > 0 ? <Scanline density={1.25} opacity={settings.scanlineIntensity} /> : null}
        </EffectComposer>
    );
};

const PhysicsScene: React.FC = () => {
  const { objects, handData, settings, isPaused } = useStore();
  const isSlowMo = handData.gesture === GestureType.CLOSED_FIST;
  const physicsStep = (1 / 60) * settings.timeScale;
  
  const bgColor = useMemo(() => {
      switch(settings.environment) {
          case 'void': return '#000000';
          case 'vaporwave': return '#2d004d';
          case 'matrix': return '#001100';
          case 'white_room': return '#ffffff';
          case 'midnight': return '#050510';
          case 'sunset': return '#331111';
          case 'toxic': return '#1a2010';
          case 'gold': return '#443300';
          case 'ice': return '#e0f0ff';
          case 'desert': return '#eebb88';
          case 'forest': return '#0a1a0a';
          case 'lava': return '#220000';
          default: return '#0a0014';
      }
  }, [settings.environment]);

  const gravity: [number,number,number] = [0, isSlowMo ? settings.gravity * 0.1 : settings.gravity, 0];

  return (
    <Canvas 
        shadows 
        dpr={[1, 1.5]} 
        camera={{ position: [0, 20, 50], fov: 45 }}
        gl={{ powerPreference: "high-performance" }}
        frameloop={isPaused ? 'never' : 'always'}
    >
      <color attach="background" args={[bgColor]} />
      <HeadTrackingCamera />
      <ambientLight intensity={0.6} />
      <spotLight position={[10, 20, 10]} angle={0.5} penumbra={1} intensity={2} castShadow shadow-bias={-0.0001} />
      <pointLight position={[-10, 5, -10]} intensity={1.5} color="cyan" />
      <pointLight position={[10, 5, -10]} intensity={1.5} color="purple" />
      
      {/* HARD OPTIMIZATION: Broadphase SAP (Sweep and Prune) is O(N log N), much faster than default Naive O(N^2) for many objects */}
      <Physics 
        broadphase="SAP"
        isPaused={isPaused} 
        gravity={gravity} 
        stepSize={physicsStep} 
        defaultContactMaterial={{ restitution: settings.bounciness, friction: settings.friction }}
      >
        <Boundaries />
        <EnvironmentManager />
        <SphereHandRig />
        <HandDropShadow />
        <GameLogic />
        {objects.map((obj) => <SmartObjectDispatcher key={obj.id} {...obj} />)}
      </Physics>
      <PostProcessing />
    </Canvas>
  );
};

export default PhysicsScene;
