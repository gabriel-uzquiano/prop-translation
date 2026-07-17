/**
 * Propositional Logic Parser
 *
 * Vocabulary (following PHIL 220g exactly):
 *   Sentence letters: p, q, r, s, t  (with optional numeric subscripts: p1, q2, …)
 *   Connectives:      ¬  ∧  ∨  →
 *   Parentheses:      (  )
 *
 * Grammar (strict — parentheses required for binary connectives):
 *   formula ::= letter
 *             | ¬ formula
 *             | ( formula ∧ formula )
 *             | ( formula ∨ formula )
 *             | ( formula → formula )
 *
 * Notational convention: outer parentheses of the top-level formula may be omitted.
 *
 * ASCII aliases accepted:
 *   ~  -        →  ¬
 *   &  /\       →  ∧
 *   |  \/       →  ∨
 *   -> =>       →  →
 *
 * Returns an AST node:
 *   { type: 'letter', name: 'p', sub: null|'1' }
 *   { type: 'neg',   arg: node }
 *   { type: 'and',   left: node, right: node }
 *   { type: 'or',    left: node, right: node }
 *   { type: 'imp',   left: node, right: node }
 *
 * Throws ParseError with a human-readable message on failure.
 */

class ParseError extends Error {
  constructor(msg) { super(msg); this.name = 'ParseError'; }
}

// ── Normalise ASCII shorthands ────────────────────────────────────────────────
function normalise(s) {
  return s
    .replace(/<->/g, '↔')   // biconditional (not in PL here, but catch gracefully)
    .replace(/<=>/g, '↔')
    .replace(/->/g,  '→')
    .replace(/=>/g,  '→')
    .replace(/\/\\/g,'∧')
    .replace(/\\\//g,'∨')
    .replace(/~/g,   '¬')
    .replace(/-(?!>)/g, '¬')  // lone - that wasn't already consumed as ->
    .replace(/&/g,   '∧')
    .replace(/\|/g,  '∨');
}

// ── Token types ───────────────────────────────────────────────────────────────
const T = {
  LETTER: 'LETTER',
  NEG:    'NEG',
  AND:    'AND',
  OR:     'OR',
  IMP:    'IMP',
  BICOND: 'BICOND',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  EOF:    'EOF',
};

function tokenise(raw) {
  const s = normalise(raw.trim());
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
    if (ch === '¬') { tokens.push({ type: T.NEG });    i++; continue; }
    if (ch === '∧') { tokens.push({ type: T.AND });    i++; continue; }
    if (ch === '∨') { tokens.push({ type: T.OR  });    i++; continue; }
    if (ch === '→') { tokens.push({ type: T.IMP });    i++; continue; }
    if (ch === '↔') { tokens.push({ type: T.BICOND }); i++; continue; }
    if (ch === '(') { tokens.push({ type: T.LPAREN }); i++; continue; }
    if (ch === ')') { tokens.push({ type: T.RPAREN }); i++; continue; }

    // Sentence letters: p, q, r, s, t with optional numeric subscript
    if (/[pqrst]/.test(ch)) {
      let sub = '';
      i++;
      while (i < s.length && /[0-9]/.test(s[i])) { sub += s[i]; i++; }
      tokens.push({ type: T.LETTER, name: ch, sub: sub || null });
      continue;
    }

    // Uppercase letters or other lowercase — not in vocabulary
    if (/[A-Za-z]/.test(ch)) {
      let word = ch; i++;
      while (i < s.length && /[A-Za-z0-9]/.test(s[i])) { word += s[i]; i++; }
      if (/^[pqrst]/.test(word)) {
        tokens.push({ type: T.LETTER, name: word[0], sub: null });
        i -= word.length - 1;
      } else {
        throw new ParseError(
          `'${word}' is not a symbol of propositional logic. ` +
          `Sentence letters are p, q, r, s, t (with optional numeric subscripts).`
        );
      }
      continue;
    }

    throw new ParseError(
      `Unexpected character '${ch}'. Only sentence letters (p, q, r, s, t), connectives (¬ ∧ ∨ →), and parentheses are allowed.`
    );
  }
  tokens.push({ type: T.EOF });
  return tokens;
}

