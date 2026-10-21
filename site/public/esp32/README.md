# ESP32 bridge for Tawaf

This firmware bridges the website's MQTT commands to the existing Uno sketch over UART.

## Before flashing
1. Install ESP32 board support in Arduino IDE and the PubSubClient library.
2. Fill in Wi-Fi SSID/password and the private MQTT broker host, user, and password in `esp32_mqtt_bridge.ino`.
3. Configure MQTT TLS (port 8883) on the board and secure WebSockets (WSS) for browser clients. Create separate limited accounts for the ESP32 and website. Restrict both accounts to `tawaf/esp32/#`.
4. Replace `tls.setInsecure()` with the broker's CA certificate before production use.
5. Upload to the ESP32 and wire its UART2 to an available Uno software-serial port. Never connect Uno 5V TX directly to ESP32 RX; use a level shifter or resistor divider.
6. Enter the broker WSS URL and website account credentials in the site's ESP32 settings.

Only the commands F, D, N, and C are accepted. The site publishes to `tawaf/esp32/cmd`, and the board's heartbeat appears on `tawaf/esp32/status`.

Credentials are placeholders. A private MQTT broker must be configured before this can connect. Do not commit Wi-Fi or broker secrets, and do not use an open public broker for commands that can actuate hardware.
