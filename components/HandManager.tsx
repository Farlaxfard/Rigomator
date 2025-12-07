
/// <reference lib="dom" />
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { useStore } from '../store';
import { GestureType, GestureMetrics } from '../types';

/**
 * HandManager Component
 * Optimized for minimal garbage collection and stable tracking.
 */
const HandManager: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { 
    setHandData, 
    setFaceData, 
    cameraIndex, 
    setCameraSwitching, 
    setCameraName,
    isPaused,
    setVideoStream,
    cameraEnabled,
    setCameraBrightness
  } = useStore();
  
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

  useEffect(() => {
    let active = true;
    canvasRef.current = document.createElement('canvas');
    canvasRef.current.width = 10;
    canvasRef.current.height = 10;

    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        const confidence = 0.65;

        // Parallel load
        const [handLandmarker, faceLandmarker] = await Promise.all([
            HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
              },
              runningMode: "VIDEO",
              numHands: 1,
              minHandDetectionConfidence: confidence,
              minHandPresenceConfidence: confidence,
              minTrackingConfidence: confidence
            }),
            FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                  modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                  delegate: "GPU"
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

    return () => {
      active = false;
      stopWebcam();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  useEffect(() => {
      if (isModelLoaded && videoRef.current && !videoRef.current.paused && !isPredicting.current) {
          predictWebcam();
      }
  }, [isModelLoaded]);

  useEffect(() => {
      const shouldRun = cameraEnabled && !isPaused;
      
      if (shouldRun) {
          // If a stream exists (e.g. from previous camera index), stop it first to allow switching
          if (streamRef.current) {
              stopWebcam();
          }
          startWebcam();
      } else {
          stopWebcam();
      }
  }, [cameraIndex, cameraEnabled, isPaused]);

  const stopWebcam = () => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          setVideoStream(null);
          setHandData({ present: false });
          setFaceData({ present: false });
          setCameraName("camera disabled");
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      isPredicting.current = false;
      if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = null;
      }
  }

  const startWebcam = async () => {
    if (!cameraEnabled || isPaused) return; 

    try {
      // 1. Get initial list of devices
      let devices = await (navigator as any).mediaDevices.enumerateDevices();
      let videoDevices = devices.filter((device: any) => device.kind === 'videoinput');

      // 2. Permission Check: If devices found but no labels/IDs, or no devices at all, force a generic request
      // This triggers the browser permission popup
      if (videoDevices.length === 0 || !videoDevices[0].deviceId || !videoDevices[0].label) {
          try {
             // Request generic video access just to trigger permission
             const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
             // Stop immediately, we just needed the permission
             tempStream.getTracks().forEach(track => track.stop());
             
             // Re-enumerate now that we have permission
             devices = await (navigator as any).mediaDevices.enumerateDevices();
             videoDevices = devices.filter((device: any) => device.kind === 'videoinput');
          } catch (permErr) {
             console.warn("Permission request failed or cancelled:", permErr);
             // Proceed anyway, usually getUserMedia below will throw the real error
          }
      }
      
      if (videoDevices.length === 0) {
          console.error("No video input devices found.");
          setCameraName("no camera found");
          setCameraSwitching(false);
          return;
      }

      const deviceIndex = cameraIndex % videoDevices.length;
      const device = videoDevices[deviceIndex];
      const deviceLabel = device.label || `Camera ${deviceIndex + 1}`;
      setCameraName(deviceLabel);

      // Build constraints
      const constraints: MediaStreamConstraints = {
          video: { 
              width: { ideal: 640 }, 
              height: { ideal: 480 }, 
              frameRate: { ideal: 30 } 
          } 
      };

      // Only add specific deviceId if it exists and is not empty
      if (device.deviceId && device.deviceId !== "") {
          (constraints.video as MediaTrackConstraints).deviceId = { exact: device.deviceId };
      }

      const stream = await (navigator as any).mediaDevices.getUserMedia(constraints);
      
      streamRef.current = stream;
      setVideoStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const playAndPredict = () => {
           videoRef.current?.play().catch(e => console.error("Play failed", e));
           if (!isPredicting.current && handLandmarkerRef.current) {
             predictWebcam();
           }
        };
        if (videoRef.current.readyState >= 2) playAndPredict();
        else videoRef.current.onloadeddata = playAndPredict;
      }
      setTimeout(() => setCameraSwitching(false), 800);
    } catch (err) {
      console.error("Critical Camera Error:", err);
      setCameraSwitching(false);
      setCameraName("camera error");
    }
  };

  // Helper for Euclidean distance without creating objects
  const dist = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
      return Math.sqrt(Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2) + Math.pow(z1-z2, 2));
  }

  const predictWebcam = () => {
    if (!cameraEnabled || isPaused) {
        isPredicting.current = false;
        return;
    }

    isPredicting.current = true;
    requestRef.current = requestAnimationFrame(predictWebcam);

    const now = performance.now();
    // Throttle to ~30fps for stability even if screen is 60/120hz
    if (now - lastPredictionTime.current < 32) return; 
    lastPredictionTime.current = now;
    frameCounter.current++;
    
    if (!handLandmarkerRef.current || !faceLandmarkerRef.current || !videoRef.current) return;
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) return;

    let startTimeMs = performance.now();
    if (lastVideoTime.current !== videoRef.current.currentTime) {
      lastVideoTime.current = videoRef.current.currentTime;
      
      // Brightness Analysis (low frequency)
      if (frameCounter.current % 30 === 0 && canvasRef.current) {
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
            
            setFaceData({
                present: true,
                position: { 
                    x: (0.5 - nose.x) * 10, 
                    y: (0.5 - nose.y) * 5, 
                    z: 0 
                },
                rotation: { 
                    x: (0.5 - nose.y) * 2, 
                    y: (nose.x - (leftEye.x + rightEye.x) / 2) * 20, 
                    z: Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) 
                }
            });
        } else {
            setFaceData({ present: false });
        }

        // --- HAND TRACKING ---
        if (handResults.landmarks && handResults.landmarks.length > 0) {
            const rawLandmarks = handResults.landmarks[0];
            
            const SENSITIVITY_X = 35; 
            const SENSITIVITY_Y = 20;
            const OFFSET_Y = 2; 
            const RIG_SCALE = 0.8; 

            // Pre-allocate array for 21 joints
            const rigLandmarks: [number, number, number][] = new Array(21);
            
            // Single loop mapping
            for(let i=0; i<21; i++) {
                rigLandmarks[i] = [
                    ((0.5 - rawLandmarks[i].x) * SENSITIVITY_X) * RIG_SCALE,
                    ((0.5 - rawLandmarks[i].y) * SENSITIVITY_Y + OFFSET_Y) * RIG_SCALE,
                    (-rawLandmarks[i].z * 15) * RIG_SCALE
                ];
            }

            // Calculations using rawLandmarks (0-1 space)
            const wrist = rawLandmarks[0];
            
            // Helper for extension score
            const getScore = (tip: number, pip: number) => {
                const tipLm = rawLandmarks[tip];
                const pipLm = rawLandmarks[pip];
                const dTip = dist(tipLm.x, tipLm.y, tipLm.z, wrist.x, wrist.y, wrist.z);
                const dPip = dist(pipLm.x, pipLm.y, pipLm.z, wrist.x, wrist.y, wrist.z);
                const ratio = dTip / dPip;
                return Math.min(1, Math.max(0, (ratio - 0.8) / 0.4));
            };

            const thumbScore = getScore(4, 2); 
            const indexScore = getScore(8, 6);
            const middleScore = getScore(12, 10);
            const ringScore = getScore(16, 14);
            const pinkyScore = getScore(20, 18);

            const t = rawLandmarks[4];
            const i = rawLandmarks[8];
            const pinchDist = dist(t.x, t.y, t.z, i.x, i.y, i.z);
            const pinchScore = Math.max(0, 1 - (pinchDist / 0.12)); 

            const avgFingerExt = (indexScore + middleScore + ringScore + pinkyScore) / 4;
            const othersCurledStrict = (1 - indexScore) * (1 - middleScore) * (1 - ringScore);
            
            // 3-Fingers Metric: Index, Middle, Ring UP. Pinky DOWN.
            const threeFingersScore = (indexScore * middleScore * ringScore * (1 - pinkyScore));

            const metrics: GestureMetrics = {
                pinch: pinchScore,
                palm: avgFingerExt,
                fist: Math.max(0, 1 - ((avgFingerExt * 3) + thumbScore * 0.5)), 
                peace: (indexScore + middleScore + (1 - ringScore) + (1 - pinkyScore)) / 4,
                pointing: (indexScore * (1 - middleScore) * (1 - ringScore) * (1 - pinkyScore)),
                pinkyUp: pinkyScore * othersCurledStrict,
                threeFingers: threeFingersScore
            };

            let gesture = GestureType.NONE;
            
            // Optimized logic tree
            if (middleScore > 0.8 && indexScore < 0.2 && ringScore < 0.2 && pinkyScore < 0.2) gesture = GestureType.MIDDLE_FINGER;
            else if (metrics.pinch > 0.6) gesture = GestureType.PINCH;
            else if (indexScore > 0.8 && middleScore < 0.2 && ringScore < 0.2 && pinkyScore < 0.2) gesture = GestureType.POINTING;
            else if (pinkyScore > 0.75 && indexScore < 0.15 && middleScore < 0.15 && ringScore < 0.15) gesture = GestureType.PINKY_UP;
            // Check 3-fingers before peace because Peace is a subset of 3-fingers often
            else if (metrics.threeFingers > 0.6) gesture = GestureType.THREE_FINGERS;
            else if (metrics.peace > 0.6) gesture = GestureType.PEACE;
            else if (avgFingerExt < 0.15) gesture = GestureType.CLOSED_FIST;
            else if (metrics.palm > 0.5) gesture = GestureType.OPEN_PALM;

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

            setHandData({
              present: true,
              landmarks: rawLandmarks, 
              rigLandmarks,
              gesture,
              metrics,
              pinchDistance: pinchDist,
              worldPosition: [wx, wy, wz]
            });
        } else {
            setHandData({ present: false, gesture: GestureType.NONE });
        }
      } catch (e) {
        // Drop frames silently
      }
    }
  };

  return (
    <video ref={videoRef} autoPlay playsInline muted className="hidden" style={{ transform: "scaleX(-1)" }} />
  );
};

export default HandManager;
