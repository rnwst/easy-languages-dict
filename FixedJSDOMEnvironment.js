/**
The jest jsdom test environment is needed to be able to mock the global
`document`. However, this results in the following error:
`ReferenceError: fetch is not defined`
This file defines a new test environment, with `fetch` defined.
Adapted from https://github.com/jsdom/jsdom/issues/1724#issuecomment-1446858041.
*/

import {TestEnvironment} from 'jest-environment-jsdom';

// https://github.com/facebook/jest/blob/v29.4.3/website/versioned_docs/version-29.4/Configuration.md#testenvironment-string
export default class FixedJSDOMEnvironment extends TestEnvironment {
  constructor(...args) {
    super(...args);

    // FIXME https://github.com/jsdom/jsdom/issues/1724
    this.global.fetch = fetch;
    this.global.Headers = Headers;
    this.global.Request = Request;
    this.global.Response = Response;
  }
}
