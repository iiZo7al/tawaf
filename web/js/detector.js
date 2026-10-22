/**
 * Smart Black Stone Guard - detection core (ported from python/ai_fall_detector.py)
 *
 * The Python program classified posture with plain trigonometry on MediaPipe's
 * 33 pose landmarks, then ran a small frame-counting state machine.  Nothing in
 * that logic was Python specific, so it is reproduced here line for line with
 * the same constants, so the browser and the desktop program agree.
 */

export const LM = {
  NOSE: 0,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export const TUNING = {
  fallThreshold: 3,      // consecutive fall frames before confirming
  safeFrames: 3,         // consecutive safe frames before clearing
  refireCooldown: 0.8,   // seconds before "safe" frames count again
  standCancel: 3.5,      // seconds of standing required to cancel the alert
  heartbeat: 1.5,        // seconds between Arduino watchdog pings
  minVisibility: 0.45,   // confidence needed to include a landmark in the person box
  minVisibleCount: 8,   // require a body-like set, not a few stray points
  minCoreVisibility: 0.60,
  minSupportVisibility: 0.45,
  minSupportCount: 3,
  uprightAngle: 55,      // torso angle above this reads as upright
  darkThreshold: 90,     // average brightness below this -> lamp on
  brightThreshold: 80,   // hysteresis: above this -> lamp off
};

/**
 * Classify one frame.
 *
 * @param {Array<{x:number,y:number,visibility:number}>} landmarks normalised landmarks
 * @param {number} w frame width in pixels
 * @param {number} h frame height in pixels
 * @returns {{isFall:boolean, reason:string, torsoAngle:number, standing:boolean, box:?{x:number,y:number,w:number,h:number}}}
 */
export function classifyPosture(landmarks, w, h) {
  const out = { personDetected: false, isFall: false, reason: '', torsoAngle: 90, standing: false, box: null };
  if (!landmarks || landmarks.length < 29) return out;

  const confidence = (lm) => {
    if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)
      || lm.x < 0 || lm.x > 1 || lm.y < 0 || lm.y > 1) return 0;
    const visibility = Number.isFinite(lm.visibility) ? lm.visibility : 0;
    const presence = Number.isFinite(lm.presence) ? lm.presence : visibility;
    return Math.min(visibility, presence);
  };
  const core = [
    LM.NOSE, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP,
  ];
  const support = [
    LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST,
    LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ];
  if (core.some((index) => confidence(landmarks[index]) < TUNING.minCoreVisibility)) return out;
  const supportedJoints = support.filter(
    (index) => confidence(landmarks[index]) >= TUNING.minSupportVisibility,
  ).length;
  if (supportedJoints < TUNING.minSupportCount) return out;

  const nose = landmarks[LM.NOSE];
  const ls = landmarks[LM.LEFT_SHOULDER];
  const rs = landmarks[LM.RIGHT_SHOULDER];
  const lh = landmarks[LM.LEFT_HIP];
  const rh = landmarks[LM.RIGHT_HIP];

  const shoulderX = (ls.x + rs.x) / 2;
  const shoulderY = (ls.y + rs.y) / 2;
  const hipX = (lh.x + rh.x) / 2;
  const hipY = (lh.y + rh.y) / 2;

  const dx = Math.abs(shoulderX - hipX) * w;
  const dy = Math.abs(shoulderY - hipY) * h;
  // 0 deg = horizontal (lying), 90 deg = upright
  const torsoAngle = dx > 0 ? (Math.atan2(dy, dx) * 180) / Math.PI : 90;
  out.torsoAngle = torsoAngle;

  const visible = landmarks.filter((lm) => confidence(lm) > TUNING.minVisibility);
  if (visible.length < TUNING.minVisibleCount) return out;

  const xs = visible.map((lm) => lm.x * w);
  const ys = visible.map((lm) => lm.y * h);
  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(w, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(h, Math.max(...ys));
  const bodyW = maxX - minX;
  const bodyH = maxY - minY;
  const aspect = bodyH > 0 ? bodyW / bodyH : 0;

  out.personDetected = true;
  out.box = { x: minX, y: minY, w: bodyW, h: bodyH };

  if (torsoAngle < 48 || (aspect > 1.15 && torsoAngle < 55)) {
    out.isFall = true;
    out.reason = `Lying Flat (Angle: ${Math.round(torsoAngle)} deg)`;
  } else if (minY > h * 0.4 && hipY > 0.5 && aspect > 0.85 && torsoAngle < 60) {
    out.isFall = true;
    out.reason = 'Curled / Fetal on Floor';
  } else if (shoulderY > 0.58 && hipY > 0.6) {
    out.isFall = true;
    out.reason = 'Collapsed to Ground';
  } else if (nose.y > hipY - 0.08 && hipY > 0.48) {
    out.isFall = true;
    out.reason = 'Head Inverted / Slumped';
  } else if (torsoAngle > TUNING.uprightAngle) {
    out.standing = true;
  }

  return out;
}

