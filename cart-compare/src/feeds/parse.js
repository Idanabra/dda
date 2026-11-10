import { gunzipSync, inflateRawSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';

/** Decompress .gz / .zip (single entry) buffers; return plain buffers untouched. */
export function decompress(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf);
  if (buf[0] === 0x50 && buf[1] === 0x4b) return unzipFirstEntry(buf);
  return buf;
}

function unzipFirstEntry(buf) {
  // Minimal ZIP reader: first local file header only (enough for single-file price archives).
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('Not a zip file');
  const method = buf.readUInt16LE(8);
  let compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  if (compSize === 0) {
    // Size in data descriptor: find central directory entry instead.
    const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    compSize = buf.readUInt32LE(cd + 20);
  }
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`Unsupported zip compression method ${method}`);
}

/** Decode XML bytes; some chains publish UTF-16. */
export function decodeXml(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  return buf.toString('utf8');
}

const lower = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

function isItem(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const keys = Object.keys(o).map((k) => k.toLowerCase());
  return keys.includes('itemcode') && keys.includes('itemprice');
}

function findHeader(root, key) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    for (const [k, v] of Object.entries(n)) {
      if (k.toLowerCase() === key && (typeof v === 'string' || typeof v === 'number')) return String(v);
      if (typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

/**
 * Parse a PriceFull / Price XML file (any chain's dialect: <Items><Item>, <Products><Product>,
 * <Line>, different tag casing) into a normalized item map keyed by barcode (ItemCode).
 */
export function parsePriceXml(xml) {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
  const root = parser.parse(xml);
  const items = {};
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (Array.isArray(n)) {
      for (const x of n) stack.push(x);
      continue;
    }
    if (!n || typeof n !== 'object') continue;
    if (isItem(n)) {
      const o = lower(n);
      const code = str(o.itemcode).replace(/^0+(?=\d{8,})/, '');
      const price = num(o.itemprice);
      if (!code || price === null) continue;
      items[code] = {
        name: str(o.itemname ?? o.itemnm ?? o.manufactureritemdescription),
        price,
        manufacturer: str(o.manufacturername ?? o.manufacturename),
        unitQty: str(o.unitqty),
        quantity: num(o.quantity),
        unitOfMeasure: str(o.unitofmeasure),
        unitPrice: num(o.unitofmeasureprice),
        isWeighted: str(o.biswighted ?? o.bisweighted) === '1',
      };
      continue;
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v);
  }
  return {
    chainCode: findHeader(root, 'chainid'),
    storeId: findHeader(root, 'storeid'),
    items,
  };
}

export function parsePriceFile(buf) {
  return parsePriceXml(decodeXml(decompress(buf)));
}

/** Pull chain/store/timestamp out of names like PriceFull7290058140886-001-202611100300.gz */
export function parseFileName(name) {
  const m = /Price(?:Full)?(\d{13})-(\d+)-(?:\d+-)?(\d{12})/i.exec(name);
  if (!m) return null;
  return { chainCode: m[1], storeId: m[2], stamp: m[3] };
}
