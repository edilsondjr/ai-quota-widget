// Safe, JS-like expressions for custom-provider mappings. This is deliberately not
// eval/Function: only values, property access, arithmetic, comparisons, a few
// whitelisted methods and Math/Number/String calls are allowed. A spec cannot reach
// require, process, Function, constructors or prototypes.
const jsep = require('jsep');

const MAX_EXPR = 600;
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
const METHODS = new Set(['toFixed', 'toLocaleString', 'toString', 'trim', 'toUpperCase', 'toLowerCase']);
const MATH = new Set(['round', 'floor', 'ceil', 'abs', 'min', 'max', 'pow', 'sqrt']);
const GLOBALS = { Number, String, Boolean, parseInt, parseFloat, isFinite };
const BINARY = new Set(['+', '-', '*', '/', '%', '**', '==', '!=', '===', '!==', '<', '<=', '>', '>=', '&&', '||']);

function isExpression(value) {
  return typeof value === 'string' && value.trim().startsWith('=');
}

function memberName(node) {
  const property = node.property;
  if (!property) return null;
  if (!node.computed && property.type === 'Identifier') return property.name;
  if (node.computed && property.type === 'Literal') return String(property.value);
  return null;
}

function validate(node) {
  if (!node || typeof node !== 'object') throw new Error('Invalid expression');
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
      return;
    case 'ArrayExpression':
      for (const item of node.elements || []) validate(item);
      return;
    case 'MemberExpression': {
      const name = memberName(node);
      if (name != null && BLOCKED.has(name)) throw new Error(`Property not allowed: ${name}`);
      validate(node.object);
      if (node.computed) validate(node.property);
      return;
    }
    case 'UnaryExpression':
      if (!['-', '+', '!', 'typeof'].includes(node.operator)) throw new Error(`Operator not allowed: ${node.operator}`);
      validate(node.argument);
      return;
    case 'BinaryExpression':
      if (!BINARY.has(node.operator)) throw new Error(`Operator not allowed: ${node.operator}`);
      validate(node.left);
      validate(node.right);
      return;
    case 'ConditionalExpression':
      validate(node.test);
      validate(node.consequent);
      validate(node.alternate);
      return;
    case 'CallExpression': {
      const callee = node.callee;
      if (!callee || (callee.type !== 'Identifier' && callee.type !== 'MemberExpression')) {
        throw new Error('Call not allowed');
      }
      if (callee.type === 'Identifier') {
        if (!Object.prototype.hasOwnProperty.call(GLOBALS, callee.name)) throw new Error(`Function not allowed: ${callee.name}`);
      } else {
        const name = memberName(callee);
        const isMath = callee.object && callee.object.type === 'Identifier' && callee.object.name === 'Math';
        if (isMath) {
          if (!MATH.has(name)) throw new Error(`Math function not allowed: ${name}`);
        } else {
          if (!METHODS.has(name)) throw new Error(`Method not allowed: ${name}`);
          validate(callee.object);
        }
        if (callee.computed) validate(callee.property);
      }
      for (const arg of node.arguments || []) validate(arg);
      return;
    }
    default:
      throw new Error(`Expression not allowed: ${node.type}`);
  }
}

function parse(expr) {
  if (typeof expr !== 'string' || !expr.trim() || expr.length > MAX_EXPR) throw new Error('Invalid expression');
  const ast = jsep(expr);
  validate(ast);
  return ast;
}

function resolveMember(node, data) {
  const key = node.computed ? run(node.property, data) : node.property.name;
  if (BLOCKED.has(String(key))) throw new Error(`Property not allowed: ${key}`);
  const object = run(node.object, data);
  if (object == null) return undefined;
  return object[key];
}

function call(node, data) {
  const args = (node.arguments || []).map((arg) => run(arg, data));
  const callee = node.callee;
  if (callee.type === 'Identifier') return GLOBALS[callee.name](...args);

  const name = callee.computed ? run(callee.property, data) : callee.property.name;
  if (callee.object.type === 'Identifier' && callee.object.name === 'Math') {
    if (!MATH.has(name)) throw new Error(`Math function not allowed: ${name}`);
    return Math[name](...args);
  }
  if (BLOCKED.has(String(name))) throw new Error(`Property not allowed: ${name}`);
  if (!METHODS.has(name)) throw new Error(`Method not allowed: ${name}`);
  const object = run(callee.object, data);
  if (object == null) throw new Error(`Cannot call ${name} on a null value`);
  const fn = object[name];
  if (typeof fn !== 'function') throw new Error(`${name} is not a function`);
  return fn.apply(object, args);
}

function run(node, data) {
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier': {
      if (node.name === 'data') return data;
      if (node.name === 'undefined') return undefined;
      if (Object.prototype.hasOwnProperty.call(data, node.name)) return data[node.name];
      throw new Error(`Unknown identifier: ${node.name}`);
    }
    case 'ArrayExpression':
      return (node.elements || []).map((item) => run(item, data));
    case 'MemberExpression':
      return resolveMember(node, data);
    case 'UnaryExpression': {
      const value = run(node.argument, data);
      if (node.operator === '-') return -value;
      if (node.operator === '+') return +value;
      if (node.operator === '!') return !value;
      return typeof value;
    }
    case 'BinaryExpression': {
      const left = run(node.left, data);
      if (node.operator === '&&') return left ? run(node.right, data) : left;
      if (node.operator === '||') return left ? left : run(node.right, data);
      const right = run(node.right, data);
      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        case '**': return left ** right;
        case '==': return left == right;
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
        default: throw new Error(`Operator not allowed: ${node.operator}`);
      }
    }
    case 'ConditionalExpression':
      return run(node.test, data) ? run(node.consequent, data) : run(node.alternate, data);
    case 'CallExpression':
      return call(node, data);
    default:
      throw new Error(`Expression not allowed: ${node.type}`);
  }
}

function validateExpression(expr) {
  try {
    parse(expr);
    return true;
  } catch (_) {
    return false;
  }
}

function evaluateExpression(expr, data) {
  return run(parse(expr), data);
}

module.exports = { MAX_EXPR, isExpression, validateExpression, evaluateExpression };
