/*
 * Tawaf ESP32 bridge for the original Uno + motor/LED sketch.
 *
 * Wiring:
 *   ESP32 GPIO17 (TX2) -> Uno software-serial RX pin (default 10) through
 *                         a 3.3V-safe level shifter/divider.
 *   ESP32 GPIO16 (RX2) <- Uno software-serial TX pin (default 11).
 *   ESP32 GND           -- Uno GND
 *
 * Configure Wi-Fi and a private MQTT broker below. Use MQTT over TLS.
 * Commands are the existing single-byte protocol: F, D, N, C.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

static const char *WIFI_SSID = "YOUR_WIFI_NAME";
static const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
static const char *MQTT_HOST = "YOUR_MQTT_HOST";
static const int MQTT_PORT = 8883;
static const char *MQTT_USER = "tawaf-esp32";
static const char *MQTT_PASSWORD = "CHANGE_THIS_PASSWORD";
static const char *CMD_TOPIC = "tawaf/esp32/cmd";
static const char *STATUS_TOPIC = "tawaf/esp32/status";
static const int UNO_RX_PIN = 16;
static const int UNO_TX_PIN = 17;
static const uint32_t UNO_BAUD = 9600;

WiFiClientSecure tls;
PubSubClient mqtt(tls);
HardwareSerial uno(2);
unsigned long lastStatus = 0;

void publishStatus(bool online) {
  char payload[128];
  snprintf(payload, sizeof(payload),
    "{\"device\":\"tawaf-esp32\",\"online\":%s}",
    online ? "true" : "false");
  mqtt.publish(STATUS_TOPIC, payload, true);
}

void onMessage(char *topic, byte *payload, unsigned int length) {
  if (strcmp(topic, CMD_TOPIC) != 0 || length == 0 || length > 512) return;
  String body;
  for (unsigned int i = 0; i < length; i++) body += (char)payload[i];

  // Accept only the site's known safe command alphabet.
  const char *commands[] = { "\"F\"", "\"D\"", "\"N\"", "\"C\"" };
  for (const char *command : commands) {
    if (body.indexOf(String("\"command\":") + command) >= 0) {
      uno.write(command[1]);
      return;
    }
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void connectMqtt() {
  if (mqtt.connected()) return;
  while (!mqtt.connected()) {
    String clientId = "tawaf-esp32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)) {
      mqtt.subscribe(CMD_TOPIC, 0);
      publishStatus(true);
    } else {
      delay(2500);
    }
  }
}

void setup() {
  Serial.begin(115200);
  uno.begin(UNO_BAUD, SERIAL_8N1, UNO_RX_PIN, UNO_TX_PIN);
  tls.setInsecure(); // Replace with broker CA certificate for production TLS verification.
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  connectWifi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();
  if (millis() - lastStatus > 5000) {
    lastStatus = millis();
    publishStatus(true);
  }
}
