/**
 * We need to check if the video is playing. There is no `.playing` attribute,
 * but we can define one.
 */
Object.defineProperty(HTMLMediaElement.prototype, 'playing', {
  get: function() {
    return (this.currentTime > 0 &&
            !this.paused &&
            !this.ended &&
            this.readyState > 2);
  },
});
