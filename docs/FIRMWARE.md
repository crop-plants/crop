# ESP32 field node — reference firmware

This is the documented reference for the low-cost field node that posts to
`POST /api/v1/ingest`. It is a reference sketch (Arduino framework), not a
compiled PlatformIO project — the hardware was not available in this build.

## Wiring (per spec 9.2)

| Peripheral | Pin | Notes |
| --- | --- | --- |
| Capacitive soil moisture | ADC1 (GPIO 32–39 only) | ADC2 does **not** work while Wi-Fi is on |
| DS18B20 soil temperature | any GPIO + 4.7 kΩ pull-up to 3V3 | OneWire |
| EC sensor analogue front-end | ADC1 | or RS485 if the probe supports it |
| DHT22 (station only) | digital GPIO | air temp + RH |
| Battery divider | ADC1 | 100k/100k → measure Vbat |

## Cycle

1. Wake from deep sleep, power the sensor rail.
2. Wait for stabilisation (moisture 500 ms), take 16 samples, keep the median.
3. Read the battery voltage through the divider.
4. Connect Wi-Fi, sync time via NTP.
5. POST JSON over HTTP with the node API key (`X-API-Key` header):

```cpp
// crop-node.ino (reference sketch)
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

const char* WIFI_SSID = "...";           // set via captive portal on first boot (NVS)
const char* WIFI_PASS = "...";
const char* API_URL  = "http://<host>/api/v1/ingest";
const char* API_KEY  = "crop-demo-node-1";  // per-node key; stored hashed server-side

OneWire oneWire(4);
DallasTemperature soilTemp(&oneWire);

int medianOf16(int pin) {
  int v[16];
  for (auto &x : v) { x = analogRead(pin); delay(5); }
  std::sort(v, v + 16);
  return v[8];
}

void setup() {
  Serial.begin(115200);
  analogSetAttenuation(ADC_11db);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(200);

  float tC = NAN;
  soilTemp.requestTemperatures();
  tC = soilTemp.getTempCByIndex(0);

  int moistureRaw = medianOf16(32);
  int ecRaw       = medianOf16(33);
  float battery   = analogReadMilliVolts(34) / 1000.0 * 2.0; // divider

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  String body = String("{\"node_id\":\"Node 1\"") +
                ",\"battery_v\":" + String(battery, 2) +
                ",\"rssi\":" + WiFi.RSSI() +
                ",\"readings\":{\"moisture_raw\":" + moistureRaw +
                ",\"soil_temp_c\":" + String(tC, 2) + ",\"ec_raw\":" + ecRaw + "}}";
  int code = http.POST(body);
  if (code != 202) storeForRetry(body);   // keep up to 200 records in flash (NVS/LittleFS)
  http.end();
}

void loop() {
  delay(600000);            // deep sleep in production: esp_deep_sleep(10 * 60 * 1000000ULL);
}
```

6. On POST failure, buffer up to 200 readings in flash and send them in the next cycle.
7. Deep sleep 10 minutes (configurable).

## Notes

- EC → ECe: the server stores the sensor's 1:5-basis reading; the app converts with a
  texture factor that must be calibrated against a lab ECe (saturated-paste) test.
- pH is a manual kit on a prepared soil–water sample — log it in the app, don't stream it.
- The bioelectric module (INA128 + ADS1115 over I²C, 100–250 Hz bursts) posts batches to
  `/api/v1/bio`; it is experimental and never influences recommendations.
