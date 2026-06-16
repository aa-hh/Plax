if (!String.prototype.padEnd) {
  String.prototype.padEnd = function padEnd(targetLength, padString) {
    var str = String(this);
    targetLength = targetLength >> 0;
    padString = padString !== undefined ? String(padString) : ' ';
    if (str.length >= targetLength || !padString) return str;
    var needed = targetLength - str.length;
    var repeated = '';
    while (repeated.length < needed) repeated += padString;
    return str + repeated.slice(0, needed);
  };
}

if (!String.prototype.padStart) {
  String.prototype.padStart = function padStart(targetLength, padString) {
    var str = String(this);
    targetLength = targetLength >> 0;
    padString = padString !== undefined ? String(padString) : ' ';
    if (str.length >= targetLength || !padString) return str;
    var needed = targetLength - str.length;
    var repeated = '';
    while (repeated.length < needed) repeated += padString;
    return repeated.slice(0, needed) + str;
  };
}
