/**
 * Device fingerprinting — best-effort type label + icon from the passive
 * metadata the dongle already reports (Class-of-Device for Classic, name +
 * advertised traits for BLE). Heuristic, offline, no lookups.
 */
const TI = {
  phone: 'ti-device-mobile', computer: 'ti-device-laptop', audio: 'ti-headphones',
  wearable: 'ti-watch', input: 'ti-keyboard', mouse: 'ti-mouse', tv: 'ti-device-tv',
  health: 'ti-heartbeat', beacon: 'ti-broadcast', tag: 'ti-tag', car: 'ti-car',
  network: 'ti-router', imaging: 'ti-printer', toy: 'ti-mood-smile', unknown: 'ti-bluetooth'
};

/* Class-of-Device major class → label (Bluetooth assigned numbers) */
function classicType(cod) {
  const v = typeof cod === 'string' ? parseInt(cod, 16) : (cod || 0);
  const major = (v >> 8) & 0x1f;
  switch (major) {
    case 0x01: return ['Computer', TI.computer];
    case 0x02: return ['Phone', TI.phone];
    case 0x03: return ['Network', TI.network];
    case 0x04: {
      const minor = (v >> 2) & 0x3f;             /* audio/video minor */
      if (minor === 0x01 || minor === 0x02) return ['Headset', TI.audio];
      if (minor === 0x06) return ['Headphones', TI.audio];
      if (minor === 0x0b || minor === 0x0c) return ['Display/TV', TI.tv];
      if (minor === 0x08) return ['Car audio', TI.car];
      return ['Audio/Video', TI.audio];
    }
    case 0x05: {
      const minor = (v >> 6) & 0x03;             /* peripheral */
      if (minor === 0x01) return ['Keyboard', TI.input];
      if (minor === 0x02) return ['Mouse', TI.mouse];
      return ['Peripheral', TI.input];
    }
    case 0x06: return ['Imaging', TI.imaging];
    case 0x07: return ['Wearable', TI.wearable];
    case 0x08: return ['Toy', TI.toy];
    case 0x09: return ['Health', TI.health];
    default:   return ['Device', TI.unknown];
  }
}

function nameGuess(name) {
  const n = (name || '').toLowerCase();
  if (!n) return null;
  if (/(buds|airpods|headphone|headset|speaker|soundbar|jbl|bose|beats)/.test(n)) return ['Audio', TI.audio];
  if (/(watch|band|fit|garmin|whoop)/.test(n)) return ['Wearable', TI.wearable];
  if (/(iphone|galaxy|pixel|phone|redmi|oneplus)/.test(n)) return ['Phone', TI.phone];
  if (/(macbook|laptop|desktop|pc|thinkpad)/.test(n)) return ['Computer', TI.computer];
  if (/(mouse|mx |logi)/.test(n)) return ['Mouse', TI.mouse];
  if (/(keyboard|keeb)/.test(n)) return ['Keyboard', TI.input];
  if (/(tv|roku|chromecast|firestick|bravia)/.test(n)) return ['Display/TV', TI.tv];
  if (/(tile|airtag|smarttag|tag)/.test(n)) return ['Tracker tag', TI.tag];
  if (/(beacon|eddystone|ibeacon)/.test(n)) return ['Beacon', TI.beacon];
  if (/(heart|hrm|polar|oxi)/.test(n)) return ['Health', TI.health];
  if (/(car|tesla|bmw|vw|toyota|ford)/.test(n)) return ['Car', TI.car];
  return null;
}

export function deviceType(d) {
  if (!d) return ['Device', TI.unknown];
  const byName = nameGuess(d.name);
  if (byName) return byName;
  if (d.cod || d.cls) return classicType(d.cod || d.cls);
  /* BLE with no name: random address that rotates = likely a phone/tracker */
  if (d.atype === 'random') return ['Private BLE', TI.tag];
  if (d.atype === 'public') return ['BLE device', TI.beacon];
  return ['Device', TI.unknown];
}
