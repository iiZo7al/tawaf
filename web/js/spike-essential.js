/** Bluetooth Low Energy control for the LEGO SPIKE Essential hub. */
const SERVICE_UUID = "00001623-1212-efde-1623-785feabcd123";
const COMMAND_UUID = "00001624-1212-efde-1623-785feabcd123";
const FEEDBACK_UUID = "00001625-1212-efde-1623-785feabcd123";

export class SpikeEssential {
  constructor() {
    this.device = null;
    this.command = null;
  }

  get connected() {
    return Boolean(this.device?.gatt?.connected && this.command);
  }

  async connect() {
    if (!navigator.bluetooth) throw new Error("استخدم Chrome أو Edge مع Bluetooth.");
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
      });
    } catch (err) {
      if (err?.name === "NotFoundError" && /globally disabled/i.test(err.message || "")) {
        throw new Error("Brave عطّل Web Bluetooth. افتح الموقع في Microsoft Edge أو Google Chrome للاتصال بالمكعب.");
      }
      throw err;
    }
    this.device.addEventListener("gattserverdisconnected", () => { this.command = null; });
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    this.command = await service.getCharacteristic(COMMAND_UUID);
    const feedback = await service.getCharacteristic(FEEDBACK_UUID);
    await feedback.startNotifications();
    return this.device.name || "SPIKE Essential";
  }

  async lift({ port = "A", degrees = 180, speed = 35, maxPower = 50 } = {}) {
    if (!this.connected) throw new Error("اتصل بمكعب SPIKE أولاً.");
    const portId = ({ A: 0, B: 1 })[String(port).toUpperCase()];
    if (portId === undefined) throw new Error("منفذ المحرك يجب أن يكون A أو B.");
    const amount = Math.max(1, Math.min(10000, Math.round(degrees)));
    const signedSpeed = Math.max(-100, Math.min(100, Math.round(speed)));
    if (!signedSpeed) throw new Error("سرعة المحرك يجب ألا تكون صفرًا.");
    const power = Math.max(1, Math.min(100, Math.round(maxPower)));
    const degreeBytes = new Uint8Array(4);
    new DataView(degreeBytes.buffer).setInt32(0, amount, true);
    // LEGO Wireless Protocol 3.0: run for degrees, then hold the raised mechanism.
    const body = [0x00, 0x81, portId, 0x11, 0x0b, ...degreeBytes, signedSpeed, power, 126, 0];
    await this.command.writeValueWithoutResponse(new Uint8Array([body.length, ...body]));
  }

  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.command = null;
  }
}
