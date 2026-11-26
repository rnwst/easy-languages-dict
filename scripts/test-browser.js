// @ts-check

import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Select browser suites and forward supported Node test-runner options.
 * @param {string[]} argv - Arguments supplied to the browser test command
 * @return {string[]} Arguments for Node's test runner
 */
export function browserTestArgs(argv) {
  let live = false;
  let browser;
  const options = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'live') live = true;
    else if (['chromium', 'firefox'].includes(arg) && !browser) browser = arg;
    else if (/^--test-(name-pattern|skip-pattern|reporter|timeout)=/
      .test(arg)) {
      options.push(arg);
    } else if (/^--test-(name-pattern|skip-pattern|reporter|timeout)$/
      .test(arg) &&
        argv[i + 1] && !argv[i + 1].startsWith('--')) {
      options.push(arg, argv[++i]);
    } else throw new Error(`Unknown browser test argument: ${arg}`);
  }
  const browsers = browser ? [browser] : ['chromium', 'firefox'];
  const directory = '__tests__/browser/' + (live ? 'live/' : '');
  return ['--test', '--test-concurrency=1', ...options,
    ...(!live ? ['__tests__/browser/contracts.test.mjs'] : []),
    ...browsers.map(name => `${directory}${name}.test.mjs`)];
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log('Usage: npm run test-browser[:chromium|:firefox] [live]');
    console.log('Default: local fixtures. live: real YouTube compatibility.');
    console.log('Node --test-name-pattern, --test-skip-pattern, ' +
      '--test-reporter and --test-timeout options are also forwarded.');
    return;
  }
  const child = spawn(process.execPath, browserTestArgs(argv), {
    stdio: 'inherit',
  });
  /** @type {NodeJS.Signals[]} */
  const signals = ['SIGINT', 'SIGTERM'];
  const handlers = signals.map(signal => {
    const handler = () => child.kill(signal);
    process.on(signal, handler);
    return handler;
  });
  child.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('close', (code, signal) => {
    signals.forEach((value, index) =>
      process.removeListener(value, handlers[index]));
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
}

if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
