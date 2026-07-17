'use strict';

/* ── Instructor mode ─────────────────────────────────────────── */
// Append ?key=show to the URL to enter instructor mode.
// Students use the plain URL — the answer-key toggle is hidden for them.
const INSTRUCTOR_MODE = new URLSearchParams(location.search).get('key') === 'show';

/* ── State ───────────────────────────────────────────────────── */
let sentences   = [];   // [{ text, refFormula, refAtoms: [{letter, clause}] }]
let keyMode     = false; // show reference fields
let lastFocused = { area: 'trans', el: null }; // for symbol toolbar insertion

// Worksheet state: atoms per sentence slot
// wsAtoms[i] = [{letter, clause}]
let wsAtoms = [];

/* ── Utilities ───────────────────────────────────────────────── */
function applyAscii(s) {
  s = s.split('<->').join('↔');
  s = s.split('->').join('→');
  s = s.split('=>').join('→');
  s = s.split('/\\').join('∧');
  s = s.split('\\/').join('∨');
  s = s.split('~').join('¬');
  s = s.split('&').join('∧');
  // only replace | when not part of a word
  s = s.split(' | ').join(' ∨ ');
  // simple pipe when standalone char
  return s;
}

function safeApplyAscii(el) {
  const start = el.selectionStart;
  const old   = el.value;
  const next  = applyAscii(old);
  if (next !== old) {
    el.value = next;
    const diff = next.length - old.length;
    el.setSelectionRange(start + diff, start + diff);
  }
}

function tryParse(formula) {
  if (!formula.trim()) return null;
  // Try as-is first
  try { return parse(formula); } catch (e1) {
    // If it failed, try wrapping in parens (handles bare top-level binary like p→q)
    try { return parse('(' + formula + ')'); } catch (e2) { return null; }
  }
}

/* ── Symbol insertion ─────────────────────────────────────────── */
function insertSym(sym, area) {
  const el = lastFocused.el;
  if (!el) return;
  const s = el.selectionStart;
  const e = el.selectionEnd;
  el.value = el.value.slice(0, s) + sym + el.value.slice(e);
  el.setSelectionRange(s + sym.length, s + sym.length);
  el.focus();
  el.dispatchEvent(new Event('input'));
}

function trackFocus(el, area) {
  el.addEventListener('focus', () => { lastFocused = { area, el }; });
}

/* ── Key mode ─────────────────────────────────────────────────── */
function toggleKeyMode() {
  if (!INSTRUCTOR_MODE) return; // guard: only instructors can toggle
  keyMode = !keyMode;
  document.getElementById('toggle-key-btn').textContent =
    keyMode ? 'Hide answer key' : 'Show answer key';
  document.getElementById('key-toolbar').style.display = keyMode ? 'flex' : 'none';
  document.querySelectorAll('.ref-section').forEach(el => {
    el.style.display = keyMode ? 'block' : 'none';
  });
}

