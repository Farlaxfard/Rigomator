
import { useStore } from '../store';

export class AudioEngine {
    private _ctx: AudioContext | null = null;
    private _masterGain: GainNode | null = null;
    private _hissBuffer: AudioBuffer | null = null;
    private _lastCollideTime: number = 0;
    droneOsc: OscillatorNode | null = null;
    droneGain: GainNode | null = null;
    
    get ctx() {
        if (!this._ctx) {
            // @ts-ignore
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            this._ctx = new AudioCtx();
            const limiter = this._ctx.createDynamicsCompressor();
            limiter.threshold.value = -2;
            this._masterGain = this._ctx.createGain();
            this._masterGain.gain.value = 0.8;
            limiter.connect(this._masterGain);
            this._masterGain.connect(this._ctx.destination);
            
            // Load custom samples
            this.loadSample('/hiss.wav').then(buf => this._hissBuffer = buf);
        }
        return this._ctx;
    }

    private async loadSample(url: string): Promise<AudioBuffer | null> {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.error(`Failed to load audio sample: ${url}`, e);
            return null;
        }
    }

    get masterGain() {
        this.ctx; // Trigger getter
        return this._masterGain!;
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
        if (!this._ctx || this._ctx.state === 'suspended' || !this.droneOsc || !this.droneGain) return;
        
        const intensity = Math.min(1, velocity / 10);
        const targetFreq = 60 + (intensity * 80);
        const targetVol = intensity * 0.2 * 0.4 * useStore.getState().settings.soundVolume;

        this.droneOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        this.droneGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
    }

    play3D(type: string, position: [number, number, number] | number[] = [0,0,0], volume: number = 1.0) {
        if (useStore.getState().isPaused || useStore.getState().isMuted) return;
        this.checkInit();
        const now = this.ctx.currentTime;
        const gain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, position[0] / 15));
        gain.connect(panner); panner.connect(this.masterGain);
        
        if (type === 'hiss' && this._hissBuffer) {
            const source = this.ctx.createBufferSource();
            source.buffer = this._hissBuffer;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1 * volume, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            source.connect(gain);
            source.start(now);
            return;
        }

        const osc = this.ctx.createOscillator();
        osc.connect(gain);

        // Retro 8-Bit Logic: Square waves, fast arps, noise chips
        if (type === 'spawn') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.setValueAtTime(600, now + 0.03);
            osc.frequency.setValueAtTime(800, now + 0.06);
            gain.gain.setValueAtTime(0.04 * volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now); osc.stop(now + 0.12);
        } else if (type === 'click') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, now);
            gain.gain.setValueAtTime(0.03 * volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now); osc.stop(now + 0.05);
        } else if (type === 'trash') {
             osc.type = 'sawtooth';
             osc.frequency.setValueAtTime(200, now);
             osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
             gain.gain.setValueAtTime(0.05 * volume, now);
             gain.gain.linearRampToValueAtTime(0, now + 0.2);
             osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'connect') {
             osc.type = 'square';
             osc.frequency.setValueAtTime(300, now);
             osc.frequency.setValueAtTime(600, now + 0.05);
             osc.frequency.setValueAtTime(1200, now + 0.1);
             gain.gain.setValueAtTime(0.03 * volume, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
             osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'disconnect') {
             osc.type = 'square';
             osc.frequency.setValueAtTime(1200, now);
             osc.frequency.setValueAtTime(600, now + 0.05);
             osc.frequency.setValueAtTime(300, now + 0.1);
             gain.gain.setValueAtTime(0.03 * volume, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
             osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'grab') {
             osc.type = 'triangle';
             osc.frequency.setValueAtTime(200, now);
             osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
             gain.gain.setValueAtTime(0.04 * volume, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
             osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'release') {
             osc.type = 'triangle';
             osc.frequency.setValueAtTime(400, now);
             osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
             gain.gain.setValueAtTime(0.03 * volume, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
             osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'fling') {
             osc.type = 'square';
             osc.frequency.setValueAtTime(100, now);
             osc.frequency.exponentialRampToValueAtTime(1500, now + 0.15);
             gain.gain.setValueAtTime(0.04 * volume, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
             osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'collide') {
             if (now - this._lastCollideTime < 0.15) return;
             this._lastCollideTime = now;
             
             // 8-bit noise burst
             const bufferSize = this.ctx.sampleRate * 0.05;
             const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
             const data = buffer.getChannelData(0);
             for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
             
             const noise = this.ctx.createBufferSource();
             noise.buffer = buffer;
             const filter = this.ctx.createBiquadFilter();
             filter.type = 'bandpass'; 
             filter.frequency.value = 1000 + Math.random() * 500;
             noise.connect(filter); filter.connect(gain);
             
             gain.gain.setValueAtTime(0.02 * volume, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
             noise.start(now); noise.stop(now + 0.05);
        } else if (type === 'crackle') {
             // 8-bit chip blip
             osc.type = 'square';
             osc.frequency.setValueAtTime(800 + Math.random() * 400, now);
             gain.gain.setValueAtTime(0.03 * volume, now);
             gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
             osc.start(now); osc.stop(now + 0.04);
        }
    }
}

export const audio = new AudioEngine();
