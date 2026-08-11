'use strict';

function info(message) {
  console.log(message);
}

function warn(message) {
  console.error(`warn: ${message}`);
}

function error(message) {
  console.error(`error: ${message}`);
}

module.exports = { info, warn, error };
