/**
 * Cloud link — pairs the camera device with the display through a public MQTT
 * broker over WSS.  Every session lives in its own room, named by the six-digit
 * code the display shows and the camera types in.
 *
 * Why MQTT and not a local WebSocket: the page is hosted in the cloud, so the
 * two devices can be on completely different networks (phone data + iPad wifi)
 * without a server on anybody's laptop and without a temporary tunnel link.
 *
 * Topics
 *   bsg/v2/<code>/cam          camera -> display (frames, telemetry)
 *   bsg/v2/<code>/scr          display -> camera (presence heartbeat)
 *   bsg/v2/hw/<robot>/cmd      page -> Arduino agent (Bluetooth on the laptop)
 *   bsg/v2/hw/<robot>/state    Arduino agent -> page (retained last state)
 */

import mqtt from "../vendor/mqtt.esm.js";

export const ROBOT_ID = (window.BSG_ROBOT_ID || "tawaf-bot-01").toLowerCase();
export const HW_TOPIC = `bsg/v2/hw/${ROBOT_ID}/state`;
export const HW_CMD_TOPIC = `bsg/v2/hw/${ROBOT_ID}/cmd`;

// Two independent public brokers: the first one that answers is used.
export const BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
];

const TOPIC_ROOT = "bsg/v2";

/** Six digits, never starting with zero so it survives numeric keyboards. */
export function newCode() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

export function normalizeCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

export class CloudLink {
  constructor({ onMessage, onState } = {}) {
    this.onMessage = onMessage || (() => {});
    this.onState = onState || (() => {});
    this.client = null;
    this.connecting = false;
    this.state = "idle";
    this.broker = "";
    this.code = "";
    this.role = "";
    this.closed = false;
    this._roomTopics = [];
    this._retry = null;
  }

  setState(next, detail = "") {
    if (this.state === next && !detail) return;
    this.state = next;
    this.onState(next, detail);
  }

  /** Connect once; safe to call from boot and from a button. */
  connect() {
    if (this.client || this.connecting || this.closed) return;
    this._connectLoop(0);
  }

  async _connectLoop(index) {
    this.connecting = true;
    clearTimeout(this._retry);
    for (let i = index; i < BROKERS.length; i += 1) {
      this.setState("connecting", BROKERS[i]);
      try {
        const client = await this._open(BROKERS[i]);
        if (this.closed) {
          client.end(true);
          return;
        }
        this.client = client;
        this.broker = BROKERS[i];
        this.connecting = false;
        this._wire(client);
        this._resubscribe();
        this.setState("online", this.broker);
        return;
      } catch (err) {
        console.warn("[cloud] broker failed:", BROKERS[i], err?.message || err);
      }
    }
    this.connecting = false;
    this.setState("offline");
    // Try again shortly: phones lose signal, school wifi drops.
    this._retry = setTimeout(() => this.connect(), 6000);
  }

  _open(url) {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(url, {
        clientId: `bsg-${Math.random().toString(16).slice(2, 10)}`,
        clean: true,
        keepalive: 30,
        connectTimeout: 9000,
        reconnectPeriod: 0,
        protocolVersion: 4,
      });
      const timer = setTimeout(() => {
        cleanup();
        client.end(true);
        reject(new Error("timeout"));
      }, 10000);
      const cleanup = () => {
        clearTimeout(timer);
        client.off("connect", onConnect);
        client.off("error", onError);
      };
      const onConnect = () => {
        cleanup();
        resolve(client);
      };
      const onError = (err) => {
        cleanup();
        client.end(true);
        reject(err);
      };
      client.once("connect", onConnect);
      client.once("error", onError);
    });
  }

  _wire(client) {
    client.on("message", (topic, payload) => {
      let msg;
      try {
        msg = JSON.parse(payload.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      msg.__topic = topic;
      msg.__hw = topic === HW_TOPIC;
      this.onMessage(msg);
    });
    client.on("reconnect", () => this.setState("connecting", this.broker));
    client.on("close", () => {
      if (!this.closed && this.client) this.setState("offline");
    });
    client.on("error", (err) => {
      console.warn("[cloud] mqtt error:", err?.message || err);
    });
  }

  /** Enter a room. Subscriptions are refreshed on every broker reconnect. */
  join(code, role) {
    this.code = normalizeCode(code);
    this.role = role === "view" ? "view" : "camera";
    this._resubscribe();
  }

  _resubscribe() {
    if (!this.client || this.client.connected === false) return;
    const topics = [HW_TOPIC];
    if (this.code) {
      topics.push(this.role === "view" ? `${TOPIC_ROOT}/${this.code}/cam` : `${TOPIC_ROOT}/${this.code}/scr`);
    }
    for (const old of this._roomTopics) {
      if (!topics.includes(old)) this.client.unsubscribe(old, () => {});
    }
    for (const topic of topics) {
      this.client.subscribe(topic, { qos: 0 }, (err) => {
        if (err) console.warn("[cloud] subscribe failed:", topic, err.message);
      });
    }
    this._roomTopics = topics;
  }

  /** Publish into the room (camera or display topic, depending on the role). */
  send(obj) {
    if (!this.client || !this.code) return false;
    const topic = `${TOPIC_ROOT}/${this.code}/${this.role === "view" ? "scr" : "cam"}`;
    return this._publish(topic, obj);
  }

  /** Publish to the Arduino agent on the laptop (Bluetooth HC-05). */
  sendHardware(obj) {
    return this._publish(HW_CMD_TOPIC, obj);
  }

  _publish(topic, obj) {
    if (!this.client) return false;
    try {
      this.client.publish(topic, JSON.stringify(obj), { qos: 0 });
      return true;
    } catch (err) {
      console.warn("[cloud] publish failed:", err?.message || err);
      return false;
    }
  }

  close() {
    this.closed = true;
    clearTimeout(this._retry);
    try {
      this.client?.end(true);
    } catch {}
    this.client = null;
    this.setState("idle");
  }
}
