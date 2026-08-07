// DOC: Minimal dependency-free YAML subset parser (no external yaml lib —
// NFR zero-external-services). Supports what bench config/task files need:
// nested block mappings (2-space indent), block sequences ("- item"),
// scalars (quoted/unquoted strings, numbers, booleans, null), and
// full-line comments. Not a general YAML implementation — do not feed it
// flow collections, anchors, or multi-document streams.
function stripComment(line) {
  // Only strips a trailing "# ..." that is not inside a quoted string.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") return null;
  if (s === "true" || s === "True" || s === "TRUE") return true;
  if (s === "false" || s === "False" || s === "FALSE") return false;
  if (/^".*"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"');
  if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m[1].length;
}

const BLOCK_SCALAR_RE = /^([|>])([+-]?)$/;

/**
 * Parse a minimal YAML subset into a plain JS value.
 * @param {string} text
 * @returns {*}
 */
export function parseYaml(text) {
  // Block scalars (| and >) need raw (uncommented, untrimmed) lines with
  // blank lines preserved, so we keep the raw split alongside the
  // comment-stripped/trimmed lines used for everything else.
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (let idx = 0; idx < rawLines.length; idx++) {
    const raw = rawLines[idx];
    const noComment = stripComment(raw);
    if (noComment.trim() === "") continue;
    lines.push({ indent: indentOf(noComment), content: noComment.trim(), raw, rawIndex: idx });
  }
  if (lines.length === 0) return {};
  const [value] = parseBlock(lines, 0, lines[0].indent, rawLines);
  return value;
}

// Consumes a block scalar (| or >) starting right after a "key: |" line.
// `keyIndent` is the indent of the "key:" line itself. Returns
// [stringValue, nextIndex] where nextIndex is the index into `lines` of the
// first line after the block.
function parseBlockScalar(lines, start, keyIndent, folded, chomp, rawLines) {
  // Find raw-line bounds: from just after the key's raw line up to (but not
  // including) the next `lines` entry at indent <= keyIndent.
  let endIdx = lines.length;
  for (let j = start; j < lines.length; j++) {
    if (lines[j].indent <= keyIndent) {
      endIdx = j;
      break;
    }
  }
  const rawStart = start < lines.length ? lines[start].rawIndex : (lines[start - 1] ? lines[start - 1].rawIndex + 1 : 0);
  const rawEnd = endIdx < lines.length ? lines[endIdx].rawIndex : rawLines.length;

  // Collect the raw lines belonging to the block (may include blank lines
  // that were filtered out of `lines`).
  const blockRaw = rawLines.slice(rawStart, rawEnd);
  // text.split(/\r?\n/) appends exactly one trailing "" artifact for the
  // file's own final trailing newline when the block runs to EOF; drop it
  // (just the one) so it isn't mistaken for a real blank line in the block.
  if (rawEnd === rawLines.length && blockRaw.length > 0 && blockRaw[blockRaw.length - 1] === "") {
    blockRaw.pop();
  }

  // Find block indentation from first non-blank raw line.
  let blockIndent = null;
  for (const l of blockRaw) {
    if (l.trim() !== "") {
      blockIndent = indentOf(l);
      break;
    }
  }
  if (blockIndent === null) blockIndent = keyIndent + 2;

  const contentLines = blockRaw.map((l) => (l.trim() === "" ? "" : l.slice(blockIndent)));

  // Trim trailing empty lines (they get re-added per chomp mode).
  let trimmedCount = 0;
  while (contentLines.length > 0 && contentLines[contentLines.length - 1] === "") {
    contentLines.pop();
    trimmedCount++;
  }

  let body;
  if (folded) {
    // Fold: a single line break between two text lines becomes a space; a
    // run of N consecutive line breaks (i.e. N-1 blank lines) becomes N-1
    // line breaks.
    const joined = contentLines.join("\n");
    body = joined.replace(/(\n+)(?!\n|$)/g, (m, breaks) => (breaks.length === 1 ? " " : breaks.slice(1)));
  } else {
    body = contentLines.join("\n");
  }

  if (chomp === "-") {
    // strip: no trailing newline at all
  } else if (chomp === "+") {
    // keep: preserve all trailing newlines that were present
    body += "\n".repeat(trimmedCount > 0 ? trimmedCount + 1 : (contentLines.length > 0 ? 1 : 0));
  } else {
    // clip (default): single trailing newline, unless the block was empty
    if (contentLines.length > 0 || trimmedCount > 0) body += "\n";
  }

  return [body, endIdx];
}

// Parses a contiguous block of lines starting at `start` sharing `indent`.
// Returns [value, nextIndex]. `rawLines` (the untrimmed, comment-bearing
// source split) is threaded through so block scalars (| / >) can recover
// blank lines and exact whitespace that `lines` already filtered out.
function parseBlock(lines, start, indent, rawLines) {
  if (start < lines.length && lines[start].content.startsWith("- ") || (start < lines.length && lines[start].content === "-")) {
    return parseSequence(lines, start, indent, rawLines);
  }
  return parseMapping(lines, start, indent, rawLines);
}

function parseSequence(lines, start, indent, rawLines) {
  const arr = [];
  let i = start;
  while (i < lines.length && lines[i].indent === indent && (lines[i].content.startsWith("- ") || lines[i].content === "-")) {
    const content = lines[i].content === "-" ? "" : lines[i].content.slice(2);
    if (content.includes(":") && !/^".*"$|^'.*'$/.test(content.trim())) {
      // inline mapping start under a sequence item, e.g. "- key: value"
      const fakeLine = { indent: indent + 2, content, raw: lines[i].raw, rawIndex: lines[i].rawIndex };
      const rest = lines.slice(i + 1);
      const [obj, consumed] = parseMapping([fakeLine, ...rest], 0, indent + 2, rawLines);
      arr.push(obj);
      i = i + 1 + consumed;
    } else {
      arr.push(parseScalar(content));
      i++;
    }
  }
  return [arr, i];
}

function parseMapping(lines, start, indent, rawLines) {
  const obj = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent) {
    const { content } = lines[i];
    const colonIdx = findColon(content);
    if (colonIdx === -1) break; // not a mapping line at this indent
    const key = parseScalar(content.slice(0, colonIdx));
    const rest = content.slice(colonIdx + 1).trim();
    const blockMatch = BLOCK_SCALAR_RE.exec(rest);
    if (blockMatch) {
      const folded = blockMatch[1] === ">";
      const chomp = blockMatch[2]; // "" (clip), "-" (strip), "+" (keep)
      const [value, consumed] = parseBlockScalar(lines, i + 1, indent, folded, chomp, rawLines);
      obj[key] = value;
      i = consumed;
    } else if (rest === "") {
      // nested block: mapping or sequence at deeper indent
      const next = lines[i + 1];
      if (next && next.indent > indent) {
        const [value, consumed] = parseBlock(lines, i + 1, next.indent, rawLines);
        obj[key] = value;
        i = consumed;
      } else {
        obj[key] = null;
        i++;
      }
    } else {
      obj[key] = parseScalar(rest);
      i++;
    }
  }
  return [obj, i];
}

function findColon(content) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      if (i + 1 === content.length || /\s/.test(content[i + 1])) return i;
    }
  }
  return -1;
}
