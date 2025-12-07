
import { useStore } from '../store';

export class AudioEngine {
    ctx: AudioContext;
    masterGain: GainNode;
    droneOsc: OscillatorNode | null = null;
    droneGain: GainNode | null = null;
    
    constructor() {
        // @ts-ignore
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioCtx();
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -2;
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;
        limiter.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
    }

    checkInit() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    startDrone() {
        if (this.droneOsc || !this.ctx) return;
        this.checkInit();
        this.droneOsc = this.ctx.createOscillator();
        this.droneGain = this.ctx.createGain();
        this.droneOsc.type = 'sine';
        this.droneOsc.frequency.value = 60;
        this.droneGain.gain.value = 0;
        this.droneOsc.connect(this.droneGain);
        this.droneGain.connect(this.masterGain);
        this.droneOsc.start();
    }

    updateDrone(velocity: number) {
        if (!this.droneOsc) this.startDrone();
        if (!this.droneOsc || !this.droneGain) return;
        
        const intensity = Math.min(1, velocity / 10);
        const targetFreq = 60 + (intensity * 80);
        const targetVol = intensity * 0.2 * 0.4 * useStore.getState().settings.soundVolume;

        this.droneOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        this.droneGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
    }

    play3D(type: string, position: [number, number, number] | number[] = [0,0,0], volume: number = 1.0) {
        if (useStore.getState().isPaused || useStore.getState().isMuted) return; // Mute check
        this.checkInit();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, position[0] / 15));
        osc.connect(gain); gain.connect(panner); panner.connect(this.masterGain);
        
        if (type === 'spawn') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(350, now); 
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
            gain.gain.setValueAtTime(0, now); 
            gain.gain.linearRampToValueAtTime(0.5 * volume, now + 0.01); 
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'click') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(1200, now); osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
            gain.gain.setValueAtTime(0.2 * volume, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now); osc.stop(now + 0.05);
        } else if (type === 'connect') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(659.25, now + 0.2);
            gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.2 * volume, now + 0.1); gain.gain.linearRampToValueAtTime(0, now + 0.6);
            osc.start(now); osc.stop(now + 0.6);
        } else if (type === 'collide') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(80 + Math.random() * 100, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            gain.gain.setValueAtTime(0.3 * volume, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'pop') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
            gain.gain.setValueAtTime(0.5 * volume, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'bad') {
             osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.linearRampToValueAtTime(50, now + 0.3);
             gain.gain.setValueAtTime(0.5 * volume, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
             osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'trash') {
             osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(50, now + 0.2);
             gain.gain.setValueAtTime(0.3 * volume, now); gain.gain.linearRampToValueAtTime(0, now + 0.2);
             osc.start(now); osc.stop(now + 0.2);
        }
    }
}

export const audio = new AudioEngine();
