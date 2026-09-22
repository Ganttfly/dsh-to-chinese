/**
 * dsh-to-chinese — Host half.
 *
 * Owns the one endpoint the Client half calls: given a `dsh-resource://file/…`
 * address, read that file, produce a **bilingual** copy — each original English
 * sentence immediately followed by its Simplified Chinese translation — write
 * the `<name>-cn<ext>` sibling next to it, and answer with the new file's own
 * address so the Client can open it in a tab.
 *
 * Structure is protected rather than trusted to the model: YAML front matter and
 * every fenced code block are lifted out into `<!--KEEP:n-->` placeholders
 * before the call and put back verbatim afterwards. A placeholder the model
 * dropped or duplicated fails the request instead of writing a mangled file.
 *
 * The route carries no authentication of its own — the web server has none —
 * which matches every other route owner in the shipped composition: the server
 * binds loopback unless the deployment deliberately exposes it.
 *
 * @module dsh-to-chinese
 */

/** Scheme and type every file address opens with. */
const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

/** The exact path this plugin owns on the web server. */
export const TRANSLATE_PATH = '/to-chinese/translate'

/** Package identity, used to tag the synthetic request message. */
export const PACKAGE_NAME = 'dsh-to-chinese'

/** Cordis plugin name; the bundle patch inserts this row. */
export const name = PACKAGE_NAME

/** Hard dependencies: every one is mounted by the shipped base and web bundles. */
export const inject = ['webServer', 'fs', 'sessions', 'sandboxPolicy', 'llm', 'agentDefaultModel']

/** Refuse documents larger than this many characters rather than truncating them. */
const MAX_INPUT_CHARS = 120000

/** Placeholder standing in for one protected region. */
function keepToken(index) {
  return `<!--KEEP:${index}-->`
}

/** Tolerant matcher for one placeholder: the model may pad the inside. */
function keepPattern(index) {
  return new RegExp(`<!--\\s*KEEP\\s*:\\s*${index}\\s*-->`, 'g')
}

/** Instruction for the translation call: bilingual reading copy, structure intact. */
const SYSTEM_PROMPT = [
  'You turn a Markdown document into a bilingual reading copy: the original English followed by its Simplified Chinese translation, sentence by sentence.',
  'Walk the document in order.',
  'For every sentence of natural-language prose, output the original sentence unchanged on its own line, then its natural Simplified Chinese translation on the very next line.',
  'Separate one sentence pair from the next with exactly one blank line.',
  'Keep the Markdown structure where it is: heading markers, list markers, blockquote markers and table pipes all stay in place.',
  'A heading becomes two lines: the original heading line, then the same heading text translated, with the same markers.',
  'A line holding only a token like <!--KEEP:0--> is a protected region: reproduce that token unchanged, exactly once, on its own line, in its original position.',
  'Never translate, reflow, wrap in backticks, indent or comment on a protected token.',
  'Never translate code, identifiers, file paths, URLs, command names, configuration keys, or Latin-script proper nouns.',
  'Output only the transformed document — no preamble, no commentary, no summary, and no code fence around the whole document.',
].join(' ')

/**
 * Decode a `/`-joined address tail back into one path.
 * @param segments - encoded address segments after the scope.
 * @returns the decoded path.
 */
function decodePath(segments) {
  return segments
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
}

/**
 * Parse a `dsh-resource://file/…` address into its scope and path.
 * @param address - the address carried on the wire.
 * @returns `{ scope, sessionId?, path }`, or `undefined` for another scheme.
 */
export function parseFileAddress(address) {
  if (typeof address !== 'string' || !address.startsWith(FILE_ADDRESS_PREFIX)) return undefined
  const segments = address.slice(FILE_ADDRESS_PREFIX.length).split('/')
  const scope = segments.shift()
  if (scope === 'session') {
    const sessionId = decodeURIComponent(segments.shift() ?? '')
    if (sessionId === '') return undefined
    return { scope, sessionId, path: decodePath(segments) }
  }
  if (scope === 'absolute') return { scope, path: decodePath(segments) }
  return undefined
}

