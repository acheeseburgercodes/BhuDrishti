#include <WiFi.h>
#include <WebServer.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>   // install via Library Manager: "ArduinoJson" by Benoit Blanchon
 
// ---------- Pin config ----------
const int RED_LED   = 2;
const int GREEN_LED = 4;
const int BUTTON_PIN = 16;   // uses internal pull-up; press = LOW

// ---------- WiFi SoftAP config ----------
const char* AP_SSID = "GLOF_Bridge";
const char* AP_PASS = "bridge1234";   // change before real use
WebServer server(80);

// ---------- BLE config ----------
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_NOTIFY_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8" // ESP32 -> phone
#define CHAR_WRITE_UUID     "beb5483e-36e1-4688-b7f5-ea07361b26a9" // phone -> ESP32
BLECharacteristic *pNotifyChar;
bool phoneConnected = false;

// ---------- Shared event queue ----------
// Simple fixed-size ring buffer of pending events. Each event is a
// small JSON string: {"source": "...", "type": "...", "timestamp": ...}
#define QUEUE_SIZE 10
String eventQueue[QUEUE_SIZE];
int queueHead = 0;
int queueTail = 0;
int queueCount = 0;

void pushEvent(const String &source, const String &type) {
  if (queueCount >= QUEUE_SIZE) {
    // drop oldest if full
    queueHead = (queueHead + 1) % QUEUE_SIZE;
    queueCount--;
  }
  StaticJsonDocument<128> doc;
  doc["source"] = source;
  doc["type"] = type;
  doc["timestamp"] = millis();
  String out;
  serializeJson(doc, out);

  eventQueue[queueTail] = out;
  queueTail = (queueTail + 1) % QUEUE_SIZE;
  queueCount++;

  Serial.println("Queued event: " + out);
  digitalWrite(RED_LED, HIGH);
  digitalWrite(GREEN_LED, LOW);
}

// ---------- BLE callbacks ----------
class ServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    phoneConnected = true;
    Serial.println("Phone connected via BLE");
  }
  void onDisconnect(BLEServer* pServer) {
    phoneConnected = false;
    Serial.println("Phone disconnected");
    pServer->startAdvertising(); // keep advertising so it can reconnect
  }
};

class WriteCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pChar) {
    String value = pChar->getValue();
    if (value.length() > 0) {
      Serial.println("Received from phone: " + String(value.c_str()));
      // Treat any write from the phone as a phone-detected event.
      // Expecting a simple payload like "event" or a JSON blob; we
      // just tag it and queue it regardless of exact contents.
      pushEvent("phone_layer", "detected_event");
    }
  }
};

// ---------- HTTP handlers ----------
void handleEvents() {
  // Returns all queued events as a JSON array, then clears the queue.
  StaticJsonDocument<512> doc;
  JsonArray arr = doc.to<JsonArray>();

  while (queueCount > 0) {
    StaticJsonDocument<128> single;
    deserializeJson(single, eventQueue[queueHead]);
    arr.add(single.as<JsonObject>());
    queueHead = (queueHead + 1) % QUEUE_SIZE;
    queueCount--;
  }

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);

  if (queueCount == 0) {
    digitalWrite(RED_LED, LOW);
    digitalWrite(GREEN_LED, HIGH);
  }
}

void handleStatus() {
  StaticJsonDocument<128> doc;
  doc["phone_connected"] = phoneConnected;
  doc["pending_events"] = queueCount;
  String response;
  serializeJson(doc, response);
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
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(RED_LED, LOW);

  // --- WiFi SoftAP ---
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.println("SoftAP started");
  Serial.print("AP IP address: ");
  Serial.println(WiFi.softAPIP()); // typically 192.168.4.1

  server.on("/", handleRoot);
  server.on("/events", handleEvents);
  server.on("/status", handleStatus);
  server.begin();
  Serial.println("HTTP server started");

  // --- BLE server ---
  BLEDevice::init("GLOF_Bridge_BLE");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pNotifyChar = pService->createCharacteristic(
      CHAR_NOTIFY_UUID,
      BLECharacteristic::PROPERTY_NOTIFY
  );
  pNotifyChar->addDescriptor(new BLE2902());

  BLECharacteristic *pWriteChar = pService->createCharacteristic(
      CHAR_WRITE_UUID,
      BLECharacteristic::PROPERTY_WRITE
  );
  pWriteChar->setCallbacks(new WriteCallbacks());

  pService->start();
  pServer->getAdvertising()->start();
  Serial.println("BLE advertising started");
}

// ---------- Loop ----------
unsigned long lastButtonCheck = 0;
bool lastButtonState = HIGH;

void loop() {
  server.handleClient();

  // Poll button with simple debounce
  if (millis() - lastButtonCheck > 50) {
    bool currentState = digitalRead(BUTTON_PIN);
    if (currentState == LOW && lastButtonState == HIGH) {
      // button just pressed
      pushEvent("esp32_node", "detected_event");

      // Also notify any connected phone directly, in case it wants
      // to display the alert immediately rather than waiting on the
      // laptop's poll cycle.
      if (phoneConnected) {
        pNotifyChar->setValue("event_triggered");
        pNotifyChar->notify();
      }
    }
    lastButtonState = currentState;
    lastButtonCheck = millis();
  }
}
