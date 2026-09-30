-- DEMO seed data. Every row is flagged is_demo = true and the UI labels it as demo.
-- Coordinates are approximate (±1 km); values are illustrative, not a real deployment.
insert into public.devices (id, name, kind, source, lat, lng, status, battery_pct, last_seen, range_km, reliability, is_demo) values
  ('BD-001', 'Rasuwa Glacier Gate', 'esp32', 'esp32_node', 28.285, 85.383, 'online', 92, now() - interval '40 seconds', 3.0, 0.9, true),
  ('BD-002', 'Syabrubesi', 'esp32', 'esp32_node', 28.161, 85.345, 'online', 78, now() - interval '75 seconds', 3.0, 0.85, true),
  ('BD-003', 'Dhunche', 'esp32', 'esp32_node', 28.110, 85.296, 'warning', 64, now() - interval '10 minutes', 2.5, 0.7, true),
  ('BD-004', 'Rasuwagadhi', 'esp32', 'esp32_node', 28.262, 85.377, 'online', 86, now() - interval '30 seconds', 3.0, 0.85, true),
  ('BD-005', 'Trishuli Bazaar', 'esp32', 'esp32_node', 27.899, 85.147, 'offline', 31, now() - interval '2 hours', 3.0, 0.6, true),
  ('BD-006', 'Betrawati', 'esp32', 'esp32_node', 27.970, 85.187, 'online', 73, now() - interval '25 minutes', 3.0, 0.8, true),
  ('BD-007', 'Nuwakot Downstream', 'esp32', 'esp32_node', 27.862, 85.125, 'online', 88, now() - interval '90 seconds', 3.0, 0.85, true)
on conflict (id) do nothing;
