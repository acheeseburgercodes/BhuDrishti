/*
  GLOF Bridge Node — ESP32-WROOM-32 (WiFi + BLE + Serial)
  ----------------------------------------------------------
  Same dual-role bridge as before (WiFi SoftAP + BLE via NimBLE),
  with one addition: every event is ALSO printed as a JSON line over
  USB Serial, so the backend can read events either by polling
  /events over WiFi, or directly off the serial port -- whichever is
  more convenient for a given demo setup. Nothing about the WiFi/BLE
  side was removed.

  Manual trigger: uses the ESP32 dev board's BUILT-IN BOOT button
  (GPIO0 on virtually all WROOM-32 dev boards) -- no external button
  wiring needed.

  Pin mappings (unchanged):
    RED_LED    -> GPIO2
    GREEN_LED  -> GPIO4
    BUTTON_PIN -> GPIO0 (onboard BOOT button, active LOW)

  REQUIRED Arduino IDE settings:
    - Tools > Partition Scheme > "Minimal SPIFFS (1.9MB APP with OTA)"
      or "No OTA (2MB APP)"  -- needed for BLE + WiFi to fit
    - Tools > Flash Size > match your actual board

  Libraries needed:
    - WiFi.h, WebServer.h (built-in, ESP32 core)
    - NimBLE-Arduino (by h2zero) -- Library Manager
*/

#include <WiFi.h>
#include <WebServer.h>
#include <NimBLEDevice.h>

// ---------- Pin config ----------
const int RED_LED   = 2;
const int GREEN_LED = 4;
const int BUTTON_PIN = 0;   // onboard BOOT button, active LOW (internal pull-up)

// ---------- WiFi SoftAP config ----------
const char* AP_SSID = "GLOF_Bridge";
const char* AP_PASS = "bridge1234";
WebServer server(80);

// ---------- BLE config ----------
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_NOTIFY_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8" // ESP32 -> phone
#define CHAR_WRITE_UUID     "beb5483e-36e1-4688-b7f5-ea07361b26a9" // phone -> ESP32
NimBLECharacteristic *pNotifyChar;
bool phoneConnected = false;

// ---------- Shared event queue (for the /events HTTP endpoint) ----------
#define QUEUE_SIZE 10
String eventQueue[QUEUE_SIZE];
int queueHead = 0;
int queueTail = 0;
int queueCount = 0;

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

void pushEvent(const String &source, const String &type) {
  String out = makeEventJson(source, type);

  // 1) Serial output -- backend can read this directly over USB
  Serial.println(out);

  // 2) Also queue for the /events HTTP endpoint (WiFi polling still works)
  if (queueCount >= QUEUE_SIZE) {
    queueHead = (queueHead + 1) % QUEUE_SIZE;
    queueCount--;
  }
  eventQueue[queueTail] = out;
  queueTail = (queueTail + 1) % QUEUE_SIZE;
  queueCount++;

  digitalWrite(RED_LED, HIGH);
  digitalWrite(GREEN_LED, LOW);
}

// ---------- BLE callbacks ----------
class ServerCallbacks: public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer) {
    phoneConnected = true;
    Serial.println("Phone connected via BLE");
  }
  void onDisconnect(NimBLEServer* pServer) {
    phoneConnected = false;
    Serial.println("Phone disconnected");
    NimBLEDevice::startAdvertising();
  }
};

class WriteCallbacks: public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pChar) {
    std::string value = pChar->getValue();
    if (value.length() > 0) {
      Serial.println("Received from phone: " + String(value.c_str()));
      pushEvent("phone_layer", "detected_event");
    }
  }
};

// ---------- HTTP handlers ----------
void handleEvents() {
  String response = "[";
  bool first = true;
  while (queueCount > 0) {
    if (!first) response += ",";
    response += eventQueue[queueHead];
    first = false;
    queueHead = (queueHead + 1) % QUEUE_SIZE;
    queueCount--;
  }
  response += "]";
  server.send(200, "application/json", response);

  if (queueCount == 0) {
    digitalWrite(RED_LED, LOW);
    digitalWrite(GREEN_LED, HIGH);
  }
}

void handleStatus() {
  String response = "{\"phone_connected\":";
  response += (phoneConnected ? "true" : "false");
  response += ",\"pending_events\":";
  response += String(queueCount);
  response += "}";
  server.send(200, "application/json", response);
}

void handleRoot() {
  server.send(200, "text/plain", "GLOF Bridge Node - alive");
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);

  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);   // onboard BOOT button
  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(RED_LED, LOW);

  // --- WiFi SoftAP ---
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.println("SoftAP started");
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP());

  server.on("/", handleRoot);
  server.on("/events", handleEvents);
  server.on("/status", handleStatus);
  server.begin();
  Serial.println("HTTP server started");

  // --- NimBLE server ---
  NimBLEDevice::init("GLOF_Bridge_BLE");
  NimBLEServer *pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  NimBLEService *pService = pServer->createService(SERVICE_UUID);

  pNotifyChar = pService->createCharacteristic(
      CHAR_NOTIFY_UUID,
      NIMBLE_PROPERTY::NOTIFY
  );

  NimBLECharacteristic *pWriteChar = pService->createCharacteristic(
      CHAR_WRITE_UUID,
      NIMBLE_PROPERTY::WRITE
  );
  pWriteChar->setCallbacks(new WriteCallbacks());

  pService->start();
  NimBLEDevice::startAdvertising();
  Serial.println("BLE advertising started");

  Serial.println(makeEventJson("esp32_node", "boot"));
}

// ---------- Loop ----------
unsigned long lastButtonCheck = 0;
bool lastButtonState = HIGH;

void loop() {
  server.handleClient();

  // Manual trigger via onboard BOOT button
  if (millis() - lastButtonCheck > 50) {
    bool currentState = digitalRead(BUTTON_PIN);
    if (currentState == LOW && lastButtonState == HIGH) {
      pushEvent("esp32_node", "detected_event");

      if (phoneConnected) {
        pNotifyChar->setValue("event_triggered");
        pNotifyChar->notify();
      }
    }
    lastButtonState = currentState;
    lastButtonCheck = millis();
  }
}