/* ── Sentence slots ─────────────────────────────────────────── */
function makeSentenceSlot(idx) {
  const s = sentences[idx];

  const slot = document.createElement('div');
  slot.className = 'sentence-slot';
  slot.dataset.idx = idx;

  // Main row
  const row = document.createElement('div');
  row.className = 'slot-row';

  const num = document.createElement('span');
  num.className = 'slot-num';
  num.textContent = idx + 1;

  const textarea = document.createElement('textarea');
  textarea.className = 'sentence-input';
  textarea.rows = 2;
  textarea.placeholder = 'Enter an English sentence…';
  textarea.value = s.text || '';
  textarea.addEventListener('input', () => {
    sentences[idx].text = textarea.value;
    rebuildWorksheet();
    rebuildTranslation();
    pushHash();
  });

  const rmBtn = document.createElement('button');
  rmBtn.className = 'remove-btn';
  rmBtn.title = 'Remove';
  rmBtn.innerHTML = '&#x2715;';
  rmBtn.addEventListener('click', () => removeSentence(idx));

  row.append(num, textarea, rmBtn);

  // Reference section
  const refSec = document.createElement('div');
  refSec.className = 'ref-section';
  refSec.style.display = keyMode ? 'block' : 'none';

  const refLabel = document.createElement('span');
  refLabel.className = 'ref-label';
  refLabel.textContent = 'Answer key (not visible to students)';
  refSec.appendChild(refLabel);

  // Atom key rows
  const refAtomsContainer = document.createElement('div');
  refSec.appendChild(refAtomsContainer);

  function buildRefAtomRows() {
    refAtomsContainer.innerHTML = '';
    const atoms = s.refAtoms || [];
    atoms.forEach((atom, ai) => {
      const arow = document.createElement('div');
      arow.className = 'ref-row';

      const kInp = document.createElement('input');
      kInp.className = 'ref-key-input';
      kInp.type = 'text';
      kInp.maxLength = 3;
      kInp.placeholder = 'p';
      kInp.value = atom.letter || '';
      kInp.addEventListener('input', () => {
        s.refAtoms[ai].letter = kInp.value.trim();
        pushHash();
      });
      trackFocus(kInp, 'key');

      const cInp = document.createElement('input');
      cInp.className = 'ref-clause-input';
      cInp.type = 'text';
      cInp.placeholder = 'Atomic English clause';
      cInp.value = atom.clause || '';
      cInp.addEventListener('input', () => {
        s.refAtoms[ai].clause = cInp.value;
        pushHash();
      });

      const rmA = document.createElement('button');
      rmA.className = 'ref-remove-btn';
      rmA.innerHTML = '&#x2715;';
      rmA.addEventListener('click', () => {
        s.refAtoms.splice(ai, 1);
        buildRefAtomRows();
        pushHash();
      });

      arow.append(kInp, cInp, rmA);
      refAtomsContainer.appendChild(arow);
    });

    // Add atom button
    const addA = document.createElement('button');
    addA.className = 'ref-add-btn';
    addA.textContent = '+ Add atom';
    addA.addEventListener('click', () => {
      if (!s.refAtoms) s.refAtoms = [];
      s.refAtoms.push({ letter: '', clause: '' });
      buildRefAtomRows();
      pushHash();
    });
    refAtomsContainer.appendChild(addA);
  }

  buildRefAtomRows();

  // Reference formula row
  const fRow = document.createElement('div');
  fRow.className = 'ref-row';
  fRow.style.marginTop = 'var(--space-3)';

  const fLabel = document.createElement('span');
  fLabel.style.fontFamily = 'var(--font-sans)';
  fLabel.style.fontSize = 'var(--text-sm)';
  fLabel.style.color = 'var(--color-text-muted)';
  fLabel.style.minWidth = '9rem';
  fLabel.textContent = 'Reference translation:';

  const fInp = document.createElement('input');
  fInp.className = 'ref-formula-input';
  fInp.type = 'text';
  fInp.placeholder = 'e.g. p∧q';
  fInp.value = s.refFormula || '';
  fInp.addEventListener('input', () => {
    safeApplyAscii(fInp);
    s.refFormula = fInp.value;
    const ast = tryParse(fInp.value);
    fInp.classList.toggle('valid', !!ast);
    fInp.classList.toggle('invalid', !ast && fInp.value.trim().length > 0);
    pushHash();
  });
  fInp.addEventListener('keyup', () => safeApplyAscii(fInp));
  trackFocus(fInp, 'key');

  fRow.append(fLabel, fInp);
  refSec.appendChild(fRow);

  slot.append(row, refSec);
  return slot;
}

function renderSentenceList() {
  const list = document.getElementById('sentence-list');
  list.innerHTML = '';
  sentences.forEach((_, i) => list.appendChild(makeSentenceSlot(i)));
}

