export const SIDE_CONFIGS = {
  top: {
    axis: "y",
    points: [0, 1],
    arrow: "↑",
    minKey: "top",
    maxKey: "bottom",
  },
  right: {
    axis: "x",
    points: [1, 2],
    arrow: "→",
    minKey: "left",
    maxKey: "right",
  },
  bottom: {
    axis: "y",
    points: [2, 3],
    arrow: "↓",
    minKey: "top",
    maxKey: "bottom",
  },
  left: {
    axis: "x",
    points: [0, 3],
    arrow: "←",
    minKey: "left",
    maxKey: "right",
  },
};

const HANDLE_RATIOS = [0.5];
const MIN_LINE_GAP = 24;

export function moveQuadSide(quad, side, point, bounds, constraints = {}) {
  const config = SIDE_CONFIGS[side];
  if (!config) {
    return;
  }

  const limits = mergeLimits(getSideLimits(quad, side, bounds), constraints);
  const nextValue = clamp(point[config.axis], limits.min, limits.max);

  for (const pointIndex of config.points) {
    quad[pointIndex] = {
      ...quad[pointIndex],
      [config.axis]: nextValue,
    };
  }
}

export function getQuadSideValue(quad, side) {
  const config = SIDE_CONFIGS[side];
  if (!config) {
    return null;
  }

  const [startIndex, endIndex] = config.points;
  return (quad[startIndex][config.axis] + quad[endIndex][config.axis]) / 2;
}

export function getSideHandlePositions(quad) {
  return Object.entries(SIDE_CONFIGS).flatMap(([side, config]) => {
    const [startIndex, endIndex] = config.points;
    const start = quad[startIndex];
    const end = quad[endIndex];

    return HANDLE_RATIOS.map((ratio) => ({
      side,
      arrow: config.arrow,
      point: {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      },
    }));
  });
}

function getSideLimits(quad, side, bounds) {
  const box = getQuadBox(quad);

  if (side === "top") {
    return { min: 0, max: box.bottom - MIN_LINE_GAP };
  }

  if (side === "bottom") {
    return { min: box.top + MIN_LINE_GAP, max: bounds.height };
  }

  if (side === "left") {
    return { min: 0, max: box.right - MIN_LINE_GAP };
  }

  return { min: box.left + MIN_LINE_GAP, max: bounds.width };
}

function mergeLimits(baseLimits, constraints) {
  return {
    min: Math.max(baseLimits.min, constraints.min ?? -Infinity),
    max: Math.min(baseLimits.max, constraints.max ?? Infinity),
  };
}

function getQuadBox(quad) {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);

  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
