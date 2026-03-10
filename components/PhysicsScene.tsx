
/// <reference lib="dom" />
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
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

// --- TRACKING VOLUME BORDER ---
const TrackingVolume = () => {
    const boxColor = '#ff3b30'; // Mandatory Red 💉
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);

    useFrame((state) => {
        if (materialRef.current) {
            // Subtle pulse on the fill, adjusted for better visibility
            const pulse = 0.12 + Math.sin(state.clock.elapsedTime * 2) * 0.04;
            materialRef.current.opacity = pulse;
            materialRef.current.emissiveIntensity = 0.4 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
        }
    });

    return (
        <group>
            {/* Main Transparent Volume Box with more distinct fill */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[35, 20, 15]} />
                <meshStandardMaterial
                    ref={materialRef}
                    color={boxColor}
                    transparent
                    opacity={0.15}
                    side={THREE.DoubleSide}
                    roughness={0}
                    metalness={0.8}
                    emissive={boxColor}
                    emissiveIntensity={0.6}
                    depthWrite={false}
                />
            </mesh>
            {/* Inner Glow Border */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[35, 20, 15]} />
                <meshBasicMaterial color={boxColor} wireframe transparent opacity={0.2} />
            </mesh>
            {/* Thick Corners for Minecraft Vibe */}
            {[-1, 1].map(x => [-1, 1].map(y => [-1, 1].map(z => (
                <group key={`${x}-${y}-${z}`} position={[17.5 * x, 10 * y, 7.5 * z]}>
                    <mesh scale={[1.5, 0.15, 0.15]}>
                        <boxGeometry />
                        <meshBasicMaterial color={boxColor} transparent opacity={0.2} />
                    </mesh>
                    <mesh scale={[0.15, 1.5, 0.15]}>
                        <boxGeometry />
                        <meshBasicMaterial color={boxColor} transparent opacity={0.2} />
                    </mesh>
                    <mesh scale={[0.15, 0.15, 1.5]}>
                        <boxGeometry />
                        <meshBasicMaterial color={boxColor} transparent opacity={0.2} />
                    </mesh>
                </group>
            ))))}        </group>
    );
};