/**
 * Insert `-cn` before the final suffix of a path's last segment.
 * @param path - the source path, POSIX or Windows separators.
 * @returns the sibling path for the translation; a name with no suffix gains a plain `-cn`.
 */
export function chineseSiblingPath(path) {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const directory = cut >= 0 ? path.slice(0, cut + 1) : ''
  const base = cut >= 0 ? path.slice(cut + 1) : path
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return `${directory}${base}-cn`
  return `${directory}${base.slice(0, dot)}-cn${base.slice(dot)}`
}

/**
 * The address of the translation, derived from the source address itself so its
 * encoding and scope are preserved byte for byte.
 * @param address - the source file's address.
 * @returns the sibling address.
 */
export function chineseSiblingAddress(address) {
  const cut = address.lastIndexOf('/')
  const head = cut >= 0 ? address.slice(0, cut + 1) : ''
  const base = cut >= 0 ? address.slice(cut + 1) : address
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return `${head}${base}-cn`
  return `${head}${base.slice(0, dot)}-cn${base.slice(dot)}`
}

/**
 * Lift YAML front matter and fenced code blocks out of a document.
 *
 * The model never sees this text, so it cannot reflow it, translate an
 * identifier inside it, or lose a fence. Everything else stays in place,
 * separated by the placeholders in original order.
 *
 * @param source - the whole source document.
 * @returns the placeholder text and, positionally, the regions it stands for.
 */
export function protectVerbatim(source) {
  const lines = source.split('\n')
  const values = []
  const output = []
  let buffer = []

  const flushProse = () => {
    if (buffer.length === 0) return
    output.push(...buffer)
    buffer = []
  }
  const protect = (text) => {
    values.push(text)
    // What is buffered IS the region being protected: consume it instead of
    // emitting it, or the region lands in the output both raw and as a token.
    buffer = []
    output.push(keepToken(values.length - 1))
  }

  let start = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) {
      protect(lines.slice(0, end + 1).join('\n'))
      start = end + 1
    }
  }

  /** The quote character of the fence currently open, or `null` outside one. */
  let fence = null
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence === null) {
      if (match === null) {
        buffer.push(line)
      } else {
        // The prose before a fence is its own run: flush it, or the fence's
        // closing marker would protect everything accumulated since the last
        // placeholder — prose included.
        flushProse()
        fence = match[1][0]
        buffer.push(line)
      }
      continue
    }
    buffer.push(line)
    if (match !== null && match[1][0] === fence) {
      protect(buffer.join('\n'))
      fence = null
    }
  }
  // An unterminated fence is still code: keep it, rather than handing the model
  // the rest of the document as if it were prose.
  if (fence !== null) protect(buffer.join('\n'))

  flushProse()
  return { text: output.join('\n'), values }
}

/**
 * Put the protected regions back, refusing an answer that lost or duplicated one.
 * @param text - the model's output.
 * @param values - the protected regions, positionally.
 * @returns the reassembled document.
 * @throws when a placeholder is missing or repeated.
 */
export function restoreVerbatim(text, values) {
  let out = text
  for (let index = 0; index < values.length; index += 1) {
    const pattern = keepPattern(index)
    if ((out.match(pattern) ?? []).length !== 1) {
      throw new Error(`the model did not keep protected region ${index + 1} of ${values.length} exactly once`)
    }
    // A function replacement: a protected region may contain `$&` and friends.
    out = out.replace(pattern, () => values[index])
  }
  return out
}

/**
 * Read and parse a JSON request body.
 * @param req - the incoming request.
 * @returns the parsed body, or `{}` for an empty one.
 */
async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? {} : JSON.parse(text)
}