/**
 * Frame-counting alert state machine.
 * `update()` returns a list of events the UI/hardware layer must act on:
 *   fall-start | heartbeat | safe | resolving | resolved
 */
export class FallEngine {
  constructor(tuning = TUNING) {
    this.t = tuning;
    this.fallCounter = 0;
    this.safeCounter = 0;
    this.isFall = false;
    this.alertActive = false;
    this.standingSince = null;
    this.lastFallAt = -Infinity;
    this.lastHeartbeatAt = -Infinity;
    this.lastBeepAt = -Infinity;
    this.lastSent = null;   // 'F' | 'N'
    this.fallReason = '';
    this.torsoAngle = 90;
    this.recoveryProgress = 0;
  }

  /**
   * @param {{frameFall:boolean, standing:boolean, reason:string, torsoAngle:number, now:number}} s
   * @returns {Array<{type:string, reason?:string}>}
   */
  update({ frameFall, standing, reason, torsoAngle, now }) {
    const events = [];
    this.torsoAngle = torsoAngle;

    if (frameFall) {
      this.fallCounter += 1;
      this.safeCounter = 0;
      this.standingSince = null;
      if (this.fallCounter >= this.t.fallThreshold) {
        this.isFall = true;
        this.fallReason = reason || this.fallReason;
        // Python refreshes this on every falling frame, and only then, so the
        // 0.8s cooldown can actually elapse once the person stands up.
        this.lastFallAt = now;
      }
    } else {
      this.fallCounter = 0;
      if (now - this.lastFallAt > this.t.refireCooldown) {
        this.safeCounter += 1;
        if (this.safeCounter >= this.t.safeFrames) this.isFall = false;
      }
    }

    if (this.isFall) {
      this.standingSince = null;
      this.recoveryProgress = 0;

      if (this.lastSent !== 'F') {
        this.lastSent = 'F';
        this.alertActive = true;
        events.push({ type: 'fall-start', reason: this.fallReason });
      }
      if (now - this.lastHeartbeatAt > this.t.heartbeat) {
        this.lastHeartbeatAt = now;
        events.push({ type: 'heartbeat' });
      }
      if (now - this.lastBeepAt > 0.6) {
        this.lastBeepAt = now;
        events.push({ type: 'beep' });
      }
    } else {
      if (this.lastSent !== 'N') {
        this.lastSent = 'N';
        events.push({ type: 'safe' });
      }

      if (this.alertActive && standing) {
        if (this.standingSince === null) this.standingSince = now;
        const held = now - this.standingSince;
        this.recoveryProgress = Math.min(1, held / this.t.standCancel);
        if (held >= this.t.standCancel) {
          this.alertActive = false;
          this.standingSince = null;
          this.recoveryProgress = 0;
          events.push({ type: 'resolved' });
        } else {
          events.push({ type: 'resolving', progress: this.recoveryProgress });
        }
      } else if (!standing) {
        this.standingSince = null;
        this.recoveryProgress = 0;
      }
    }

    return events;
  }
}

/**
 * Rolling brightness used for the auto-lamp (same EMA factor as Python: 0.97/0.03).
 */
export class BrightnessMeter {
  constructor() {
    this.value = 128;
  }
  push(frameMean) {
    this.value = 0.97 * this.value + 0.03 * frameMean;
    return this.value;
  }
}

/**
 * Mean brightness of a frame, sampled from a tiny offscreen canvas.
 */
export function meanBrightness(video, scratch) {
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, scratch.width, scratch.height);
  const { data } = ctx.getImageData(0, 0, scratch.width, scratch.height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.114 * data[i] + 0.587 * data[i + 1] + 0.299 * data[i + 2];
  }
  return sum / (data.length / 4);
}