// ── Parser ────────────────────────────────────────────────────────────────────
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos    = 0;
  }

  peek()    { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }
  at(type)  { return this.peek().type === type; }
  expect(type, hint) {
    if (!this.at(type)) {
      const got = this.peek().type === T.EOF ? 'end of input'
                : this.peek().type === T.LETTER ? `'${this.peek().name}'`
                : `'${tokenLabel(this.peek().type)}'`;
      throw new ParseError(hint || `Expected ${tokenLabel(type)}, got ${got}.`);
    }
    return this.consume();
  }

  parse() {
    if (this.at(T.EOF)) throw new ParseError('Empty input — enter a formula.');
    const node = this.parseFormula(true);
    if (!this.at(T.EOF)) {
      const tok = this.peek();
      const got = tok.type === T.LETTER ? `'${tok.name}'` : `'${tokenLabel(tok.type)}'`;
      throw new ParseError(`Unexpected ${got} after formula — check your parentheses.`);
    }
    return node;
  }

  parseFormula(topLevel = false) {
    if (this.at(T.NEG)) {
      this.consume();
      if (this.at(T.EOF)) throw new ParseError('¬ must be followed by a formula.');
      const arg = this.parseFormula();
      return { type: 'neg', arg };
    }

    if (this.at(T.LPAREN)) {
      this.consume();
      if (this.at(T.RPAREN)) throw new ParseError('Empty parentheses — put a formula inside ( ).');
      const left = this.parseFormula();
      const conn = this.parseConnective();
      const right = this.parseFormula();
      this.expect(T.RPAREN, `Missing closing ')' after the right subformula.`);
      return { type: conn, left, right };
    }

    if (this.at(T.LETTER)) {
      const tok = this.consume();
      return { type: 'letter', name: tok.name, sub: tok.sub };
    }

    if (this.at(T.AND) || this.at(T.OR) || this.at(T.IMP)) {
      throw new ParseError(`'${tokenLabel(this.peek().type)}' cannot start a formula — did you forget the left subformula or a '('?`);
    }
    if (this.at(T.RPAREN)) {
      throw new ParseError(`Unexpected ')' — check your parentheses.`);
    }
    if (this.at(T.BICOND)) {
      throw new ParseError(`'↔' is not a connective of propositional logic in this course. Use ¬, ∧, ∨, or →.`);
    }

    throw new ParseError(`Expected a formula, but got '${tokenLabel(this.peek().type)}'.`);
  }

  parseConnective() {
    if (this.at(T.AND)) { this.consume(); return 'and'; }
    if (this.at(T.OR))  { this.consume(); return 'or';  }
    if (this.at(T.IMP)) { this.consume(); return 'imp'; }
    if (this.at(T.BICOND)) throw new ParseError(`'↔' is not a connective of this language. Use ∧, ∨, or →.`);
    const got = this.at(T.EOF) ? 'end of input'
              : this.at(T.RPAREN) ? "')'"
              : `'${tokenLabel(this.peek().type)}'`;
    throw new ParseError(`Expected a connective (∧, ∨, or →) between the two subformulas, but got ${got}.`);
  }
}

function tokenLabel(type) {
  return { NEG:'¬', AND:'∧', OR:'∨', IMP:'→', BICOND:'↔',
           LPAREN:'(', RPAREN:')', LETTER:'sentence letter', EOF:'end of input' }[type] || type;
}

// ── Public API ────────────────────────────────────────────────────────────────

function parse(input) {
  const tokens = tokenise(input);
  const p = new Parser(tokens);
  return p.parse();
}

function prettyPrint(node, topLevel = true) {
  if (!node) return '';
  switch (node.type) {
    case 'letter': return node.name + (node.sub || '');
    case 'neg':    return '¬' + prettyAtom(node.arg);
    case 'and':    return wrap(`${prettyPrint(node.left, false)} ∧ ${prettyPrint(node.right, false)}`, topLevel);
    case 'or':     return wrap(`${prettyPrint(node.left, false)} ∨ ${prettyPrint(node.right, false)}`, topLevel);
    case 'imp':    return wrap(`${prettyPrint(node.left, false)} → ${prettyPrint(node.right, false)}`, topLevel);
    default: return '?';
  }
}

function prettyAtom(node) {
  // For a letter or negation, no extra parens needed.
  if (node.type === 'letter' || node.type === 'neg') return prettyPrint(node, false);
  // For a binary connective, wrap it — but call prettyPrint with topLevel=true
  // so wrap() doesn't add a redundant inner pair of parens.
  return '(' + prettyPrint(node, true) + ')';
}

function wrap(s, topLevel) {
  return topLevel ? s : `(${s})`;
}

function collectLetters(ast) {
  const letters = new Set();
  function walk(node) {
    if (!node) return;
    if (node.type === 'letter') { letters.add(node.name + (node.sub || '')); return; }
    if (node.type === 'neg')   { walk(node.arg); return; }
    walk(node.left); walk(node.right);
  }
  walk(ast);
  return [...letters].sort();
}