/**
 * Answer with JSON, owning the whole response lifecycle.
 * @param res - the response.
 * @param status - HTTP status.
 * @param payload - JSON-serializable body.
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Build the bilingual document for one source document.
 * @param ctx - the plugin context.
 * @param source - the whole source document.
 * @param sessionId - the Session the request is attributed to.
 * @returns the bilingual document text.
 * @throws when the model call fails, yields no text, or breaks a protected region.
 */
async function translateBilingual(ctx, source, sessionId) {
  const protectedSource = protectVerbatim(source)
  if (protectedSource.text.length > MAX_INPUT_CHARS) {
    throw new Error(`the document is longer than ${MAX_INPUT_CHARS} characters; translate a smaller file`)
  }

  const selection = ctx.agentDefaultModel.currentSelection()
  const options = {
    provider: selection.provider,
    model: selection.model,
    system: SYSTEM_PROMPT,
    messages: [
      {
        id: `to-chinese-${Date.now().toString(36)}`,
        role: 'user',
        content: [{ type: 'text', text: protectedSource.text }],
        source: { kind: 'plugin', plugin: PACKAGE_NAME },
      },
    ],
  }
  if (selection.reasoningEffort !== undefined) options.reasoningEffort = selection.reasoningEffort
  if (sessionId !== undefined) options.sessionId = sessionId

  let text = ''
  let failure
  for await (const chunk of ctx.llm.stream(options)) {
    if (chunk.type === 'text-delta') text += chunk.text
    else if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
      failure = chunk.reason.failure
    }
  }

  if (failure !== undefined) throw new Error(`the model call failed: ${failure.message}`)
  if (text.trim() === '') throw new Error('the model produced no text')
  return restoreVerbatim(text, protectedSource.values)
}

/**
 * Serve one translation request.
 * @param ctx - the plugin context.
 * @param req - the incoming request.
 * @param res - the response to write.
 */
async function handleTranslate(ctx, req, res) {
  let body
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { ok: false, error: 'the request body is not valid JSON' })
    return
  }

  const parsed = parseFileAddress(body?.address)
  if (parsed === undefined) {
    sendJson(res, 400, { ok: false, error: 'expected a dsh-resource://file/ address' })
    return
  }

  const session = parsed.scope === 'session' ? ctx.sessions.get(parsed.sessionId) : undefined
  if (parsed.scope === 'session' && session === undefined) {
    sendJson(res, 404, { ok: false, error: `no session ${parsed.sessionId}` })
    return
  }

  const root = session?.header?.cwd
  const resolveOptions = root === undefined ? undefined : { cwd: root }

  const target = await ctx.fs.resolve(parsed.path, resolveOptions)
  const info = await ctx.fs.stat(target)
  if (info === undefined) {
    sendJson(res, 404, { ok: false, error: `not a readable file: ${target.displayPath}` })
    return
  }

  const source = await ctx.fs.readText(target)
  if (source.trim() === '') {
    sendJson(res, 400, { ok: false, error: 'the file is empty' })
    return
  }

  const bilingual = await translateBilingual(ctx, source, session?.id)

  const outputPath = chineseSiblingPath(parsed.path)
  const outputTarget = await ctx.fs.resolve(outputPath, resolveOptions)
  const policy = ctx.sandboxPolicy.resolve(session === undefined ? undefined : { session })
  const outcome = await ctx.fs.writeText(outputTarget, bilingual, undefined, undefined, policy)

  sendJson(res, 200, {
    ok: true,
    address: chineseSiblingAddress(body.address),
    path: outcome?.displayPath ?? outputTarget.displayPath,
    bytes: Buffer.byteLength(bilingual, 'utf8'),
  })
}

/**
 * Mount the translate endpoint.
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: TRANSLATE_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'POST only' })
            return
          }
          try {
            await handleTranslate(ctx, req, res)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            ctx.logger?.error?.('to-chinese: translation failed: %s', message)
            if (!res.headersSent) sendJson(res, 500, { ok: false, error: message })
            else res.end()
          }
        },
      }),
    'to-chinese translate route',
  )
}
