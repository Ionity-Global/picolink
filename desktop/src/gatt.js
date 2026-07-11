/**
 * BLE GATT helpers — friendly names for standard service/characteristic UUIDs,
 * a broad optionalServices allowlist (Chromium only lets you read services you
 * requested), and a value decoder (hex + text + known formats).
 */

/* comprehensive-enough allowlist so getPrimaryServices() content is readable */
export const OPTIONAL_SERVICES = [
  'generic_access', 'generic_attribute', 'device_information', 'battery_service',
  'heart_rate', 'health_thermometer', 'human_interface_device', 'immediate_alert',
  'link_loss', 'tx_power', 'current_time', 'environmental_sensing', 'user_data',
  'cycling_power', 'cycling_speed_and_cadence', 'running_speed_and_cadence',
  'location_and_navigation', 'glucose', 'blood_pressure', 'weight_scale',
  'body_composition', 'pulse_oximeter', 'fitness_machine',
  0x1800, 0x1801, 0x1802, 0x1803, 0x1804, 0x1805, 0x1806, 0x1808, 0x1809,
  0x180A, 0x180D, 0x180F, 0x1810, 0x1812, 0x1814, 0x1816, 0x1818, 0x1819,
  0x181A, 0x181B, 0x181C, 0x181D, 0x1826,
  0xFE9F, 0xFEAA, 0xFEED, 0xFEEC, 0xFD5A, 0xFDCB,
  0xFFE0, 0xFFF0, 0xFF00, 0xFFE5,
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e' /* Nordic UART */
];

const NAMES = {
  '1800': 'Generic Access', '1801': 'Generic Attribute', '180a': 'Device Information',
  '180f': 'Battery', '180d': 'Heart Rate', '1809': 'Health Thermometer',
  '1812': 'HID', '181a': 'Environmental Sensing', '1816': 'Cycling Speed/Cadence',
  '1818': 'Cycling Power', '1826': 'Fitness Machine', '1805': 'Current Time',
  '1804': 'Tx Power', '1802': 'Immediate Alert', '1803': 'Link Loss',
  'fe9f': 'Google', 'feaa': 'Eddystone', 'feed': 'Tile', 'feec': 'Tile',
  'fd5a': 'Samsung SmartTag',
  /* characteristics */
  '2a00': 'Device Name', '2a01': 'Appearance', '2a04': 'Conn Params',
  '2a19': 'Battery Level', '2a29': 'Manufacturer', '2a24': 'Model Number',
  '2a25': 'Serial Number', '2a27': 'HW Revision', '2a26': 'FW Revision',
  '2a28': 'SW Revision', '2a23': 'System ID', '2a37': 'Heart Rate Meas',
  '2a6e': 'Temperature', '2a6f': 'Humidity', '2a6d': 'Pressure',
  '2a19b': 'Battery', '2a07': 'Tx Power Level', '2902': 'CCC descriptor'
};

export function gattName(uuid) {
  if (!uuid) return '';
  const s = String(uuid).toLowerCase();
  const short = s.length === 36 && s.startsWith('0000') ? s.slice(4, 8) : s;
  if (NAMES[short]) return `${NAMES[short]} (0x${short})`;
  if (s.length === 36) return s;           /* full 128-bit vendor UUID */
  return `0x${short}`;
}

const APPEARANCE = {
  0: 'Unknown', 64: 'Phone', 128: 'Computer', 192: 'Watch', 448: 'Heart Rate Sensor',
  512: 'Blood Pressure', 833: 'Heart Rate Belt', 961: 'Keyboard', 962: 'Mouse',
  1088: 'Barcode', 1152: 'Pulse Oximeter', 3072: 'Outdoor'
};

/* decode a DataView into {hex, text, note} */
export function decodeValue(uuid, dv) {
  if (!dv || dv.byteLength === 0) return { hex: '', text: '', note: '' };
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ');
  let text = '';
  const printable = [...bytes].every(b => b === 0 || (b >= 0x20 && b < 0x7f));
  if (printable) text = new TextDecoder().decode(bytes).replace(/\0+$/, '');
  let note = '';
  const short = String(uuid).toLowerCase().slice(4, 8);
  try {
    if (short === '2a19') note = `${dv.getUint8(0)}% battery`;
    else if (short === '2a01') note = APPEARANCE[dv.getUint16(0, true)] || 'appearance ' + dv.getUint16(0, true);
    else if (short === '2a6e') note = (dv.getInt16(0, true) / 100).toFixed(2) + ' °C';
    else if (short === '2a6f') note = (dv.getUint16(0, true) / 100).toFixed(1) + ' %RH';
    else if (short === '2a07') note = dv.getInt8(0) + ' dBm';
    else if (short === '2a37') { const f = dv.getUint8(0); note = (f & 1 ? dv.getUint16(1, true) : dv.getUint8(1)) + ' bpm'; }
    else if (!text && bytes.length <= 4) {
      let v = 0; for (let i = bytes.length - 1; i >= 0; i--) v = v * 256 + bytes[i];
      note = 'uint ' + v;
    }
  } catch { /* best effort */ }
  return { hex, text, note };
}

export function props(c) {
  const p = c.properties || {};
  const out = [];
  if (p.read) out.push('read');
  if (p.write) out.push('write');
  if (p.writeWithoutResponse) out.push('writeNR');
  if (p.notify) out.push('notify');
  if (p.indicate) out.push('indicate');
  return out;
}
