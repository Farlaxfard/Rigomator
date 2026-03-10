
/// <reference lib="dom" />
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { useStore } from '../store';
import { GestureType, GestureMetrics } from '../types';

// Helper for squared distance (no Math.pow for speed)
const distSq = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const dz = z1 - z2;
    return dx * dx + dy * dy + dz * dz;
};

// Helper for deep equality check on small objects
const isSamePos = (a: any, b: any, threshold = 0.01) => {
    if (!a || !b) return a === b;
    return Math.abs(a.x - b.x) < threshold && Math.abs(a.y - b.y) < threshold;
};

/**
 * HandManager Component
 * Optimized for minimal garbage collection and stable tracking.
 */
const HandManager: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const setHands = useStore(s => s.setHands);
  const setFaceData = useStore(s => s.setFaceData);
  const cameraIndex = useStore(s => s.cameraIndex);
  const setCameraSwitching = useStore(s => s.setCameraSwitching);
  const setCameraName = useStore(s => s.setCameraName);
  const isPaused = useStore(s => s.isPaused);
  const setVideoStream = useStore(s => s.setVideoStream);
  const cameraEnabled = useStore(s => s.cameraEnabled);
  const setCameraBrightness = useStore(s => s.setCameraBrightness);
  
  const lastVideoTime = useRef(-1);
  const lastPredictionTime = useRef(0);
  const frameCounter = useRef(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isPredicting = useRef(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
// Optimization Refs to prevent store spamming
const lastFacePos = useRef({ x: 0, y: 0 });
const handsRef = useRef<any[]>([]); 
const lastWorldPositions = useRef<Record<string, [number, number, number]>>({});
const lastVelocities = useRef<Record<string, [number, number, number]>>({});
const handColors = useRef<Record<string, string>>({});

  const predictWebcam = useCallback(() => {
    if (!cameraEnabled || isPaused) {
        isPredicting.current = false;
        return;
    }

    isPredicting.current = true;
    requestRef.current = requestAnimationFrame(predictWebcam);

    const now = performance.now();
    // Throttle to ~30fps for stability
    const dt = (now - lastPredictionTime.current) / 1000;
    if (now - lastPredictionTime.current < 32) return; 
    lastPredictionTime.current = now;
    frameCounter.current++;
    
    if (!handLandmarkerRef.current || !faceLandmarkerRef.current || !videoRef.current) return;
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) return;

    let startTimeMs = performance.now();
    if (lastVideoTime.current !== videoRef.current.currentTime) {
      lastVideoTime.current = videoRef.current.currentTime;
      
      if (frameCounter.current % 60 === 0 && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
          if (ctx) {
              ctx.drawImage(videoRef.current, 0, 0, 10, 10);
              const data = ctx.getImageData(0, 0, 10, 10).data;
              let sum = 0;
              for(let i = 0; i < data.length; i += 4) {
                  sum += data[i] + data[i+1] + data[i+2];
              }
              setCameraBrightness((sum / (data.length / 4 * 3)) / 255);
          }
      }

      try {
        const handResults = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
        const faceResults = faceLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

        // --- FACE TRACKING ---
        if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
            const face = faceResults.faceLandmarks[0];
            const nose = face[1];
            const leftEye = face[33];
            const rightEye = face[263];
            
            const newPos = { 
                x: (0.5 - nose.x) * 10, 
                y: (0.5 - nose.y) * 5, 
                z: 0 
            };

            // Only update if moved more than 0.05 units to stop micro-jitter re-renders
            if (!isSamePos(newPos, lastFacePos.current, 0.05)) {
                lastFacePos.current = newPos;
                const rawRot = { 
                    x: (0.5 - nose.y) * 2, 
                    y: (nose.x - (leftEye.x + rightEye.x) / 2) * 20, 
                    z: Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) 
                };
                setFaceData({
                    present: true,
                    position: newPos,
                    rotation: rawRot,
                    rawPosition: { x: nose.x, y: nose.y, z: nose.z },
                    rawRotation: rawRot
                });
            }
        } else if (lastFacePos.current.x !== -999) {
            lastFacePos.current = { x: -999, y: -999 };
            setFaceData({ present: false });
        }

        // --- HAND TRACKING ---
        const currentHands: any[] = [];
        if (handResults.landmarks && handResults.landmarks.length > 0) {
            for (let h = 0; h < handResults.landmarks.length; h++) {
                const rawLandmarks = handResults.landmarks[h];
                const handedness = handResults.handedness?.[h]?.[0]?.categoryName?.toLowerCase() as 'left' | 'right' || 'none';
                
                const SENSITIVITY_X = 35; 
                const SENSITIVITY_Y = 20;
                const OFFSET_Y = 2; 
                const RIG_SCALE = 0.8; 

                const rigLandmarks: [number, number, number][] = new Array(21);
                for(let i=0; i<21; i++) {
                    rigLandmarks[i] = [
                        ((0.5 - rawLandmarks[i].x) * SENSITIVITY_X) * RIG_SCALE,
                        ((0.5 - rawLandmarks[i].y) * SENSITIVITY_Y + OFFSET_Y) * RIG_SCALE,
                        (-rawLandmarks[i].z * 15) * RIG_SCALE
                    ];
                }

                const wrist = rawLandmarks[0];

                // --- COLOR SAMPLING ---
                let handColor = handColors.current[handedness] || "#ffffff";
                if (!handColors.current[handedness] && videoRef.current && canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
                    if (ctx) {
                        // Sample from palm center (approx between wrist, index base, and pinky base)
                        const p0 = rawLandmarks[0];
                        const p5 = rawLandmarks[5];
                        const p17 = rawLandmarks[17];
                        const palmX = (p0.x + p5.x + p17.x) / 3;
                        const palmY = (p0.y + p5.y + p17.y) / 3;

                        const sampleX = palmX * videoRef.current!.videoWidth;
                        const sampleY = palmY * videoRef.current!.videoHeight;
                        
                        // Draw a 10x10 area to the canvas for averaging
                        ctx.drawImage(videoRef.current!, sampleX - 5, sampleY - 5, 10, 10, 0, 0, 10, 10);
                        const d = ctx.getImageData(0, 0, 10, 10).data;
                        
                        let r=0, g=0, b=0, count=0;
                        for(let j=0; j<d.length; j+=4) {
                            if (d[j] + d[j+1] + d[j+2] > 20) { // Avoid pure black noise
                                r += d[j]; g += d[j+1]; b += d[j+2];
                                count++;
                            }
                        }
                        
                        if (count > 0) {
                            const avgR = Math.floor(r / count);
                            const avgG = Math.floor(g / count);
                            const avgB = Math.floor(b / count);
                            handColor = `rgb(${avgR}, ${avgG}, ${avgB})`;
                            handColors.current[handedness] = handColor;
                        }
                    }
                }

                const getScore = (tip: number, pip: number) => {
                    const tipLm = rawLandmarks[tip];
                    const pipLm = rawLandmarks[pip];
                    const dTipSq = distSq(tipLm.x, tipLm.y, tipLm.z, wrist.x, wrist.y, wrist.z);
                    const dPipSq = distSq(pipLm.x, pipLm.y, pipLm.z, wrist.x, wrist.y, wrist.z);
                    const ratio = Math.sqrt(dTipSq / dPipSq);
                    return Math.min(1, Math.max(0, (ratio - 0.8) / 0.4));
                };

                const indexScore = getScore(8, 6);
                const middleScore = getScore(12, 10);
                const ringScore = getScore(16, 14);
                const pinkyScore = getScore(20, 18);

                const t = rawLandmarks[4];
                const i = rawLandmarks[8];
                const pinchDistSq = distSq(t.x, t.y, t.z, i.x, i.y, i.z);
                const pinchScore = Math.max(0, 1 - (Math.sqrt(pinchDistSq) / 0.18)); 

                const avgFingerExt = (indexScore + middleScore + ringScore + pinkyScore) / 4;
                const indexRingPinkyCurled = (1 - indexScore) * (1 - ringScore) * (1 - pinkyScore);
                const indexMiddleRingCurled = (1 - indexScore) * (1 - middleScore) * (1 - ringScore);
                const threeFingersScore = (indexScore * middleScore * ringScore * (1 - pinkyScore));

                const metrics: GestureMetrics = {
                    pinch: pinchScore,
                    palm: avgFingerExt,
                    fist: Math.max(0, 1 - ((avgFingerExt * 3) + getScore(4, 2) * 0.5)), 
                    peace: (indexScore + middleScore + (1 - ringScore) + (1 - pinkyScore)) / 4,
                    pointing: (indexScore * (1 - middleScore) * (1 - ringScore) * (1 - pinkyScore)),
                    pinkyUp: pinkyScore * indexMiddleRingCurled,
                    threeFingers: threeFingersScore,
                    middleFinger: middleScore * indexRingPinkyCurled
                };

                let gesture = GestureType.NONE;
                if (metrics.middleFinger > 0.6) gesture = GestureType.MIDDLE_FINGER;
                else if (metrics.pinch > 0.7) gesture = GestureType.PINCH;
                else if (indexScore > 0.85 && middleScore < 0.15 && ringScore < 0.15 && pinkyScore < 0.15) gesture = GestureType.POINTING;
                else if (pinkyScore > 0.8 && indexScore < 0.2 && middleScore < 0.2 && ringScore < 0.2) gesture = GestureType.PINKY_UP;
                else if (metrics.threeFingers > 0.7) gesture = GestureType.THREE_FINGERS;
                else if (metrics.peace > 0.7) gesture = GestureType.PEACE;
                else if (avgFingerExt < 0.1) gesture = GestureType.CLOSED_FIST;
                else if (metrics.palm > 0.6) gesture = GestureType.OPEN_PALM;

                let wx, wy, wz;
                if (gesture === GestureType.PINCH) {
                    wx = (rigLandmarks[4][0] + rigLandmarks[8][0]) / 2;
                    wy = (rigLandmarks[4][1] + rigLandmarks[8][1]) / 2;
                    wz = (rigLandmarks[4][2] + rigLandmarks[8][2]) / 2;
                } else {
                    wx = rigLandmarks[8][0];
                    wy = rigLandmarks[8][1];
                    wz = rigLandmarks[8][2];
                }

                // --- VELOCITY CALCULATION ---
                const currentWorldPos: [number, number, number] = [wx, wy, wz];
                let velocity: [number, number, number] = [0, 0, 0];
                
                const handKey = handedness;
                if (dt > 0 && lastWorldPositions.current[handKey]) {
                    const alpha = 0.5;
                    const rawVx = (currentWorldPos[0] - lastWorldPositions.current[handKey][0]) / dt;
                    const rawVy = (currentWorldPos[1] - lastWorldPositions.current[handKey][1]) / dt;
                    const rawVz = (currentWorldPos[2] - lastWorldPositions.current[handKey][2]) / dt;
                    
                    const lastV = lastVelocities.current[handKey] || [0, 0, 0];
                    velocity = [
                        lastV[0] * (1 - alpha) + rawVx * alpha,
                        lastV[1] * (1 - alpha) + rawVy * alpha,
                        lastV[2] * (1 - alpha) + rawVz * alpha
                    ];
                }
                
                lastWorldPositions.current[handKey] = currentWorldPos;
                lastVelocities.current[handKey] = velocity;

                currentHands.push({
                  present: true,
                  handedness,
                  color: handColor,
                  landmarks: rawLandmarks, 
                  rigLandmarks,
                  gesture,
                  metrics,
                  pinchDistance: Math.sqrt(pinchDistSq),
                  worldPosition: currentWorldPos,
                  velocity
                });
            }
        }

        // --- HAND TRACKING UPDATE ---
        // Only update store if hands state changed (property-based diff)
        const hasChanged = currentHands.length !== handsRef.current.length || 
            currentHands.some((h, i) => {
                const prev = handsRef.current[i];
                if (!prev) return true;
                return h.gesture !== prev.gesture || 
                       Math.abs(h.worldPosition[0] - prev.worldPosition[0]) > 0.1 ||
                       Math.abs(h.worldPosition[1] - prev.worldPosition[1]) > 0.1;
            });

        if (hasChanged || (currentHands.length === 0 && handsRef.current.length > 0)) {
            handsRef.current = currentHands;
            setHands(currentHands);
            
            // Handle cleanup of lost hands' tracking refs
            const currentHandKeys = new Set(currentHands.map(h => h.handedness));
            Object.keys(lastWorldPositions.current).forEach(key => {
                if (!currentHandKeys.has(key as any)) {
                    delete lastWorldPositions.current[key];
                    delete lastVelocities.current[key];
                    delete handColors.current[key];
                }
            });
        }
      } catch (e) { }
    }
  }, [cameraEnabled, isPaused, setCameraBrightness, setFaceData, setHands]);

  const stopWebcam = useCallback(() => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          setVideoStream(null);
          setHands([]);
          setFaceData({ present: false });
          setCameraName("camera disabled");
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      isPredicting.current = false;
      if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = null;
      }
  }, [setVideoStream, setHands, setFaceData, setCameraName]);

  const startWebcam = useCallback(async () => {
    if (!cameraEnabled || isPaused) return; 

    try {
      let devices = await (navigator as any).mediaDevices.enumerateDevices();
      let videoDevices = devices.filter((device: any) => device.kind === 'videoinput');

      if (videoDevices.length === 0 || !videoDevices[0].deviceId || !videoDevices[0].label) {
          try {
             const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
             tempStream.getTracks().forEach(track => track.stop());
             devices = await (navigator as any).mediaDevices.enumerateDevices();
             videoDevices = devices.filter((device: any) => device.kind === 'videoinput');
          } catch (permErr) { }
      }
      
      if (videoDevices.length === 0) {
          setCameraName("no camera found");
          setCameraSwitching(false);
          return;
      }

      const deviceIndex = cameraIndex % videoDevices.length;
      const device = videoDevices[deviceIndex];
      const deviceLabel = (device.label || `Camera ${deviceIndex + 1}`).toLowerCase();
      setCameraName(deviceLabel);

      const constraints: MediaStreamConstraints = {
          video: { 
              width: { ideal: 640 }, 
              height: { ideal: 480 }, 
              frameRate: { ideal: 30 } 
          } 
      };

      if (device.deviceId && device.deviceId !== "") {
          (constraints.video as MediaTrackConstraints).deviceId = { exact: device.deviceId };
      }

      const stream = await (navigator as any).mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setVideoStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const playAndPredict = () => {
           videoRef.current?.play().catch(() => {});
           if (!isPredicting.current && handLandmarkerRef.current) {
             predictWebcam();
           }
        };
        if (videoRef.current.readyState >= 2) playAndPredict();
        else videoRef.current.onloadeddata = playAndPredict;
      }
      setTimeout(() => setCameraSwitching(false), 800);
    } catch (err) {
      setCameraSwitching(false);
      setCameraName("camera error");
    }
  }, [cameraEnabled, isPaused, cameraIndex, setCameraName, setCameraSwitching, setVideoStream, predictWebcam]);

