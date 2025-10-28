/**
 * Find subtitle text band's vertical boundary position, as a fraction of total
 * video height. This position data is used for taking a screenshot of the
 * subtitle band for OCR, and for positioning of HTML elements overlaid on the
 * video.
 */
export default function getSubtitlePosition(
    language: string,
    videoId: string,
    publicationDate: Date,
) {
  const standardPosition = {
    top: 0.780,
    bottom: 0.863,
  };

  const legacyPosition = {
    top: 0.812,
    bottom: 0.893,
  };


  if (language === 'german') {
    const switchDate = new Date('Mar 15, 2020');
    const standardExceptions = [
      'yvRp2Uk1zSQ',
      'mj3e2YPKkvc',
    ];
    if (standardExceptions.includes(videoId)) {
      return standardPosition;
    }
    return (publicationDate >= switchDate) ?
        standardPosition :
        legacyPosition;
  }

  if (language === 'french') {
    const switchDate = new Date('Jun 13, 2020');
    return (publicationDate >= switchDate) ?
        standardPosition :
        legacyPosition;
  }

  if (language === 'spanish') {
    const legacyExceptions = [
      'DwbAW8G-57A',
    ];
    return legacyExceptions.includes(videoId) ?
      legacyPosition :
      standardPosition;
  }

  if (language === 'mandarin') {
    const mandarinStandardPosition = {
      top: 0.737,
      bottom: 0.815,
    };

    const mandarinLegacyPosition = {
      top: 0.760,
      bottom: 0.835,
    };

    const switchDate = new Date('Sep 24, 2022');
    const legacyExceptions = [
      'pwuQJjtdt90',
      'LevXg6pwIQ8',
    ];
    if (legacyExceptions.includes(videoId)) return mandarinLegacyPosition;
    return (publicationDate >= switchDate) ?
        mandarinStandardPosition :
        mandarinLegacyPosition;
  }

  return standardPosition;
}
