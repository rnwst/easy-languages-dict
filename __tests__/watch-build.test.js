/** @jest-environment node */
import {watchBuild, refreshDevelopmentTabs} from '../scripts/watch-build.js';

describe('coordinated development builds', () => {
  let revision;
  let build;
  let publish;
  let onError;
  let stop;

  beforeEach(() => {
    jest.useFakeTimers();
    revision = 'initial';
    build = jest.fn().mockResolvedValue(undefined);
    publish = jest.fn().mockResolvedValue(undefined);
    onError = jest.fn();
    stop = watchBuild({
      initial: revision, snapshot: () => revision, build, publish, onError,
    });
  });

  afterEach(() => {
    stop();
    jest.useRealTimers();
  });

  it('never rebuilds or reloads during unchanged browser startup', async () => {
    await jest.advanceTimersByTimeAsync(2000);
    expect(build).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('coalesces multi-file saves into one build and reload', async () => {
    revision = 'main edit';
    await jest.advanceTimersByTimeAsync(250);
    revision = 'main and isolated edit';
    await jest.advanceTimersByTimeAsync(500);
    expect(build).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('discards a build changed in flight and publishes its successor',
    async () => {
      let finish;
      build.mockImplementationOnce(() => new Promise((resolve) => {
        finish = resolve;
      }));
      revision = 'first edit';
      await jest.advanceTimersByTimeAsync(500);
      revision = 'second edit';
      await jest.advanceTimersByTimeAsync(1000);
      expect(build).toHaveBeenCalledTimes(1);
      expect(publish).not.toHaveBeenCalled();
      finish();
      await jest.advanceTimersByTimeAsync(500);
      expect(build).toHaveBeenCalledTimes(2);
      expect(publish).toHaveBeenCalledTimes(1);
    });

  it('awaits reload before starting a subsequent build', async () => {
    let finish;
    publish.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    revision = 'first edit';
    await jest.advanceTimersByTimeAsync(500);
    revision = 'second edit';
    await jest.advanceTimersByTimeAsync(1000);
    expect(build).toHaveBeenCalledTimes(1);
    finish();
    await jest.advanceTimersByTimeAsync(500);
    expect(build).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('rebuilds a revert to the startup revision after discarding a build',
    async () => {
      let finish;
      build.mockImplementationOnce(() => new Promise((resolve) => {
        finish = resolve;
      }));
      revision = 'edit';
      await jest.advanceTimersByTimeAsync(500);
      revision = 'initial';
      finish();
      await jest.advanceTimersByTimeAsync(500);
      expect(build).toHaveBeenCalledTimes(2);
      expect(publish).toHaveBeenCalledTimes(1);
    });

  it('withholds failed builds and recovers on the next edit', async () => {
    const error = new Error('TypeScript failed');
    build.mockRejectedValueOnce(error);
    revision = 'broken';
    await jest.advanceTimersByTimeAsync(2000);
    expect(onError).toHaveBeenCalledWith(error);
    expect(build).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
    revision = 'fixed';
    await jest.advanceTimersByTimeAsync(500);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('does not publish an in-flight build after browser shutdown', async () => {
    let finish;
    build.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    revision = 'edit';
    await jest.advanceTimersByTimeAsync(500);
    stop();
    finish();
    await jest.advanceTimersByTimeAsync(2000);
    expect(publish).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledTimes(1);
  });
});

describe('development tab refresh', () => {
  afterEach(() => {
    delete global.chrome;
  });

  // The first page can open before installation. After an update, refresh it
  // too so our page-side script runs again before YouTube starts its player.
  it.each(['install', 'update'])('refreshes on %s', async (reason) => {
    let installed;
    global.chrome = {
      runtime: {onInstalled: {addListener: (listener) => installed = listener}},
      tabs: {
        query: jest.fn().mockResolvedValue([{id: 42}, {id: 43}, {}]),
        reload: jest.fn().mockResolvedValue(undefined),
      },
    };
    refreshDevelopmentTabs();
    await installed({reason: 'chrome_update'});
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    await installed({reason});
    expect(chrome.tabs.query).toHaveBeenCalledWith({
      url: ['https://www.youtube.com/*', 'https://m.youtube.com/*'],
    });
    expect(chrome.tabs.reload).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.reload).toHaveBeenCalledWith(42);
    expect(chrome.tabs.reload).toHaveBeenCalledWith(43);
  });
});