useEffect(() => {
    let active = true;
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
        );
        
        const confidence = 0.65;
        const delegate = (window as any).WebGLRenderingContext ? "GPU" : "CPU";

        const [handLandmarker, faceLandmarker] = await Promise.all([
            HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate
              },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: confidence,
              minHandPresenceConfidence: confidence,
              minTrackingConfidence: confidence
            }),
            FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                  modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                  delegate
              },
              runningMode: "VIDEO",
              numFaces: 1,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5
            })
        ]);

        if (active) {
            handLandmarkerRef.current = handLandmarker;
            faceLandmarkerRef.current = faceLandmarker;
            setIsModelLoaded(true);
        } else {
            handLandmarker.close();
            faceLandmarker.close();
        }
      } catch (e) {
        console.error("MediaPipe initialization failed:", e);
      }
    };

    initMediaPipe();

    // Initialize sampling canvas
    canvasRef.current = document.createElement('canvas');
    canvasRef.current.width = 100;
    canvasRef.current.height = 100;

    return () => {
      active = false;
      stopWebcam();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [stopWebcam]);

  useEffect(() => {
      if (isModelLoaded && videoRef.current && !videoRef.current.paused && !isPredicting.current) {
          predictWebcam();
      }
  }, [isModelLoaded, predictWebcam]);

  useEffect(() => {
      const shouldRun = cameraEnabled && !isPaused;
      if (shouldRun) {
          if (streamRef.current) stopWebcam();
          startWebcam();
      } else {
          stopWebcam();
      }
  }, [cameraIndex, cameraEnabled, isPaused, startWebcam, stopWebcam]);

  return (
    <video ref={videoRef} autoPlay playsInline muted className="hidden" style={{ transform: "scaleX(-1)" }} />
  );
};

export default HandManager;
