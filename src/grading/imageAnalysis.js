const MAX_ANALYSIS_SIZE = 900;

export async function analyzeSidePhoto(sideData) {
  if (!sideData?.imageDataUrl || !sideData.outerQuad || !sideData.innerQuad) {
    return createEmptyAnalysis();
  }

  const image = await loadImage(sideData.imageDataUrl);
  const scale = Math.min(1, MAX_ANALYSIS_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const outerBox = getBoundingBox(scaleQuad(sideData.outerQuad, scale), canvas);
  const innerBox = getBoundingBox(scaleQuad(sideData.innerQuad, scale), canvas);
  const quality = analyzeQuality(context, canvas, image);
  const corners = analyzeCorners(context, outerBox);
  const edges = analyzeEdges(context, outerBox);
  const surface = analyzeSurface(context, innerBox);

  return {
    quality,
    checks: {
      corners: corners.suggestion,
      edges: edges.suggestion,
      surface: surface.suggestion,
    },
    summaries: {
      corners: corners.label,
      edges: edges.label,
      surface: surface.label,
    },
  };
}

export function createEmptyAnalysis() {
  return {
    quality: {
      level: "unchecked",
      label: "-",
      reasons: [],
    },
    checks: {
      corners: "unchecked",
      edges: "unchecked",
      surface: "unchecked",
    },
    summaries: {
      corners: "-",
      edges: "-",
      surface: "-",
    },
  };
}

function analyzeQuality(context, canvas, image) {
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let luminanceSum = 0;
  let highlights = 0;
  let shadows = 0;
  const pixelCount = canvas.width * canvas.height;

  for (let index = 0; index < data.length; index += 4) {
    const luminance = getLuminance(data[index], data[index + 1], data[index + 2]);
    luminanceSum += luminance;
    if (luminance > 245) {
      highlights += 1;
    }
    if (luminance < 20) {
      shadows += 1;
    }
  }

  const averageLuminance = luminanceSum / pixelCount;
  const highlightRatio = highlights / pixelCount;
  const shadowRatio = shadows / pixelCount;
  const sharpness = estimateSharpness(context, canvas);
  const reasons = [];

  if (image.naturalWidth < 700 || image.naturalHeight < 900) {
    reasons.push("해상도 낮음");
  }
  if (averageLuminance < 40) {
    reasons.push("어두움");
  }
  if (averageLuminance > 220 || highlightRatio > 0.18) {
    reasons.push("반사/과노출");
  }
  if (shadowRatio > 0.35) {
    reasons.push("그림자 강함");
  }
  if (sharpness < 3) {
    reasons.push("흐림");
  }

  return {
    level: reasons.length === 0 ? "clean" : "minor",
    label: reasons.length === 0 ? "좋음" : reasons.join(", "),
    reasons,
  };
}

function analyzeCorners(context, outerBox) {
  const size = Math.max(18, Math.min(outerBox.width, outerBox.height) * 0.09);
  const patches = [
    { x: outerBox.x, y: outerBox.y, width: size, height: size },
    { x: outerBox.x + outerBox.width - size, y: outerBox.y, width: size, height: size },
    { x: outerBox.x, y: outerBox.y + outerBox.height - size, width: size, height: size },
    {
      x: outerBox.x + outerBox.width - size,
      y: outerBox.y + outerBox.height - size,
      width: size,
      height: size,
    },
  ];
  const worstRatio = Math.max(...patches.map((patch) => getNeutralWhiteRatio(context, patch)));
  const suggestion = getSuggestionFromRatio(worstRatio, 0.07, 0.14, 0.25);

  return {
    suggestion,
    label: buildRiskLabel(suggestion, worstRatio),
  };
}

function analyzeEdges(context, outerBox) {
  const strip = Math.max(12, Math.min(outerBox.width, outerBox.height) * 0.045);
  const patches = [
    { x: outerBox.x, y: outerBox.y, width: outerBox.width, height: strip },
    { x: outerBox.x, y: outerBox.y + outerBox.height - strip, width: outerBox.width, height: strip },
    { x: outerBox.x, y: outerBox.y, width: strip, height: outerBox.height },
    { x: outerBox.x + outerBox.width - strip, y: outerBox.y, width: strip, height: outerBox.height },
  ];
  const worstRatio = Math.max(...patches.map((patch) => getNeutralWhiteRatio(context, patch)));
  const suggestion = getSuggestionFromRatio(worstRatio, 0.1, 0.2, 0.34);

  return {
    suggestion,
    label: buildRiskLabel(suggestion, worstRatio),
  };
}

function analyzeSurface(context, innerBox) {
  const patch = {
    x: innerBox.x + innerBox.width * 0.06,
    y: innerBox.y + innerBox.height * 0.06,
    width: innerBox.width * 0.88,
    height: innerBox.height * 0.88,
  };
  const glareRatio = getGlareRatio(context, patch);
  const suggestion = getSuggestionFromRatio(glareRatio, 0.08, 0.16, 0.28);

  return {
    suggestion,
    label: buildRiskLabel(suggestion, glareRatio),
  };
}

function getNeutralWhiteRatio(context, rect) {
  const imageData = getRegionData(context, rect);
  let whitePixels = 0;
  const pixelCount = imageData.data.length / 4;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const luminance = getLuminance(red, green, blue);
    const saturation = getSaturation(red, green, blue);

    if (luminance > 218 && saturation < 0.28) {
      whitePixels += 1;
    }
  }

  return pixelCount === 0 ? 0 : whitePixels / pixelCount;
}