function addSentenceSlot() {
  sentences.push({ text: '', refFormula: '', refAtoms: [] });
  // wsAtoms is flat/shared — no need to add a slot per sentence
  renderSentenceList();
  rebuildWorksheet();
  rebuildTranslation();
  // Focus the new textarea
  const inputs = document.querySelectorAll('.sentence-input');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeSentence(idx) {
  if (sentences.length <= 1) {
    sentences[0] = { text: '', refFormula: '', refAtoms: [] };
  } else {
    sentences.splice(idx, 1);
  }
  renderSentenceList();
  rebuildWorksheet();
  rebuildTranslation();
  pushHash();
}

/* ── Worksheet ──────────────────────────────────────────────── */
// wsAtoms is now a flat array [{letter, clause}] — a single shared key
function rebuildWorksheet() {
  const body = document.getElementById('worksheet-body');
  body.innerHTML = '';

  const activeSentences = sentences.filter(s => s.text.trim());
  if (!activeSentences.length) {
    body.innerHTML = '<p class="ws-placeholder">Enter sentences above to begin.</p>';
    return;
  }

  // Ensure wsAtoms is a flat array
  if (!Array.isArray(wsAtoms) || (wsAtoms.length > 0 && Array.isArray(wsAtoms[0]))) {
    // migrate from old per-sentence format
    const flat = [];
    wsAtoms.forEach(arr => { if (Array.isArray(arr)) arr.forEach(a => flat.push(a)); else flat.push(arr); });
    wsAtoms = flat.length ? flat : [{ letter: '', clause: '' }];
  }
  if (!wsAtoms.length) wsAtoms = [{ letter: '', clause: '' }];

  // Block of all sentences (read-only)
  const sentBlock = document.createElement('div');
  sentBlock.className = 'ws-sentence-block';
  const sentTitle = document.createElement('div');
  sentTitle.className = 'ws-sentence-label';
  sentTitle.textContent = activeSentences.length === 1 ? 'Sentence' : 'Sentences';
  sentBlock.appendChild(sentTitle);

  activeSentences.forEach((s, i) => {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.gap = 'var(--space-3)';
    wrapper.style.alignItems = 'baseline';
    wrapper.style.marginBottom = 'var(--space-2)';
    if (activeSentences.length > 1) {
      const num = document.createElement('span');
      num.style.cssText = 'font-style:italic;color:var(--color-text-muted);font-size:var(--text-sm);min-width:1rem;font-family:var(--font-body)';
      num.textContent = i + 1;
      wrapper.appendChild(num);
    }
    const txt = document.createElement('div');
    txt.className = 'ws-sentence-text';
    txt.style.marginBottom = '0';
    txt.textContent = s.text;
    wrapper.appendChild(txt);
    sentBlock.appendChild(wrapper);
  });
  body.appendChild(sentBlock);

  // Divider
  const divider = document.createElement('hr');
  divider.style.cssText = 'border:none;border-top:1px solid var(--color-border);margin:var(--space-4) 0';
  body.appendChild(divider);

  // Shared atom assignment section
  const keyTitle = document.createElement('div');
  keyTitle.className = 'ws-sentence-label';
  keyTitle.textContent = 'Assign a letter to each atomic sentence';
  body.appendChild(keyTitle);

  const atomsDiv = document.createElement('div');
  atomsDiv.className = 'ws-atoms';
  atomsDiv.id = 'ws-atoms-container';
  body.appendChild(atomsDiv);

  function buildAtomRows() {
    atomsDiv.innerHTML = '';
    wsAtoms.forEach((atom, ai) => {
      const row = document.createElement('div');
      row.className = 'ws-atom-row';

      const letterInp = document.createElement('input');
      letterInp.className = 'ws-letter-input';
      letterInp.type = 'text';
      letterInp.maxLength = 3;
      letterInp.placeholder = 'p';
      letterInp.value = atom.letter || '';
      letterInp.addEventListener('input', () => {
        wsAtoms[ai].letter = letterInp.value.trim();
        renderKeyLegend();
        pushHash();
      });

      const clauseInp = document.createElement('input');
      clauseInp.className = 'ws-clause-input';
      clauseInp.type = 'text';
      clauseInp.placeholder = 'Atomic English clause…';
      clauseInp.value = atom.clause || '';
      clauseInp.addEventListener('input', () => {
        wsAtoms[ai].clause = clauseInp.value;
        renderKeyLegend();
        pushHash();
      });

      const rmBtn = document.createElement('button');
      rmBtn.className = 'ws-remove-atom-btn';
      rmBtn.innerHTML = '&#x2715;';
      rmBtn.addEventListener('click', () => {
        if (wsAtoms.length > 1) {
          wsAtoms.splice(ai, 1);
        } else {
          wsAtoms[0] = { letter: '', clause: '' };
        }
        buildAtomRows();
        renderKeyLegend();
        pushHash();
      });

      row.append(letterInp, clauseInp, rmBtn);
      atomsDiv.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'ws-add-atom-btn';
    addBtn.textContent = '+ Add atom';
    addBtn.addEventListener('click', () => {
      wsAtoms.push({ letter: '', clause: '' });
      buildAtomRows();
      renderKeyLegend();
      pushHash();
    });
    atomsDiv.appendChild(addBtn);
  }

  buildAtomRows();

  // Running key legend
  const legend = document.createElement('div');
  legend.className = 'ws-key-legend';
  legend.style.marginTop = 'var(--space-5)';
  legend.innerHTML = '<div class="ws-key-legend-title">Your key</div><div id="key-legend-rows"></div>';
  body.appendChild(legend);
  renderKeyLegend();
}

function renderKeyLegend() {
  const rowsEl = document.getElementById('key-legend-rows');
  if (!rowsEl) return;
  rowsEl.innerHTML = '';

  const seen = new Set();
  let any = false;
  (Array.isArray(wsAtoms[0]) ? wsAtoms.flat() : wsAtoms).forEach(a => {
    if (a.letter && a.clause && !seen.has(a.letter)) {
      seen.add(a.letter);
      const row = document.createElement('div');
      row.className = 'ws-key-row';
      const lt = document.createElement('span');
      lt.className = 'ws-key-letter';
      lt.textContent = a.letter;
      const cl = document.createElement('span');
      cl.className = 'ws-key-clause';
      cl.textContent = '— ' + a.clause;
      row.append(lt, cl);
      rowsEl.appendChild(row);
      any = true;
    }
  });

  if (!any) {
    rowsEl.innerHTML = '<span style="color:var(--color-text-muted);font-style:italic">No assignments yet.</span>';
  }
}

// keep old name as alias so any stray calls still work
function updateKeyLegend() { renderKeyLegend(); }

function resetWorksheet() {
  wsAtoms = [{ letter: '', clause: '' }];
  rebuildWorksheet();
  pushHash();
}

/* ── Translation ─────────────────────────────────────────────── */
// transState[i] = { formula, checked, revealed }
let transState = [];

function rebuildTranslation() {
  const body = document.getElementById('translation-body');
  body.innerHTML = '';

  const hasSentences = sentences.some(s => s.text.trim());
  if (!hasSentences) {
    body.innerHTML = '<p class="ws-placeholder">Enter sentences above to begin.</p>';
    return;
  }

  // Ensure transState matches
  while (transState.length < sentences.length) transState.push({ formula: '', checked: false, revealed: false });
  transState.length = sentences.length;

  sentences.forEach((s, i) => {
    if (!s.text.trim()) return;
    const ts = transState[i];

    const block = document.createElement('div');
    block.className = 'trans-block';

    const lbl = document.createElement('div');
    lbl.className = 'trans-sentence-label';
    lbl.textContent = 'Sentence ' + (i + 1);

    const txt = document.createElement('div');
    txt.className = 'trans-sentence-text';
    txt.textContent = s.text;

    // Parse status
    const parseStatus = document.createElement('div');
    parseStatus.className = 'trans-parse-status';

    // Formula input
    const inp = document.createElement('input');
    inp.className = 'trans-formula-input';
    inp.type = 'text';
    inp.placeholder = 'e.g.  p ∧ q';
    inp.value = ts.formula || '';
    inp.spellcheck = false;
    trackFocus(inp, 'trans');

    inp.addEventListener('input', () => {
      safeApplyAscii(inp);
      updateParseStatus();
      pushHash();
    });
    inp.addEventListener('keyup', () => {
      safeApplyAscii(inp);
      updateParseStatus();
    });

    function updateParseStatus() {
      ts.formula = inp.value;
      ts.checked = false;
      ts.revealed = false;
      feedbackEl.className = 'trans-feedback';
      feedbackEl.innerHTML = '';

      const val = inp.value.trim();
      if (!val) {
        parseStatus.textContent = '';
        parseStatus.className = 'trans-parse-status';
        inp.classList.remove('valid', 'invalid');
        return;
      }
      const ast = tryParse(val);
      if (ast) {
        parseStatus.textContent = '✓ ' + val;
        parseStatus.className = 'trans-parse-status ok';
        inp.classList.add('valid'); inp.classList.remove('invalid');
      } else {
        parseStatus.textContent = 'Not a valid formula';
        parseStatus.className = 'trans-parse-status err';
        inp.classList.remove('valid'); inp.classList.add('invalid');
      }
    }

    const inputRow = document.createElement('div');
    inputRow.className = 'trans-input-row';
    inputRow.appendChild(inp);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'trans-btn-row';

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn-primary';
    checkBtn.textContent = 'Check';

    const revealBtn = document.createElement('button');
    revealBtn.className = 'btn-reveal';
    revealBtn.textContent = 'Reveal';

    // Feedback area
    const feedbackEl = document.createElement('div');
    feedbackEl.className = 'trans-feedback';

    checkBtn.addEventListener('click', () => {
      const val = inp.value.trim();
      if (!val) return;
      const studentAst = tryParse(val);
      if (!studentAst) {
        feedbackEl.className = 'trans-feedback wrong';
        feedbackEl.textContent = 'Not a well-formed formula — check your syntax.';
        return;
      }
      const refVal = s.refFormula ? s.refFormula.trim() : '';
      if (!refVal) {
        feedbackEl.className = 'trans-feedback revealed';
        feedbackEl.textContent = 'No reference answer has been set for this sentence.';
        return;
      }
      const refAst = tryParse(refVal);
      if (!refAst) {
        feedbackEl.className = 'trans-feedback revealed';
        feedbackEl.textContent = 'Reference answer is not a valid formula. Contact your instructor.';
        return;
      }

      // Build clause→refLetter map from the reference key
      const refKey = s.refAtoms || [];  // [{letter, clause}]
      const clauseToRef = {};
      refKey.forEach(a => { if (a.letter && a.clause) clauseToRef[a.clause.trim().toLowerCase()] = a.letter; });

      // Build studentLetter→refLetter substitution from the worksheet key
      const studentKey = Array.isArray(wsAtoms[0]) ? wsAtoms.flat() : wsAtoms;
      const subst = {};   // studentLetter → refLetter
      const unmapped = []; // student letters with no matching clause in ref key
      studentKey.forEach(a => {
        if (!a.letter) return;
        const refLetter = clauseToRef[a.clause.trim().toLowerCase()];
        if (refLetter) {
          subst[a.letter] = refLetter;
        } else if (a.clause.trim()) {
          unmapped.push({ letter: a.letter, clause: a.clause });
        }
      });

      // Warn if student used letters whose clauses don’t appear in the reference key
      if (unmapped.length > 0) {
        const listed = unmapped.map(u => `‘${u.letter}’ (${u.clause})`).join(', ');
        feedbackEl.className = 'trans-feedback wrong';
        feedbackEl.innerHTML = `⚠ The atomic sentence${unmapped.length > 1 ? 's' : ''} assigned to ${listed} ` +
          `do${unmapped.length > 1 ? '' : 'es'} not appear in the reference key. ` +
          `Check that your key matches the intended atoms.`;
        return;
      }

      // Apply substitution to the student’s AST (rename letters)
      const renamedAst = renameLetters(studentAst, subst);

      // Check equivalence between renamed student formula and reference
      const result = checkEquivalence(renamedAst, refAst);
      if (result.equivalent) {
        feedbackEl.className = 'trans-feedback correct';
        feedbackEl.innerHTML = '✓ Correct — your translation is equivalent to the reference.';
      } else {
        feedbackEl.className = 'trans-feedback wrong';
        // Translate the counterexample back into English using the ref key
        const ce = result.counterexample;
        const assign = Object.entries(ce.assignment).map(([letter, v]) => {
          const atom = refKey.find(a => a.letter === letter);
          const label = atom ? atom.clause : letter;
          return `‘${label}’ is ${v ? 'true' : 'false'}`;
        }).join(', ');
        feedbackEl.innerHTML =
          `✗ Not quite — consider the case where ${assign}. ` +
          `Your formula gives the wrong truth value there.`;
      }
      ts.checked = true;
      pushHash();
    });

    revealBtn.addEventListener('click', () => {
      const refVal = s.refFormula ? s.refFormula.trim() : '';
      if (!refVal) {
        feedbackEl.className = 'trans-feedback revealed';
        feedbackEl.textContent = 'No reference answer has been set for this sentence.';
        return;
      }
      feedbackEl.className = 'trans-feedback revealed';
      feedbackEl.innerHTML = 'Reference: <span class="feedback-formula">' + escHtml(refVal) + '</span>';
      ts.revealed = true;
      pushHash();
    });

    btnRow.append(checkBtn, revealBtn);
    block.append(lbl, txt, parseStatus, inputRow, btnRow, feedbackEl);
    body.appendChild(block);
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* -- Letter renaming (for key-mapped equivalence check) ------- */
function renameLetters(node, subst) {
  if (!node) return node;
  if (node.type === 'letter') {
    const mapped = subst[node.name];
    return { type: 'letter', name: mapped !== undefined ? mapped : node.name, sub: node.sub };
  }
  if (node.type === 'neg') return { type: 'neg', arg: renameLetters(node.arg, subst) };
  if (node.left !== undefined) {
    return { ...node, left: renameLetters(node.left, subst), right: renameLetters(node.right, subst) };
  }
  return node;
}
/* ── Equivalence check ──────────────────────────────────────── */
function checkEquivalence(ast1, ast2) {
  // Collect all propositional letters from both trees
  const letters = new Set();
  function collect(ast) {
    if (!ast) return;
    if (ast.type === 'letter') { letters.add(ast.name + (ast.sub || '')); return; }
    collect(ast.left); collect(ast.right); collect(ast.arg);
  }
  collect(ast1); collect(ast2);
  const vars = [...letters].sort();

  const n = vars.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    const assignment = {};
    vars.forEach((v, j) => { assignment[v] = !!(mask & (1 << j)); });
    const v1 = evaluate(ast1, assignment);
    const v2 = evaluate(ast2, assignment);
    if (v1 !== v2) {
      return { equivalent: false, counterexample: { assignment, student: v1, reference: v2 } };
    }
  }
  return { equivalent: true };
}

/* ── Hash encode/decode ─────────────────────────────────────── */
function pushHash() {
  try {
    const data = {
      sentences: sentences.map(s => ({
        text: s.text,
        refFormula: s.refFormula,
        refAtoms: s.refAtoms
      })),
      wsAtoms,
      trans: transState.map(ts => ({ formula: ts.formula }))
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    history.replaceState(null, '', '#v1:' + encoded);
  } catch (e) { /* ignore */ }
}

function loadHash() {
  const hash = location.hash;
  if (!hash.startsWith('#v1:')) return false;
  try {
    const raw = decodeURIComponent(escape(atob(hash.slice(4))));
    const data = JSON.parse(raw);
    if (data.sentences && Array.isArray(data.sentences)) {
      sentences = data.sentences.map(s => ({
        text: s.text || '',
        refFormula: s.refFormula || '',
        refAtoms: s.refAtoms || []
      }));
    }
    if (data.wsAtoms && Array.isArray(data.wsAtoms)) {
      // migrate old per-sentence nested format to flat
      if (data.wsAtoms.length > 0 && Array.isArray(data.wsAtoms[0])) {
        wsAtoms = data.wsAtoms.flat();
      } else {
        wsAtoms = data.wsAtoms;
      }
    }
    if (data.trans && Array.isArray(data.trans)) {
      transState = data.trans.map(t => ({ formula: t.formula || '', checked: false, revealed: false }));
    }
    return true;
  } catch (e) { return false; }
}

/* ── Examples ───────────────────────────────────────────────── */
function loadExample(key) {
  const examples = {
    simple: {
      sentences: [
        { text: 'If it rains, the ground is wet.', refFormula: 'p→q', refAtoms: [
          { letter: 'p', clause: 'It rains' },
          { letter: 'q', clause: 'The ground is wet' }
        ]}
      ],
      wsAtoms: [{ letter: '', clause: '' }],
    },
    burglar: {
      sentences: [
        { text: 'If the alarm goes off, the burglar entered through the window or the front door.', refFormula: 'p→(q∨r)', refAtoms: [
          { letter: 'p', clause: 'The alarm goes off' },
          { letter: 'q', clause: 'The burglar entered through the window' },
          { letter: 'r', clause: 'The burglar entered through the front door' }
        ]},
        { text: 'The alarm did not go off.', refFormula: '¬p', refAtoms: [] },
        { text: 'Therefore, the burglar did not enter through the window and did not enter through the front door.', refFormula: '¬q∧¬r', refAtoms: [] }
      ],
      wsAtoms: [{ letter: '', clause: '' }],
    },
    zebra: {
      sentences: [
        { text: 'I cannot be certain that the animal in the pen is a zebra unless I can rule out that it is a cleverly painted mule.', refFormula: '¬q→¬p', refAtoms: [
          { letter: 'p', clause: 'I can be certain that the animal in the pen is a zebra' },
          { letter: 'q', clause: 'I can rule out that the animal in the pen is a cleverly painted mule' }
        ]},
        { text: 'I cannot rule out that the animal in the pen is a cleverly painted mule.', refFormula: '¬q', refAtoms: [] },
        { text: 'Therefore, I cannot be certain that the animal in the pen is a zebra.', refFormula: '¬p', refAtoms: [] }
      ],
      wsAtoms: [{ letter: '', clause: '' }],
    }
  };

  const ex = examples[key];
  if (!ex) return;
  sentences = ex.sentences.map(s => ({ ...s }));
  wsAtoms = ex.wsAtoms.map(a => ({ ...a }));
  transState = sentences.map(() => ({ formula: '', checked: false, revealed: false }));
  renderSentenceList();
  rebuildWorksheet();
  rebuildTranslation();
  pushHash();
}

/* ── Theme toggle ───────────────────────────────────────────── */
document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  document.querySelector('[data-theme-toggle]').textContent = next === 'dark' ? '☀' : '☽';
});

/* ── Help panel ─────────────────────────────────────────────── */
function toggleHelp(e) {
  if (e) e.preventDefault();
  const panel = document.getElementById('help-panel');
  if (panel.hasAttribute('hidden')) {
    panel.removeAttribute('hidden');
  } else {
    panel.setAttribute('hidden', '');
  }
}

/* ── Copy link ───────────────────────────────────────────────── */
function copyLink() {
  pushHash();
  // Build student URL (no ?key=show)
  const studentUrl = location.origin + location.pathname + location.hash;
  navigator.clipboard.writeText(studentUrl).then(() => {
    const btn = document.getElementById('copy-link-btn');
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy link'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const inp = document.createElement('input');
    inp.value = studentUrl;
    document.body.appendChild(inp); inp.select(); document.execCommand('copy'); document.body.removeChild(inp);
  });
}

/* ── Init ─────────────────────────────────────────────────────────── */
function init() {
  const loaded = loadHash();
  if (!loaded) {
    sentences = [{ text: '', refFormula: '', refAtoms: [] }];
    wsAtoms   = [{ letter: '', clause: '' }];
    transState = [{ formula: '', checked: false, revealed: false }];
  }

  // Show/hide the answer-key toggle depending on instructor mode
  const keyBtn = document.getElementById('toggle-key-btn');
  const keyToolbar = document.getElementById('key-toolbar');
  if (!INSTRUCTOR_MODE) {
    keyBtn.style.display = 'none';
    keyToolbar.style.display = 'none';
  }

  renderSentenceList();
  rebuildWorksheet();
  rebuildTranslation();
}

setTimeout(init, 0);
