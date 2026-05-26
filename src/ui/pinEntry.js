var PIN_LENGTH = 4;

function createPinEntry(options) {
  options = options || {};
  var maxLength = options.maxLength || PIN_LENGTH;
  var digits = [];
  var onComplete = options.onComplete || null;
  var onChange = options.onChange || null;

  function notify() {
    if (onChange) onChange(digits.length, getValue());
  }

  function appendDigit(d) {
    if (digits.length >= maxLength) return false;
    digits.push(String(d));
    notify();
    if (digits.length >= maxLength && onComplete) {
      onComplete(getValue());
    }
    return true;
  }

  function deleteDigit() {
    if (!digits.length) return false;
    digits.pop();
    notify();
    return true;
  }

  function clear() {
    digits = [];
    notify();
  }

  function getValue() {
    return digits.join('');
  }

  function getDisplayMask() {
    var out = '';
    for (var i = 0; i < digits.length; i++) out += '•';
    return out;
  }

  return {
    appendDigit: appendDigit,
    deleteDigit: deleteDigit,
    clear: clear,
    getValue: getValue,
    getDisplayMask: getDisplayMask,
    getLength: function () { return digits.length; }
  };
}

function isNumericKeyCode(keyCode) {
  if (keyCode >= 48 && keyCode <= 57) return String(keyCode - 48);
  if (keyCode >= 96 && keyCode <= 105) return String(keyCode - 96);
  return null;
}

export { createPinEntry, isNumericKeyCode, PIN_LENGTH };