function getGlareRatio(context, rect) {
  const imageData = getRegionData(context, rect);
  let glarePixels = 0;
  const pixelCount = imageData.data.length / 4;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance = getLuminance(
      imageData.data[index],
      imageData.data[index + 1],
      imageData.data[index + 2],
    );

    if (luminance > 245) {
      glarePixels += 1;
    }
  }

  return pixelCount === 0 ? 0 : glarePixels / pixelCount;
}

function estimateSharpness(context, canvas) {
  const step = 4;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  let samples = 0;

  for (let y = step; y < canvas.height - step; y += step) {
    for (let x = step; x < canvas.width - step; x += step) {
      const center = getGrayAt(imageData, canvas.width, x, y);
      const right = getGrayAt(imageData, canvas.width, x + step, y);
      const bottom = getGrayAt(imageData, canvas.width, x, y + step);
      total += Math.abs(center - right) + Math.abs(center - bottom);
      samples += 2;
    }
  }

  return samples === 0 ? 0 : total / samples;
}

function getRegionData(context, rect) {
  const canvas = context.canvas;
  const x = clamp(Math.round(rect.x), 0, canvas.width - 1);
  const y = clamp(Math.round(rect.y), 0, canvas.height - 1);
  const width = clamp(Math.round(rect.width), 1, canvas.width - x);
  const height = clamp(Math.round(rect.height), 1, canvas.height - y);

  return context.getImageData(x, y, width, height);
}

function getSuggestionFromRatio(ratio, minorThreshold, visibleThreshold, severeThreshold) {
  if (ratio >= severeThreshold) {
    return "severe";
  }
  if (ratio >= visibleThreshold) {
    return "visible";
  }
  if (ratio >= minorThreshold) {
    return "minor";
  }

  return "clean";
}

function buildRiskLabel(suggestion, ratio) {
  const labels = {
    clean: "깨끗함",
    minor: "미세 의심",
    visible: "보임 의심",
    severe: "심함 의심",
  };

  return `${labels[suggestion]} · ${(ratio * 100).toFixed(1)}%`;
}

function scaleQuad(quad, scale) {
  return quad.map((point) => ({
    x: point.x * scale,
    y: point.y * scale,
  }));
}

function getBoundingBox(quad, canvas) {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const minX = clamp(Math.min(...xs), 0, canvas.width - 1);
  const minY = clamp(Math.min(...ys), 0, canvas.height - 1);
  const maxX = clamp(Math.max(...xs), minX + 1, canvas.width);
  const maxY = clamp(Math.max(...ys), minY + 1, canvas.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getLuminance(red, green, blue) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getSaturation(red, green, blue) {
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;

  return max === 0 ? 0 : (max - min) / max;
}

function getGrayAt(data, width, x, y) {
  const index = (y * width + x) * 4;
  return getLuminance(data[index], data[index + 1], data[index + 2]);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image analysis load failed"));
    image.src = dataUrl;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
