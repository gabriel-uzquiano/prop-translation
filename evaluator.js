/**
 * Propositional Logic Evaluator
 *
 * evaluate(ast, assignment) → true | false
 *   assignment: { 'p': true, 'q': false, ... }
 *
 * evaluateWithSteps(ast, assignment) → { value: bool, steps: [...] }
 *   Each step: { formula: string, reason: string, value: bool }
 */

function evaluate(node, assignment) {
  switch (node.type) {
    case 'letter': {
      const key = node.name + (node.sub || '');
      if (assignment[key] === undefined)
        throw new Error(`No truth value assigned to '${key}'.`);
      return assignment[key];
    }
    case 'neg': return !evaluate(node.arg, assignment);
    case 'and': return evaluate(node.left, assignment) && evaluate(node.right, assignment);
    case 'or':  return evaluate(node.left, assignment) || evaluate(node.right, assignment);
    case 'imp': return !evaluate(node.left, assignment) || evaluate(node.right, assignment);
    default: throw new Error('Unknown node type: ' + node.type);
  }
}

function evaluateWithSteps(node, assignment) {
  const steps = [];

  function evalNode(n) {
    const f = prettyPrint(n, true);
    let value;
    switch (n.type) {
      case 'letter': {
        const key = n.name + (n.sub || '');
        value = assignment[key];
        steps.push({ formula: f, reason: `assigned ${value ? 'T' : 'F'}`, value });
        return value;
      }
      case 'neg': {
        const v = evalNode(n.arg);
        value = !v;
        steps.push({ formula: f, reason: `negation of ${v ? 'T' : 'F'}`, value });
        return value;
      }
      case 'and': {
        const l = evalNode(n.left);
        const r = evalNode(n.right);
        value = l && r;
        steps.push({ formula: f,
          reason: l && r ? 'both conjuncts T' : (!l && !r ? 'both conjuncts F' : `one conjunct F`),
          value });
        return value;
      }
      case 'or': {
        const l = evalNode(n.left);
        const r = evalNode(n.right);
        value = l || r;
        steps.push({ formula: f,
          reason: !l && !r ? 'both disjuncts F' : 'at least one disjunct T',
          value });
        return value;
      }
      case 'imp': {
        const l = evalNode(n.left);
        const r = evalNode(n.right);
        value = !l || r;
        steps.push({ formula: f,
          reason: !l ? 'antecedent F — conditional T'
                : r  ? 'antecedent T, consequent T'
                      : 'antecedent T, consequent F',
          value });
        return value;
      }
      default: throw new Error('Unknown node type: ' + n.type);
    }
  }

  const value = evalNode(node);
  return { value, steps };
}
