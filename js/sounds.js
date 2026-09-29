// Gestion des sons
class BoardSounds {
  constructor() {
    this.enabled = true;
    this.audioContext = null;
  }

  init() {
    if (!this.audioContext && window.AudioContext) {
      this.audioContext = new AudioContext();
    }
  }

  playTone(frequency, duration, volume = 0.2, waveType = 'sine') {
    if (!this.enabled || !this.audioContext) return;
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    // Connexions avec filtre pour adoucir le son
    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    // Configuration du filtre passe-bas pour un son plus doux
    filter.type = 'lowpass';
    filter.frequency.value = frequency * 2;
    filter.Q.value = 1;
    
    oscillator.frequency.value = frequency;
    oscillator.type = waveType;
    
    // Enveloppe ADSR plus douce
    const now = this.audioContext.currentTime;
    const attackTime = 0.01;
    const releaseTime = duration * 0.3;
    
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + attackTime);
    gainNode.gain.setValueAtTime(volume, now + duration - releaseTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  // Sons agréables et doux
  move() {
    // Son de coup normal - clic doux et élégant (note La)
    this.playTone(440, 0.06, 0.12, 'sine');
  }

  capture() {
    // Son de capture - note plus marquée mais douce (Mi grave)
    this.playTone(329.63, 0.10, 0.14, 'sine');
    setTimeout(() => this.playTone(392, 0.08, 0.10, 'sine'), 40);
  }

  check() {
    // Son d'échec - alerte douce mais notable (Sol-Si)
    this.playTone(783.99, 0.08, 0.14, 'sine');
    setTimeout(() => this.playTone(987.77, 0.12, 0.12, 'sine'), 50);
  }

  win() {
    // Son de victoire - accord majestueux et agréable (Do-Mi-Sol)
    this.playTone(523.25, 0.4, 0.11, 'sine');
    setTimeout(() => this.playTone(659.25, 0.4, 0.11, 'sine'), 80);
    setTimeout(() => this.playTone(783.99, 0.5, 0.11, 'sine'), 160);
  }

  refuse() {
    // Son de refus - bip court et doux mais reconnaissable (Fa grave)
    this.playTone(174.61, 0.12, 0.11, 'triangle');
  }

  select() {
    // Son de sélection - clic très doux pour l'antimisclic (Si aigu)
    this.playTone(493.88, 0.04, 0.09, 'sine');
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.init();
  }
}

window.BoardSounds = BoardSounds;
