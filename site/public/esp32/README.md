# Tawaf ESP32 bridge

This firmware connects an ESP32 to the same EMQX MQTT broker used by the Tawaf website and forwards hardware commands to the Uno over UART. Once flashed and connected to Wi-Fi, the website sends commands through the cloud; no CMD window or laptop agent is needed.

## Prepare and flash

1. In Arduino IDE, install the ESP32 board package and the `PubSubClient` library.
2. Open `esp32_mqtt_bridge.ino` and set `WIFI_SSID` and `WIFI_PASSWORD`. These are saved on the physical ESP32; do not commit your real Wi-Fi password.
3. Confirm the Uno program reads single-byte commands `F`, `D`, `N`, and `C` at 9600 baud on software-serial RX pin 10. If your Uno sketch uses different pins or baud, update `UNO_RX_PIN`, `UNO_TX_PIN`, or `UNO_BAUD` to match.
4. Wire ESP32 GPIO17 (TX2) to the Uno software-serial RX through a 3.3V-safe level shifter or divider. Connect ESP32 GPIO16 (RX2) to the Uno software-serial TX, and connect grounds together. Do not connect Uno 5V TX directly to ESP32 RX.
5. Select the correct ESP32 board and port in Arduino IDE, then upload the sketch. The board must be on Wi-Fi with internet access.

The firmware uses TLS to connect to `broker.emqx.io:8883`, subscribes to `bsg/v2/hw/tawaf-bot-01/cmd`, and publishes its online state to `bsg/v2/hw/tawaf-bot-01/state`. The website sends hardware commands using these same cloud topics. MQTT uses client authentication neither for the web app nor for this ESP32 sketch.

## Public broker warning

The command topic is public and unauthenticated. Anyone who discovers the robot ID and topic can publish allowed commands directly, without logging in to or opening the website. The firmware only forwards `F`, `D`, `N`, and `C`, but those commands can still actuate hardware. This setup is being used at the owner's explicit request. To restrict control later, move both the website and ESP32 to a private authenticated broker and rotate the topic/robot ID.

## Limits

This change removes the laptop-side Python/CMD agent from the ESP32 path. It does not configure the physical Uno or ESP32 automatically: the Wi-Fi credentials must be entered and the sketch flashed once, and UART wiring must match the Uno sketch. The HC-05 remains available for direct Web Serial use in supported desktop browsers; mobile browsers generally cannot use the HC-05 Web Serial path.