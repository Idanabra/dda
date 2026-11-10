import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5';

const nullable = (type) => ({ type: [type, 'null'] });

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['store_name', 'date', 'total', 'items'],
  properties: {
    store_name: nullable('string'),
    date: { ...nullable('string'), description: 'YYYY-MM-DD if visible' },
    total: { ...nullable('number'), description: 'Grand total paid, in ILS' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'barcode', 'quantity', 'unit_price', 'line_total', 'is_weighted'],
        properties: {
          name: { type: 'string', description: 'Product name exactly as printed (usually Hebrew)' },
          barcode: { ...nullable('string'), description: 'Item barcode / code if printed, digits only' },
          quantity: { type: 'number', description: 'Units, or kilograms for weighted items' },
          unit_price: { ...nullable('number'), description: 'Price per unit or per kg, before discounts' },
          line_total: { ...nullable('number'), description: 'Amount charged for the line after line discounts' },
          is_weighted: { type: 'boolean' },
        },
      },
    },
  },
};

const PROMPT = `This is an Israeli supermarket receipt (קבלה / חשבונית). Extract every purchased product line.

- Keep product names exactly as printed; don't translate.
- If a barcode or item code is printed next to the product, put its digits in "barcode", otherwise null.
- Weighted produce: quantity is the weight in kg and unit_price is the price per kg.
- Fold discount lines (הנחה, מבצע) into the line_total of the product they apply to; don't list them as items.
- Skip deposits (פיקדון), bags (שקית), totals, VAT, payment and loyalty-club lines.
- Prices are in shekels. Use null for anything you can't read.`;

let client;

/**
 * Read a receipt image or PDF and return { store_name, date, total, items[] }.
 * @param {Buffer} buffer
 * @param {string} mediaType  image/jpeg | image/png | image/webp | image/gif | application/pdf
 */
export async function extractReceipt(buffer, mediaType) {
  const data = buffer.toString('base64');
  const fileBlock =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };

  client ??= new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: RECEIPT_SCHEMA } },
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === 'refusal') {
    throw new Error(`The model declined to read this receipt (${response.stop_details?.category ?? 'refusal'})`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Receipt too long: output was cut off');

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const receipt = JSON.parse(text);
  receipt.items = receipt.items
    .filter((it) => it.name && it.name.trim())
    .map((it) => ({ ...it, barcode: it.barcode ? it.barcode.replace(/\D/g, '') || null : null }));
  return receipt;
}
