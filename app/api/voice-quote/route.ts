import Anthropic from '@anthropic-ai/sdk'

// Parses a spoken job description into structured quote fields.
// The client sends the raw speech transcript plus the business's live service
// list; Claude does the reasoning (math, service matching, surface type) and
// returns strict JSON. Anything it can't determine confidently comes back null.

type ServiceInfo = {
  id: string
  service_name: string
  unit: string
  category: string
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['paraphrase', 'customer_name', 'address', 'phone', 'quote_type', 'line_items', 'notes'],
  properties: {
    paraphrase: {
      type: 'string',
      description:
        'A short, natural read-back (2-4 sentences) of everything you understood, so the salesperson can confirm before the form is filled.',
    },
    customer_name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    address: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    phone: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    quote_type: {
      anyOf: [{ type: 'string', enum: ['asphalt', 'concrete', 'both'] }, { type: 'null' }],
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['service_rate_id', 'quantity'],
        properties: {
          service_rate_id: { type: 'string', description: 'Must be an exact id from the provided service list.' },
          quantity: { type: 'number', description: 'Final computed quantity in the service’s own unit.' },
        },
      },
    },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const

const SYSTEM_PROMPT = `You turn a salesperson's spoken description of a paving/concrete job into structured quote fields. The input is raw speech-to-text: it may have no punctuation, numbers spelled out as words, and information in any order.

Reasoning rules:
- Do the math. When measurements are given as calculations or dimensions ("twenty times fifteen plus thirty times ten", "the pad is 20 by 12"), compute the final number and use it. Quantities must be in the service's own unit (area services in square feet, linear services in feet, weight services in pounds).
- If the same service applies to multiple sections, add them together into ONE line item for that service.
- Match what's described to the closest service in the provided list, even when the exact name isn't used (e.g. "seal the driveway" on asphalt is a sealcoat service; "fill the cracks" maps to the crack filler for that surface). Use only ids from the list. If nothing in the list is a reasonable match, do not invent a line item — mention it in notes instead.
- Infer quote_type from the surfaces/services described: "asphalt", "concrete", or "both". Leave it null only if genuinely unclear.
- Anything relevant that doesn't belong in a specific field (surface conditions, access issues, special requests, timing, context) goes into notes, written cleanly. Don't duplicate values already captured in other fields.
- If something is unclear or missing, leave that field null (or omit the line item) rather than guessing. The salesperson reviews and edits everything afterward.
- Never assign or mention price tiers or dollar amounts.
- Clean up obvious speech-to-text artifacts: capitalize names properly, format phone numbers like (403) 555-0123, write addresses normally.

The paraphrase is read back to the salesperson for confirmation before anything is filled in — make it a faithful, natural summary of what you understood, including computed quantities, and note anything you left out or found unclear.`

export async function POST(request: Request) {
  let body: { transcript?: unknown; services?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : ''
  const services = Array.isArray(body.services) ? (body.services as ServiceInfo[]) : []
  if (!transcript || services.length === 0) {
    return Response.json({ error: 'A transcript and service list are required.' }, { status: 400 })
  }

  const serviceList = services
    .filter(s => s && typeof s.id === 'string')
    .map(s => ({ id: s.id, name: s.service_name, unit: s.unit, category: s.category }))
  const validIds = new Set(serviceList.map(s => s.id))

  try {
    const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Available services (id, name, unit, category):\n${JSON.stringify(serviceList, null, 2)}\n\nSpoken transcript:\n"""\n${transcript}\n"""`,
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return Response.json({ error: 'The AI declined to process this input.' }, { status: 502 })
    }

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return Response.json({ error: 'The AI returned no result.' }, { status: 502 })
    }

    const parsed = JSON.parse(textBlock.text)

    // Defensive cleanup: only known service ids, positive finite quantities,
    // and one merged line per service.
    const merged = new Map<string, number>()
    if (Array.isArray(parsed.line_items)) {
      for (const item of parsed.line_items) {
        const id = item?.service_rate_id
        const qty = Number(item?.quantity)
        if (!validIds.has(id) || !Number.isFinite(qty) || qty <= 0) continue
        merged.set(id, (merged.get(id) ?? 0) + qty)
      }
    }

    return Response.json({
      paraphrase: typeof parsed.paraphrase === 'string' ? parsed.paraphrase : '',
      customer_name: typeof parsed.customer_name === 'string' ? parsed.customer_name : null,
      address: typeof parsed.address === 'string' ? parsed.address : null,
      phone: typeof parsed.phone === 'string' ? parsed.phone : null,
      quote_type: ['asphalt', 'concrete', 'both'].includes(parsed.quote_type) ? parsed.quote_type : null,
      line_items: Array.from(merged, ([service_rate_id, quantity]) => ({ service_rate_id, quantity })),
      notes: typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim() : null,
    })
  } catch (err) {
    console.error('[voice-quote]', err)
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: 'Too many requests right now. Try again in a moment.' }, { status: 502 })
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json({ error: 'The AI service returned an error.' }, { status: 502 })
    }
    return Response.json({ error: 'Voice processing failed.' }, { status: 500 })
  }
}
