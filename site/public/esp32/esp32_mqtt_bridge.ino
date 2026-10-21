/*
 * Tawaf ESP32 bridge for the original Uno robot.
 *
 * Configure Wi-Fi below. The board uses the same public EMQX MQTT broker as
 * the website. Its hardware command topic is public and unauthenticated.
 *
 * Wiring:
 *   ESP32 GPIO17 (TX2) -> Uno software-serial RX (default pin 10) through
 *                         a 3.3V-safe level shifter/divider.
 *   ESP32 GPIO16 (RX2) <- Uno software-serial TX (default pin 11).
 *   ESP32 GND           -- Uno GND
 *
 * Commands use the existing single-byte alphabet: F, D, N, C.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <time.h>

static const char *WIFI_SSID = "YOUR_WIFI_NAME";
static const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
static const char *MQTT_HOST = "broker.emqx.io";
static const int MQTT_PORT = 8883;
static const char *CMD_TOPIC = "bsg/v2/hw/tawaf-bot-01/cmd";
static const char *STATUS_TOPIC = "bsg/v2/hw/tawaf-bot-01/state";
static const int UNO_RX_PIN = 16;
static const int UNO_TX_PIN = 17;
static const uint32_t UNO_BAUD = 9600;

static const char *ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDjjCCAnagAwIBAgIQAzrx5qcRqaC7KGSxHQn65TANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEcyMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuzfNNNx7a8myaJCtSnX/RrohCgiN9RlUyfuI
2/Ou8jqJkTx65qsGGmvPrC3oXgkkRLpimn7Wo6h+4FR1IAWsULecYxpsMNzaHxmx
1x7e/dfgy5SDN67sH0NO3Xss0r0upS/kqbitOtSZpLYl6ZtrAGCSYP9PIUkY92eQ
q2EGnI/yuum06ZIya7XzV+hdG82MHauVBJVJ8zUtluNJbd134/tJS7SsVQepj5Wz
tCO7TG1F8PapspUwtP1MVYwnSlcUfIKdzXOS0xZKBgyMUNGPHgm+F6HmIcr9g+UQ
vIOlCsRnKPZzFBQ9RnbDhxSJITRNrw9FDKZJobq7nMWxM4MphQIDAQABo0IwQDAP
BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHQ4EFgQUTiJUIBiV
5uNu5g/6+rkS7QYXjzkwDQYJKoZIhvcNAQELBQADggEBAGBnKJRvDkhj6zHd6mcY
1Yl9PMWLSn/pvtsrF9+wX3N3KjITOYFnQoQj8kVnNeyIv/iPsGEMNKSuIEyExtv4
NeF22d+mQrvHRAiGfzZ0JFrabA0UWTW98kndth/Jsw1HKj2ZL7tcu7XUIOGZX1NG
Fdtom/DzMNU+MeKNhJ7jitralj41E6Vf8PlwUHBHQRFXGU7Aj64GxJUTFy8bJZ91
8rGOmaFvE7FBcf6IKshPECBV1/MUReXgRPTqh5Uykw7+U0b6LJ3/iyK5S9kJRaTe
pLiaWN0bfVKfjllDiIGknibVb63dDcY3fe0Dkhvld1927jyNxF1WW6LZZm6zNTfl
MrY=
-----END CERTIFICATE-----
)EOF";

WiFiClientSecure tls;
PubSubClient mqtt(tls);
HardwareSerial uno(2);
unsigned long lastStatus = 0;

void publishStatus(bool online) {
  if (!mqtt.connected()) return;
  char payload[160];
  const time_t now = time(nullptr);
  snprintf(payload, sizeof(payload),
    "{\"type\":\"serial\",\"port\":\"ESP32\",\"connected\":%s,\"online\":%s,\"ts\":%lu}",
    online ? "true" : "false",
    online ? "true" : "false",
    (unsigned long)now);
  mqtt.publish(STATUS_TOPIC, payload, true);
}

void onMessage(char *topic, byte *payload, unsigned int length) {
  if (strcmp(topic, CMD_TOPIC) != 0 || length == 0 || length > 512) return;
  String body;
  body.reserve(length);
  for (unsigned int i = 0; i < length; i++) body += (char)payload[i];

  // Public topic: only allow the four commands understood by the Uno sketch.
  const int key = body.indexOf("\"cmd\"");
  if (key < 0) return;
  const int colon = body.indexOf(':', key + 5);
  if (colon < 0) return;
  int value = colon + 1;
  while (value < (int)body.length() && isspace((unsigned char)body[value])) value++;
  if (value >= (int)body.length() || body[value] != '"') return;
  if (value + 2 >= (int)body.length() || body[value + 2] != '"') return;
  const char command = body[value + 1];
  if (command == 'F' || command == 'D' || command == 'N' || command == 'C') {
    uno.write((uint8_t)command);
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const unsigned long started = millis();
  while (time(nullptr) < 1700000000 && millis() - started < 15000) delay(250);
}

void connectMqtt() {
  if (mqtt.connected()) return;
  while (!mqtt.connected()) {
    const String clientId = "tawaf-esp32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    const char *lastWill = "{\"type\":\"serial\",\"port\":\"ESP32\",\"connected\":false,\"online\":false,\"ts\":0}";
    if (mqtt.connect(clientId.c_str(), STATUS_TOPIC, 1, true, lastWill)) {
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
  tls.setCACert(ROOT_CA);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setKeepAlive(30);
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
