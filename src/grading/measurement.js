const MIN_MARGIN = 0.0001;

export function createDefaultQuad(width, height, insetRatio = 0.06) {
  const insetX = width * insetRatio;
  const insetY = height * insetRatio;

  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ];
}

export function cloneQuad(quad) {
  return quad.map((point) => ({ x: point.x, y: point.y }));
}

export function calculateCentering(outerQuad, innerQuad) {
  const transform = createPerspectiveTransform(outerQuad, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]);

  const normalizedInner = innerQuad.map((point) => projectPoint(transform, point));
  const xs = normalizedInner.map((point) => point.x);
  const ys = normalizedInner.map((point) => point.y);
  const left = clamp01(Math.min(...xs));
  const right = clamp01(1 - Math.max(...xs));
  const top = clamp01(Math.min(...ys));
  const bottom = clamp01(1 - Math.max(...ys));

  return buildCenteringResult(left, right, top, bottom);
}

export function formatRatio(pair) {
  if (!pair || !Number.isFinite(pair.first) || !Number.isFinite(pair.second)) {
    return "-";
  }

  return `${pair.first.toFixed(1)}% | ${pair.second.toFixed(1)}%`;
}

function buildCenteringResult(left, right, top, bottom) {
  const horizontalTotal = Math.max(left + right, MIN_MARGIN);
  const verticalTotal = Math.max(top + bottom, MIN_MARGIN);
  const lr = {
    first: (left / horizontalTotal) * 100,
    second: (right / horizontalTotal) * 100,
  };
  const tb = {
    first: (top / verticalTotal) * 100,
    second: (bottom / verticalTotal) * 100,
  };

  return {
    margins: { left, right, top, bottom },
    lr,
    tb,
    worstSide: Math.max(lr.first, lr.second, tb.first, tb.second),
    isValid: left > 0 && right > 0 && top > 0 && bottom > 0,
  };
}

function createPerspectiveTransform(source, destination) {
  const matrix = [];
  const vector = [];

  for (let index = 0; index < 4; index += 1) {
    const src = source[index];
    const dst = destination[index];

    matrix.push([src.x, src.y, 1, 0, 0, 0, -dst.x * src.x, -dst.x * src.y]);
    vector.push(dst.x);

    matrix.push([0, 0, 0, src.x, src.y, 1, -dst.y * src.x, -dst.y * src.y]);
    vector.push(dst.y);
  }

  const solution = solveLinearSystem(matrix, vector);

  return [
    solution[0],
    solution[1],
    solution[2],
    solution[3],
    solution[4],
    solution[5],
    solution[6],
    solution[7],
    1,
  ];
}

function projectPoint(transform, point) {
  const denominator = transform[6] * point.x + transform[7] * point.y + transform[8];

  return {
    x: (transform[0] * point.x + transform[1] * point.y + transform[2]) / denominator,
    y: (transform[3] * point.x + transform[4] * point.y + transform[5]) / denominator,
  };
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(rows[pivot][column]) < Number.EPSILON) {
      throw new Error("Invalid quadrilateral");
    }

    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];

    const pivotValue = rows[column][column];
    for (let item = column; item <= size; item += 1) {
      rows[column][item] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = rows[row][column];
      for (let item = column; item <= size; item += 1) {
        rows[row][item] -= factor * rows[column][item];
      }
    }
  }

  return rows.map((row) => row[size]);
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