// --- HAND DROP SHADOW ---
const HandDropShadow = ({ index }: { index: number }) => {
    const hand = useStore(s => s.hands[index]);
    const shadowRef = useRef<THREE.Mesh>(null);

    useFrame(() => {
        if (!shadowRef.current) return;
        
        if (hand?.present) {
            shadowRef.current.position.set(hand.worldPosition[0], -5.95, hand.worldPosition[2]);
            shadowRef.current.visible = true;
            const height = hand.worldPosition[1] - (-6);
            const scale = 1 + (Math.max(0, height) * 0.15);
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

// --- GAME OF LIFE (ULTRA OPTIMIZED) ---
const GameOfLifeFloor = () => {
    const hands = useStore(s => s.hands);
    const rows = 30;
    const cols = 30;
    const count = rows * cols;
    const meshRef = useRef<THREE.InstancedMesh>(null);
    
    // Dual buffers for zero-allocation simulation
    const [grid] = useState(() => ({
        current: new Uint8Array(count),
        next: new Uint8Array(count)
    }));
    
    const lastUpdate = useRef(0);

    useEffect(() => {
        for(let i=0; i<count; i++) grid.current[i] = Math.random() > 0.8 ? 1 : 0;
    }, []);

    useFrame((state) => {
        if (!meshRef.current) return;
        const now = state.clock.elapsedTime;
        
        let newLifeIndices: number[] = [];
        hands.forEach(hand => {
            if (hand.present) {
                const hx = hand.worldPosition[0];
                const hz = hand.worldPosition[2];
                const gx = Math.floor((hx + 30) / 2);
                const gz = Math.floor((hz + 30) / 2);
                if (gx >= 0 && gx < cols && gz >= 0 && gz < rows) {
                    newLifeIndices.push(gz * cols + gx);
                }
            }
        });

        if (now - lastUpdate.current > 0.1) {
            lastUpdate.current = now;
            const { current, next } = grid;
            
            for (let i = 0; i < count; i++) {
                const r = (i / cols) | 0;
                const c = i % cols;
                let neighbors = 0;
                
                // Efficient neighbor check with boundary protection
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                            if (current[nr * cols + nc]) neighbors++;
                        }
                    }
                }

                const isAlive = current[i] === 1;
                next[i] = (isAlive ? (neighbors === 2 || neighbors === 3) : (neighbors === 3)) ? 1 : 0;
                if (newLifeIndices.includes(i)) next[i] = 1;
            }
            // Swap buffers
            current.set(next);
        }

        const black = new THREE.Color('#111111');
        const aliveColor = new THREE.Color();
        
        for (let i = 0; i < count; i++) {
            const isAlive = grid.current[i] === 1;
            const targetY = isAlive ? -5 : -6.5; 
            
            _dummyObj.position.set(((i % cols) * 2) - 30, targetY, ((i / cols | 0) * 2) - 30);
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
    const settings = useStore(s => s.settings);
    
    // Memoize the background planes and grids to avoid reconstruction
    const environmentContent = useMemo(() => {
        if (settings.gameOfLife) return <GameOfLifeFloor />;
        
        switch(settings.environment) {
            case 'void': return <gridHelper args={[100, 10]} position={[0,-6,0]} visible={false} />;
            case 'grid': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#222" />
                    </mesh>
                    <Grid infiniteGrid sectionColor="#555" cellColor="#333" position={[0, 0.01, 0]} />
                </group>
            );
            case 'vaporwave': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                        <planeGeometry args={[400,400]} />
                        <meshStandardMaterial color="#2d004d" />
                    </mesh>
                    <Grid infiniteGrid sectionColor="#ff00ff" cellColor="#00ffff" sectionSize={10} cellSize={2} position={[0, 0.01, 0]} />
                    <ambientLight intensity={2} color="#ff00ff" />
                </group>
            );
            case 'matrix': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#001100" />
                    </mesh>
                    <Grid infiniteGrid sectionColor="#00ff00" cellColor="#003300" sectionSize={5} cellSize={1} position={[0, 0.01, 0]} />
                    <fog attach="fog" args={['#002200', 5, 50]} />
                </group>
            );
            case 'white_room': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#e0e0e0" roughness={0.1} />
                    </mesh>
                    <Grid infiniteGrid sectionColor="#ccc" cellColor="#f0f0f0" position={[0, 0.01, 0]} />
                    <ambientLight intensity={0.8} />
                </group>
            );
            case 'midnight': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#050510" />
                    </mesh>
                    <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
                    <fog attach="fog" args={['#050510', 10, 80]} />
                </group>
            );
            case 'sunset': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#331111" />
                    </mesh>
                    <Sky sunPosition={[100, 10, 100]} turbidity={10} rayleigh={3} />
                    <ambientLight intensity={0.5} color="#ffaa00" />
                </group>
            );
            case 'toxic': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#1a2010" />
                    </mesh>
                    <fog attach="fog" args={['#204010', 0, 60]} />
                    <Grid infiniteGrid sectionColor="#40ff00" cellColor="#104000" position={[0, 0.01, 0]} />
                </group>
            );
            case 'gold': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#443300" metalness={0.8} roughness={0.2} />
                    </mesh>
                    <Environment preset="city" />
                    <Grid infiniteGrid sectionColor="#ffd700" cellColor="#554400" position={[0, 0.01, 0]} />
                </group>
            );
            case 'ice': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#88ccff" metalness={0.5} roughness={0.1} />
                    </mesh>
                    <fog attach="fog" args={['#e0f0ff', 10, 100]} />
                    <Sparkles count={300} scale={50} size={4} speed={0.2} opacity={0.5} color="#ffffff" />
                </group>
            );
            case 'desert': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#eebb88" roughness={1} />
                    </mesh>
                    <Sky sunPosition={[10, 50, 10]} turbidity={5} rayleigh={1} mieCoefficient={0.005} />
                    <fog attach="fog" args={['#eebb88', 20, 100]} />
                </group>
            );
            case 'forest': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#1a2b1a" roughness={0.8} />
                    </mesh>
                    <fog attach="fog" args={['#0a1a0a', 5, 40]} />
                    <Sparkles count={100} scale={20} size={2} speed={0.5} opacity={0.6} color="#55ff55" />
                </group>
            );
            case 'lava': return (
                <group position={[0,-6,0]}>
                    <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0, -0.01, 0]}>
                        <planeGeometry args={[200,200]} />
                        <meshStandardMaterial color="#200000" />
                    </mesh>
                    <Grid infiniteGrid sectionColor="#ff2200" cellColor="#440000" position={[0, 0.01, 0]} />
                    <Sparkles count={200} scale={30} size={6} speed={2} opacity={0.8} color="#ff4400" />
                    <fog attach="fog" args={['#220000', 5, 60]} />
                </group>
            );
            default: return null;
        }
    }, [settings.environment, settings.gameOfLife]);

    return <group>{environmentContent}</group>;
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
    const settings = useStore(s => s.settings);
    const cameraBrightness = useStore(s => s.cameraBrightness);
    const addCloudRef = useStore(s => s.addCloudRef);
    const removeCloudRef = useStore(s => s.removeCloudRef);
    
    // Determine Shape and Material
    const { shape, matType, radius } = useMemo(() => {
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
        return { shape, matType, radius };
    }, [type, settings.objectShape, settings.objectMaterial]);

    // Physics Hook Selection
    const { hookFn, args } = useMemo(() => {
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
        return { hookFn, args };
    }, [shape, type, radius]);

    const mass = type === 'liquid' ? 0.1 : (type === 'cloud' ? 0.1 : 1);
    const linearDamping = type === 'cloud' ? 0.95 : 0.05;

    const safePosition = useMemo(() => [Number(position[0]), Number(position[1]), Number(position[2])] as [number, number, number], [position]);
    
    const onCollide = useCallback((e: any) => {
        if (!e || !e.body) return; // Prevent crash if body is undefined
        if (type === 'cloud') return; 

        const impact = Math.abs(e.contact.impactVelocity);
        if (impact > 1.2) {
             audio.play3D('collide', [0,0,0], settings.soundVolume * Math.min(1, impact/8));
             
             // Visual impact feedback
             if (materialRef.current) {
                 materialRef.current.emissiveIntensity = 2.0;
             }
        }
    }, [type, settings.soundVolume]);

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
    }), [mass, safePosition, args, onCollide, linearDamping, initVelocity, settings.bounciness, settings.friction]);

    // Update phys material dynamically
    useEffect(() => {
        if (api.material) (api.material as any).set({ restitution: settings.bounciness, friction: settings.friction });
    }, [settings.bounciness, settings.friction, api]);

    const isGrabbed = useRef(false);
    const grabbingHandIdx = useRef<number>(-1);
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
            // PULLED DIRECTLY FROM STORE FOR 0-LATENCY 💅
            const hands = useStore.getState().hands;
            
            // PROXIMITY TINT LOGIC - OPTIMIZED
            if (type !== 'cloud' && materialRef.current) {
                const cloudRefs = useStore.getState().cloudRefs;
                const cloudKeys = Object.keys(cloudRefs);
                
                if (cloudKeys.length > 0) {
                    let minSqDist = Infinity; 
                    _bodyPos.copy(ref.current.position);
                    
                    for (let i = 0; i < cloudKeys.length; i++) {
                        const cloud = cloudRefs[cloudKeys[i]];
                        if (cloud) {
                            const sqDist = _bodyPos.distanceToSquared(cloud.position);
                            if (sqDist < minSqDist) minSqDist = sqDist;
                        }
                    }

                    // Threshold 12 -> Squared 144
                    if (minSqDist < 144) {
                        const dist = Math.sqrt(minSqDist);
                        const tintFactor = 1 - (Math.max(0, dist - 3) / 9); // 0 to 1
                        const cloudColor = cameraBrightness > 0.5 ? '#ffffff' : '#333333';
                        _targetTint.set(cloudColor);
                        _baseColor.set(color);
                        _tempColor.copy(_baseColor).lerp(_targetTint, tintFactor * 0.85);
                        
                        materialRef.current.color.lerp(_tempColor, 0.15);
                    } else {
                         _baseColor.set(color);
                         materialRef.current.color.lerp(_baseColor, 0.08);
                    }
                } else {
                     // No clouds, ensure original color
                     _baseColor.set(color);
                     if (materialRef.current.color.getHex() !== _baseColor.getHex()) {
                         materialRef.current.color.lerp(_baseColor, 0.08);
                     }
                }
            }

            // Grab Logic - reworked for absolute clinginess 💅
            let currentGrabbingHand = grabbingHandIdx.current !== -1 ? hands[grabbingHandIdx.current] : null;
            
            // If not grabbed, look for a hand to grab with
            if (!isGrabbed.current) {
                for (let i = 0; i < hands.length; i++) {
                    const hand = hands[i];
                    if (hand.present && hand.gesture === GestureType.PINCH) {
                        _bodyPos.copy(ref.current.position); 
                        _handPos.set(hand.worldPosition[0], hand.worldPosition[1], hand.worldPosition[2]);
                        const sqDist = _handPos.distanceToSquared(_bodyPos);
                        if (sqDist < 35) {
                            isGrabbed.current = true;
                            grabbingHandIdx.current = i;
                            currentGrabbingHand = hand;
                            audio.play3D('grab', hand.worldPosition, settings.soundVolume);
                            break;
                        }
                    }
                }
            }

            if (isGrabbed.current && currentGrabbingHand && currentGrabbingHand.present && currentGrabbingHand.gesture === GestureType.PINCH) {
                api.wakeUp();
                _bodyPos.copy(ref.current.position); 
                _handPos.set(currentGrabbingHand.worldPosition[0], currentGrabbingHand.worldPosition[1], currentGrabbingHand.worldPosition[2]);
                
                // PD Controller for smooth, forceful grabbing 🧲
                const stiffness = 200; // Spring strength
                const damping = 10;   // Resistance to oscillation
                
                const forceX = (_handPos.x - _bodyPos.x) * stiffness;
                const forceY = (_handPos.y - _bodyPos.y) * stiffness;
                const forceZ = (_handPos.z - _bodyPos.z) * stiffness;
                
                const dampX = -velocity.current[0] * damping;
                const dampY = -velocity.current[1] * damping;
                const dampZ = -velocity.current[2] * damping;
                
                api.applyForce(
                    [forceX + dampX, forceY + dampY, forceZ + dampZ],
                    [_bodyPos.x, _bodyPos.y, _bodyPos.z] 
                );
                
                api.velocity.set(
                    velocity.current[0] * 0.8 + currentGrabbingHand.velocity[0] * 0.2,
                    velocity.current[1] * 0.8 + currentGrabbingHand.velocity[1] * 0.2,
                    velocity.current[2] * 0.8 + currentGrabbingHand.velocity[2] * 0.2
                );

                api.angularDamping.set(0.9); 
                api.linearDamping.set(0.1); 
            } else if (isGrabbed.current) {
                // Release logic
                if (currentGrabbingHand) {
                    const flingVel = [
                        velocity.current[0] + currentGrabbingHand.velocity[0] * 1.5,
                        velocity.current[1] + currentGrabbingHand.velocity[1] * 1.5,
                        velocity.current[2] + currentGrabbingHand.velocity[2] * 1.5
                    ];
                    api.velocity.set(flingVel[0], flingVel[1], flingVel[2]);
                    
                    const speed = Math.sqrt(flingVel[0]**2 + flingVel[1]**2 + flingVel[2]**2);
                    if (speed > 10) {
                        audio.play3D('fling', currentGrabbingHand.worldPosition, settings.soundVolume);
                    } else {
                        audio.play3D('release', currentGrabbingHand.worldPosition, settings.soundVolume);
                    }
                }
                isGrabbed.current = false; 
                grabbingHandIdx.current = -1;
            }
             
            // SLOW MO (CLOSED FIST) check for ANY hand
            const isAnySlowMo = hands.some(h => h.present && h.gesture === GestureType.CLOSED_FIST);
            if (isAnySlowMo && !isGrabbed.current) { 
                 api.linearDamping.set(0.99); api.angularDamping.set(0.99); 
            } else if (!isGrabbed.current) { 
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
const PhysicsJoint: React.FC<{ handIdx: number, index: number, material: THREE.Material }> = ({ handIdx, index, material }) => {
    const hand = useStore(s => s.hands[handIdx]);
    const settings = useStore(s => s.settings);
    const [ref, api] = useSphere(() => ({ 
        type: 'Kinematic', 
        args: [0.25], 
        position: [0, -100, 0],
        userData: { isHand: true } 
    }));
    
    // Store previous position for velocity calculation
    const prevPos = useRef(new THREE.Vector3(0, -100, 0));

    useFrame((state, delta) => {
        if (hand?.present && hand.rigLandmarks[index]) {
            const [x, y, z] = hand.rigLandmarks[index];
            _targetColor.set(x,y,z); // Reuse as vector target
            
            const alpha = Math.max(0.1, settings.handTrackingSpeed); 
            // Lerp current conceptual position
            prevPos.current.lerp(_targetColor as unknown as THREE.Vector3, alpha);
            
            // Set Physics Position
            api.position.set(prevPos.current.x, prevPos.current.y, prevPos.current.z);
            
            if (delta > 0) {
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

const SphereHandRig = React.memo(({ index }: { index: number }) => {
    const hand = useStore(s => s.hands[index]);
    const settings = useStore(s => s.settings);
    const jointIndices = useMemo(() => Array.from({ length: 21 }, (_, i) => i), []);
    const connections = useMemo(() => [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20]], []);
    
    // Updated Material: ToneMapped false allows colors to exceed 1.0 (blooming)
    const handMaterial = useMemo(() => new THREE.MeshStandardMaterial({ 
        roughness: 0.3, 
        metalness: 0.8,
        toneMapped: false 
    }), []);

    useFrame(() => {
        if (!hand?.present) return;
        
        let targetColor = hand.color || "#00ffff"; 
        
        // Interaction Overrides
        const isInteracting = hand.gesture === GestureType.PINCH;
        const isAction = hand.gesture !== GestureType.NONE && hand.gesture !== GestureType.OPEN_PALM;

        if (isInteracting) {
            targetColor = "#FFD700"; // GOLD
        }

        _targetColor.set(targetColor);
        handMaterial.color.lerp(_targetColor, isInteracting ? 0.4 : 0.1);
        
        const targetEmissive = isInteracting ? 4.0 : (isAction ? 1.0 : 0.5);
        _currentEmit.set(targetColor);
        
        handMaterial.emissive.lerp(_currentEmit, isInteracting ? 0.4 : 0.1);
        handMaterial.emissiveIntensity = THREE.MathUtils.lerp(handMaterial.emissiveIntensity, targetEmissive, isInteracting ? 0.4 : 0.1);
    });

    if (!hand?.present) return null;

    return (
        <group>
            {jointIndices.map((i) => (
                <PhysicsJoint key={`j-${i}-${index}`} handIdx={index} index={i} material={handMaterial} />
            ))}
            {connections.map(([startIdx, endIdx], i) => (
                <Bone key={`b-${i}-${index}`} start={hand.rigLandmarks[startIdx]} end={hand.rigLandmarks[endIdx]} material={handMaterial} />
            ))}
        </group>
    );
});

const HeadTrackingCamera = () => {
    const faceData = useStore(s => s.faceData);
    const isCameraSwitching = useStore(s => s.isCameraSwitching);
    const hands = useStore(s => s.hands);
    const cameraResetTrigger = useStore(s => s.cameraResetTrigger);
    const settings = useStore(s => s.settings);
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

        const isAnyTimeDilation = hands.some(h => h.present && h.gesture === GestureType.CLOSED_FIST);
        const targetFov = isAnyTimeDilation ? 35 : 45; 
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
                const rotY = -faceData.position.x * rotMult * 0.5;
                const rotX = faceData.position.y * rotMult;
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
    const hands = useStore(s => s.hands);
    const addObject = useStore(s => s.addObject);
    const settings = useStore(s => s.settings);
    const clearObjects = useStore(s => s.clearObjects);
    
    // Optimized: Use refs for timers to avoid React state overhead in 60fps loop
    const lastSpawnTimes = useRef<Record<number, number>>({});
    const lastClearTime = useRef(0);
    const wasPresent = useRef<Record<number, boolean>>({});

    useFrame((state) => {
        if (useStore.getState().isPaused) return;

        const now = state.clock.elapsedTime;
        
        hands.forEach((hand, idx) => {
            if (hand.present && !wasPresent.current[idx]) { 
                audio.play3D('connect', [0,0,0], settings.soundVolume); 
                wasPresent.current[idx] = true; 
            } else if (!hand.present && wasPresent.current[idx]) { 
                audio.play3D('disconnect', [0,0,0], settings.soundVolume); 
                wasPresent.current[idx] = false; 
            }
            
            if (!hand.present) return;
            const [hx, hy, hz] = hand.worldPosition; 
            
            // POINTING: Spawn
            if (hand.gesture === GestureType.POINTING) {
                const lastSpawn = lastSpawnTimes.current[idx] || 0;
                if (now - lastSpawn > 0.12) {
                    const pos: [number,number,number] = [hx, hy - 1, hz];
                    addObject('box', pos, undefined); 
                    audio.play3D('spawn', pos, settings.soundVolume); 
                    lastSpawnTimes.current[idx] = now;
                }
            }
            
            // PINKY: Clear Objects (With Debounce)
            if (hand.gesture === GestureType.PINKY_UP) {
                if (now - lastClearTime.current > 1.5) {
                    clearObjects();
                    audio.play3D('trash', [0,0,0], 1);
                    lastClearTime.current = now;
                }
            }
            
            // PEACE: Liquid
            if (hand.gesture === GestureType.PEACE) {
                if (Math.random() > 0.7) {
                    const pos: [number,number,number] = [hx + (Math.random()-0.5), hy - 1, hz + (Math.random()-0.5)];
                    addObject('liquid', pos);
                    audio.play3D('crackle', pos, settings.soundVolume * 0.5);
                }
            }
        });
    });
    return null;
};

// --- MAIN SCENE ---

const PostProcessing = () => {
    const settings = useStore(s => s.settings);
    const isCameraSwitching = useStore(s => s.isCameraSwitching);
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
          {/* Casting to any to avoid strict 'ReactElement' type check for null/false values */}
          {(settings.filmGrain > 0 ? <Noise opacity={settings.filmGrain} /> : null) as any}
          {(settings.scanlineIntensity > 0 ? <Scanline density={1.25} opacity={settings.scanlineIntensity} /> : null) as any}
        </EffectComposer>
    );
};

const PhysicsScene: React.FC = () => {
  const objects = useStore(s => s.objects);
  const hands = useStore(s => s.hands);
  const settings = useStore(s => s.settings);
  const isPaused = useStore(s => s.isPaused);
  const isAnySlowMo = hands.some(h => h.present && h.gesture === GestureType.CLOSED_FIST);
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

  const gravity: [number,number,number] = [0, isAnySlowMo ? settings.gravity * 0.1 : settings.gravity, 0];

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
      
      <Physics 
        broadphase="SAP"
        isPaused={isPaused} 
        gravity={gravity} 
        stepSize={physicsStep} 
        defaultContactMaterial={{ restitution: settings.bounciness, friction: settings.friction }}
      >
        <Boundaries />
        <EnvironmentManager />
        <TrackingVolume />
        {hands.map((_, idx) => (
            <React.Fragment key={idx}>
                <SphereHandRig index={idx} />
                <HandDropShadow index={idx} />
            </React.Fragment>
        ))}
        <GameLogic />
        {objects.map((obj) => <SmartObjectDispatcher key={obj.id} {...obj} />)}
      </Physics>
      <PostProcessing />
    </Canvas>
  );
};

export default PhysicsScene;
