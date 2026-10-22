// Arduino Uno Controller with OLED (SCL=10, SDA=12) + Buzzer (D11) + Auto-Lamp (D13)

#include <SoftwareSerial.h>
#include <U8g2lib.h> // OLED library

// OLED display using software I2C (SCL=10, SDA=12). Move its SDA wire to D12;
// D11 is reserved for the emergency buzzer.
U8G2_SSD1306_128X64_NONAME_F_SW_I2C u8g2(U8G2_R0, 10, 12, U8X8_PIN_NONE);

// Pins
const byte PIN_GREEN  = 8;
const byte PIN_RED    = 9;
const byte PIN_BUZZER = 11;
const byte PIN_LAMP   = 13;  // Auto-Lamp (D13 — now free from OLED)

// HC-05 Bluetooth (RX=2, TX=3)
const byte BT_RX = 2;
const byte BT_TX = 3;
SoftwareSerial bluetooth(BT_RX, BT_TX);

// State Variables
bool fallAlarm = false;
bool blinkState = false;
bool lampOn = false;          // Auto-Lamp state
unsigned long lastBlinkTime = 0;
unsigned long lastCommandTime = 0;

const unsigned long BLINK_INTERVAL = 250;
const unsigned long WATCHDOG_TIMEOUT = 3500;

// ---------- Helper functions ----------
void setLeds(bool green, bool red) {
  if (red) green = false; // never both on
  digitalWrite(PIN_GREEN, green ? HIGH : LOW);
  digitalWrite(PIN_RED,   red   ? HIGH : LOW);
}

void buzzerOn()  { tone(PIN_BUZZER, 2000); }
void buzzerOff() { noTone(PIN_BUZZER);     digitalWrite(PIN_BUZZER, LOW); }

void setSafeMode() {
  fallAlarm = false;
  blinkState = false;
  setLeds(true, false); // Green ON, Red OFF
  buzzerOff();
  // Note: lamp stays as-is (controlled independently by darkness)
}

void setFallAlert() {
  fallAlarm = true;
  blinkState = true;
  lastBlinkTime = millis();
  setLeds(false, true); // Green OFF, Red ON
  buzzerOn();
}

void testHardware() {
  setLeds(true, false); buzzerOff(); delay(800);
  setLeds(false, false); delay(200);
  setLeds(false, true); buzzerOn(); delay(800);
  setLeds(false, false); buzzerOff(); delay(200);
  // Lamp test flash
  digitalWrite(PIN_LAMP, HIGH); delay(600);
  digitalWrite(PIN_LAMP, lampOn ? HIGH : LOW); // restore lamp state
  setSafeMode();
}

void testOled() {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB14_tr);
  u8g2.drawStr(0, 20, "OLED OK");
  u8g2.sendBuffer();
  delay(2000);
}

void displayStats(int active, int fallen) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB14_tr);
  char line1[30];
  char line2[30];
  sprintf(line1, "Active: %d", active);
  sprintf(line2, "Fallen: %d", fallen);
  u8g2.drawStr(0, 20, line1);
  u8g2.drawStr(0, 40, line2);
  u8g2.sendBuffer();
}

// ---------- Command handling ----------
void handleCommand(char cmd) {
  lastCommandTime = millis();
  if      (cmd == 'F' || cmd == 'f' || cmd == 'R' || cmd == 'r') setFallAlert();
  else if (cmd == 'N' || cmd == 'n' || cmd == 'G' || cmd == 'g') setSafeMode();
  else if (cmd == 'T' || cmd == 't')                              testHardware();
  else if (cmd == 'D' || cmd == 'd') {   // Dark → Lamp ON
    lampOn = true;
    digitalWrite(PIN_LAMP, HIGH);
  }
  else if (cmd == 'O' || cmd == 'o') {   // Dedicated command: darkness lamp OFF
    lampOn = false;
    digitalWrite(PIN_LAMP, LOW);
  }
  else if (cmd == 'C' || cmd == 'c') {   // Backward-compatible lamp OFF
    lampOn = false;
    digitalWrite(PIN_LAMP, LOW);
  }
}

// Buffer for incoming serial data (e.g., "C,fallen,active")
String incoming = "";

void handleIncomingChar(char c) {
  if (c == '\r' || c == '\n') {
    if (incoming.length() > 0) {
      // Expect format C,<fallen>,<active>
      if (incoming.charAt(0) == 'C' && incoming.length() > 4) {
        int firstComma = incoming.indexOf(',');
        int secondComma = incoming.indexOf(',', firstComma + 1);
        if (firstComma > 0 && secondComma > firstComma) {
          int fallen = incoming.substring(firstComma + 1, secondComma).toInt();
          int active = incoming.substring(secondComma + 1).toInt();
          displayStats(active, fallen);
        }
      }
    }
    incoming = ""; // reset buffer
    return;
  }
  // Simple commands (single letters) are still supported
  if (c == 'F' || c == 'f' || c == 'R' || c == 'r' ||
      c == 'N' || c == 'n' || c == 'G' || c == 'g' ||
      c == 'T' || c == 't' ||
      c == 'D' || c == 'd' || c == 'C' || c == 'c') {
    handleCommand(c);
    return;
  }
  incoming += c; // accumulate other characters
}

void setup() {
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LAMP, OUTPUT);

  setLeds(false, false);
  buzzerOff();
  digitalWrite(PIN_LAMP, LOW);  // Lamp OFF at startup

  Serial.begin(9600);
  bluetooth.begin(9600);

  u8g2.begin();
  // إذا كان العنوان 0x3D (0x7A) فافعل السطر أعلاه

  testOled();
  setSafeMode();
  lastCommandTime = millis();
}

void loop() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    handleIncomingChar(c);
  }
  while (bluetooth.available() > 0) {
    char c = (char)bluetooth.read();
    handleIncomingChar(c);
  }

  unsigned long now = millis();
  if (fallAlarm && (now - lastCommandTime > WATCHDOG_TIMEOUT)) {
    setSafeMode();
  }

  if (fallAlarm) {
    digitalWrite(PIN_GREEN, LOW);
    if (now - lastBlinkTime >= BLINK_INTERVAL) {
      lastBlinkTime = now;
      blinkState = !blinkState;
      digitalWrite(PIN_RED, blinkState ? HIGH : LOW);
      if (blinkState) buzzerOn(); else buzzerOff();
    }
  }
}

