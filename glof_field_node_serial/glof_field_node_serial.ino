/*
  GLOF Field Node — ESP32-WROOM-32 (Serial version)
  ----------------------------------------------------
  Simplified from the WiFi+BLE bridge version: this node just streams
  JSON event lines over USB Serial. The backend (or a small Python
  bridge script) reads this serial port directly and forwards events
  into the classification/ingest pipeline -- no WiFi, no BLE, no
  partition-size headaches.

  Manual trigger: uses the ESP32 dev board's BUILT-IN BOOT button
  (tied to GPIO0 on virtually all WROOM-32 dev boards) -- no extra
  wiring needed for the trigger itself.

  Pin mappings kept identical to the earlier bridge version:
    RED_LED    -> GPIO2
    GREEN_LED  -> GPIO4
    BUTTON_PIN -> GPIO0 (onboard BOOT button, active LOW)

  Output format (one JSON object per line over Serial @ 115200):
    {"source":"esp32_node","type":"detected_event","timestamp":12345}

  No libraries beyond the ESP32 core are required.
*/

// ---------- Pin config (unchanged from bridge version) ----------
const int RED_LED    = 2;
const int GREEN_LED  = 4;
const int BUTTON_PIN = 0;   // onboard BOOT button, active LOW (internal pull-up)

// ---------- Timing ----------
unsigned long lastButtonCheck = 0;
bool lastButtonState = HIGH;

unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 5000; // periodic "alive" line for the backend

// Tiny manual JSON builder -- same approach as the bridge version,
// no ArduinoJson dependency needed.
String makeEventJson(const String &source, const String &type) {
  String out = "{\"source\":\"";
  out += source;
  out += "\",\"type\":\"";
  out += type;
  out += "\",\"timestamp\":";
  out += String(millis());
  out += "}";
  return out;
}

void sendEvent(const String &source, const String &type) {
  String line = makeEventJson(source, type);
  Serial.println(line);   // backend reads this line over the serial port

  // Brief visual confirmation on the board itself
  digitalWrite(RED_LED, HIGH);
  digitalWrite(GREEN_LED, LOW);
}

void setup() {
  Serial.begin(115200);

  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);   // onboard BOOT button, no external wiring

  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(RED_LED, LOW);

  delay(300); // let the serial monitor/backend attach before first line
  Serial.println(makeEventJson("esp32_node", "boot"));
}

void loop() {
  // --- Manual trigger via onboard BOOT button ---
  if (millis() - lastButtonCheck > 50) {   // simple debounce
    bool currentState = digitalRead(BUTTON_PIN);
    if (currentState == LOW && lastButtonState == HIGH) {
      sendEvent("esp32_node", "detected_event");
    }
    lastButtonState = currentState;
    lastButtonCheck = millis();
  }

  // --- Periodic heartbeat so the backend knows this node is alive ---
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
    Serial.println(makeEventJson("esp32_node", "heartbeat"));
    lastHeartbeat = millis();

    // Return to idle LED state a little after any event flash
    digitalWrite(RED_LED, LOW);
    digitalWrite(GREEN_LED, HIGH);
  }
}
